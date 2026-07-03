import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// ───────────────────────────────────────────────────────────────────────────
// Real rigged human soldier (Mixamo "Vanguard"), with Idle / Walk / Run clips.
// Replaces the procedural block character: this is an actual human mesh driven
// by skeletal animation rather than rotating box primitives.
// ───────────────────────────────────────────────────────────────────────────
let _template   = null;   // { scene, animations }
let _loading    = false;
const _callbacks = [];

export function preloadHumanSoldier(onLoad) {
  if (onLoad) _callbacks.push(onLoad);
  if (_template) { onLoad?.(); return; }
  if (_loading) return;
  _loading = true;
  new GLTFLoader().load('/soldier.glb',
    (gltf) => {
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false; // skinned bounds expand past the bind pose
        }
      });
      _template = { scene: gltf.scene, animations: gltf.animations };
      _loading  = false;
      _callbacks.splice(0).forEach((cb) => cb());
    },
    undefined,
    (err) => { console.warn('[HumanSoldier] load failed:', err?.message); _loading = false; }
  );
}

export function isHumanSoldierReady() { return !!_template; }

// The Vanguard model is authored ~1.8 world units tall already, but the game's
// character pedestal / capsule assumes ~1.8m standing at y=0. Tune to taste.
const MODEL_SCALE = 1.0;

// ── Per-armor-type Spartan variants ─────────────────────────────────────────
// Each loadout armor type renders a visibly distinct futuristic super-soldier:
// its own armour colour, glowing visor/accent hue, surface finish, and build
// scale. This is what makes the loadout's armor cards each preview a different
// "model" instead of the same green Chief four times.
export const ARMOR_LOOKS = {
  assault: { // white / silver plated spartan with orange energy glow (default)
    body: 0xe9edf2, visor: 0xff8a1f,
    roughness: 0.42, metalness: 0.5, scale: 1.00,
  },
  recon: {   // sleek light-blue scout exo
    body: 0x2f6fae, visor: 0x36f0ff,
    roughness: 0.42, metalness: 0.48, scale: 0.97,
  },
  heavy: {   // bulky burnt-orange juggernaut plate
    body: 0x9a4a1f, visor: 0xff7a1a,
    roughness: 0.62, metalness: 0.30, scale: 1.09,
  },
  stealth: { // dark infiltrator plate with violet glow (kept light enough to read)
    body: 0x2c3042, visor: 0xb24bff,
    roughness: 0.30, metalness: 0.62, scale: 0.95,
  },
};
const DEFAULT_LOOK = ARMOR_LOOKS.assault;

function _lookFor(armorTypeId) {
  return ARMOR_LOOKS[armorTypeId] || DEFAULT_LOOK;
}

/**
 * Build an independent, animated human-soldier instance.
 * Returns a THREE.Group whose userData carries { mixer, actions, setMotion, isHuman }.
 * Call `group.userData.mixer.update(dt)` every frame and
 * `group.userData.setMotion('idle'|'walk'|'run')` to switch clips.
 * `armorTypeId` selects one of the ARMOR_LOOKS variants so each loadout armor
 * type previews as a distinct super-soldier.
 */
