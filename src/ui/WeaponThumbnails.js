/**
 * Renders a small 3D thumbnail of every actual weapon MODEL (from the weapon
 * GLB) for the loadout inventory cards — so each card shows the real gun we
 * have, not a generic icon. Generated once into data-URLs and cached by id.
 *
 *   import { warmWeaponThumbs, getWeaponThumb } from './WeaponThumbnails.js';
 *   warmWeaponThumbs(() => refreshCards());   // call once; onReady fires when done
 *   const src = getWeaponThumb(weaponId);     // data-URL or null (use icon fallback)
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEAPONS } from '../weapons/weaponDefs.js';
import { buildWeaponModel, preloadWeaponModels } from '../weapons/WeaponModels.js';
import { applyWeaponSkin } from '../weapons/WeaponSkins.js';
import { applySwordSkin } from '../weapons/SwordSkins.js';

// Studio-style scene shared by both thumbnail paths. The guns are largely
// metallic, and metals lit only by punctual lights render near-black — the
// PMREM room environment is what makes the finishes actually read.
function _studio(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2.5, 3, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.5); fill.position.set(-3, 1, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe0b0, 0.45); rim.position.set(0, -2, -3); scene.add(rim);
}


// Place the camera along the standard three-quarter direction at a distance
// where the frustum comfortably contains a unit-normalised model.
const _camDir = new THREE.Vector3(0.55, 0.28, 0.9).normalize();
function _fitCamera(camera) {
  const dist = (0.5 * 0.88) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.35;
  camera.position.copy(_camDir).multiplyScalar(dist);
  camera.lookAt(0, 0, 0);
}

const _cache = new Map();
let _warmed = false;
let _onReady = null;

export function getWeaponThumb(id) { return _cache.get(id) ?? null; }

// Render a one-off larger thumbnail of a weapon wearing a specific skin (or raw
// if skin is null). Returns a data-URL, or null if the weapon GLB isn't ready.
let _live = null;
function _ensureLive() {
  if (_live) return _live;
  const SIZE = 340;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  _studio(renderer, scene);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  _live = { renderer, scene, camera };
  return _live;
}

export function renderWeaponSkinned(weaponDef, skin) {
  let built;
  try { built = buildWeaponModel(weaponDef); } catch { built = null; }
  if (!built) return null;
  const { renderer, scene, camera } = _ensureLive();
  const g = built.group;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  if (skin) {
    if (weaponDef.kind === 'melee') applySwordSkin(g, skin);
    else                            applyWeaponSkin(g, skin);
  }
  scene.add(g);
  // Some Blender-exported weapon models keep their mesh nodes positioned far
  // from the group's own origin (a leftover scene layout offset — e.g. props
  // laid out side-by-side in the source scene). Rotation must be applied
  // BEFORE measuring the centering box: rotating a large baked offset by even
  // a small angle displaces it by an amount proportional to its magnitude, so
  // centering computed pre-rotation leaves a large residual error once the
  // rotation is applied on top. Scale is likewise applied before the final
  // center measurement, for the same reason. This order keeps recentring
  // correct regardless of how far the model's authored offset sits — doing
  // it in the wrong order is negligible for guns (tiny baked offset) but
  // threw far-offset models like the sword completely out of frame.
  g.rotation.set(0.12, -0.5, 0.04);
  const sz = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
  g.scale.setScalar(0.88 / maxDim);
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
  g.position.sub(c);
  // Camera distance derived from the FOV so a 0.88-unit model always fits
  // with margin, whatever its aspect (pistols used to clip the frame).
  _fitCamera(camera);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(g);
  g.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
  return url;
}

export function warmWeaponThumbs(onReady) {
  _onReady = onReady;
  if (_warmed) { onReady?.(); return; }
  _warmed = true;
  preloadWeaponModels();
  _waitForGLB(0);
}

// buildWeaponModel returns null until the weapon GLB has loaded — poll for it.
function _waitForGLB(attempt) {
  const probe = buildWeaponModel(WEAPONS.find((w) => w.id === 'm4') || WEAPONS[0]);
  if (!probe) {
    if (attempt < 50) setTimeout(() => _waitForGLB(attempt + 1), 400);
    return;
  }
  _disposeGroup(probe.group);
  _generate();
}

function _disposeGroup(g) {
  g.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
}

function _generate() {
  const SIZE = 144;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  _studio(renderer, scene);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);

  for (const w of WEAPONS) {
    let built;
    try { built = buildWeaponModel(w); } catch { built = null; }
    if (!built) continue;
    const g = built.group;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    scene.add(g);

    // Rotate and scale BEFORE the final centering measurement (see the note in
    // renderWeaponSkinned — centering computed pre-rotation leaves a residual
    // offset once the rotation lands on top).
    g.rotation.set(0.12, -0.5, 0.04);
    const sz = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
    g.scale.setScalar(0.88 / maxDim);
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    g.position.sub(c);

    _fitCamera(camera);
    renderer.render(scene, camera);
    _cache.set(w.id, renderer.domElement.toDataURL('image/png'));

    scene.remove(g);
    _disposeGroup(g);
  }

  renderer.dispose();
  _onReady?.();
}
