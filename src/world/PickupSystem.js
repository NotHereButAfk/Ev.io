import * as THREE from 'three';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { MainWeapons } from '../core/MainWeapons.js';
import { buildWeaponModel } from '../weapons/WeaponModels.js';

const RESPAWN_DELAY = 18;  // seconds before a pickup reappears
const COLLECT_RADIUS = 1.6;
const WEAPON_RESPAWN_DELAY = 25; // weapons take a little longer to come back

// Spots where non-main "map weapons" spawn. On pickup the player swaps to that
// gun for the rest of the match; each spot re-rolls a new random map gun on
// respawn so the arena's weapon mix keeps changing.
const WEAPON_SPAWN_POINTS = [
  [  0,   0],          // dead centre
  [ 42,  42], [-42, -42],
  [ 42, -42], [-42,  42],
  [  0,  44], [  0, -44],
];

// Pickup definitions: type, color, geometry size
const PICKUP_DEFS = {
  health: { color: 0x00ff88, emissive: 0x00ff88, geo: 'sphere', size: 0.28, label: '+40 HP' },
  ammo:   { color: 0xffcc00, emissive: 0xffaa00, geo: 'box',    size: 0.30, label: 'AMMO' },
  shield: { color: 0x00ccff, emissive: 0x0088ff, geo: 'sphere', size: 0.26, label: '+30 SHIELD' },
};

// Fixed world positions: along avenues (open streets) and corner plazas
// Positions are [x, z] — y is always ground level + float height
const SPAWN_LAYOUT = [
  // Centre cross-avenues (health + ammo alternating)
  ['health', [  0,  28]], ['ammo',   [  0, -28]],
  ['health', [ 28,   0]], ['ammo',   [-28,   0]],
  ['health', [  0,  58]], ['ammo',   [  0, -58]],
  ['health', [ 58,   0]], ['ammo',   [-58,   0]],
  // Corner plazas
  ['shield', [ 52,  52]], ['shield', [-52,  52]],
  ['shield', [ 52, -52]], ['shield', [-52, -52]],
  // Mid-range scatter
  ['ammo',   [ 36,  36]], ['ammo',   [-36,  36]],
  ['ammo',   [ 36, -36]], ['ammo',   [-36, -36]],
  ['health', [ 14,  14]], ['health', [-14,  14]],
  ['health', [ 14, -14]], ['health', [-14, -14]],
];

export class PickupSystem {
  constructor(scene) {
    this.scene    = scene;
    this._pickups = [];
    this._buildAll();
  }