export function buildHumanSoldier(skin = null, armorTypeId = 'assault') {
  if (!_template) return null;

  const look = _lookFor(armorTypeId);
  const root = cloneSkeleton(_template.scene);
  root.scale.setScalar(MODEL_SCALE * look.scale);

  // Give this instance its own materials, and split body vs visor so we can
  // paint each armour variant: coloured plate + glowing visor.
  const bodyMats = [];
  const visorMats = [];
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = o.material.clone();
      const n = (o.material.name || '') + ' ' + (o.name || '');
      if (/visor/i.test(n)) visorMats.push(o.material);
      else                  bodyMats.push(o.material);
    }
  });
  _applyArmorLook(bodyMats, visorMats, look);

  const group = new THREE.Group();
  group.add(root);

  // Bolt on this loadout's distinct armour set (bone-parented so plates ride the
  // skeleton during the animation). Each armor type gets its own silhouette.
  group.updateMatrixWorld(true);
  const armor = _buildArmorPieces(root, armorTypeId, look);

  // Measure the standing figure now, while its matrices resolve cleanly, and
  // stash the result. Re-measuring a posed SkinnedMesh elsewhere (e.g. the
  // loadout turntable) can collapse to a degenerate box, so consumers that
  // need to frame the model should read these instead of re-running setFromObject.
  group.updateMatrixWorld(true);
  const _box = new THREE.Box3().setFromObject(group);
  const _size = _box.getSize(new THREE.Vector3());
  const _ctr  = _box.getCenter(new THREE.Vector3());

  // ── Animation: 3 clips (idle/walk/run) + rich procedural motion layers ──
  const mixer   = new THREE.AnimationMixer(root);
  const byName  = {};
  for (const clip of _template.animations) byName[clip.name] = clip;

  const actions = {
    idle: byName.Idle ? mixer.clipAction(byName.Idle) : null,
    walk: byName.Walk ? mixer.clipAction(byName.Walk) : null,
    run:  byName.Run  ? mixer.clipAction(byName.Run)  : null,
  };
  for (const a of Object.values(actions)) {
    if (a) { a.enabled = true; a.setEffectiveWeight(1); a.play(); a.setEffectiveWeight(0); }
  }

  let current = null;
  // Crossfade time is chosen per transition: quick between neighboring clips,
  // longer when returning to a rest state, so the blends never look snappy or
  // overlong. `warp` keeps foot cadence in sync between locomotion clips.
  const FADE = { idleToWalk: 0.14, walkToRun: 0.18, runToWalk: 0.20, walkToIdle: 0.24, idleToRun: 0.22, runToIdle: 0.26 };
  const _fadeKey = (from, to) => {
    if (!from || !to) return 0.2;
    const f = from === actions.idle ? 'idle' : from === actions.walk ? 'walk' : 'run';
    const t = to   === actions.idle ? 'idle' : to   === actions.walk ? 'walk' : 'run';
    return FADE[`${f}To${t.charAt(0).toUpperCase() + t.slice(1)}`] ?? 0.2;
  };
  const setMotion = (name) => {
    const next = actions[name] || actions.idle;
    if (!next || next === current) return;
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.reset().play();
    if (current) {
      const fade = _fadeKey(current, next);
      const warp = (next !== actions.idle && current !== actions.idle);   // warp between locomotion clips
      current.crossFadeTo(next, fade, warp);
    }
    current = next;
  };
  setMotion('idle');

  // ── Per-armor motion: animation speed + additive stance + animated armour ──
  const motion = ARMOR_MOTION[armorTypeId] || ARMOR_MOTION.assault;
  const baseTS = motion.speed;
  mixer.timeScale = baseTS;

  // ── Bone lookup (Mixamo rig) ────────────────────────────────────────────────
  // Cached once so armorTick doesn't traverse the skeleton every frame. Any
  // bone that's missing degrades gracefully (procedural offsets just skip it).
  const B = {
    hips:  root.getObjectByName('mixamorig:Hips'),
    spine: root.getObjectByName('mixamorig:Spine'),
    s1:    root.getObjectByName('mixamorig:Spine1'),
    s2:    root.getObjectByName('mixamorig:Spine2'),
    neck:  root.getObjectByName('mixamorig:Neck'),
    head:  root.getObjectByName('mixamorig:Head'),
    lArm:  root.getObjectByName('mixamorig:LeftArm'),
    rArm:  root.getObjectByName('mixamorig:RightArm'),
    lFore: root.getObjectByName('mixamorig:LeftForeArm'),
    rFore: root.getObjectByName('mixamorig:RightForeArm'),
    lLeg:  root.getObjectByName('mixamorig:LeftUpLeg'),
    rLeg:  root.getObjectByName('mixamorig:RightUpLeg'),
  };

  // Locomotion driver: choose the clip (with hysteresis to stop flicker) and
  // scale playback to the real movement speed so the feet track the ground and
  // don't slide. Extra state (accel, air time, strafe) feeds the procedural
  // layer for lean, launch/land bounce, etc.
  const _clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let _locName    = 'idle';
  let _lastSpeed  = 0;
  let _accel      = 0;                     // smoothed dSpeed/dt for lean
  let _grounded   = true;
  let _airT       = 0;                     // seconds off the ground
  let _landT      = 0;                     // seconds since landing (landing squish)
  let _strafeLean = 0;                     // –1 (right) .. +1 (left)
  let _forwardLean = 0;                    // 0..1 momentum lean forward
  let _fireRecoil = 0;                     // recoil kick amplitude, decays
  let _flinch     = { x: 0, y: 0, t: 0 };  // damage flinch, decays
  let _aimYaw     = 0;                     // desired upper-body yaw offset
  let _aimPitch   = 0;                     // desired head pitch offset
  let _sAimYaw    = 0;                     // smoothed
  let _sAimPitch  = 0;                     // smoothed
  let _idleGlanceT = 0;
  let _idleGlanceTarget = 0;               // occasional idle head yaw target
  let _idleGlanceCooldown = 3 + Math.random() * 4;

  const setLocomotion = (speed, grounded = true, sprinting = false, strafe = 0) => {
    // Air state overrides everything — bots normally pass grounded=true, but a
    // player-controlled or scripted character can hop by setting grounded=false.
    if (!grounded) {
      _grounded = false; _airT += 0;
      _locName = 'air';
      // Slow the walk clip way down as a filler cycle while airborne so the
      // legs still have some tone; the procedural jump pose takes over.
      setMotion('walk');
      mixer.timeScale = baseTS * 0.35;
    } else {
      if (!_grounded) { _landT = 0.24; _airT = 0; } // landing bounce
      _grounded = true;
      let name = 'idle', ts = baseTS;
      const runOn = _locName === 'run';
      if (sprinting || speed > (runOn ? 4.4 : 5.4)) {
        name = 'run';  ts = baseTS * _clamp(speed / 5.5, 0.7, 1.55);
      } else if (speed > (_locName === 'idle' ? 0.55 : 0.32)) {
        name = 'walk'; ts = baseTS * _clamp(speed / 1.6, 0.55, 1.9);
      }
      _locName = name;
      setMotion(name);
      mixer.timeScale = ts;
    }
    _strafeLean = _clamp(strafe, -1, 1);
  };

  // Aim tracking: yaw twists the upper spine, pitch tilts the head.
  const setAim = (pitch, yaw) => { _aimPitch = pitch; _aimYaw = yaw; };
  // Impulse hooks: fire recoil, damage flinch, jump launch.
  const triggerFire = (kick = 1) => { _fireRecoil = Math.max(_fireRecoil, 0.12 * kick); };
  const triggerHit  = (dx = 0, dy = 0) => { _flinch.x = dx * 0.18; _flinch.y = dy * 0.14; _flinch.t = 0.35; };
  const triggerJump = () => { _grounded = false; _airT = 0.001; };

  // Stance offsets applied after mixer.update overwrites bones (per armor type).
  const poseOffsets = [];
  if (B.s1 && motion.spineLean)
    poseOffsets.push({ bone: B.s1, q: new THREE.Quaternion().setFromAxisAngle(_AX_X, motion.spineLean) });
  if (B.head && motion.headPitch)
    poseOffsets.push({ bone: B.head, q: new THREE.Quaternion().setFromAxisAngle(_AX_X, motion.headPitch) });

  // Scratch quaternion pool — allocating per-frame in armorTick would thrash.
  const _q = [
    new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(),
    new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(),
  ];

  let armorT = 0;
  const armorTick = (dt) => {
    armorT += dt;
    const t = armorT;

    // ── Animated armor pieces (visor blink, thruster pulse, plate sway) ──
    for (const a of armor.animated) {
      const an = a.anim;
      if (an.type === 'pulse' || an.type === 'thruster') {
        a.mat.emissiveIntensity = an.min + (an.max - an.min) * (0.5 + 0.5 * Math.sin(t * an.freq + (an.phase || 0)));
      } else if (an.type === 'blink') {
        a.mat.emissiveIntensity = Math.sin(t * an.freq + (an.phase || 0)) > 0.3 ? an.on : an.off;
      } else if (an.type === 'sway') {
        const ang = an.amp * Math.sin(t * an.freq + (an.phase || 0));
        a.mesh.quaternion.copy(a.baseQuat);
        if (an.axis === 'z') a.mesh.rotateZ(ang); else a.mesh.rotateX(ang);
      }
    }

    // ── Per-armor stance offsets (applied first so procedural layers stack on top)
    for (const p of poseOffsets) p.bone.quaternion.multiply(p.q);

    // ── Track state for lean/land/recoil layers ──
    const speedNow = _locName === 'run' ? 5.5 : _locName === 'walk' ? 1.8 : 0;
    _accel += ((speedNow - _lastSpeed) / Math.max(dt, 1e-3) - _accel) * Math.min(1, dt * 4);
    _lastSpeed = speedNow;
    if (!_grounded) _airT += dt;
    if (_landT > 0) _landT = Math.max(0, _landT - dt);
    if (_fireRecoil > 0) _fireRecoil = Math.max(0, _fireRecoil - dt * 1.4);
    if (_flinch.t > 0) _flinch.t = Math.max(0, _flinch.t - dt);

    // Smooth the aim tracking so quick camera whips don't snap the spine.
    _sAimYaw   += (_aimYaw   - _sAimYaw)   * Math.min(1, dt * 8);
    _sAimPitch += (_aimPitch - _sAimPitch) * Math.min(1, dt * 8);

    // Momentum lean: tilt forward when accelerating into a run, back when stopping.
    const targetFwd = _grounded ? _clamp(_accel * 0.02, -0.06, 0.09) : 0;
    _forwardLean += (targetFwd - _forwardLean) * Math.min(1, dt * 5);

    // ── Layer 1: aim tracking (spine1 yaw + head pitch) ──
    if (B.s1)   B.s1.quaternion.multiply(_q[0].setFromAxisAngle(_AX_Y, _sAimYaw * 0.55));
    if (B.s2)   B.s2.quaternion.multiply(_q[1].setFromAxisAngle(_AX_Y, _sAimYaw * 0.25));
    if (B.head) B.head.quaternion.multiply(_q[2].setFromAxisAngle(_AX_X, _sAimPitch * 0.7));
    if (B.head) B.head.quaternion.multiply(_q[3].setFromAxisAngle(_AX_Y, _sAimYaw   * 0.35));

    // ── Layer 2: strafe lean (bank Z into direction of movement) ──
    if (B.spine && _grounded) {
      const bank = _strafeLean * 0.11;
      B.spine.quaternion.multiply(_q[4].setFromAxisAngle(_AX_Z, bank));
    }

    // ── Layer 3: momentum forward lean ──
    if (B.spine) B.spine.quaternion.multiply(_q[5].setFromAxisAngle(_AX_X, _forwardLean));

    // ── Layer 4: fire recoil (spine kicks back, decays out) ──
    if (_fireRecoil > 0) {
      if (B.s1)   B.s1.quaternion.multiply(_q[0].setFromAxisAngle(_AX_X, -_fireRecoil));
      if (B.head) B.head.quaternion.multiply(_q[1].setFromAxisAngle(_AX_X, -_fireRecoil * 0.6));
    }

    // ── Layer 5: damage flinch (torso twists away from hit direction) ──
    if (_flinch.t > 0) {
      const w = _flinch.t / 0.35;   // 1 -> 0 over 0.35s
      const bend = Math.sin(w * Math.PI) * 0.8;  // soft ease-in/out
      if (B.spine) B.spine.quaternion.multiply(_q[0].setFromAxisAngle(_AX_X, -_flinch.y * bend));
      if (B.s2)    B.s2.quaternion.multiply(_q[1].setFromAxisAngle(_AX_Z,  _flinch.x * bend));
      if (B.head)  B.head.quaternion.multiply(_q[2].setFromAxisAngle(_AX_Z, _flinch.x * bend * 0.6));
    }

    // ── Layer 6: airborne pose (knees up, arms flare, spine curl) ──
    if (!_grounded && _airT > 0.02) {
      const rise = _clamp(_airT * 6, 0, 1);   // ramps in over ~150ms
      if (B.spine) B.spine.quaternion.multiply(_q[0].setFromAxisAngle(_AX_X, 0.08 * rise));
      if (B.lLeg)  B.lLeg.quaternion.multiply(_q[1].setFromAxisAngle(_AX_X, -0.45 * rise));
      if (B.rLeg)  B.rLeg.quaternion.multiply(_q[2].setFromAxisAngle(_AX_X, -0.30 * rise));
      if (B.lArm)  B.lArm.quaternion.multiply(_q[3].setFromAxisAngle(_AX_Z,  0.18 * rise));
      if (B.rArm)  B.rArm.quaternion.multiply(_q[4].setFromAxisAngle(_AX_Z, -0.18 * rise));
    }

    // ── Layer 7: landing squish (brief hip drop, decays) ──
    if (_landT > 0) {
      const w = _landT / 0.24;
      const drop = Math.sin((1 - w) * Math.PI) * 0.09;
      if (B.hips) {
        B.hips.position.y -= drop * 3;
        if (B.spine) B.spine.quaternion.multiply(_q[0].setFromAxisAngle(_AX_X,  drop * 1.6));
        if (B.lLeg)  B.lLeg.quaternion.multiply(_q[1].setFromAxisAngle(_AX_X,  -drop * 2.2));
        if (B.rLeg)  B.rLeg.quaternion.multiply(_q[2].setFromAxisAngle(_AX_X,  -drop * 2.2));
      }
    }

    // ── Layer 8: rich idle life — breathing, weight shift, occasional glance ──
    if (_locName === 'idle') {
      // Two breathing frequencies layered for a natural cycle.
      const breathe = Math.sin(t * 1.5) * 0.014 + Math.sin(t * 2.7) * 0.005;
      if (B.s1) B.s1.quaternion.multiply(_bq1.setFromAxisAngle(_AX_X, breathe));
      // Slow hip weight shift left/right — sells "standing casually".
      if (B.hips) B.hips.quaternion.multiply(_q[0].setFromAxisAngle(_AX_Z, Math.sin(t * 0.5) * 0.020));
      // Head sways slowly and occasionally glances toward a target angle.
      _idleGlanceT += dt;
      if (_idleGlanceT > _idleGlanceCooldown) {
        _idleGlanceT = 0;
        _idleGlanceCooldown = 3 + Math.random() * 4;
        _idleGlanceTarget = (Math.random() - 0.5) * 0.5;   // ± ~28°
      }
      // Decay the glance target back to 0 over its dwell time.
      _idleGlanceTarget *= Math.max(0, 1 - dt * 0.3);
      if (B.head) B.head.quaternion.multiply(_bq2.setFromAxisAngle(
        _AX_Y,
        Math.sin(t * 0.55) * 0.05 + _idleGlanceTarget * 0.4
      ));
      // Subtle finger tap / hand adjust via forearm rotation.
      if (B.rFore) B.rFore.quaternion.multiply(_q[1].setFromAxisAngle(_AX_X, Math.sin(t * 1.8) * 0.010));
    }

    // ── Layer 9: locomotion accent — a tiny head bob at foot cadence for weight ──
    if (_grounded && (_locName === 'walk' || _locName === 'run')) {
      const cadence = _locName === 'run' ? 3.4 : 2.2;
      const bobY = Math.sin(t * cadence * 2) * (_locName === 'run' ? 0.010 : 0.006);
      if (B.head) B.head.quaternion.multiply(_q[0].setFromAxisAngle(_AX_X, bobY));
    }
  };

  group.userData = {
    isHuman: true,
    mixer,
    actions,
    setMotion,
    setLocomotion,
    setAim,          // (pitch, yaw) — spine twist + head tilt track camera aim
    triggerFire,     // (kick=1)     — brief recoil pulse when the character fires
    triggerHit,      // (dx, dy)     — damage flinch from a hit direction
    triggerJump,     // ()           — enters airborne state; setLocomotion(_,true,_) lands
    armorTick,
    bodyMats,
    visorMats,
    armorTypeId,
    baseBodyColor: look.body, // the variant's plate colour, used as tint anchor
    // Cached framing metrics (see measurement above).
    standHeight: _size.y || 1.8,
    feetY:       _box.min.y,
    centerX:     _ctr.x,
    centerZ:     _ctr.z,
    // No recolorable primary/secondary plates on the human; expose stubs so
    // applySkinToCharacter() stays a no-op-safe call.
    primaryMat:   bodyMats[0] || null,
    secondaryMat: bodyMats[0] || null,
  };

  if (skin) tintHumanSoldier(group, skin);
  return group;
}

