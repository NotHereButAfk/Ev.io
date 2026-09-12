import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { STATURE } from './Proportions.js';
import { weaponHandPose } from '../weapons/WeaponHandPoses.js';
import { disposeModel } from '../core/ModelResources.js';
import { setupEvCosmetics } from './EvCosmetics.js';
import { createHumanDeathPose, sampleHumanDeathPose } from './HumanActionMotion.js';

// One native skeleton and the thirteen actions exported from the supplied blend.
// Every instance owns its bones, mixer and materials; geometry stays shared.
let template = null;
let pending = null;
export function isEvCharacterReady() { return !!template; }
export function preloadEvCharacter(onLoad) {
  if (template) { onLoad?.(true); return Promise.resolve(true); }
  pending ??= new GLTFLoader().loadAsync('/ev-default.glb')
    .then((gltf) => { installEvCharacter(gltf); return true; })
    .catch((error) => { console.warn('[EV character]', error.message); return false; })
    .finally(() => { pending = null; });
  return pending.then((ready) => { onLoad?.(ready); return ready; });
}

export function installEvCharacter(gltf) {
  if (gltf.animations.length !== 13) throw new Error('EV character needs all 13 actions');
  const root = gltf.scene;
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(gltf.animations[0]).play();
  mixer.update(0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (o.isSkinnedMesh) box.union(new THREE.Box3().setFromObject(o, true));
    if (o.isMesh) o.geometry.userData.shared = true;
  });
  const scale = STATURE / (box.max.y - box.min.y);
  const clips = gltf.animations.map((clip) => clip.clone());
  // The physics capsule already supplies the jump arc. Remove only the extra
  // showcase lift, preserving the source takeoff, tucked legs and landing pose.
  const jumpRoot = clips[12].tracks.find((t) => t.name === 'Bip001_Pelvis.position');
  for (let i = 0; i < jumpRoot.times.length; i++) {
    const t = jumpRoot.times[i];
    if (t > 0.48 && t < 1.46) jumpRoot.values[i * 3 + 1] -= 0.55 * Math.sin(Math.PI * (t - 0.48) / 0.98);
  }
  // Measure stance travel from the actual ankle tracks; never guess cadence
  // from the animation's name or the game's much faster capsule speed.
  const speeds = {};
  for (const index of [1, 2, 9]) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clips[index]).play();
    const samples = [];
    const foot = root.getObjectByName('Bip001_L_Foot');
    for (let f = 0; f <= 96; f++) {
      action.time = clips[index].duration * f / 96;
      mixer.update(0); root.updateMatrixWorld(true);
      samples.push(foot.getWorldPosition(new THREE.Vector3()));
    }
    const floor = Math.min(...samples.map((p) => p.y));
    const velocities = samples.slice(1).flatMap((p, i) => {
      const v = -(p.z - samples[i].z) * 96 / clips[index].duration * scale;
      return p.y < floor + 0.09 && v > 0.1 ? [v] : [];
    }).sort((a, b) => a - b);
    if (!velocities.length) throw new Error(`No planted stance in ${clips[index].name}`);
    speeds[index] = velocities[Math.floor(velocities.length / 2)];
  }
  mixer.stopAllAction();
  mixer.clipAction(clips[0]).play(); mixer.update(0);
  template = { root, clips, scale, feet: box.min.y, speeds };
}

const V = Array.from({ length: 12 }, () => new THREE.Vector3());
const Q = Array.from({ length: 8 }, () => new THREE.Quaternion());
const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const clamp = THREE.MathUtils.clamp;
const ease = (a, b, dt, rate = 14) => a + (b - a) * (1 - Math.exp(-rate * dt));

function rotateWorld(bone, quaternion) {
  bone.getWorldQuaternion(Q[5]);
  bone.parent.getWorldQuaternion(Q[6]).invert();
  bone.quaternion.copy(Q[6].multiply(Q[5].premultiply(quaternion)));
  bone.updateWorldMatrix(false, true);
}

// Preserve the clip's elbow/knee pole while solving a target in world space.
// This works with the imported bone axes without retargeting any Euler angles.
function solveChain(a, b, c, target) {
  const start = a.getWorldPosition(V[0]);
  const middle = b.getWorldPosition(V[1]);
  const end = c.getWorldPosition(V[2]);
  const l1 = start.distanceTo(middle), l2 = middle.distanceTo(end);
  const axis = V[3].subVectors(target, start);
  const distance = clamp(axis.length(), 0.001, l1 + l2 - 0.0001);
  axis.normalize();
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const pole = V[4].subVectors(middle, start);
  pole.addScaledVector(axis, -pole.dot(axis)).normalize();
  const knee = V[5].copy(start).addScaledVector(axis, along)
    .addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
  const from = V[6].subVectors(middle, start).normalize();
  const to = V[7].subVectors(knee, start).normalize();
  rotateWorld(a, Q[0].setFromUnitVectors(from, to));
  b.getWorldPosition(middle); c.getWorldPosition(end);
  rotateWorld(b, Q[0].setFromUnitVectors(
    from.subVectors(end, middle).normalize(), to.subVectors(target, middle).normalize()));
}

