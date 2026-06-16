import * as THREE from 'three';

export function buildPreviewCharacter(skin) {
  const group = new THREE.Group();
  const primaryMat = new THREE.MeshStandardMaterial({ color: skin.primary, roughness: 0.5, metalness: 0.2 });
  const secondaryMat = new THREE.MeshStandardMaterial({ color: skin.secondary, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.62, 4, 10), primaryMat);
  torso.position.y = 1.05;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), secondaryMat);
  head.position.y = 1.68;
  group.add(head);

  const armGeo = new THREE.CapsuleGeometry(0.09, 0.46, 4, 8);
  const armL = new THREE.Mesh(armGeo, secondaryMat);
  armL.position.set(-0.42, 1.0, 0);
  armL.rotation.z = 0.18;
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, secondaryMat);
  armR.position.set(0.42, 1.0, 0);
  armR.rotation.z = -0.18;
  group.add(armR);

  const legGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 8);
  const legL = new THREE.Mesh(legGeo, primaryMat);
  legL.position.set(-0.14, 0.28, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, primaryMat);
  legR.position.set(0.14, 0.28, 0);
  group.add(legR);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: 0x161a20 }));
  visor.position.set(0, 1.7, 0.21);
  group.add(visor);

  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  group.userData = { primaryMat, secondaryMat };
  return group;
}

export function applySkinToCharacter(group, skin) {
  const { primaryMat, secondaryMat } = group.userData;
  primaryMat.color.setHex(skin.primary);
  secondaryMat.color.setHex(skin.secondary);
}