// ── Procedural PBR detail textures (worn metal: albedo + normal + roughness) ──
// Adds real surface detail — panel grain, scratches, grime — so the armour reads
// as a textured plated suit instead of smooth plastic. Generated once, shared.
let _detailTex = null;
function _getDetailTex() {
  if (_detailTex) return _detailTex;
  const S = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const CELL = 128;                       // armour-plate cell size
  const rivets = [];                       // shared bolt positions for albedo+normal

  // ── Albedo: gunmetal plating with seams, rivets, greebles, grime, scratches ──
  const aC = mk(), a = aC.getContext('2d');
  a.fillStyle = '#3a3f45'; a.fillRect(0, 0, S, S);
  for (let i = 0; i < S * 10; i++) {       // brushed grain
    const y = Math.random() * S, x = Math.random() * S, w = 10 + Math.random() * 60;
    const v = 48 + Math.random() * 30;
    a.strokeStyle = `rgba(${v},${v + 4},${v + 9},0.09)`; a.lineWidth = 1;
    a.beginPath(); a.moveTo(x, y); a.lineTo(x + w, y); a.stroke();
  }
  // plate panels: each cell slightly different shade for a paneled look
  for (let gx = 0; gx < S; gx += CELL)
    for (let gy = 0; gy < S; gy += CELL) {
      const v = 52 + Math.random() * 18;
      a.fillStyle = `rgba(${v},${v + 5},${v + 11},0.18)`;
      a.fillRect(gx + 3, gy + 3, CELL - 6, CELL - 6);
    }
  // recessed seam lines (dark) + highlight lip (light)
  a.lineWidth = 3;
  for (let g = 0; g <= S; g += CELL) {
    a.strokeStyle = 'rgba(12,13,15,0.7)';
    a.beginPath(); a.moveTo(g, 0); a.lineTo(g, S); a.stroke();
    a.beginPath(); a.moveTo(0, g); a.lineTo(S, g); a.stroke();
    a.strokeStyle = 'rgba(150,160,170,0.18)'; a.lineWidth = 1;
    a.beginPath(); a.moveTo(g + 2, 0); a.lineTo(g + 2, S); a.stroke();
    a.beginPath(); a.moveTo(0, g + 2); a.lineTo(S, g + 2); a.stroke();
    a.lineWidth = 3;
  }
  // rivets/bolts near seam corners + small greeble vents
  for (let gx = 0; gx < S; gx += CELL)
    for (let gy = 0; gy < S; gy += CELL) {
      for (const [ox, oy] of [[10, 10], [CELL - 10, 10], [10, CELL - 10], [CELL - 10, CELL - 10]]) {
        if (Math.random() < 0.5) continue;
        const x = gx + ox, y = gy + oy; rivets.push([x, y]);
        a.fillStyle = 'rgba(20,22,25,0.8)'; a.beginPath(); a.arc(x, y, 3.2, 0, Math.PI * 2); a.fill();
        a.fillStyle = 'rgba(170,178,188,0.7)'; a.beginPath(); a.arc(x - 0.8, y - 0.8, 1.6, 0, Math.PI * 2); a.fill();
      }
      if (Math.random() < 0.22) { // vent slats greeble
        a.fillStyle = 'rgba(14,15,18,0.6)';
        for (let s = 0; s < 4; s++) a.fillRect(gx + 30, gy + 40 + s * 7, CELL - 60, 3);
      }
    }
  for (let i = 0; i < 70; i++) {           // grime / oxidation
    const x = Math.random() * S, y = Math.random() * S, r = 30 + Math.random() * 120;
    const g = a.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(18,15,12,0.22)'); g.addColorStop(1, 'rgba(18,15,12,0)');
    a.fillStyle = g; a.beginPath(); a.arc(x, y, r, 0, Math.PI * 2); a.fill();
  }
  for (let i = 0; i < 240; i++) {          // exposed-metal scratches
    const x = Math.random() * S, y = Math.random() * S, ang = Math.random() * Math.PI, len = 8 + Math.random() * 46;
    a.strokeStyle = `rgba(195,201,210,${0.08 + Math.random() * 0.2})`; a.lineWidth = Math.random() < 0.25 ? 1.6 : 0.7;
    a.beginPath(); a.moveTo(x, y); a.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); a.stroke();
  }

  // ── Normal: emboss the seams (grooves), rivets (bumps) and scratches ──
  const nC = mk(), n = nC.getContext('2d');
  n.fillStyle = 'rgb(128,128,255)'; n.fillRect(0, 0, S, S);
  for (let g = 0; g <= S; g += CELL) {     // seam grooves: dark/light edges = bevel
    n.strokeStyle = 'rgba(70,128,235,0.9)'; n.lineWidth = 3;
    n.beginPath(); n.moveTo(g, 0); n.lineTo(g, S); n.stroke();
    n.strokeStyle = 'rgba(186,128,235,0.9)';
    n.beginPath(); n.moveTo(g + 3, 0); n.lineTo(g + 3, S); n.stroke();
    n.strokeStyle = 'rgba(128,70,235,0.9)';
    n.beginPath(); n.moveTo(0, g); n.lineTo(S, g); n.stroke();
    n.strokeStyle = 'rgba(128,186,235,0.9)';
    n.beginPath(); n.moveTo(0, g + 3); n.lineTo(S, g + 3); n.stroke();
  }
  for (const [x, y] of rivets) {           // rivet bumps
    const g = n.createRadialGradient(x - 1, y - 1, 0, x, y, 4);
    g.addColorStop(0, 'rgba(180,180,255,1)'); g.addColorStop(1, 'rgba(128,128,255,0)');
    n.fillStyle = g; n.beginPath(); n.arc(x, y, 4, 0, Math.PI * 2); n.fill();
  }
  for (let i = 0; i < 220; i++) {          // scratch grooves
    const x = Math.random() * S, y = Math.random() * S, ang = Math.random() * Math.PI, len = 8 + Math.random() * 40;
    n.strokeStyle = Math.random() < 0.5 ? 'rgba(150,150,255,0.45)' : 'rgba(106,106,255,0.45)';
    n.lineWidth = Math.random() < 0.3 ? 2 : 1;
    n.beginPath(); n.moveTo(x, y); n.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); n.stroke();
  }

  // ── Roughness: panels mid, seams matte, scratches/rivets shinier ──
  const rC = mk(), r = rC.getContext('2d');
  r.fillStyle = '#888'; r.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S, y = Math.random() * S, rad = 30 + Math.random() * 110;
    const g = r.createRadialGradient(x, y, 0, x, y, rad);
    const dark = Math.random() < 0.5;
    g.addColorStop(0, dark ? 'rgba(60,60,60,0.5)' : 'rgba(205,205,205,0.4)');
    g.addColorStop(1, 'rgba(136,136,136,0)');
    r.fillStyle = g; r.beginPath(); r.arc(x, y, rad, 0, Math.PI * 2); r.fill();
  }
  r.strokeStyle = 'rgba(170,170,170,0.5)'; r.lineWidth = 3; // seams matte
  for (let g = 0; g <= S; g += CELL) {
    r.beginPath(); r.moveTo(g, 0); r.lineTo(g, S); r.stroke();
    r.beginPath(); r.moveTo(0, g); r.lineTo(S, g); r.stroke();
  }

  const tex = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.4, 1.4); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  _detailTex = { map: tex(aC, true), normalMap: tex(nC, false), roughnessMap: tex(rC, false) };
  return _detailTex;
}

