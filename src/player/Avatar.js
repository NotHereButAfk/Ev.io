import * as THREE from 'three';
import { buildPreviewCharacter, rigCharacterLimbs } from './PreviewCharacter.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { getWeapon } from '../weapons/weaponDefs.js';
import { applyWalkCycle } from './Locomotion.js';
import { applyRifleCarry, restRifleTransform } from './RifleCarry.js';

// ═══════════════════════════════════════════════════════════════════════════
// One character body, driven entirely by a state struct.
//
// This exists so that the version of you OTHER players see and the version YOU
// see in third person are produced by the same code from the same inputs.
// Before this, your own body was a rigged cyborg running the full walk cycle
// and rifle carry, while everyone else saw you as a cyan capsule with a sphere
// for a head — no model, no animation, no weapon, no aim.
//
// Feed it {position, yaw, pitch, speed, sprint, grounded, crouch, firing,
// alive} and it renders that faithfully. Where the state comes from — your own
// controller, or a network snapshot of somebody else — makes no difference.
// ═══════════════════════════════════════════════════════════════════════════

const _v = new THREE.Vector3();

// How much of your look-pitch the body shows. Not 1.0: a real shooter's head
// and spine absorb part of it, and pinning the rifle to the full ±90° makes
// the arms invert when someone looks at their feet.
const PITCH_FOLLOW = 0.62;
const PITCH_LIMIT  = 0.95;    // radians (~54°)

export class Avatar {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [opts] { skin, armorTypeId, weaponId, allowHuman }
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.group = buildPreviewCharacter(
      opts.skin || null, opts.armorTypeId || 'vanguard', null,
      { allowHuman: opts.allowHuman ?? false });
    this.isHuman = !!this.group.userData?.isHuman;
    this.rig = this.isHuman ? null : rigCharacterLimbs(this.group);
    // Yaw-first, so the run lean pitches about the body's own axis.
    this.group.rotation.order = 'YXZ';
    scene.add(this.group);

    this.weaponId = null;
    this.weapon   = null;
    this.setWeapon(opts.weaponId || 'm4');

