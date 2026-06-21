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
    if (input.isDown('KeyW')) moveZ -= 1;
    if (input.isDown('KeyS')) moveZ += 1;
    if (input.isDown('KeyA')) moveX -= 1;
    if (input.isDown('KeyD')) moveX += 1;

    const moving = moveX !== 0 || moveZ !== 0;
    this.isSprinting = moving && input.isDown('ShiftLeft') && moveZ < 0 && this.stamina > 2;

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
    }
    this.velocity.y += GRAVITY * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    }

    world.resolveCollisions(this.position, RADIUS);

    // --- head bob ---
    if (moving && this.onGround) {
      this.bobTime += dt * (this.isSprinting ? 11 : 8);
    } else {
      this.bobTime += dt * 4;
    }
    const bobAmount = moving && this.onGround ? 0.045 : 0.012;
    const bobOffset = Math.sin(this.bobTime) * bobAmount;

    // --- apply to camera ---
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT + bobOffset, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;
    this.camera.rotation.z = 0;
  }
}
