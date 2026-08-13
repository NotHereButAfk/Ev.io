import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { Octree } from 'three/addons/math/Octree.js';
import { loadEvMap } from './EvMapLoader.js';
import { DEFAULT_MAP_ID, getImportedMap, nextImportedMapId } from './MapRegistry.js';

const _boxHit = new THREE.Vector3();

function disposeRoot(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value?.isTexture) value.dispose?.();
    }
    material.dispose?.();
  }
}

export class World {
  constructor(initialMapId = DEFAULT_MAP_ID) {
    this.scene = new THREE.Scene();
    this.colliders = [];
    this.platforms = [];
    this.gravLifts = [];
    this.teleporters = [];
    this.spawnPoints = [new THREE.Vector3(0, 3, 0)];
    this.weaponSpawnPoints = [];
    this.previewPedestalPos = new THREE.Vector3(0, 3, 0);
    this.arenaHalf = 128;
    this.killY = -25;
    this.usesMeshCollision = true;
    this.currentMapId = null;
    this.currentMap = null;
    this._mapRoot = null;
    this._mapColliderRoot = null;
    this._mapOctree = null;
    this._mapBounds = null;
    this._raycastMeshes = [];
    this._raycastBoxes = [];
    this._loadToken = 0;
    this._groundRay = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    this._playerCapsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.45);