const _tintC = new THREE.Color();
function _applyArmorLook(bodyMats, visorMats, look) {
  _tintC.setHex(look.body);
  const det = _getDetailTex();
  for (const m of bodyMats) {
    if (m.map) {
      // REALISTIC: keep the GLB's authored texture (skin, fatigues, gear, wear)
      // and apply only a gentle tint so the armour variant still reads — instead
      // of flattening the whole soldier to a solid plastic colour.
      m.color.setRGB(0.68 + 0.32 * _tintC.r, 0.68 + 0.32 * _tintC.g, 0.68 + 0.32 * _tintC.b);
      m.map.colorSpace = THREE.SRGBColorSpace;
      m.map.anisotropy = 8;
    } else {
      // No authored texture — give the plate a realistic worn-metal albedo tinted
      // to the variant colour.
      m.color.setRGB(0.5 + 0.5 * _tintC.r, 0.5 + 0.5 * _tintC.g, 0.5 + 0.5 * _tintC.b);
      m.map = det.map;
    }
    // Surface detail on every body material — adds depth even over a real albedo.
    m.normalMap = det.normalMap;
    m.normalScale = new THREE.Vector2(1.4, 1.4);
    m.roughnessMap = det.roughnessMap;
    m.roughness = Math.min(1, look.roughness + 0.1);
    m.metalness = Math.min(1, look.metalness + 0.15); // shinier so the bevels read
    m.envMapIntensity = 1.1;
    m.needsUpdate = true;
  }
  for (const m of visorMats) {
    m.color.setHex(look.visor);
    m.emissive?.setHex?.(look.visor);
    m.emissiveIntensity = 0.9;
    m.metalness = 0.95;
    m.roughness = 0.14;
    m.needsUpdate = true;
  }
}

