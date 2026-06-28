import * as THREE from 'three';
import { WEAPONS } from './weaponDefs.js';
import { buildWeaponModel } from './WeaponModels.js';
import { applyWeaponSkin, animateWeaponSkin } from './WeaponSkins.js';
import { applySwordSkin, animateSwordSkin } from './SwordSkins.js';

const TRACER_LIFE = 0.07;
const FLASH_LIFE = 0.05;

// Kawaii skins (anime pew, cat meow, uwu squeak, puppy yip, magic sparkle) all
// get the pink muzzle flash + sparkle-heart burst treatment.
const CUTE_SOUNDS = new Set(['anime', 'meow', 'uwu', 'bark', 'sparkle']);
// Fire-sound skins get an orange/red muzzle flash + ember burst.
const FIRE_SOUNDS = new Set(['fire']);

function createTracerMesh() {
  const geo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true);
  geo.translate(0, 0.5, 0);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.9 });
  return new THREE.Mesh(geo, mat);
}

export class WeaponSystem {
  constructor(camera, scene, audio) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;

    // Every weapon model/state is kept so any can be brought into a match, but
    // the ACTIVE loadout is exactly one gun + one melee (set via setLoadout).
    this.allWeapons = WEAPONS;
    const defGun   = WEAPONS.find((w) => w.kind !== 'melee');
    const defMelee = WEAPONS.find((w) => w.kind === 'melee');
    this.loadout = [defGun, defMelee].filter(Boolean);
    this.keyMap = new Map();
    this._rebuildKeyMap();
    this.currentIndex = 0;
    this.state = new Map();
    for (const w of this.allWeapons) {
      this.state.set(w.id, {
        magAmmo: w.kind === 'melee' ? 0 : w.magSize,
        reserveAmmo: w.kind === 'melee' ? 0 : w.reserveMax,
        isReloading: false,
        reloadTimer: 0
      });
    }

    // Thrown-knife projectiles
    this.thrownKnives = [];
    this._knifeCooldown = 0;
    this._prevRightMouse = false;

    this.fireTimer = 0;
    this.prevMouseDown = false;
    this.kickPos = new THREE.Vector3();
    this.kickRotX = 0;
    this.swingPhase = 1;
    this.scopeT = 0; // 0..1 zoom blend
    this._sprintT = 0; // 0..1 sprint carry blend

    this.tracers = [];
    this.rockets = [];
    this.explosions = [];
    this.shells = [];
    this._idleT = 0;
    this.weaponSkin = null;
    this.swordSkin = null;
    this.animTime = 0;
    this.flashLight = new THREE.PointLight(0xffcc66, 0, 8, 1.8);
    // (sky-only lighting) flashLight not added to scene

