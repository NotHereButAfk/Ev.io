import * as THREE from 'three';

// DOM labels do not participate in the depth buffer, so explicitly test the
// camera-to-head segment against both rendered map meshes and box-only
// collision. Returns true only when geometry is closer than the player.
export function isNameplateOccluded(world, cameraPosition, target, raycaster) {
  if (!world || !cameraPosition || !target || !raycaster) return false;
  const direction = target.clone().sub(cameraPosition);
  const distance = direction.length();
  if (distance < 0.1) return false;
  direction.multiplyScalar(1 / distance);
  raycaster.set(cameraPosition, direction);
  raycaster.near = 0.08;
  raycaster.far = Math.max(0.08, distance - 0.22);

  let nearest = Infinity;
  const meshes = world.raycastMeshes || [];
  if (meshes.length) {
    const meshHit = raycaster.intersectObjects(meshes, true)[0];
    if (meshHit) nearest = meshHit.distance;
  }
  const boxHit = world.raycastBoxHit?.(raycaster.ray, raycaster.far);
  if (boxHit) nearest = Math.min(nearest, boxHit.distance);
  return nearest < distance - 0.22;
}

