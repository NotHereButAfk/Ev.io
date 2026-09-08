import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let template = null;
let loading = false;
const callbacks = [];

export function preloadViewmodelArms(onLoad) {
  if (template) { onLoad?.(true); return; }
  // Contract/unit tests instantiate WeaponSystem in Node, where a site-root URL
  // has no origin. Keep the procedural fallback there; browsers perform the
  // real asset swap as soon as the compact arm bake arrives.
  if (typeof window === 'undefined') { onLoad?.(false); return; }
  if (onLoad) callbacks.push(onLoad);
  if (loading) return;
  loading = true;
  new GLTFLoader().load('/kyx-view-arms.glb', (gltf) => {
    template = gltf.scene;
    loading = false;
    callbacks.splice(0).forEach((cb) => cb(true));
  }, undefined, (error) => {
    console.warn('[ViewmodelArms] load failed:', error?.message);
    loading = false;
    callbacks.splice(0).forEach((cb) => cb(false));
  });
}

function cloneMaterial(material) {
  // Same material construction as the live player's authored body.
  const clone = new THREE.MeshToonMaterial({
    color: material.color.clone(), transparent: material.transparent,
    opacity: material.opacity, alphaTest: material.alphaTest, side: material.side,
  });
  clone.name = material.name;
  clone.userData.authoredColor = material.color.getHex();
  clone.depthTest = false;
  clone.depthWrite = false;
  return clone;
}

// The third-person bake ends at the shoulder. In the closer first-person
// camera that open end can enter the frame. Continue only the proximal sleeve
// toward the off-screen shoulder, leaving the glove and forearm grip intact.
// Apply the same continuous deformation to sleeve and armour so their seams
// stay together. Clone geometry: the cached template also serves other arms.
function continueUpperArm(mesh, side) {
  if (/_Hand$/i.test(mesh.name)) return;
  const geometry = mesh.geometry.clone();
  const positions = geometry.getAttribute('position');
  const direction = side === 'Left' ? -1 : 1;
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    const t = THREE.MathUtils.clamp((z - 0.18) / 0.25, 0, 1);
    const blend = t * t * (3 - 2 * t);
    positions.setXYZ(i,
      positions.getX(i) + direction * 0.12 * blend,
      positions.getY(i) - 0.20 * blend,
      z + 0.30 * blend);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  mesh.geometry = geometry;
}

/**
 * Clone one arm baked from the same KYX_Warrior mesh shown to other players.
 * Its origin is the wrist and its fingers already use the authored GunIdle
 * pose. WeaponSystem measures the closed palm before seating it on a grip.
 */
export function buildViewmodelArm(side, sourceTemplate = template) {
  const source = sourceTemplate?.getObjectByName(`KYX_ViewArm_${side}`);
  if (!source) return null;
  const root = source.clone(true);
  root.traverse((object) => {
    if (!object.isMesh) return;
    continueUpperArm(object, side);
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => cloneMaterial(material));
    } else {
      object.material = cloneMaterial(object.material);
    }
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    object.userData.sourceMaterial = Array.isArray(object.material)
      ? object.material[0]?.name || '' : object.material?.name || '';
  });
  return root;
}

export function tintViewmodelArm(root, { plate, sleeve, glove, accent, authored = false }) {
  if (!root) return;
  const colors = {
    // PreviewCharacter has already resolved the actual rendered body colours.
    // Do not shade them again here or the local hands diverge from the skin
    // other players see.
    plate: new THREE.Color(plate),
    sleeve: new THREE.Color(sleeve),
    glove: new THREE.Color(glove),
    accent: new THREE.Color(accent),
  };
  root.traverse((object) => {
    if (!object.isMesh) return;
    const name = `${object.name} ${object.userData.sourceMaterial || ''}`;
    const role = object.userData.viewmodelPart || (/Hand/i.test(object.name) ? 'glove'
      : /Orange|Insert/i.test(name) ? 'accent'
        : /Armor|Guard|Pauldron/i.test(name) ? 'plate'
          : 'sleeve');
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (authored && material.userData.authoredColor !== undefined) {
        material.color.setHex(material.userData.authoredColor);
        material.emissive?.setHex(0);
        continue;
      }
      material.color.copy(colors[role]);
      if (material.emissive) {
        material.emissive.copy(role === 'accent' ? colors.accent : new THREE.Color(0x000000));
        material.emissiveIntensity = role === 'accent' ? 0.05 : 0;
      }
      material.needsUpdate = true;
    }
  });
}