export function buildEvCharacter(skin = null, armorSkin = null) {
  if (!template) return null;
  const group = new THREE.Group();
  group.name = 'EV default operative';
  const model = cloneSkeleton(template.root);
  // Blender's -Y exports as +Z. The game and all weapon aim use -Z.
  model.rotation.y = Math.PI;
  model.scale.setScalar(template.scale);
  model.position.y = -template.feet * template.scale;
  group.add(model);
  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.castShadow = o.receiveShadow = true;
    o.frustumCulled = false;
    if (o.isSkinnedMesh) o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
  });
  const pelvis = bones.Bip001_Pelvis;
  const spine = bones.Bip001_Spine;
  const chest = bones.Bip001_Spine1;
  const rifle = model.getObjectByName('Auto_Rifle_-_root');
  const cosmetics = setupEvCosmetics(group, model, bones);
  const muzzle = model.getObjectByName('BIND_BULLET');
  rifle.traverse((o) => { o.userData.noHit = true; });
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.10),
    new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.raycast = () => {};
  flash.userData.noHit = true;
  muzzle.add(flash); flash.visible = false;
  const native = new THREE.AnimationMixer(model);
  const actions = template.clips.map((clip) => native.clipAction(clip).play().setEffectiveWeight(0));
  actions[0].setEffectiveWeight(1);
  const state = { speed: 0, grounded: true, sprint: false, dirF: 1, dirR: 0,
    crouch: 0, firing: 0, reload: 0, swing: 1, vy: 0, slide: 0 };
  let current = 0, wasGrounded = true, wasCrouched = false;
  let transition = 0, landing = 0, fireHold = 0, flashTime = 0;
  let pitch = 0, yaw = 0, smoothPitch = 0, smoothYaw = 0, travelYaw = 0;
  let externalWeapon = null, melee = false, shot = 0, actionTime = 0, actionKind = '';
  let death = 0, deathSide = 1;
  const deathBase = new Map();
  const deathPose = createHumanDeathPose();
  const weaponSocket = new THREE.Group();
  rifle.add(weaponSocket);
  const rifleMeshes = [];
  rifle.traverse((o) => { if (o.isMesh && o !== flash) rifleMeshes.push(o); });
  const cycles = (i) => [4, 5, 10].includes(i) ? 2 : 1;
  const ud = group.userData = {
    isHuman: true, isEvCharacter: true, armorTypeId: 'vanguard',
    standHeight: STATURE, feetY: 0, centerX: 0, centerZ: 0, headshotY: 1.56,
    bones, animationMixer: native, animationActions: actions, measuredSpeeds: template.speeds,
    primaryMat: cosmetics.primary, bodyMats: cosmetics.materials, applyFinish: cosmetics.apply,
    setLocomotion(speed, grounded = true, sprint = false, strafe = 0, dirF = 1, dirR = 0) {
      Object.assign(state, { speed: Math.max(0, speed), grounded, sprint, dirF, dirR });
    },
    setMotion(name) { Object.assign(state, { speed: name === 'run' ? 5 : name === 'walk' ? 2 : 0, grounded: true, sprint: name === 'run' }); },
    setActionState(value) { Object.assign(state, value); },
    setAim(p, y = 0) { pitch = clamp(p || 0, -1.1, 1.1); yaw = clamp(y || 0, -0.65, 0.65); },
    triggerFire(amount = 1) { fireHold = 0.16; flashTime = 0.045; shot = Math.min(1.5, amount); },
    triggerAction(name) { actionKind = name; actionTime = 0.5; },
    triggerHit() { actionKind = 'hit'; actionTime = 0.3; },
    triggerJump() { landing = 0.25; },
    triggerTeleport() {
      death = 0; rifle.visible = true;
      for (const [bone, pose] of deathBase) {
        bone.position.copy(pose.position); bone.quaternion.copy(pose.quaternion); bone.scale.copy(pose.scale);
      }
      fireHold = flashTime = shot = transition = landing = actionTime = 0;
      pitch = yaw = smoothPitch = smoothYaw = travelYaw = 0;
      state.speed = 0; state.sprint = false; state.dirF = 1; state.dirR = 0;
      state.crouch = state.firing = state.reload = state.slide = 0;
      state.swing = 1; state.vy = 0;
      state.grounded = wasGrounded = true; wasCrouched = false;
      current = 0;
      actions.forEach((a, i) => { a.time = 0; a.enabled = i === 0; a.setEffectiveWeight(i === 0 ? 1 : 0); });
      flash.visible = false;
      tick(0);
    },
    setDeathState(value, side = 1) {
      if (death > 0 && value <= 0) ud.triggerTeleport();
      death = clamp(value, 0, 1); deathSide = side;
    },
    attachWeapon(weapon, isMelee = false) {
      if (externalWeapon && externalWeapon !== weapon) disposeModel(externalWeapon);
      externalWeapon = null; melee = isMelee;
      const useNative = !weapon || weapon.userData.weaponId === 'm4';
      rifleMeshes.forEach((o) => { o.visible = useNative; });
      if (useNative) { if (weapon) disposeModel(weapon); return; }
      externalWeapon = weapon;
      // Preserve the original rifle's orientation, replacing its geometry at
      // the trigger marker. Other loadout weapons remain visible and animated.
      weaponSocket.add(weapon);
      weapon.rotation.set(-Math.PI / 2, 0, 0);
      weapon.scale.setScalar(1 / rifle.getWorldScale(V[0]).x);
      const contact = weaponHandPose(weapon).trigger;
      weaponSocket.updateWorldMatrix(true, false);
      const wrist = weaponSocket.worldToLocal(bones.Bip001_R_Hand.getWorldPosition(new THREE.Vector3()));
      weapon.position.copy(wrist).sub(V[0].fromArray(contact).multiply(weapon.scale).applyEuler(weapon.rotation));
      weapon.traverse((o) => { o.userData.noHit = true; });
    },
  };
  function tick(dt) {
    dt = clamp(dt, 0, 0.1);
    if (death > 0) {
      for (const [bone, pose] of deathBase) {
        bone.position.copy(pose.position); bone.quaternion.copy(pose.quaternion); bone.scale.copy(pose.scale);
      }
      const pose = sampleHumanDeathPose(death, deathSide, deathPose);
      group.updateWorldMatrix(true, true);
      const frame = group.getWorldQuaternion(new THREE.Quaternion());
      const x = X.clone().applyQuaternion(frame), z = new THREE.Vector3(0, 0, 1).applyQuaternion(frame);
      const parts = [
        ['Pelvis', 'hips'], ['Spine', 'spine'], ['Spine1', 'chest'], ['Head', 'head'],
        ['R_UpperArm', 'rArm'], ['L_UpperArm', 'lArm'], ['R_Forearm', 'rFore'], ['L_Forearm', 'lFore'],
        ['R_Thigh', 'rLeg'], ['L_Thigh', 'lLeg'], ['R_Calf', 'rCalf'], ['L_Calf', 'lCalf'],
      ];
      for (const [name, key] of parts) {
        const bone = bones[`Bip001_${name}`];
        rotateWorld(bone, Q[0].setFromAxisAngle(x, pose[`${key}X`] || 0));
        rotateWorld(bone, Q[0].setFromAxisAngle(z, pose[`${key}Z`] || 0));
      }
      rifle.visible = death < 0.2; flash.visible = false;
      fireHold = flashTime = shot = actionTime = 0;
      ud.activeAnimation = 'Death';
      return;
    }
    const crouched = state.crouch > 0.5 || state.slide > 0.5;
    const moving = state.speed > 0.35;
    const firing = !melee && state.reload <= 0 && (state.firing > 0 || fireHold > 0);
    if (state.grounded && !wasGrounded) landing = 0.30;
    if (crouched !== wasCrouched && !moving) transition = 0.40;
    wasCrouched = crouched; wasGrounded = state.grounded;
    let target = crouched ? (moving ? (firing ? 10 : 9) : (firing ? 8 : 7))
      : moving ? (state.sprint || state.speed > template.speeds[1] * 2.2 * 1.65 ? (firing ? 5 : 2) : (firing ? 4 : 1))
        : firing ? 3 : 0;
    if (transition > 0 && !moving) target = crouched ? 6 : 11;
    if (!state.grounded || landing > 0) target = 12;
    const previous = actions[current];
    if (target !== current) {
      const a = actions[target];
      a.time = [6, 11, 12].includes(target) ? 0
        : previous.time / previous.getClip().duration * cycles(current) % 1 * a.getClip().duration / cycles(target);
      current = target;
    }
    const base = [4].includes(target) ? 1 : target === 5 ? 2 : target === 10 ? 9 : target;
    const reference = template.speeds[base];
    const cadence = reference ? clamp(state.speed / reference, 0.35, 2.2) : 1;
    const stride = reference ? clamp(state.speed / (reference * cadence), 1, 1.65) : 1;
    let desiredTravel = moving ? -Math.atan2(state.dirR, state.dirF) : 0;
    const backwards = Math.abs(desiredTravel) > Math.PI / 2;
    if (backwards) desiredTravel += desiredTravel > 0 ? -Math.PI : Math.PI;
    travelYaw = ease(travelYaw, desiredTravel, dt, 12);
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      const weight = ease(a.getEffectiveWeight(), i === target ? 1 : 0, dt, 18);
      a.enabled = i === target || weight > 0.0001;
      a.setEffectiveWeight(a.enabled ? weight : 0);
      a.setEffectiveTimeScale(([1, 2, 4, 5, 9, 10].includes(i) ? cadence * (backwards ? -1 : 1) : 1));
      a.paused = [6, 11, 12].includes(i);
    }
    if (target === 6 || target === 11) actions[target].time = (1 - transition / 0.40) * 0.75;
    if (target === 12) actions[12].time = !state.grounded
      ? (state.vy > 1 ? 0.68 : state.vy > -1 ? 0.93 : 1.22)
      : 1.40 + (1 - landing / 0.30) * 0.92;
    native.update(dt);
    group.updateWorldMatrix(true, true);
    // Aim rotates the complete upper-body chain, including both hands and gun.
    smoothPitch = ease(smoothPitch, pitch, dt);
    smoothYaw = ease(smoothYaw, yaw, dt);
    group.getWorldQuaternion(Q[1]);
    const bodyAxis = V[8].copy(Y).applyQuaternion(Q[1]);
    const chestWorld = spine.getWorldQuaternion(Q[2]).clone();
    rotateWorld(pelvis, Q[0].setFromAxisAngle(bodyAxis, travelYaw));
    spine.parent.getWorldQuaternion(Q[3]).invert();
    spine.quaternion.copy(Q[3].multiply(chestWorld));
    spine.updateWorldMatrix(false, true);
    // Small stride extension, solved against real bone lengths; ankle height
    // is unchanged, so walk/run still contact the gameplay floor.
    if (stride > 1.001 && state.grounded) for (const side of ['L', 'R']) {
      const foot = bones[`Bip001_${side}_Foot`];
      const thigh = bones[`Bip001_${side}_Thigh`];
      const targetFoot = foot.getWorldPosition(new THREE.Vector3());
      const hip = thigh.getWorldPosition(new THREE.Vector3());
      targetFoot.x = hip.x + (targetFoot.x - hip.x) * stride;
      targetFoot.z = hip.z + (targetFoot.z - hip.z) * stride;
      const footQ = foot.getWorldQuaternion(new THREE.Quaternion());
      solveChain(thigh, bones[`Bip001_${side}_Calf`], foot, targetFoot);
      foot.parent.getWorldQuaternion(Q[3]).invert(); foot.quaternion.copy(Q[3].multiply(footQ));
    }
    const actionPulse = actionTime > 0 ? Math.sin(actionTime / 0.5 * Math.PI) : 0;
    const reload = Math.sin(clamp(state.reload, 0, 1) * Math.PI);
    const meleeSwing = melee && state.swing < 1 ? Math.sin(state.swing * Math.PI * 2) * 0.8 : 0;
    const actionPitch = reload * -0.35 + (actionKind === 'hit' ? -0.12 : -0.25) * actionPulse + meleeSwing;
    rotateWorld(chest, Q[0].setFromAxisAngle(bodyAxis, smoothYaw));
    rotateWorld(chest, Q[0].setFromAxisAngle(V[8].copy(X).applyQuaternion(Q[1]), smoothPitch + actionPitch + shot * 0.018));
    if (externalWeapon && !melee) {
      externalWeapon.updateWorldMatrix(true, true);
      const contact = weaponHandPose(externalWeapon);
      const support = new THREE.Vector3(...(state.reload > 0 ? contact.reload : contact.support))
        .applyMatrix4(externalWeapon.matrixWorld);
      solveChain(bones.Bip001_L_UpperArm, bones.Bip001_L_Forearm, bones.Bip001_L_Hand, support);
    }
    ud.activeAnimation = template.clips[target].name;
    ud.animationCadence = cadence; ud.strideScale = stride;
    ud.headshotY = group.worldToLocal(bones.Bip001_Head.getWorldPosition(V[9])).y - 0.02;
    flash.visible = flashTime > 0 && !melee && !externalWeapon;
    flashTime = Math.max(0, flashTime - dt); fireHold = Math.max(0, fireHold - dt);
    transition = Math.max(0, transition - dt); landing = Math.max(0, landing - dt);
    shot *= Math.exp(-24 * dt); actionTime = Math.max(0, actionTime - dt);
  }
  ud.mixer = { update: tick };
  tick(0);
  for (const bone of Object.values(bones)) deathBase.set(bone, {
    position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone(),
  });
  cosmetics.apply(skin, armorSkin);
  return group;
}