    this._walkT   = Math.random() * Math.PI * 2;
    this._aim     = 0;        // 0 = patrol carry, 1 = shouldered
    this._kick    = 0;
    this._pitch   = 0;
    this._crouch  = 0;
    this._yawInit = false;
    this._prevPos = new THREE.Vector3();
    this._hasPrev = false;
    this._lastDirPos = new THREE.Vector3();
  }

  setWeapon(id) {
    if (id === this.weaponId) return;
    this.weaponId = id;
    if (this.weapon) { this.group.remove(this.weapon); this.weapon = null; }
    const def = getWeapon(id);
    if (!def) return;
    if (this.isHuman && this.group.userData.attachWeapon) {
      const built = buildWeaponModel(def, { procedural: true });
      this.group.userData.attachWeapon(built?.group || null, def.kind === 'melee');
      return;
    }
    const wm = buildWeaponModel(def, { procedural: true })?.group;
    if (!wm) return;
    wm.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
    this.isMelee = def.kind === 'melee';
    if (this.isMelee) { wm.position.set(-0.22, 1.06, -0.24); wm.rotation.set(-0.70, 0, 0.22); }
    else restRifleTransform(wm);
    this.group.add(wm);
    this.weapon = wm;
  }

  /** Recoil pulse — call when this character fires. */
  fire() { this._kick = 1; this._aimHold = 1.1; }

  /**
   * @param {number} dt
   * @param {object} s  {
   *   position: Vector3, yaw, pitch, speed?, sprint?, grounded?, crouch?,
   *   firing?, alive?
   * }  speed is optional — omitted, it is measured from the position delta,
   *    which is how a remote player (who only sends positions) is animated.
   */
  update(dt, s) {
    const g = this.group;
    if (s.alive === false) { g.visible = false; return; }
    g.visible = true;

    // Speed: measured from movement when not supplied, so a network snapshot
    // animates identically to a local controller without sending a velocity.
    let speed = s.speed;
    if (speed === undefined) {
      if (this._hasPrev && dt > 0) {
        _v.copy(s.position).sub(this._prevPos); _v.y = 0;
        speed = _v.length() / dt;
      } else speed = 0;
    }
    this._prevPos.copy(s.position);
    this._hasPrev = true;

    const grounded = s.grounded !== false;
    const moving   = speed > 0.6 && grounded;
    const run = s.sprint ? 1 : THREE.MathUtils.clamp((speed - 3.0) / 6.0, 0, 0.45);

    // Facing. `yaw` is a CAMERA yaw (the server relays the client's look yaw),
    // and a three.js camera looks down −Z — so the direction being described is
    // −(sin yaw, cos yaw). A cyborg body is modelled front-on-−Z and takes it
    // unchanged; the human soldier faces +Z and needs the π.
    // Snap on the first frame so a fresh avatar doesn't spin into place.
    const yaw = (s.yaw || 0) + (this.isHuman ? Math.PI : 0);
    if (!this._yawInit) { g.rotation.y = yaw; this._yawInit = true; }
    else {
      let d = yaw - g.rotation.y;
      d = ((d + Math.PI) % (Math.PI * 2)) - Math.PI;
      g.rotation.y += d * Math.min(1, dt * 14);
    }

    // Rigged human bodies drive their own skeletal clips.
    if (this.isHuman) {
      const ud = g.userData;
      g.position.copy(s.position);
      ud.setLocomotion?.(speed, grounded, !!s.sprint, 0);
      ud.setAim?.(s.pitch || 0, 0);
      ud.mixer?.update(dt);
      ud.armorTick?.(dt);
      return;
    }
    if (!this.rig) { g.position.copy(s.position); return; }

    this._crouch += ((s.crouch ? 1 : 0) - this._crouch) * Math.min(1, dt * 10);

    // Which way this body is travelling relative to the way it is FACING —
    // without it the legs run a forward stride while the character strafes or
    // backpedals, and the feet travel with the body instead of planting.
    // The body faces local -Z, so after its yaw forward is (-sin, -cos) and
    // right is (cos, -sin).
    const sn = Math.sin(yaw), cs = Math.cos(yaw);
    let dirF = 1, dirR = 0;
    if (speed > 0.6) {
      _v.copy(s.position).sub(this._lastDirPos); _v.y = 0;
      const m = _v.length();
      if (m > 1e-5) {
        dirF = (_v.x * -sn + _v.z * -cs) / m;
        dirR = (_v.x *  cs + _v.z * -sn) / m;
      }
    }
    this._lastDirPos.copy(s.position);

    // The stride phase is owned by applyWalkCycle and derived from `speed`.
    const gait = applyWalkCycle(this.rig, {
      speed, moving, run, crouch: this._crouch, dt, dirF, dirR,
      grounded, vy: s.vy || 0,
    });
    this._walkT = gait.phase;
    g.position.set(s.position.x, s.position.y + gait.bob, s.position.z);
    g.rotation.x = gait.lean;                  // already eased, and bob assumes it

    if (this.isMelee || !this.weapon) return;

    // Shoulder the rifle while firing, drift back to the patrol carry after.
    this._aimHold = Math.max(0, (this._aimHold || 0) - dt);
    if (s.firing) this._aimHold = 1.1;
    this._kick = Math.max(0, this._kick - dt * 7);
    const want = (this._aimHold > 0 || s.aiming) ? 1 : 0;
    this._aim += (want - this._aim) * Math.min(1, dt * 8);

    // Look-pitch rides the SAME common-mode shoulder rotation the stride uses,
    // so the rifle points where this character is actually looking and the
    // hands stay welded to it. Without this, a remote shooting up at you still
    // reads as aiming flat at the horizon.
    const pitchTarget = THREE.MathUtils.clamp(
      (s.pitch || 0) * PITCH_FOLLOW, -PITCH_LIMIT, PITCH_LIMIT);
    this._pitch += (pitchTarget - this._pitch) * Math.min(1, dt * 12);

    applyRifleCarry(this.rig, this.weapon, this._aim, dt, {
      swing: gait.swing + this._pitch * this._aim,
      kick:  this._kick,
    });
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    });
  }
}