    // Visible muzzle flash sprite — two crossed quads for a star shape
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });
    this._flashMeshes = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(0.18, 0.18);
      const mesh = new THREE.Mesh(geo, flashMat.clone());
      mesh.rotation.z = (i / 3) * Math.PI;
      this._flashMeshes.push(mesh);
    }

    // Pre-allocated scratch vectors — avoids GC spikes from per-shot allocations
    this._camPos      = new THREE.Vector3();
    this._camDir      = new THREE.Vector3();
    this._rightVec    = new THREE.Vector3();
    this._upVec       = new THREE.Vector3();
    this._fwdVec      = new THREE.Vector3();
    this._muzzleWorld = new THREE.Vector3();
    this._pelletDir   = new THREE.Vector3();
    this._farVec      = new THREE.Vector3();
    this._raycaster   = new THREE.Raycaster();

    // Shared shell casing geo/mat — created once, reused by every ejected casing
    this._shellGeo = new THREE.CylinderGeometry(0.0048, 0.0035, 0.02, 6);
    this._shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a520, roughness: 0.28, metalness: 0.9 });

    this._buildViewmodels();
    this._lastSpawnedTracerHolder = scene;

    this.onShoot = null; // (weaponDef) => void
    this.onHitBot = null; // (bot, dmg, point) => void
    this.onHitWorld = null; // (point) => void
    this.onEmpty = null; // () => void
    this.onReloadStart = null;
    this.applyRecoilToPlayer = null; // (amount) => void
  }

  _buildViewmodels() {
    this.weaponMount = new THREE.Object3D();
    this.weaponMount.position.set(0.32, -0.26, -0.5);
    this.camera.add(this.weaponMount);

    // Dedicated viewmodel key light — a short-range light parented to the camera
    // that rakes across the gun so its metal/clearcoat highlights always read.
    this.vmLight = new THREE.PointLight(0xffffff, 4.5, 1.8, 2);
    this.vmLight.position.set(0.5, 0.35, 0.0);
    // (sky-only lighting) vmLight not added to scene
    // Cool fill from the other side to shape the form.
    this.vmFill = new THREE.PointLight(0x88aaff, 1.6, 1.8, 2);
    this.vmFill.position.set(-0.5, -0.1, -0.2);
    // (sky-only lighting) vmFill not added to scene

    this.swayGroup = new THREE.Object3D();
    this.weaponMount.add(this.swayGroup);

    this.kickGroup = new THREE.Object3D();
    this.swayGroup.add(this.kickGroup);

    this.models = new Map();
    for (const w of this.allWeapons) {
      const { group, muzzle } = buildWeaponModel(w);
      group.visible = false;
      this.kickGroup.add(group);
      this.models.set(w.id, { group, muzzle });
    }
    this._setActiveModel(0);
    this._buildArm();
  }

  _buildArm() {
    this.sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x2d3540, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.6
    });
    this.gloveMat = new THREE.MeshStandardMaterial({
      color: 0x191c22, roughness: 0.52, metalness: 0.12, envMapIntensity: 1.0
    });
    const gloveSeam = new THREE.MeshStandardMaterial({
      color: 0x0c0e12, roughness: 0.6, metalness: 0.08
    });

    const bx = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const cy = (r1, r2, h, mat, segs = 12) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, segs), mat);
      m.rotation.x = Math.PI / 2;
      return m;
    };

    const arm = new THREE.Group();

    // Forearm — tapered sleeve
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.062, 0.38, 12), this.sleeveMat);
    forearm.rotation.x = 1.18;
    forearm.position.set(0, -0.055, 0.19);
    arm.add(forearm);

    // Sleeve cuff detail ring
    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.018, 12), gloveSeam);
    cuff.rotation.x = 1.18;
    cuff.position.set(0, -0.032, 0.01);
    arm.add(cuff);

    // Wrist
    const wrist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.046, 0.07, 12), this.gloveMat);
    wrist.rotation.x = 1.18;
    wrist.position.set(0, -0.022, -0.02);
    arm.add(wrist);

    // Palm
    const palm = bx(0.088, 0.048, 0.095, this.gloveMat);
    palm.position.set(0, 0.0, -0.098);
    arm.add(palm);

    // Knuckle ridge
    const knuckleBar = bx(0.09, 0.014, 0.018, gloveSeam);
    knuckleBar.position.set(0, 0.025, -0.148);
    arm.add(knuckleBar);

    // 4 fingers
    const fingerX = [-0.031, -0.010, 0.011, 0.032];
    fingerX.forEach((xOff, i) => {
      const len = i === 0 || i === 3 ? 0.055 : 0.065;
      const fing = cy(0.009, 0.011, len, this.gloveMat, 8);
      fing.rotation.x = 1.38;
      fing.position.set(xOff, 0.018, -0.178 - (i === 0 || i === 3 ? 0.005 : 0));
      arm.add(fing);
      // fingertip cap
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), gloveSeam);
      tip.position.set(xOff, 0.038, -0.207 - (i === 0 || i === 3 ? 0.004 : 0));
      arm.add(tip);
    });

    // Thumb
    const thumb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.016, 0.055, 8), this.gloveMat);
    thumb.rotation.x = 1.22;
    thumb.rotation.z = -0.45;
    thumb.position.set(-0.052, 0.01, -0.115);
    arm.add(thumb);
    const thumbTip = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), gloveSeam);
    thumbTip.position.set(-0.068, 0.022, -0.148);
    arm.add(thumbTip);

    arm.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });
    this.swayGroup.add(arm);
    this.armGroup = arm;
  }

  setSkin(skin) {
    this.sleeveMat.color.setHex(skin.primary);
    this.gloveMat.color.setHex(skin.secondary);
  }

  /** Apply a cosmetic weapon finish to all gun (non-melee) models. */
  setWeaponSkin(skin) {
    this.weaponSkin = skin;
    if (!skin) return;
    for (const w of this.allWeapons) {
      if (w.kind === 'melee') continue;
      applyWeaponSkin(this.models.get(w.id).group, skin);
    }
  }

  /** Apply a cosmetic finish to every melee model. */
  setSwordSkin(skin) {
    this.swordSkin = skin;
    if (!skin) return;
    for (const w of this.allWeapons) {
      if (w.kind !== 'melee') continue;
      applySwordSkin(this.models.get(w.id).group, skin);
    }
  }

  /**
   * Apply per-weapon skins from the Armory skin map.
   * Map<weaponId, { skin, isSword }> — each weapon gets its own individual finish.
   */
  applyArmoryMap(map) {
    this._armoryMap = map;
    for (const w of this.allWeapons) {
      const entry = map.get(w.id);
      if (!entry) continue;
      const { group } = this.models.get(w.id);
      if (entry.isSword) {
        this.swordSkin = entry.skin;
        applySwordSkin(group, entry.skin);
      } else {
        if (!this.weaponSkin) this.weaponSkin = entry.skin;
        applyWeaponSkin(group, entry.skin);
      }
    }
  }

  // Resolve the cosmetic skin currently applied to a given weapon: prefer the
  // per-weapon Armory entry, fall back to the global weapon/sword skin.
  _activeSkinFor(weaponId) {
    const entry = this._armoryMap?.get(weaponId);
    if (entry) return entry.skin;
    const def = this.loadout.find((w) => w.id === weaponId);
    return def?.kind === 'melee' ? this.swordSkin : this.weaponSkin;
  }

  _rebuildKeyMap() {
    // Active loadout maps to slots 1 (gun) and 2 (melee).
    this.keyMap = new Map();
    this.loadout.forEach((w, i) => this.keyMap.set(`Digit${i + 1}`, i));
  }

  /** Set the active loadout to a single gun + single melee weapon. */
  setLoadout(gunId, meleeId) {
    const gun = this.allWeapons.find((w) => w.id === gunId && w.kind !== 'melee')
             || this.allWeapons.find((w) => w.kind !== 'melee');
    const melee = this.allWeapons.find((w) => w.id === meleeId && w.kind === 'melee')
               || this.allWeapons.find((w) => w.kind === 'melee');
    this.loadout = [gun, melee].filter(Boolean);
    this.currentIndex = 0;
    this._rebuildKeyMap();
    this._setActiveModel(0);
  }

  _setActiveModel(index) {
    // Hide every model, then show the active loadout slot.
    for (const w of this.allWeapons) {
      const m = this.models.get(w.id);
      if (m) m.group.visible = false;
    }
    const cur = this.loadout[index];
    if (cur) this.models.get(cur.id).group.visible = true;
  }

  get currentDef() {
    return this.loadout[this.currentIndex];
  }

  get currentState() {
    return this.state.get(this.currentDef.id);
  }

  switchTo(index) {
    if (index === this.currentIndex || index < 0 || index >= this.loadout.length) return;
    const st = this.currentState;
    if (st.isReloading) {
      st.isReloading = false;
    }
    this.currentIndex = index;
    this.fireTimer = Math.max(this.fireTimer, 0.12);
    this._setActiveModel(index);
    this.audio.playWeaponSwitch();
  }

  resetState(baseFov) {
    this.currentIndex = 0;
    this._setActiveModel(0);
    for (const w of this.allWeapons) {
      const st = this.state.get(w.id);
      st.magAmmo = w.kind === 'melee' ? 0 : w.magSize;
      st.reserveAmmo = w.kind === 'melee' ? 0 : w.reserveMax;
      st.isReloading = false;
      st.reloadTimer = 0;
    }
    this.fireTimer = 0;
    this.kickPos.set(0, 0, 0);
    this.kickRotX = 0;
    this.swingPhase = 1;
    this.scopeT = 0;
    this._knifeCooldown = 0;
    this._prevRightMouse = false;
    this.camera.fov = baseFov;
    this.camera.updateProjectionMatrix();

    // drop any in-flight thrown knives from a previous round
    for (const k of this.thrownKnives) {
      this.scene.remove(k.mesh);
      k.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.thrownKnives.length = 0;

    // drop any in-flight rockets / explosions from a previous round
    for (const r of this.rockets) {
      this.scene.remove(r.mesh);
      r.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.rockets.length = 0;
    for (const e of this.explosions) {
      this.scene.remove(e.mesh);
      this.scene.remove(e.light);
    }
    this.explosions.length = 0;
    for (const s of this.shells) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    }
    this.shells.length = 0;
  }

  startReload() {
    const def = this.currentDef;
    const st = this.currentState;
    if (def.kind === 'melee' || st.isReloading) return;
    if (st.magAmmo >= def.magSize || st.reserveAmmo <= 0) return;
    st.isReloading = true;
    st.reloadTimer = def.reloadTime;
    // Two-phase reload: mag drop immediately, rack/bolt halfway through
    this.audio.playReloadMag();
    setTimeout(() => { if (st.isReloading) this.audio.playReloadRack(); }, (def.reloadTime * 0.55) * 1000);
    if (this.onReloadStart) this.onReloadStart();
  }

  _completeReload() {
    const def = this.currentDef;
    const st = this.currentState;
    const needed = def.magSize - st.magAmmo;
    const transfer = Math.min(needed, st.reserveAmmo);
    st.magAmmo += transfer;
    st.reserveAmmo -= transfer;
    st.isReloading = false;
  }

  _spawnTracer(from, to) {
    const mesh = createTracerMesh();
    mesh.position.copy(from);
    const dist = from.distanceTo(to);
    mesh.scale.set(1, 1, dist);
    mesh.lookAt(to);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: TRACER_LIFE });
  }

  _flash() {
    const skinSound  = this._activeSkinFor?.(this.currentDef?.id)?.shootSound;
    const animeActive = CUTE_SOUNDS.has(skinSound);
    const fireActive  = FIRE_SOUNDS.has(skinSound);
    const flashColor  = animeActive ? 0xff69b4 : fireActive ? 0xff4400 : 0xffcc66;
    const flashHex    = animeActive ? 0xff9de0 : fireActive ? 0xff6600 : 0xfff0a0;
    this.flashLight.color.setHex(flashColor);
    this.flashLight.intensity = animeActive ? 12 : fireActive ? 14 : 8;
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(this._muzzleWorld);
    this.camera.worldToLocal(this._muzzleWorld);
    const muzzleWorld = this._muzzleWorld;
    this.flashLight.position.copy(muzzleWorld);
    this._flashTimer = FLASH_LIFE;

    // Show sprite meshes at muzzle
    const muzzleObj = this.models.get(this.currentDef.id).muzzle;
    this._flashMeshes.forEach((m) => {
      muzzleObj.add(m);
      m.material.color.setHex(flashHex);
      m.material.opacity = 0.92;
      m.rotation.z += Math.random() * Math.PI;
    });
  }

  _spawnShell() {
    const mesh = new THREE.Mesh(this._shellGeo, this._shellMat);
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(this._muzzleWorld);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    mesh.position.copy(this._muzzleWorld)
      .addScaledVector(this._rightVec, 0.12)
      .addScaledVector(this._upVec, -0.05);
    this.scene.add(mesh);
    const vel = this._rightVec.clone().multiplyScalar(2.8 + Math.random() * 1.4);
    vel.addScaledVector(this._upVec, 1.8 + Math.random() * 1.0);
    vel.x += (Math.random() - 0.5) * 0.8;
    vel.z += (Math.random() - 0.5) * 0.8;
    this.shells.push({ mesh, vel, life: 0.55 });
  }

  _spawnAnimeSparkles() {
    if (!this._animeSparkles) this._animeSparkles = [];
    const colors = [0xff69b4, 0xff1493, 0xffa0d0, 0xffd700, 0xffffff];
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(this._muzzleWorld);
    const muzzleWorld = this._muzzleWorld;
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = this._upVec, right = this._rightVec;
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.SphereGeometry(0.015 + Math.random() * 0.02, 4, 3);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true, opacity: 1.0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(muzzleWorld);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        1.5 + Math.random() * 3,
        (Math.random() - 0.5) * 4
      );
      vel.addScaledVector(up,    Math.random() * 2.5);
      vel.addScaledVector(right, (Math.random() - 0.5) * 2);
      this._animeSparkles.push({ mesh, vel, life: 0.5 + Math.random() * 0.3, spin: Math.random() * 10 });
    }
  }

  _updateAnimeSparkles(dt) {
    if (!this._animeSparkles?.length) return;
    for (let i = this._animeSparkles.length - 1; i >= 0; i--) {
      const s = this._animeSparkles[i];
      s.vel.y -= 8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.z += s.spin * dt;
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.5);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this._animeSparkles.splice(i, 1);
      }
    }
  }

  _spawnFireEmbers() {
    if (!this._fireEmbers) this._fireEmbers = [];
    const colors = [0xff2200, 0xff6600, 0xff9900, 0xffcc00, 0xff4400];
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(this._muzzleWorld);
    const muzzleWorld = this._muzzleWorld;
    this._fwdVec.setFromMatrixColumn(this.camera.matrixWorld, 2).negate();
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const fwd = this._fwdVec, up = this._upVec, right = this._rightVec;
    for (let i = 0; i < 12; i++) {
      const size = 0.012 + Math.random() * 0.022;
      const geo = new THREE.SphereGeometry(size, 4, 3);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true, opacity: 1.0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(muzzleWorld);
      this.scene.add(mesh);
      const spread = 0.8 + Math.random() * 1.6;
      const vel = fwd.clone().multiplyScalar(5 + Math.random() * 8);
      vel.addScaledVector(up,    (Math.random() - 0.3) * spread * 4);
      vel.addScaledVector(right, (Math.random() - 0.5) * spread * 4);
      this._fireEmbers.push({ mesh, vel, life: 0.28 + Math.random() * 0.22, spin: Math.random() * 14 });
    }
  }

  _updateFireEmbers(dt) {
    if (!this._fireEmbers?.length) return;
    for (let i = this._fireEmbers.length - 1; i >= 0; i--) {
      const s = this._fireEmbers[i];
      s.vel.y += 6 * dt; // embers rise
      s.vel.multiplyScalar(1 - dt * 3.5); // drag
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.z += s.spin * dt;
      s.life -= dt;
      const t = Math.max(0, s.life / 0.35);
      s.mesh.material.opacity = t;
      s.mesh.scale.setScalar(0.5 + t * 0.6); // shrink as they fade
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this._fireEmbers.splice(i, 1);
      }
    }
  }

  _updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += dt * 18;
      s.mesh.rotation.z += dt * 14;
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.shells.splice(i, 1);
      }
    }
  }

  _doHitscanShot(world, botMeshes) {
    const def = this.currentDef;
    const st = this.currentState;
    this.camera.getWorldPosition(this._camPos);
    this.camera.getWorldDirection(this._camDir);
    this._rightVec.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._upVec.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.models.get(def.id).muzzle.getWorldPosition(this._muzzleWorld);

    this._raycaster.far = def.range;
    const targets = [...botMeshes, ...world.colliders.map((c) => c.mesh)];

    const pelletCount = def.pellets || 1;
    let anyHitBot = false;
    let lastImpact = null;

    for (let i = 0; i < pelletCount; i++) {
      this._pelletDir.copy(this._camDir);
      if (def.spread > 0) {
        const jx = (Math.random() - 0.5) * def.spread;
        const jy = (Math.random() - 0.5) * def.spread;
        this._pelletDir.addScaledVector(this._rightVec, jx).addScaledVector(this._upVec, jy).normalize();
      }
      this._raycaster.set(this._camPos, this._pelletDir);
      const hits = this._raycaster.intersectObjects(targets, true);
      const hit = hits.find((h) => !h.object.userData.noHit);
      if (hit) {
        lastImpact = hit.point;
        const bot = hit.object.userData.bot;
        if (bot) {
          anyHitBot = true;
          // Procedural bots tag head meshes; the human model is one skinned mesh,
          // so resolve its headshots from the hit height (~1.5m+ above the feet).
          const isHead = bot.mesh?.userData?.isHuman
            ? (hit.point.y - bot.position.y) > 1.5
            : !!hit.object.userData.isHead;
          const mult   = isHead && def.headshotMultiplier ? def.headshotMultiplier : 1;
          if (this.onHitBot) this.onHitBot(bot, def.damage * mult, hit.point, { headshot: isHead });
        } else if (this.onHitWorld) {
          this.onHitWorld(hit.point);
        }
        this._spawnTracer(this._muzzleWorld, hit.point);
      } else {
        this._farVec.copy(this._camPos).addScaledVector(this._pelletDir, def.range);
        this._spawnTracer(this._muzzleWorld, this._farVec);
      }
    }

    return anyHitBot;
  }

  _doMeleeSwing(player, world, botManager) {
    const def = this.currentDef;
    const camPos = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();

    for (const bot of botManager.bots) {
      if (!bot.alive) continue;
      const toBot = new THREE.Vector3(bot.position.x - player.position.x, 0, bot.position.z - player.position.z);
      const dist = toBot.length();
      if (dist > def.range) continue;
      toBot.normalize();
      const dot = camDir.dot(toBot);
      if (dot > Math.cos(def.arc)) {
        if (this.onHitBot) this.onHitBot(bot, def.damage, bot.position);
      }
    }
  }

  _makeThrownKnifeMesh(def) {
    const skin = this._activeSkinFor(def.id);
    const bladeColor = skin?.blade ?? 0xc0c6ce;
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({
      color: bladeColor, metalness: 0.9, roughness: 0.18,
      emissive: new THREE.Color(skin?.emissive ?? 0x000000),
      emissiveIntensity: skin?.emissiveIntensity ?? 0,
    });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.82, metalness: 0.1 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.26), bladeMat);
    blade.position.z = -0.1;
    g.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 6), bladeMat);
    tip.rotation.x = -Math.PI / 2; tip.position.z = -0.27;
    g.add(tip);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.1), gripMat);
    grip.position.z = 0.08;
    g.add(grip);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  _throwKnife(def) {
    const muzzleWorld = new THREE.Vector3();
    this.models.get(def.id).muzzle.getWorldPosition(muzzleWorld);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir).normalize();

    const mesh = this._makeThrownKnifeMesh(def);
    mesh.position.copy(muzzleWorld);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    this.scene.add(mesh);

    this.thrownKnives.push({
      mesh, pos: muzzleWorld.clone(), dir: dir.clone(),
      speed: def.throwSpeed || 40, life: 3, def
    });

    this._knifeCooldown = def.throwCooldown || 0.9;
    // hide the in-hand knife until a fresh one is pulled (cooldown end)
    const m = this.models.get(def.id);
    if (m) m.group.visible = false;
    if (this.audio.playSwing) this.audio.playSwing();
  }

  _updateThrownKnives(dt, world, botManager) {
    if (!this.thrownKnives.length) return;
    const worldMeshes = world.colliders.map((c) => c.mesh);
    const botMeshes = botManager.getRaycastTargets();
    const ray = new THREE.Raycaster();
    const spinAxis = new THREE.Vector3(1, 0, 0);

    for (let i = this.thrownKnives.length - 1; i >= 0; i--) {
      const k = this.thrownKnives[i];
      const prev = k.pos.clone();
      const step = k.speed * dt;
      k.pos.addScaledVector(k.dir, step);
      k.life -= dt;

      let hitPoint = null, hitBot = null;
      ray.set(prev, k.dir);
      ray.far = step + 0.2;
      const hits = ray
        .intersectObjects([...botMeshes, ...worldMeshes], true)
        .filter((h) => !h.object.userData.noHit);
      if (hits.length) { hitPoint = hits[0].point; hitBot = hits[0].object.userData.bot; }

      const oob = Math.abs(k.pos.x) > world.arenaHalf || Math.abs(k.pos.z) > world.arenaHalf;
      if (!hitPoint && (k.pos.y <= 0.05 || oob || k.life <= 0)) hitPoint = k.pos.clone();

      if (hitPoint) {
        if (hitBot && this.onHitBot) {
          // one-hit kill + 3x reward (only thrown knives carry rewardMult)
          this.onHitBot(hitBot, k.def.throwDamage || 9999, hitPoint,
            { rewardMult: k.def.throwRewardMult || 3, thrown: true });
        }
        this.scene.remove(k.mesh);
        k.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        this.thrownKnives.splice(i, 1);
      } else {
        k.mesh.position.copy(k.pos);
        k.mesh.rotateOnAxis(spinAxis, dt * 24); // tumbling throw
      }
    }
  }

  _spawnRocket(def) {
    const muzzleWorld = new THREE.Vector3();
    this.models.get(def.id).muzzle.getWorldPosition(muzzleWorld);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.normalize();

    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6b6f55, roughness: 0.6, metalness: 0.3 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 0.5, metalness: 0.3 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x222420, roughness: 0.7 });

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), bodyMat);
    tube.rotation.x = Math.PI / 2;
    g.add(tube);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 10), noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.16;
    g.add(nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, 0.06), finMat);
      fin.position.z = 0.1;
      fin.rotation.z = (i / 4) * Math.PI * 2;
      fin.position.x = Math.cos((i / 4) * Math.PI * 2) * 0.04;
      fin.position.y = Math.sin((i / 4) * Math.PI * 2) * 0.04;
      g.add(fin);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.copy(muzzleWorld);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    this.scene.add(g);

    this.rockets.push({
      mesh: g,
      pos: muzzleWorld.clone(),
      dir: dir.clone(),
      speed: def.rocketSpeed || 40,
      life: 5,
      def
    });
  }

  _updateRockets(dt, world, botManager) {
    if (!this.rockets.length) return;
    const worldMeshes = world.colliders.map((c) => c.mesh);
    const botMeshes = botManager.getRaycastTargets();
    const ray = new THREE.Raycaster();

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const prev = r.pos.clone();
      const stepLen = r.speed * dt;
      r.pos.addScaledVector(r.dir, stepLen);
      r.life -= dt;

      let hitPoint = null;
      ray.set(prev, r.dir);
      ray.far = stepLen + 0.15;
      const hits = ray
        .intersectObjects([...worldMeshes, ...botMeshes], true)
        .filter((h) => !h.object.userData.noHit);
      if (hits.length) hitPoint = hits[0].point;

      const outOfBounds = Math.abs(r.pos.x) > world.arenaHalf || Math.abs(r.pos.z) > world.arenaHalf;
      if (!hitPoint && (r.pos.y <= 0.05 || outOfBounds)) hitPoint = r.pos.clone();
      if (!hitPoint && r.life <= 0) hitPoint = r.pos.clone();

      if (hitPoint) {
        this._explode(hitPoint, r.def, botManager);
        this.scene.remove(r.mesh);
        r.mesh.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            o.material.dispose();
          }
        });
        this.rockets.splice(i, 1);
      } else {
        r.mesh.position.copy(r.pos);
      }
    }
  }

  _explode(point, def, botManager) {
    if (this.audio.playExplosion) this.audio.playExplosion();

    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa53a, transparent: true, opacity: 0.95 })
    );
    fireball.position.copy(point);
    this.scene.add(fireball);
    const light = new THREE.PointLight(0xff8a3a, 10, (def.splashRadius || 5) * 3.5, 2);
    light.position.copy(point);
    // (sky-only lighting) explosion light not added to scene
    this.explosions.push({ mesh: fireball, light, t: 0, life: 0.45, radius: def.splashRadius || 5 });

    const radius = def.splashRadius || 5;
    const minF = def.splashMin !== undefined ? def.splashMin : 0.25;
    for (const bot of botManager.bots) {
      if (!bot.alive) continue;
      const bc = new THREE.Vector3(bot.position.x, bot.position.y + 0.9, bot.position.z);
      const d = bc.distanceTo(point);
      if (d <= radius) {
        const f = THREE.MathUtils.lerp(1, minF, THREE.MathUtils.clamp(d / radius, 0, 1));
        if (this.onHitBot) this.onHitBot(bot, def.damage * f, point);
      }
    }
  }

  _updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      const p = e.t / e.life;
      if (p >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.scene.remove(e.light);
        this.explosions.splice(i, 1);
        continue;
      }
      const visR = THREE.MathUtils.lerp(0.3, e.radius * 0.7, p);
      e.mesh.scale.setScalar(visR / 0.3);
      e.mesh.material.opacity = 0.95 * (1 - p);
      e.light.intensity = 10 * (1 - p);
    }
  }

  _fire(world, botMeshes, player, botManager) {
    const def = this.currentDef;
    const st = this.currentState;

    if (def.kind === 'melee') {
      this.audio.playSwing();
      this._doMeleeSwing(player, world, botManager);
      this.swingPhase = 0;
      this.fireTimer = def.fireRate;
      if (this.onShoot) this.onShoot(def);
      return;
    }

    if (st.isReloading) return;
    if (st.magAmmo <= 0) {
      this.audio.playEmptyClick();
      if (this.onEmpty) this.onEmpty();
      this.startReload();
      return;
    }

    st.magAmmo -= 1;
    this.fireTimer = def.fireRate;
    // A themed skin can override the fire SFX (anime pew, laser, fire whoosh).
    const activeSkin = this._activeSkinFor(def.id);
    const skinSound  = activeSkin?.shootSound;
    if (!(skinSound && this.audio.playSkinShot(skinSound))) {
      this.audio.playShot(def.sound || 'rifle');
    }
    // Shell casing clink (not for melee, rocket, or shotgun — they eject differently)
    if (def.kind !== 'rocket' && def.kind !== 'melee' && def.sound !== 'shotgun') {
      this.audio.playShellCasing();
    }
    if (def.kind === 'rocket') {
      this._spawnRocket(def);
    } else {
      this._doHitscanShot(world, botMeshes);
      this._spawnShell();
    }
    this._flash();
    // Kawaii skins: spawn pink sparkle hearts at the muzzle
    if (CUTE_SOUNDS.has(skinSound)) this._spawnAnimeSparkles();
    // Fire skins with fireEmbers flag: spawn orange ember burst
    const activeSkinDef = this._activeSkinFor?.(this.currentDef?.id);
    if (activeSkinDef?.fireEmbers) this._spawnFireEmbers();

    this.kickPos.z += def.recoil * 2.2;
    this.kickPos.y += def.recoil * 0.4;
    this.kickRotX -= def.recoil * 3.2;
    if (this.applyRecoilToPlayer) this.applyRecoilToPlayer(def.recoil * 0.6);

    if (this.onShoot) this.onShoot(def);

    if (st.magAmmo <= 0 && st.reserveAmmo > 0) {
      this.startReload();
    }
  }

  update(dt, input, world, botManager, player) {
    if (this.fireTimer > 0) this.fireTimer -= dt;

    for (const [code, index] of this.keyMap) {
      if (input.consumeJustPressed(code)) this.switchTo(index);
    }
    // Scroll switches weapons only in FPS mode; in TPS the wheel zooms the camera.
    if (input.wheelDelta !== 0 && !(player?._camDist > 0)) {
      const dir = input.wheelDelta > 0 ? 1 : -1;
      this.switchTo((this.currentIndex + dir + this.loadout.length) % this.loadout.length);
    }

    if (input.consumeJustPressed('KeyR')) this.startReload();

    const st = this.currentState;
    if (st.isReloading) {
      st.reloadTimer -= dt;
      if (st.reloadTimer <= 0) this._completeReload();
    }

    const def = this.currentDef;
    const mouseJustPressed = input.mouseDown && !this.prevMouseDown;
    const triggerPulled = def.automatic ? input.mouseDown : mouseJustPressed;

    if (triggerPulled && this.fireTimer <= 0) {
      this._fire(world, botManager.getRaycastTargets(), player, botManager);
    }
    this.prevMouseDown = input.mouseDown;

    // Knife throw (right-click): one-hit kill + 3x reward. Cooldown hides the
    // in-hand knife until a fresh one is pulled.
    if (this._knifeCooldown > 0) {
      this._knifeCooldown -= dt;
      if (this._knifeCooldown <= 0 && def.kind === 'melee') {
        const m = this.models.get(def.id);
        if (m) m.group.visible = true;
      }
    }
    const rightJustPressed = input.rightMouseDown && !this._prevRightMouse;
    if (def.kind === 'melee' && def.throwable && rightJustPressed && this._knifeCooldown <= 0) {
      this._throwKnife(def);
    }
    this._prevRightMouse = input.rightMouseDown;

    // Sprint blend for COD carry animation (blocks ADS)
    this._sprintT += ((player.isSprinting ? 1 : 0) - this._sprintT) * Math.min(1, dt * 9);

    // scope zoom — disabled while sprinting
    const wantScope = !!def.scoped && input.rightMouseDown && !player.isSprinting;
    this.scopeT += ((wantScope ? 1 : 0) - this.scopeT) * Math.min(1, dt * 10);
    const sprintFovBoost = this._sprintT * 6;
    const targetFov = THREE.MathUtils.lerp(player.baseFov + sprintFovBoost, 28, this.scopeT);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    // recoil spring back
    this.kickPos.multiplyScalar(Math.max(0, 1 - dt * 10));
    this.kickRotX *= Math.max(0, 1 - dt * 10);
    this.kickGroup.position.set(this.kickPos.x, this.kickPos.y, this.kickPos.z);
    this.kickGroup.rotation.x = this.kickRotX;

    // sword swing animation — windup → fast diagonal slash → recover
    if (def.kind === 'melee' && this.swingPhase < 1) {
      this.swingPhase = Math.min(1, this.swingPhase + dt / def.fireRate);
      const ph = this.swingPhase;
      if (ph < 0.22) {
        // windup: raise blade up and back
        const w = ph / 0.22;
        this.kickGroup.rotation.y = -0.7 - w * 0.5;
        this.kickGroup.rotation.x = w * 0.55;
        this.kickGroup.rotation.z = -w * 0.4;
        this.kickGroup.position.z = w * 0.12;
      } else if (ph < 0.5) {
        // slash: snap down-across fast
        const s = (ph - 0.22) / 0.28;
        const e = s * s * (3 - 2 * s); // smoothstep
        this.kickGroup.rotation.y = -1.2 + e * 2.0;
        this.kickGroup.rotation.x = 0.55 - e * 1.1;
        this.kickGroup.rotation.z = -0.4 + e * 0.9;
        this.kickGroup.position.z = 0.12 - e * 0.3;
      } else {
        // recover back to rest
        const r = (ph - 0.5) / 0.5;
        const e = r * r * (3 - 2 * r);
        this.kickGroup.rotation.y = 0.8 - e * 1.5;
        this.kickGroup.rotation.x = -0.55 + e * 0.55;
        this.kickGroup.rotation.z = 0.5 - e * 0.5;
        this.kickGroup.position.z = -0.18 + e * 0.18;
      }
    } else if (def.kind === 'melee') {
      this.kickGroup.rotation.y = -0.7;
    }

    // idle breathing / weapon settle — fades out during sprint
    this._idleT += dt;
    if (def.kind !== 'melee') {
      const breatheAmt = 1.0 - this._sprintT;
      const breathe = Math.sin(this._idleT * 1.6) * 0.004 * breatheAmt;
      const swayB   = Math.cos(this._idleT * 1.1) * 0.003 * breatheAmt;
      this.kickGroup.position.y += breathe;
      this.kickGroup.rotation.z = swayB;
    }

    // viewmodel sway based on mouse movement (weighty feel)
    const swayTargetX = THREE.MathUtils.clamp(-input.mouseDX * 0.0006, -0.06, 0.06);
    const swayTargetY = THREE.MathUtils.clamp(-input.mouseDY * 0.0006, -0.05, 0.05);
    this.swayGroup.rotation.y += (swayTargetX - this.swayGroup.rotation.y) * Math.min(1, dt * 8);
    this.swayGroup.rotation.x += (swayTargetY - this.swayGroup.rotation.x) * Math.min(1, dt * 8);

    // COD-style weapon bob: larger amplitude, lateral sway component
    const bobAmt = player.onGround ? (player.isSprinting ? 0.026 : 0.016) : 0;
    const bobV   = Math.sin(player.bobTime) * bobAmt;
    const bobH   = Math.sin(player.bobTime * 0.5) * bobAmt * 0.55;

    // ADS: slide gun to center-screen when scoping
    const adsShiftX = -this.scopeT * 0.32;

    // Sprint carry: raise gun and tilt to side like COD
    const sprintRaiseY = this._sprintT * 0.12;
    const sprintShiftX = -this._sprintT * 0.12;
    this.weaponMount.position.set(0.32 + sprintShiftX + adsShiftX + bobH, -0.26 + sprintRaiseY + bobV, -0.5);
    this.weaponMount.rotation.x = this._sprintT * 0.22;
    this.weaponMount.rotation.z = this._sprintT * -1.0;

    // muzzle flash decay
    if (this._flashTimer !== undefined && this._flashTimer > 0) {
      this._flashTimer -= dt;
      const t = Math.max(0, this._flashTimer / FLASH_LIFE);
      this.flashLight.intensity = t * 8;
      this._flashMeshes.forEach((m) => { m.material.opacity = t * 0.92; });
      if (t === 0) {
        this._flashMeshes.forEach((m) => m.parent?.remove(m));
      }
    }

    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.mesh.material.opacity = Math.max(0, tr.life / TRACER_LIFE) * 0.9;
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        tr.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // rockets + explosions + ejected shells + thrown knives
    this._updateRockets(dt, world, botManager);
    this._updateThrownKnives(dt, world, botManager);
    this._updateExplosions(dt);
    this._updateShells(dt);
    this._updateAnimeSparkles(dt);
    this._updateFireEmbers(dt);

    // skin animations (only on the currently visible weapon)
    this.animTime += dt;
    const activeGroup = this.models.get(def.id).group;
    // Per-weapon skin takes priority over the global skin
    const perSkin = this._armoryMap?.get(def.id)?.skin;
    const activeSkin = perSkin || (def.kind === 'melee' ? this.swordSkin : this.weaponSkin);
    if (activeSkin?.animated) {
      if (def.kind === 'melee') animateSwordSkin(activeGroup, activeSkin, this.animTime);
      else                      animateWeaponSkin(activeGroup, activeSkin, this.animTime);
    }
  }

  getHudInfo() {
    const def = this.currentDef;
    const st = this.currentState;
    return {
      name: def.name,
      isMelee: def.kind === 'melee',
      magAmmo: st.magAmmo,
      reserveAmmo: st.reserveAmmo,
      isReloading: st.isReloading,
      currentIndex: this.currentIndex,
      slots: this.loadout.map((_, i) => String(i + 1))
    };
  }
}
