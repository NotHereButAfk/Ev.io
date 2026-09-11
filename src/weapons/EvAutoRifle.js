import * as THREE from 'three';

// The standalone export uses metres, +Y up and muzzle-forward -Z. Geometry
// and original hand/muzzle markers share the same baked normalization.
export function buildEvAutoRifle(template, weaponDef) {
  const source = template?.getObjectByName('weapon_m4');
  if (!source) return null;
  const group = source.clone(true);
  const muzzle = group.getObjectByName('BIND_BULLET');
  const trigger = group.getObjectByName('BIND_RIGHTHAND');
  const support = group.getObjectByName('BIND_LEFTHAND');
  if (!muzzle || !trigger || !support) return null;
  group.updateWorldMatrix(true, true);
  const contact = (marker) => group.worldToLocal(marker.getWorldPosition(new THREE.Vector3())).toArray();
  const triggerPoint = contact(trigger);
  const supportPoint = contact(support);
  group.userData.weaponId = weaponDef.id;
  group.userData.weaponKind = weaponDef.kind;
  group.userData.modelSource = 'ev-original';
  group.userData.authoredHandPose = {
    trigger: triggerPoint,
    support: supportPoint,
    reload: [triggerPoint[0] - 0.025, triggerPoint[1] - 0.13, triggerPoint[2] - 0.14],
    supportVisible: true,
    carry: 'rifle',
  };
  // Skins and the first-person depth pass mutate materials per instance.
  // Keep the source palette on an unequipped/default rifle and share geometry.
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.userData.shared = true;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone()) : object.material.clone();
    object.castShadow = true;
  });
  return { group, muzzle };
}
