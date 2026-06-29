import * as THREE from 'three';

const RESPAWN_DELAY = 18;  // seconds before a pickup reappears
const COLLECT_RADIUS = 1.6;

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
    pickup.respawnTimer = RESPAWN_DELAY;
    pickup.mesh.visible = false;

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
