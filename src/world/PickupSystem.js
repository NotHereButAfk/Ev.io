import * as THREE from 'three';
import { buildWeaponModel } from '../weapons/WeaponModels.js';
import { getWeapon } from '../weapons/weaponDefs.js';

const RESPAWN_DELAY = 18;  // seconds before a pickup reappears
const COLLECT_RADIUS = 1.6;
const WEAPON_RESPAWN = 35;  // power weapons come back slowly — worth fighting over
const WEAPON_COLLECT_RADIUS = 2.0;

// The five "power" weapons that spawn on the map (ev.io style): a marked beam of
// light with the floating weapon inside. Collecting one swaps it into your hands.
const SPECIAL_WEAPONS = [
  { id: 'rpg',        pos: [  0,   0], color: 0xff7a1a },  // Nova Launcher (centre holo-fountain — most contested)
  { id: 'boltsniper', pos: [ 22,   0], color: 0x33d0ec },  // Rail Driver
  { id: 'fuelrod',    pos: [-22,   0], color: 0x5cff7a },  // Fuel Rod
  { id: 'needler',    pos: [  0,  22], color: 0xff4dd2 },  // Needler
  { id: 'concussion', pos: [  0, -22], color: 0xb27bff },  // Concussion Rifle
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
  ['health', [  0,  44]], ['ammo',   [  0, -44]],
  ['health', [ 44,   0]], ['ammo',   [-44,   0]],
  // Cross-street corners (the old corner spots are now inside the towers)
  ['shield', [ 38,  38]], ['shield', [-38,  38]],
  ['shield', [ 38, -38]], ['shield', [-38, -38]],
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
    // Special power-weapon spawns.
    for (const spec of SPECIAL_WEAPONS) {
      const gun = getWeapon(spec.id);
      if (!gun) continue;
      const mesh = this._buildWeaponMesh(spec, gun);
      mesh.position.set(spec.pos[0], 0, spec.pos[1]);
      this.scene.add(mesh);
      this._pickups.push({
        type: 'weapon', gunId: spec.id, def: gun, name: gun.name, mesh,
        active: true, respawnTimer: 0, baseY: 1.4, _animT: this._pickups.length * 1.37,
        _spin: mesh.getObjectByName('wpnSpin'),
      });
    }
  }

  // A marked power-weapon spawn: a beam of light + a glowing base ring with the
  // floating weapon model inside.
  _buildWeaponMesh(spec, gun) {
    const group = new THREE.Group();
    group.userData.noHit = true;
    const col = spec.color;

    // Light beam column (translucent, visible from across the map).
    const beamMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 6, 16, 1, true), beamMat);
    beam.position.y = 3.0; beam.userData.noHit = true; group.add(beam);
    // Base ring + pad.
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 28), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; ring.userData.noHit = true; group.add(ring);

    // Floating weapon model (procedural — no GLB dependency), scaled to fit.
    const spin = new THREE.Group(); spin.name = 'wpnSpin'; spin.position.y = 1.4;
    const built = buildWeaponModel(gun, { procedural: true });
    const wm = built && built.group;
    if (wm) {
      wm.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noHit = true; } });
      const box = new THREE.Box3().setFromObject(wm);
      const size = box.getSize(new THREE.Vector3());
      const maxd = Math.max(size.x, size.y, size.z) || 1;
      wm.scale.setScalar(2.4 / maxd);
      const c = box.getCenter(new THREE.Vector3()).multiplyScalar(2.4 / maxd);
      wm.position.sub(c);
      spin.add(wm);
    } else {
      // fallback: a glowing diamond
      const dm = new THREE.Mesh(new THREE.OctahedronGeometry(0.5),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4 }));
      spin.add(dm);
    }
    group.add(spin);
    return group;
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
    pickup.respawnTimer = pickup.type === 'weapon' ? WEAPON_RESPAWN : RESPAWN_DELAY;
    pickup.mesh.visible = false;

    if (pickup.type === 'weapon') {
      if (weaponSystem?.addMapGun) {
        const def = weaponSystem.addMapGun(pickup.gunId);
        if (def && hud) {
          hud.addKillFeed(`PICKED UP — ${def.name}`);
          // Rebuild the right-side weapon inventory so the extra shows next to the main.
          hud.buildWeaponSlots?.(weaponSystem.getHudInfo().slots, weaponSystem.currentIndex);
        }
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
          p.active      = true;
          p.mesh.visible = true;
        }
        continue;
      }

      // Float + spin animation — use frame time instead of Date.now() (avoids 20 syscalls/frame)
      p._animT += dt * 2.0;
      if (p.type === 'weapon') {
        // Spin only the floating weapon; the beam/ring stay put.
        if (p._spin) { p._spin.rotation.y += dt * 1.1; p._spin.position.y = p.baseY + Math.sin(p._animT) * 0.18; }
      } else {
        p.mesh.position.y  = p.baseY + Math.sin(p._animT) * 0.12;
        p.mesh.rotation.y += dt * 1.4;
      }

      // Proximity collect
      const dx = pPos.x - p.mesh.position.x;
      const dz = pPos.z - p.mesh.position.z;
      const radius = p.type === 'weapon' ? WEAPON_COLLECT_RADIUS : COLLECT_RADIUS;
      if (Math.sqrt(dx * dx + dz * dz) < radius && !player.isDead) {
        // Only collect if it does something useful.
        let needed = false;
        if (p.type === 'weapon')  needed = weaponSystem?.currentDef?.id !== p.gunId;  // not already holding it
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
