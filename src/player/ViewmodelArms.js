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

/**
 * Clone one arm baked from the same KYX_Warrior mesh shown to other players.
 * Its origin is the wrist and its fingers already use the authored GunIdle
 * pose. WeaponSystem measures the closed palm before seating it on a grip.
 */
export function buildViewmodelArm(side, sourceTemplate = template) {
  const source = sourceTemplate?.getObjectByName(`KYX_ViewArm_${side}`);
  if (!source) return null;
  const root = source.clone(true);
  const materialClones = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => {
        if (!materialClones.has(material)) materialClones.set(material, cloneMaterial(material));
        return materialClones.get(material);
      });
    } else {
      const material = object.material;
      if (!materialClones.has(material)) materialClones.set(material, cloneMaterial(material));
      object.material = materialClones.get(material);
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
    plate: new THREE.Color(plate).multiplyScalar(0.82),
    sleeve: new THREE.Color(sleeve).multiplyScalar(0.34),
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
