import * as THREE from 'three';

const EYE_HEIGHT = 1.7;
const RADIUS = 0.45;
const WALK_SPEED = 6.2;
const SPRINT_MULT = 1.55;
const JUMP_SPEED = 12.0;   // sci-fi boosted (was 7.5)
const GRAVITY = -20;
const MOUSE_SENSITIVITY = 0.0024;

const TELEPORT_RANGE    = 22;
const TELEPORT_COOLDOWN = 5.0;

const MAX_STAMINA = 100;
const STAMINA_DRAIN = 28;
const STAMINA_REGEN = 14;
const STAMINA_REGEN_DELAY = 1.2;

const SHIELD_REGEN      = 6;    // per second
const SHIELD_REGEN_DELAY = 3.0; // seconds before regen kicks in

const CROUCH_HEIGHT   = 0.85;
const SLIDE_DURATION  = 0.72;
const SLIDE_BOOST     = WALK_SPEED * SPRINT_MULT * 1.65;  // ~15.7 u/s burst
const COYOTE_TIME     = 0.14;

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

    // Teleport ability (Q key)
    this.teleportCooldown    = 0;
    this.teleportMaxCooldown = TELEPORT_COOLDOWN;
    this.onTeleport = null; // (fromPos, toPos) => void

    // Sound state
    this._wasOnGround = true;
    this._stepPhase = 0;
    this._lastBobSign = 1;

    this.isCrouching   = false;
    this.isSliding     = false;
    this._slideTimer   = 0;
    this._slideVel     = new THREE.Vector3();
    this._coyoteTimer  = 0;
    this._eyeHeight    = EYE_HEIGHT;  // current (lerped) eye height
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
    if (input.isDown('KeyW')) moveZ += 1;
    if (input.isDown('KeyS')) moveZ -= 1;
    if (input.isDown('KeyA')) moveX -= 1;
    if (input.isDown('KeyD')) moveX += 1;

    const moving = moveX !== 0 || moveZ !== 0;
    // On mobile the joystick sets ShiftLeft virtually; also auto-sprint any forward motion
    const wantSprint = input.isDown('ShiftLeft') || (input.isMobile && moveZ > 0);
    this.isSprinting = moving && wantSprint && moveZ > 0 && this.stamina > 2 && !this.isSliding && !this.isCrouching;

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
    if (len > 0) { moveX /= len; moveZ /= len; }

    const speed = WALK_SPEED * (this.isSprinting ? SPRINT_MULT : (this.isCrouching ? 0.55 : 1));
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right   = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));

    const desired = new THREE.Vector3();
    desired.addScaledVector(forward, -moveZ);
    desired.addScaledVector(right,    moveX);
    desired.multiplyScalar(speed);

    // --- crouch / slide ---
    const wantCrouch   = input.isDown('ControlLeft') || input.isDown('KeyC');
    const justCrouch   = input.consumeJustPressed('ControlLeft') || input.consumeJustPressed('KeyC');

    if (justCrouch && this.isSprinting && this.onGround && !this.isSliding) {
      // Initiate slide
      this.isSliding   = true;
      this._slideTimer = SLIDE_DURATION;
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this._slideVel.copy(fwd).multiplyScalar(SLIDE_BOOST);
      this.isSprinting = false;
    }

    if (this.isSliding) {
      this._slideTimer -= dt;
      const t = Math.max(0, this._slideTimer / SLIDE_DURATION);   // 1→0 over duration
      const boost = t * t;  // eased deceleration
      this.velocity.x = this._slideVel.x * boost;
      this.velocity.z = this._slideVel.z * boost;
      if (this._slideTimer <= 0) {
        this.isSliding   = false;
        this.isCrouching = wantCrouch;
      }
    } else if (this.onGround) {
      // Normal ground movement
      this.velocity.x = desired.x;
      this.velocity.z = desired.z;
      this.isCrouching = wantCrouch && !this.isSprinting;
    } else {
      // Air strafing — soft control, preserves jump momentum
      const blend = dt * 3.5;
      this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, blend);
      this.velocity.z += (desired.z - this.velocity.z) * Math.min(1, blend);
    }

    // smooth eye height between stand / crouch / slide
    const targetEye = (this.isSliding || this.isCrouching) ? CROUCH_HEIGHT : EYE_HEIGHT;
    this._eyeHeight += (targetEye - this._eyeHeight) * Math.min(1, dt * 16);

    // --- teleport blink (Q key) ---
    if (this.teleportCooldown > 0) this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
    if (input.consumeJustPressed('KeyQ') && this.teleportCooldown <= 0) {
      const camPos = new THREE.Vector3();
      this.camera.getWorldPosition(camPos);
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);

      const raycaster = new THREE.Raycaster(camPos, camDir, 0.1, TELEPORT_RANGE);
      const meshes = world.colliders.map((c) => c.mesh).filter(Boolean);
      const hits = raycaster.intersectObjects(meshes, true);

      let destEye;
      if (hits.length > 0) {
        const safeDist = Math.max(0.1, hits[0].distance - 0.9);
        destEye = camPos.clone().addScaledVector(camDir, safeDist);
      } else {
        destEye = camPos.clone().addScaledVector(camDir, TELEPORT_RANGE);
      }
      // Eye → foot position, clamped to ground
      destEye.y -= EYE_HEIGHT;
      destEye.y = Math.max(0, destEye.y);

      const fromPos = this.position.clone();
      this.position.copy(destEye);
      this.velocity.set(0, 0, 0);
      this.onGround = false;
      this.teleportCooldown = TELEPORT_COOLDOWN;
      this.onTeleport?.(fromPos, this.position.clone());
    }

    // --- coyote time (forgives jumps just after walking off a ledge) ---
    if (this.onGround) {
      this._coyoteTimer = COYOTE_TIME;
    } else {
      this._coyoteTimer = Math.max(0, this._coyoteTimer - dt);
    }

    // --- jump ---
    const canJump = this.onGround || this._coyoteTimer > 0;
    if (input.consumeJustPressed('Space') && canJump && !this.isSliding) {
      const jumpBoost = this.isCrouching ? JUMP_SPEED * 1.1 : JUMP_SPEED; // slight boost out of crouch
      this.velocity.y = jumpBoost;
      this.onGround    = false;
      this.isCrouching = false;
      this.isSliding   = false;
      this._coyoteTimer = 0;
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
      this.bobTime += dt * (this.isSprinting ? 11 : (this.isCrouching ? 6 : 8));
      // Footstep on each downward bob (sine crossing zero from positive)
      const bobSin  = Math.sin(this.bobTime);
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
      const d    = this._camDist;
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
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
      this.camera.position.set(this.position.x, this.position.y + this._eyeHeight + bobOffset, this.position.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch + this.recoilPitch;
      this.camera.rotation.z = this._sprintT * -0.025; // slight COD-style lean while sprinting
    }
  }
}