// ── Procedural armour pieces ─────────────────────────────────────────────────
// Each loadout type gets a distinct hard-surface silhouette (pauldrons, chest
// plates, packs, helmet add-ons) so ASSAULT / RECON / HEAVY / STEALTH read as
// genuinely different armour, not just recolours. Pieces are parented to the
// Mixamo skeleton bones so they move with the walk/run animation.
const _v = new THREE.Vector3();
const _vScale = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

// Attach `mesh` to `bone` but position/scale it in the model's world space (so
// geometry can be authored in metres regardless of the bone's 0.01 bind scale).
function _attachAtWorld(bone, mesh, wx, wy, wz, worldScale, quat) {
  bone.add(mesh);
  bone.updateWorldMatrix(true, false);
  const q = quat || new THREE.Quaternion();
  const desired = _m.compose(_v.set(wx, wy, wz), q, _vScale.set(worldScale, worldScale, worldScale));
  const local = _m2.copy(bone.matrixWorld).invert().multiply(desired);
  local.decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.frustumCulled = false; // bone-driven bounds expand past the bind pose
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

// Per-armor motion character: animation playback speed + a small additive
// stance (spine lean / head pitch) applied on top of the base clip so each
// type MOVES differently, not just looks different.
const ARMOR_MOTION = {
  assault: { speed: 1.00, spineLean:  0.00, headPitch:  0.00 },
  recon:   { speed: 1.16, spineLean: -0.04, headPitch: -0.06 }, // upright, alert
  heavy:   { speed: 0.82, spineLean:  0.11, headPitch:  0.05 }, // lumbering hunch
  stealth: { speed: 0.92, spineLean:  0.13, headPitch:  0.09 }, // low, prowling
};
const _AX_X = new THREE.Vector3(1, 0, 0);
const _AX_Y = new THREE.Vector3(0, 1, 0);
const _bq1  = new THREE.Quaternion();
const _bq2  = new THREE.Quaternion();

// Returns { animated: [...] } — armour meshes that pulse / blink / sway every
// frame via the group's armorTick(dt).
function _buildArmorPieces(root, armorTypeId, look) {
  const bone = (n) => root.getObjectByName('mixamorig:' + n);
  const s = look.scale || 1;

  const plate = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.body).multiplyScalar(0.78),
    roughness: look.roughness ?? 0.5, metalness: 0.62,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.45, metalness: 0.78 });
  const accent = new THREE.MeshStandardMaterial({
    color: look.visor, emissive: look.visor, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.6,
  });
  const cape = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.body).multiplyScalar(0.4), roughness: 0.92, metalness: 0.05,
    side: THREE.DoubleSide,
  });
  // Clean armoured helmet shell — slightly lighter than the plate so the head
  // reads as a helmet, not a bare scalp.
  const helmetMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.body).lerp(new THREE.Color(0xffffff), 0.25),
    roughness: 0.45, metalness: 0.55,
  });

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r) => new THREE.SphereGeometry(r, 16, 12);
  const oct = (r) => new THREE.OctahedronGeometry(r);
  const cyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 8);
  const tiltBack = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0));

  // Helmet worn by EVERY variant — covers the bald untextured head and gives the
  // soldier a face: an armoured shell + brow, a glowing visor, and a jaw guard.
  const helmet = [
    { bone: 'Head', geo: sph(0.135), mat: helmetMat, x: 0, y: 1.605, z: 0.045 },         // shell
    { bone: 'Head', geo: box(0.20, 0.05, 0.16), mat: helmetMat, x: 0, y: 1.635, z: 0.0 }, // brow ridge
    { bone: 'Head', geo: box(0.13, 0.075, 0.12), mat: helmetMat, x: 0, y: 1.50, z: -0.015 }, // jaw guard
    { bone: 'Head', geo: box(0.185, 0.055, 0.05), mat: accent, x: 0, y: 1.585, z: -0.085,
      anim: { type: 'pulse', freq: 1.1, min: 0.7, max: 1.15 } },                          // glowing visor (the "face")
  ];

  // spec: { bone, geo, mat, x, y, z, quat?, anim? }
  //   anim: { type:'pulse'|'thruster'|'blink'|'sway', freq, ... }
  let specs = [];

  if (armorTypeId === 'recon') {
    specs = [
      { bone: 'Spine2', geo: box(0.24, 0.26, 0.06), mat: plate, x: 0, y: 1.40, z: -0.075 },
      { bone: 'LeftShoulder', geo: box(0.11, 0.09, 0.13), mat: plate, x: -0.16, y: 1.52, z: 0.04 },
      { bone: 'Head', geo: box(0.06, 0.05, 0.09), mat: dark, x: 0.085, y: 1.585, z: -0.01 },
      { bone: 'Head', geo: box(0.11, 0.015, 0.015), mat: accent, x: 0.10, y: 1.585, z: -0.055,
        anim: { type: 'pulse', freq: 6, min: 0.4, max: 1.9 } },           // visor scanner line
      { bone: 'Head', geo: cyl(0.008, 0.20), mat: dark, x: 0.085, y: 1.72, z: 0.05 },
      { bone: 'Head', geo: sph(0.013), mat: accent, x: 0.085, y: 1.82, z: 0.05,
        anim: { type: 'blink', freq: 5, on: 2.4, off: 0.1 } },            // antenna tip blink
      { bone: 'Spine2', geo: box(0.05, 0.05, 0.10), mat: accent, x: 0, y: 1.30, z: 0.12,
        anim: { type: 'pulse', freq: 4, min: 0.3, max: 1.6 } },           // back beacon
    ];
  } else if (armorTypeId === 'heavy') {
    specs = [
      { bone: 'Spine2', geo: box(0.40, 0.42, 0.18), mat: plate, x: 0, y: 1.40, z: -0.05 },
      { bone: 'Spine1', geo: box(0.34, 0.18, 0.14), mat: plate, x: 0, y: 1.21, z: -0.05 },
      { bone: 'LeftShoulder', geo: sph(0.135), mat: plate, x: -0.205, y: 1.52, z: 0.03 },
      { bone: 'RightShoulder', geo: sph(0.135), mat: plate, x: 0.205, y: 1.52, z: 0.03 },
      { bone: 'LeftShoulder', geo: box(0.10, 0.05, 0.10), mat: accent, x: -0.205, y: 1.61, z: 0.03,
        anim: { type: 'thruster', freq: 2.2, min: 0.6, max: 2.6 } },      // shoulder vents
      { bone: 'RightShoulder', geo: box(0.10, 0.05, 0.10), mat: accent, x: 0.205, y: 1.61, z: 0.03,
        anim: { type: 'thruster', freq: 2.2, min: 0.6, max: 2.6, phase: 1.0 } },
      { bone: 'Spine2', geo: box(0.32, 0.36, 0.20), mat: dark, x: 0, y: 1.40, z: 0.17 },
      { bone: 'Spine2', geo: box(0.07, 0.30, 0.06), mat: accent, x: 0, y: 1.40, z: 0.28,
        anim: { type: 'pulse', freq: 1.6, min: 0.5, max: 2.4 } },         // power core
      { bone: 'Neck', geo: box(0.28, 0.11, 0.24), mat: plate, x: 0, y: 1.52, z: 0.04 },
      { bone: 'LeftUpLeg', geo: box(0.15, 0.24, 0.17), mat: plate, x: -0.115, y: 0.92, z: -0.02 },
      { bone: 'RightUpLeg', geo: box(0.15, 0.24, 0.17), mat: plate, x: 0.115, y: 0.92, z: -0.02 },
      { bone: 'Spine2', geo: cyl(0.045, 0.12), mat: accent, x: -0.10, y: 1.27, z: 0.30,
        anim: { type: 'thruster', freq: 3, min: 0.4, max: 2.2 } },        // exhaust nozzles
      { bone: 'Spine2', geo: cyl(0.045, 0.12), mat: accent, x: 0.10, y: 1.27, z: 0.30,
        anim: { type: 'thruster', freq: 3, min: 0.4, max: 2.2, phase: 1.6 } },
    ];
  } else if (armorTypeId === 'stealth') {
    specs = [
      { bone: 'Spine2', geo: box(0.25, 0.30, 0.05), mat: plate, x: 0, y: 1.40, z: -0.075 },
      { bone: 'LeftShoulder', geo: oct(0.085), mat: dark, x: -0.17, y: 1.52, z: 0.04 },
      { bone: 'RightShoulder', geo: oct(0.085), mat: dark, x: 0.17, y: 1.52, z: 0.04 },
      { bone: 'Head', geo: box(0.20, 0.16, 0.20), mat: dark, x: 0, y: 1.65, z: 0.10, quat: tiltBack }, // cowl
      { bone: 'Head', geo: box(0.16, 0.03, 0.16), mat: accent, x: 0, y: 1.60, z: 0.10,
        anim: { type: 'pulse', freq: 1.5, min: 0.12, max: 0.7 } },        // cowl rim glow
      { bone: 'Spine2', geo: box(0.05, 0.42, 0.10), mat: dark, x: 0.07, y: 1.40, z: 0.14,
        anim: { type: 'sway', axis: 'x', amp: 0.06, freq: 1.6 } },        // back sheath
      { bone: 'Spine2', geo: box(0.03, 0.30, 0.03), mat: accent, x: 0, y: 1.40, z: -0.10,
        anim: { type: 'pulse', freq: 2.0, min: 0.15, max: 0.95 } },       // chest light strip
      { bone: 'Spine2', geo: box(0.32, 0.55, 0.02), mat: cape, x: 0, y: 1.12, z: 0.135,
        anim: { type: 'sway', axis: 'x', amp: 0.10, freq: 1.25 } },       // flowing cape
    ];
  } else {
    specs = [
      { bone: 'Spine2', geo: box(0.31, 0.35, 0.12), mat: plate, x: 0, y: 1.40, z: -0.055 },
      { bone: 'Spine2', geo: box(0.05, 0.22, 0.04), mat: accent, x: 0, y: 1.40, z: -0.115,
        anim: { type: 'pulse', freq: 3.2, min: 0.5, max: 1.7 } },         // chest emitter heartbeat
      { bone: 'LeftShoulder', geo: box(0.15, 0.13, 0.17), mat: plate, x: -0.18, y: 1.51, z: 0.04 },
      { bone: 'RightShoulder', geo: box(0.15, 0.13, 0.17), mat: plate, x: 0.18, y: 1.51, z: 0.04 },
      { bone: 'LeftShoulder', geo: box(0.045, 0.045, 0.045), mat: accent, x: -0.18, y: 1.59, z: 0.04,
        anim: { type: 'blink', freq: 4, on: 1.9, off: 0.2 } },            // shoulder beacons (alternating)
      { bone: 'RightShoulder', geo: box(0.045, 0.045, 0.045), mat: accent, x: 0.18, y: 1.59, z: 0.04,
        anim: { type: 'blink', freq: 4, on: 1.9, off: 0.2, phase: Math.PI } },
      { bone: 'Spine', geo: box(0.32, 0.09, 0.22), mat: dark, x: 0, y: 1.13, z: -0.01 },     // belt
      { bone: 'Spine2', geo: box(0.22, 0.26, 0.13), mat: dark, x: 0, y: 1.38, z: 0.14 },     // pack
    ];
  }

  specs = [...helmet, ...specs]; // every soldier wears the helmet

  const animated = [];
  for (const sp of specs) {
    const b = bone(sp.bone);
    if (!b) continue;
    const mat = sp.anim ? sp.mat.clone() : sp.mat; // independent animation per piece
    const mesh = new THREE.Mesh(sp.geo, mat);
    _attachAtWorld(b, mesh, sp.x * s, sp.y * s, sp.z * s, s, sp.quat);
    if (sp.anim) {
      animated.push({ mesh, mat, anim: sp.anim, baseQuat: mesh.quaternion.clone() });
    }
  }
  return { animated };
}

// Cosmetic skin tint: recolours the armour plates toward the equipped skin
// while keeping the variant's glowing visor. Blends toward the variant base
// colour so equipped skins read as armour shades rather than flat solid blobs.
export function tintHumanSoldier(group, skin, armorSkin = null) {
  const mats = group.userData?.bodyMats;
  if (!mats || !mats.length) return;
  const hex = armorSkin ? armorSkin.primary : skin?.primary;
  if (hex == null) return;
  const tint = new THREE.Color(hex);
  for (const m of mats) {
    if (m.map) {
      // Brighten toward the skin colour so light skins (white armour) read bright,
      // while keeping the texture detail (values can exceed 1 to lift the GLB grey).
      m.color.setRGB(0.45 + 0.7 * tint.r, 0.45 + 0.7 * tint.g, 0.45 + 0.7 * tint.b);
    } else {
      m.color.copy(tint).lerp(new THREE.Color(group.userData?.baseBodyColor ?? 0x5a7d35), 0.35);
    }
    m.needsUpdate = true;
  }
}
