import * as THREE from 'three';
import { WEAPONS } from './weaponDefs.js';
import { buildWeaponModel } from './WeaponModels.js';

const TRACER_LIFE = 0.07;
const FLASH_LIFE = 0.05;

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

    this.loadout = WEAPONS;
    this.currentIndex = 0;
    this.state = new Map();
    for (const w of this.loadout) {
      this.state.set(w.id, {
        magAmmo: w.kind === 'melee' ? 0 : w.magSize,
        reserveAmmo: w.kind === 'melee' ? 0 : w.reserveMax,
        isReloading: false,
        reloadTimer: 0
      });
    }

    this.fireTimer = 0;
    this.prevMouseDown = false;
    this.kickPos = new THREE.Vector3();
    this.kickRotX = 0;
    this.swingPhase = 1;
    this.scopeT = 0; // 0..1 zoom blend

    this.tracers = [];
    this.flashLight = new THREE.PointLight(0xffd27a, 0, 6, 2);
    this.camera.add(this.flashLight);

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

    this.swayGroup = new THREE.Object3D();
    this.weaponMount.add(this.swayGroup);

    this.kickGroup = new THREE.Object3D();
    this.swayGroup.add(this.kickGroup);

    this.models = new Map();
    for (const w of this.loadout) {
      const { group, muzzle } = buildWeaponModel(w);
      group.visible = false;
      this.kickGroup.add(group);
      this.models.set(w.id, { group, muzzle });
    }
    this._setActiveModel(0);
    this._buildArm();
  }

  _buildArm() {
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.6 });
    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.7 });

    const arm = new THREE.Group();
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.34, 8), this.sleeveMat);
    forearm.rotation.x = 1.15;
    forearm.position.set(0, -0.07, 0.16);
    arm.add(forearm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this.gloveMat);
    hand.position.set(0, -0.02, -0.02);
    arm.add(hand);

    arm.traverse((obj) => {
      if (obj.isMesh) obj.castShadow = true;
    });

    this.swayGroup.add(arm);
    this.armGroup = arm;
  }

  setSkin(skin) {
    this.sleeveMat.color.setHex(skin.primary);
    this.gloveMat.color.setHex(skin.secondary);
  }

  _setActiveModel(index) {
    this.loadout.forEach((w, i) => {
      this.models.get(w.id).group.visible = i === index;
    });
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
  }

  resetState(baseFov) {
    this.currentIndex = 0;
    this._setActiveModel(0);
    for (const w of this.loadout) {
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
    this.camera.fov = baseFov;
    this.camera.updateProjectionMatrix();
  }

  startReload() {
    const def = this.currentDef;
    const st = this.currentState;
    if (def.kind === 'melee' || st.isReloading) return;
    if (st.magAmmo >= def.magSize || st.reserveAmmo <= 0) return;
    st.isReloading = true;
    st.reloadTimer = def.reloadTime;
    this.audio.playReload();
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
    this.flashLight.intensity = 4.5;
    const muzzleWorld = new THREE.Vector3();
    this.models.get(this.currentDef.id).muzzle.getWorldPosition(muzzleWorld);
    this.camera.worldToLocal(muzzleWorld);
    this.flashLight.position.copy(muzzleWorld);
    this._flashTimer = FLASH_LIFE;
  }

  _doHitscanShot(world, botMeshes) {
    const def = this.currentDef;
    const st = this.currentState;
    const camPos = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const right = new THREE.Vector3();
    right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3();
    up.setFromMatrixColumn(this.camera.matrixWorld, 1);

    const muzzleWorld = new THREE.Vector3();
    this.models.get(def.id).muzzle.getWorldPosition(muzzleWorld);

    const raycaster = new THREE.Raycaster();
    raycaster.far = def.range;
    const targets = [...botMeshes, ...world.colliders.map((c) => c.mesh)];

    const pelletCount = def.pellets || 1;
    let anyHitBot = false;
    let lastImpact = null;

    for (let i = 0; i < pelletCount; i++) {
      const dir = camDir.clone();
      if (def.spread > 0) {
        const jx = (Math.random() - 0.5) * def.spread;
        const jy = (Math.random() - 0.5) * def.spread;
        dir.addScaledVector(right, jx).addScaledVector(up, jy).normalize();
      }
      raycaster.set(camPos, dir);
      const hits = raycaster.intersectObjects(targets, true);
      const hit = hits.find((h) => !h.object.userData.noHit);
      if (hit) {
        lastImpact = hit.point;
        const bot = hit.object.userData.bot;
        if (bot) {
          anyHitBot = true;
          if (this.onHitBot) this.onHitBot(bot, def.damage, hit.point);
        } else if (this.onHitWorld) {
          this.onHitWorld(hit.point);
        }
        this._spawnTracer(muzzleWorld, hit.point);
      } else {
        const far = camPos.clone().addScaledVector(dir, def.range);
        this._spawnTracer(muzzleWorld, far);
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
    this.audio.playShot(def.id === 'sniper' ? 'sniper' : def.id === 'shotgun' ? 'shotgun' : def.id === 'smg' ? 'smg' : def.id === 'sidearm' ? 'sidearm' : 'rifle');
    this._doHitscanShot(world, botMeshes);
    this._flash();

    this.kickPos.z += def.recoil * 2.2;
    this.kickRotX -= def.recoil * 3.2;
    if (this.applyRecoilToPlayer) this.applyRecoilToPlayer(def.recoil * 0.6);

    if (this.onShoot) this.onShoot(def);

    if (st.magAmmo <= 0 && st.reserveAmmo > 0) {
      this.startReload();
    }
  }

  update(dt, input, world, botManager, player) {
    if (this.fireTimer > 0) this.fireTimer -= dt;

    for (let i = 0; i < 6; i++) {
      if (input.consumeJustPressed(`Digit${i + 1}`)) this.switchTo(i);
    }
    if (input.wheelDelta !== 0) {
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

    // scope zoom
    const wantScope = !!def.scoped && input.rightMouseDown;
    this.scopeT += ((wantScope ? 1 : 0) - this.scopeT) * Math.min(1, dt * 10);
    const targetFov = THREE.MathUtils.lerp(player.baseFov, 28, this.scopeT);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    // recoil spring back
    this.kickPos.multiplyScalar(Math.max(0, 1 - dt * 10));
    this.kickRotX *= Math.max(0, 1 - dt * 10);
    this.kickGroup.position.set(this.kickPos.x, this.kickPos.y, this.kickPos.z);
    this.kickGroup.rotation.x = this.kickRotX;

    // sword swing animation (overrides kick rotation/position while active)
    if (def.kind === 'melee' && this.swingPhase < 1) {
      this.swingPhase = Math.min(1, this.swingPhase + dt / def.fireRate);
      const s = Math.sin(this.swingPhase * Math.PI);
      this.kickGroup.rotation.y = -0.7 + s * 1.1;
      this.kickGroup.rotation.x = -s * 0.4;
      this.kickGroup.position.z = -s * 0.18;
    } else if (def.kind === 'melee') {
      this.kickGroup.rotation.y = -0.7;
    }

    // viewmodel sway based on mouse movement (weighty feel)
    const swayTargetX = THREE.MathUtils.clamp(-input.mouseDX * 0.0006, -0.06, 0.06);
    const swayTargetY = THREE.MathUtils.clamp(-input.mouseDY * 0.0006, -0.05, 0.05);
    this.swayGroup.rotation.y += (swayTargetX - this.swayGroup.rotation.y) * Math.min(1, dt * 8);
    this.swayGroup.rotation.x += (swayTargetY - this.swayGroup.rotation.x) * Math.min(1, dt * 8);

    // bob the weapon mount slightly with footstep timing
    const bob = Math.sin(player.bobTime) * (player.onGround ? 0.012 : 0);
    this.weaponMount.position.y = -0.26 + bob;

    // muzzle flash decay
    if (this._flashTimer !== undefined && this._flashTimer > 0) {
      this._flashTimer -= dt;
      this.flashLight.intensity = Math.max(0, (this._flashTimer / FLASH_LIFE)) * 4.5;
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