  _buildMesh(def) {
    const mat = new THREE.MeshStandardMaterial({
      color:             def.color,
      emissive:          new THREE.Color(def.emissive),
      emissiveIntensity: 1.2,
      roughness:         0.3,
      metalness:         0.5,
      transparent:       true,
      opacity:           0.92,
    });
    let geo;
    if (def.geo === 'sphere') {
      geo = new THREE.SphereGeometry(def.size, 12, 8);
    } else {
      geo = new THREE.BoxGeometry(def.size, def.size, def.size);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.userData.noHit = true;

    // Outer glow ring
    const ringGeo = new THREE.TorusGeometry(def.size * 1.55, def.size * 0.07, 6, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: def.emissive, transparent: true, opacity: 0.6 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.userData.noHit = true;

    const group = new THREE.Group();
    group.add(mesh);
    group.add(ring);
    group.userData.noHit = true;
    return group;
  }

  _buildAll() {
    for (const [type, [px, pz]] of SPAWN_LAYOUT) {
      const def    = PICKUP_DEFS[type];
      const mesh   = this._buildMesh(def);
      mesh.position.set(px, 0.7, pz);
      this.scene.add(mesh);
      // Stagger _animT so every pickup floats at a different phase from the start
      this._pickups.push({ type, def, mesh, active: true, respawnTimer: 0, baseY: 0.7, _animT: this._pickups.length * 1.37 });
    }

    // Map weapons — the non-main guns, collectible only here.
    for (const [px, pz] of WEAPON_SPAWN_POINTS) {
      const gunId = this._randomMapGun();
      const mesh  = this._buildWeaponPickup(gunId);
      mesh.position.set(px, 1.0, pz);
      this.scene.add(mesh);
      this._pickups.push({ type: 'weapon', gunId, mesh, active: true, respawnTimer: 0, baseY: 1.0, _animT: this._pickups.length * 1.37 });
    }
  }

  _randomMapGun() {
    const ids = MainWeapons.getMapGunIds();
    if (!ids.length) return null;
    return ids[Math.floor(Math.random() * ids.length)];
  }

  // A floating, slowly-spinning real gun model over a glowing ground ring + beam.
  _buildWeaponPickup(gunId) {
    const group = new THREE.Group();
    group.userData.noHit = true;

    const def = WEAPONS.find((w) => w.id === gunId);
    const color = def?.color ?? 0x66ccff;

    const holder = new THREE.Group();
    holder.userData.noHit = true;
    if (def) {
      try {
        const { group: gun } = buildWeaponModel(def);
        // Scale to a consistent on-map size regardless of the model's native size.
        const box = new THREE.Box3().setFromObject(gun);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const s = 1.7 / maxDim;
        gun.scale.setScalar(s);
        // Re-centre so it spins about its middle.
        const centre = new THREE.Vector3();
        box.getCenter(centre);
        gun.position.sub(centre.multiplyScalar(s));
        gun.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noHit = true; } });
        holder.add(gun);
      } catch { /* fall through to a glow box below */ }
    }
    if (!holder.children.length) {
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.3, 0.3),
        new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.4 })
      );
      fallback.userData.noHit = true;
      holder.add(fallback);
    }
    group.add(holder);
    group._holder = holder;

    // Glowing ground ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.05, 8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.95;
    ring.userData.noHit = true;
    group.add(ring);

    // Soft vertical beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 2.2, 16, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 0;
    beam.userData.noHit = true;
    group.add(beam);

    return group;
  }

  // Swap a respawning weapon spot to a fresh random gun.
  _rerollWeapon(p) {
    const gunId = this._randomMapGun();
    if (!gunId) return;
    const px = p.mesh.position.x, pz = p.mesh.position.z;
    this.scene.remove(p.mesh);
    this._disposeMesh(p.mesh);
    p.gunId = gunId;
    p.mesh = this._buildWeaponPickup(gunId);
    p.mesh.position.set(px, p.baseY, pz);
    this.scene.add(p.mesh);
  }

  _disposeMesh(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material.dispose?.();
      }
    });
  }

  _collect(pickup, player, weaponSystem, hud) {
    pickup.active      = false;
    pickup.respawnTimer = pickup.type === 'weapon' ? WEAPON_RESPAWN_DELAY : RESPAWN_DELAY;
    pickup.mesh.visible = false;

    if (pickup.type === 'weapon') {
      if (weaponSystem) {
        const def = weaponSystem.equipMapGun(pickup.gunId);
        if (hud && def) hud.addKillFeed(`PICKED UP ${def.name.toUpperCase()}`);
      }
      return;
    }

    if (pickup.type === 'health') {
      const gained = Math.min(40, player.maxHealth - player.health);
      player.health = Math.min(player.maxHealth, player.health + 40);
      if (hud) hud.addKillFeed(`+ ${gained} HP`);
    } else if (pickup.type === 'shield') {
      if (player.maxShield > 0) {
        const gained = Math.min(30, player.maxShield - player.shield);
        player.shield = Math.min(player.maxShield, player.shield + 30);
        if (hud) hud.addKillFeed(`+ ${gained} SHIELD`);
      } else {
        // Treat as health if no shield
        player.health = Math.min(player.maxHealth, player.health + 30);
        if (hud) hud.addKillFeed(`+30 HP`);
      }
    } else if (pickup.type === 'ammo') {
      if (weaponSystem) {
        for (const w of weaponSystem.loadout) {
          if (w.kind !== 'melee') {
            const st = weaponSystem.state.get(w.id);
            if (st) {
              const add = Math.floor(w.reserveMax * 0.35);
              st.reserveAmmo = Math.min(w.reserveMax, st.reserveAmmo + add);
            }
          }
        }
        if (hud) hud.addKillFeed(`AMMO REFILL`);
      }
    }
  }

  update(dt, player, weaponSystem, hud) {
    const pPos = player.position;

    for (const p of this._pickups) {
      if (!p.active) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          if (p.type === 'weapon') this._rerollWeapon(p);  // fresh gun each cycle
          p.active      = true;
          p.mesh.visible = true;
        }
        continue;
      }

      // Float + spin animation — use frame time instead of Date.now() (avoids 20 syscalls/frame)
      p._animT += dt * 2.0;
      p.mesh.position.y  = p.baseY + Math.sin(p._animT) * 0.12;
      p.mesh.rotation.y += dt * 1.4;

      // Proximity collect
      const dx = pPos.x - p.mesh.position.x;
      const dz = pPos.z - p.mesh.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < COLLECT_RADIUS && !player.isDead) {
        // Only collect if the resource isn't already full
        let needed = false;
        if (p.type === 'weapon')  needed = !!weaponSystem && !weaponSystem.loadout.some(w => w.id === p.gunId);
        if (p.type === 'health')  needed = player.health  < player.maxHealth;
        if (p.type === 'shield')  needed = player.maxShield > 0 ? player.shield < player.maxShield : player.health < player.maxHealth;
        if (p.type === 'ammo')    needed = weaponSystem?.loadout.some(w =>
          w.kind !== 'melee' && weaponSystem.state.get(w.id)?.reserveAmmo < w.reserveMax
        );
        if (needed) this._collect(p, player, weaponSystem, hud);
      }
    }
  }

  dispose() {
    for (const p of this._pickups) this.scene.remove(p.mesh);
    this._pickups = [];
  }
}
