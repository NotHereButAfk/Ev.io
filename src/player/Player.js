import * as THREE from 'three';

const EYE_HEIGHT = 1.7;
const RADIUS = 0.45;
const WALK_SPEED = 6.2;
const SPRINT_MULT = 1.55;
const JUMP_SPEED = 7.5;
const GRAVITY = -20;
const MOUSE_SENSITIVITY = 0.0024;

const MAX_STAMINA = 100;
const STAMINA_DRAIN = 28;
const STAMINA_REGEN = 14;
const STAMINA_REGEN_DELAY = 1.2;

const SHIELD_REGEN      = 6;    // per second
const SHIELD_REGEN_DELAY = 3.0; // seconds before regen kicks in

export class Player {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(78, aspect, 0.05, 300);
    this.baseFov = 78;

    this.position = new THREE.Vector3(0, 0, 8);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0;
    this.onGround = true;

    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.maxStamina = MAX_STAMINA;
    this.stamina = MAX_STAMINA;
    this._staminaRegenDelay = 0;
    this.maxShield = 0;
    this.shield = 0;
    this._shieldRegenDelay = 0;
    this.isSprinting = false;
    this.bobTime = 0;
    this.recoilPitch = 0;
    this.recoilPitchVel = 0;

    this.name = 'Recruit';
    this.skin = null;
    this.sensitivityMult = 1.0;
    this.audio = null;

    // Third-person camera
    this._camDist = 0;           // 0 = FPS, >0 = TPS metres
    this._tpsTarget = new THREE.Vector3();

    // Sprint blend (0..1) for camera roll
    this._sprintT = 0;

    // Sound state
    this._wasOnGround = true;
    this._stepPhase = 0;
    this._lastBobSign = 1;
  }

  get isDead() {
    return this.health <= 0;
  }

  setMaxShield(max) {
    this.maxShield = max;
    this.shield = max;
    this._shieldRegenDelay = 0;
  }

  respawn(position) {
    this.health   = this.maxHealth;
    this.stamina  = this.maxStamina;
    this.shield   = this.maxShield;
    this._staminaRegenDelay = 0;
    this._shieldRegenDelay  = 0;
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
  }

  takeDamage(amount) {
    this._shieldRegenDelay = SHIELD_REGEN_DELAY;
    const absorbed = Math.min(this.shield, amount);
    this.shield = Math.max(0, this.shield - absorbed);
    const remaining = amount - absorbed;
    if (remaining > 0) this.health = Math.max(0, this.health - remaining);
    return this.health <= 0;
  }

  applyRecoil(amount) {
    this.recoilPitchVel -= amount;
  }

  update(dt, input, world) {
    // --- third-person camera zoom (scroll wheel) ---
    if (input.wheelDelta !== 0) {
      this._camDist = THREE.MathUtils.clamp(this._camDist + input.wheelDelta * 0.9, 0, 6.0);
    }

    // --- look ---
    this.yaw -= input.mouseDX * MOUSE_SENSITIVITY * this.sensitivityMult;
    this.pitch -= input.mouseDY * MOUSE_SENSITIVITY * this.sensitivityMult;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

    // recoil recovery (spring back to 0)
    const recoilSpring = -this.recoilPitch * 18 - this.recoilPitchVel * 6;
    this.recoilPitchVel += recoilSpring * dt;
    this.recoilPitch += this.recoilPitchVel * dt;

    // --- movement input ---
    let moveX = 0;
    let moveZ = 0;
    if (input.isDown('KeyW')) moveZ += 1;   // forward
    if (input.isDown('KeyS')) moveZ -= 1;   // backward
    if (input.isDown('KeyA')) moveX -= 1;
    if (input.isDown('KeyD')) moveX += 1;

    const moving = moveX !== 0 || moveZ !== 0;
    this.isSprinting = moving && input.isDown('ShiftLeft') && moveZ > 0 && this.stamina > 2;

    // smooth sprint blend for camera roll
    this._sprintT += ((this.isSprinting ? 1 : 0) - this._sprintT) * Math.min(1, dt * 9);

    // stamina drain / regen
    if (this.isSprinting) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      this._staminaRegenDelay = STAMINA_REGEN_DELAY;
      if (this.stamina <= 0) this.isSprinting = false;
    } else {
      if (this._staminaRegenDelay > 0) {
        this._staminaRegenDelay = Math.max(0, this._staminaRegenDelay - dt);
      } else {
        this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * dt);
      }
    }

    // shield regen
    if (this._shieldRegenDelay > 0) {
      this._shieldRegenDelay = Math.max(0, this._shieldRegenDelay - dt);
    } else if (this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + SHIELD_REGEN * dt);
    }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    const speed = WALK_SPEED * (this.isSprinting ? SPRINT_MULT : 1);
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));

    const desired = new THREE.Vector3();
    desired.addScaledVector(forward, -moveZ);
    desired.addScaledVector(right, moveX);
    desired.multiplyScalar(speed);

    this.velocity.x = desired.x;
    this.velocity.z = desired.z;

    // --- jump / gravity ---
    if (input.consumeJustPressed('Space') && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
      if (this.audio) this.audio.playJump();
    }
    this.velocity.y += GRAVITY * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    const landingVel = this.velocity.y;
    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      if (!this._wasOnGround && this.audio) {
        this.audio.playLand(landingVel < -12);
      }
      this.onGround = true;
    }
    this._wasOnGround = this.onGround;

    world.resolveCollisions(this.position, RADIUS);

    // --- head bob + footstep sounds ---
    if (moving && this.onGround) {
      this.bobTime += dt * (this.isSprinting ? 11 : 8);
      // Footstep on each downward bob (sine crossing zero from positive)
      const bobSin = Math.sin(this.bobTime);
      const bobSign = bobSin >= 0 ? 1 : -1;
      if (bobSign !== this._lastBobSign && bobSign < 0 && this.audio) {
        this.audio.playFootstep(this.isSprinting);
      }
      this._lastBobSign = bobSign;
    } else {
      this.bobTime += dt * 4;
      this._lastBobSign = 1;
    }
    const bobAmount = moving && this.onGround ? 0.045 : 0.012;
    const bobOffset = Math.sin(this.bobTime) * bobAmount;

    // --- apply to camera ---
    if (this._camDist > 0) {
      // Third-person: orbit camera behind and above the player.
      // "behind" in our coord system = +sin(yaw) X, +cos(yaw) Z (opposite of camera forward).
      const d   = this._camDist;
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      // Slight vertical arc based on pitch so looking up lifts the camera.
      const pitchBlend = Math.sin(Math.max(0, this.pitch) * 0.5);
      this.camera.position.set(
        this.position.x + sinY * d * (1 - pitchBlend * 0.4),
        this.position.y + 1.4 + 0.5 * d * 0.18 + pitchBlend * d * 0.6,
        this.position.z + cosY * d * (1 - pitchBlend * 0.4)
      );
      this._tpsTarget.set(this.position.x, this.position.y + 1.2, this.position.z);
      this.camera.lookAt(this._tpsTarget);
    } else {
      // First-person: camera sits at eye height with head-bob.
      this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT + bobOffset, this.position.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch + this.recoilPitch;
      this.camera.rotation.z = this._sprintT * -0.025; // slight COD-style lean while sprinting
    }
  }
}