    this._buildLighting();
    this.ready = this.loadMap(initialMapId);
  }

  _buildLighting() {
    this._hemisphere = new THREE.HemisphereLight();
    this._sun = new THREE.DirectionalLight();
    this._sun.position.set(-82, 118, 66);
    this._rim = new THREE.DirectionalLight();
    this._rim.position.set(72, 42, -64);
    this.scene.add(this._hemisphere, this._sun, this._rim);
  }

  _applyLighting(definition) {
    const profile = definition.lighting;
    if (!profile) return;
    this._hemisphere.color.setHex(profile.sky);
    this._hemisphere.groundColor.setHex(profile.ground);
    this._hemisphere.intensity = profile.hemisphereIntensity;
    this._sun.color.setHex(profile.sun);
    this._sun.intensity = profile.sunIntensity;
    this._rim.color.setHex(profile.rim);
    this._rim.intensity = profile.rimIntensity;
  }

  async loadMap(mapId) {
    const definition = getImportedMap(mapId);
    if (this.currentMapId === definition.id && this.currentMap) return this.currentMap;

    const token = ++this._loadToken;
    const map = await loadEvMap(definition.url);
    if (token !== this._loadToken) {
      disposeRoot(map.root);
      disposeRoot(map.colliderRoot);
      return this.currentMap;
    }

    if (this._mapRoot) this.scene.remove(this._mapRoot);
    disposeRoot(this._mapRoot);
    disposeRoot(this._mapColliderRoot);

    this.currentMapId = definition.id;
    this.currentMap = { ...map, definition };
    this._mapRoot = map.root;
    this._mapColliderRoot = map.colliderRoot;
    this._mapOctree = new Octree().fromGraphNode(map.colliderRoot);
    this._mapBounds = map.bounds;
    this._raycastMeshes = map.raycastMeshes;
    this._raycastBoxes = [];
    this.colliders = [];
    this.platforms = [];
    this.gravLifts = [];
    this.teleporters = [];
    this.spawnPoints = map.spawnPoints.length
      ? map.spawnPoints
      : [new THREE.Vector3(0, 3, 0)];
    this.weaponSpawnPoints = map.weaponSpawnPoints;

    const maxXZ = Math.max(
      Math.abs(map.bounds.min.x), Math.abs(map.bounds.max.x),
      Math.abs(map.bounds.min.z), Math.abs(map.bounds.max.z),
    );
    this.arenaHalf = Math.ceil(maxXZ + 4);
    this.killY = Math.min(-25, (map.collisionBounds?.min?.y ?? map.bounds.min.y) - 10);
    const previewSpawn = this.spawnPoints.find((point) => point.y <= 3.1) || this.spawnPoints[0];
    this.previewPedestalPos.copy(previewSpawn);

    this.scene.background = new THREE.Color(definition.background);
    this.scene.fog = new THREE.Fog(
      definition.fog,
      definition.fogNear,
      definition.fogFar,
    );
    this._applyLighting(definition);
    this.scene.add(map.root);
    map.root.traverse((object) => {
      if (object.isMesh && object.matrixAutoUpdate) {
        object.matrixAutoUpdate = false;
        object.updateMatrix();
      }
    });
    return this.currentMap;
  }

  loadNextMap() {
    return this.loadMap(nextImportedMapId(this.currentMapId));
  }

  // Imported map animation is authored into the map assets. This hook stays in
  // place because Game drives World on both menu and gameplay frames.
  update(_dt) {}

  groundHeightAt(x, z, prevY, newY) {
    if (!this._mapOctree) return -100;
    const stepUp = 0.55;
    const grace = 0.06;
    this._groundRay.origin.set(x, Math.max(prevY, newY) + stepUp + grace, z);
    const hit = this._mapOctree.rayIntersect(this._groundRay);
    if (!hit) return -100;
    const normal = hit.triangle.getNormal(_boxHit);
    const top = hit.position.y;
    const crossed = prevY >= top - grace && newY <= top + grace;
    const stepping = newY <= top + stepUp && newY >= top - 0.8;
    return normal.y > 0.35 && (crossed || stepping) ? top : -100;
  }

  queryGravLift(x, z, y) {
    for (const lift of this.gravLifts) {
      const dx = x - lift.x;
      const dz = z - lift.z;
      if (dx * dx + dz * dz < lift.r * lift.r && y < lift.topY) return lift.power;
    }
    return 0;
  }

  queryTeleport(x, z) {
    for (const teleporter of this.teleporters) {
      const dx = x - teleporter.x;
      const dz = z - teleporter.z;
      if (dx * dx + dz * dz < teleporter.r * teleporter.r) return teleporter.dest;
    }
    return null;
  }

  randomSpawnPoint() {
    return this._cloneSpawn(this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)]);
  }

  _cloneSpawn(point) {
    const clone = point.clone();
    if (Number.isFinite(point.spawnYaw)) clone.spawnYaw = point.spawnYaw;
    return clone;
  }

  safeSpawnPoint(occupants = []) {
    const live = occupants.filter((occupant) => occupant && occupant.alive !== false && occupant.position);
    if (!live.length) return this.randomSpawnPoint();
    const scored = this.spawnPoints.map((point) => {
      let nearest = Infinity;
      for (const occupant of live) nearest = Math.min(nearest, point.distanceTo(occupant.position));
      return { point, nearest };
    }).sort((a, b) => b.nearest - a.nearest);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length / 3)));
    return this._cloneSpawn(top[Math.floor(Math.random() * top.length)].point);
  }

  get raycastMeshes() {
    return this._raycastMeshes;
  }

  get raycastBoxes() {
    return this._raycastBoxes;
  }

  raycastBoxHit(ray, far = Infinity) {
    let best = null;
    for (const box of this.raycastBoxes) {
      if (box.containsPoint(ray.origin)) continue;
      const point = ray.intersectBox(box, _boxHit);
      if (!point) continue;
      const distance = ray.origin.distanceTo(point);
      if (distance <= far && (!best || distance < best.distance)) {
        best = { point: point.clone(), distance };
      }
    }
    return best;
  }

  resolveCollisions(position, radius) {
    if (!this._mapOctree) return position;
    const capsule = this._playerCapsule;
    capsule.radius = radius;
    capsule.start.set(position.x, position.y + radius, position.z);
    capsule.end.set(position.x, position.y + 1.7 - radius, position.z);
    const hit = this._mapOctree.capsuleIntersect(capsule);
    if (hit) position.addScaledVector(hit.normal, hit.depth);
    return position;
  }
}
