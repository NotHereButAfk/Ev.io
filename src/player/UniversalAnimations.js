import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { retargetClip } from 'three/addons/utils/SkeletonUtils.js';

const URL = '/vendor/quaternius/universal-animation-library.glb';
const CLIPS = {
  idle: 'Idle_Loop',
  jog: 'Jog_Fwd_Loop',
  sprint: 'Sprint_Loop',
  crouchIdle: 'Crouch_Idle_Loop',
  crouchMove: 'Crouch_Fwd_Loop',
  air: 'Jump_Loop',
};

// Target HeroBody bone -> Quaternius source bone. The source contains extra
// twist/finger/toe bones; the game rig intentionally retargets only the joints
// that deform its connected mesh. RifleCarry takes ownership of both arms after
// locomotion is sampled, keeping every weapon locked to its two contact points.
const BONE_MAP = {
  root: 'root', hips: 'DEF-hips', spine: 'DEF-spine001', chest: 'DEF-spine003',
  neck: 'DEF-neck', head: 'DEF-head',
  shoulderL: 'DEF-upper_armL', elbowL: 'DEF-forearmL', handL: 'DEF-handL',
  shoulderR: 'DEF-upper_armR', elbowR: 'DEF-forearmR', handR: 'DEF-handR',
  thighL: 'DEF-thighL', kneeL: 'DEF-shinL', ankleL: 'DEF-footL',
  thighR: 'DEF-thighR', kneeR: 'DEF-shinR', ankleR: 'DEF-footR',
};

let source = null;
let loading = false;
let retargeted = null;
const pending = new Set();

// Quaternius' library is authored Z-up and carries that conversion as a
// constant -90-degree X rotation on its skeleton root. HeroBody is already
// Y-up. Retargeting that root track therefore lays the entire bot on its side
// while the child bones continue playing a valid walk cycle. Root motion is
// owned by the game simulation, so keep the target skeleton's upright rest
// transform and retain only the articulated body tracks.
export function stripRetargetedRootMotion(clip) {
  if (!clip?.tracks) return clip;
  clip.tracks = clip.tracks.filter((track) =>
    !/^\.bones\[root\]\.(?:position|quaternion|scale)$/.test(track.name));
  clip.resetDuration?.();
  return clip;
}

function sourceSkeleton(scene) {
  const bones = [];
  scene.traverse((node) => { if (node.isBone) bones.push(node); });
  return bones.length ? new THREE.Skeleton(bones) : null;
}

function makeRetargeted(targetMesh) {
  if (retargeted || !source) return retargeted;
  const skeleton = sourceSkeleton(source.scene);
  if (!skeleton) return null;
  const byName = new Map(source.animations.map((clip) => [clip.name, clip]));
  retargeted = {};
  for (const [state, clipName] of Object.entries(CLIPS)) {
    const clip = byName.get(clipName);
    if (!clip) continue;
    retargeted[state] = stripRetargetedRootMotion(retargetClip(targetMesh, skeleton, clip, {
      names: BONE_MAP,
      hip: 'DEF-hips',
      hipInfluence: new THREE.Vector3(0, 0, 0),
      preserveBonePositions: true,
      useFirstFramePosition: false,
      fps: 30,
    }));
  }
  targetMesh.skeleton.pose();
  return retargeted;
}

function install(group) {
  const mesh = group?.userData?.meshes?.[0];
  const rig = group?.userData?.rig;
  if (!mesh || !rig || rig.universalAnimator) return rig?.universalAnimator || null;
  const clips = makeRetargeted(mesh);
  if (!clips) return null;

  const mixer = new THREE.AnimationMixer(mesh);
  const actions = {};
  for (const [state, clip] of Object.entries(clips)) {
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    actions[state] = action;
  }
  let activeName = 'idle';
  let active = actions.idle;
  active?.play();
  let playback = 1;

  const animator = {
    source: 'Quaternius Universal Animation Library Standard',
    update(dt, o = {}) {
      if (!active) return;
      let nextName;
      if (!o.grounded) nextName = 'air';
      else if (o.crouch) nextName = o.moving ? 'crouchMove' : 'crouchIdle';
      else if (!o.moving || (o.speed || 0) < 0.18) nextName = 'idle';
      else nextName = (o.run || 0) > 0.48 ? 'sprint' : 'jog';
      const next = actions[nextName] || actions.idle;
      if (next && next !== active) {
        const phase = active.time / Math.max(0.001, active.getClip().duration);
        next.reset();
        if ((nextName === 'jog' || nextName === 'sprint')
            && (activeName === 'jog' || activeName === 'sprint')) {
          next.time = phase * next.getClip().duration;
        }
        next.play();
        active.crossFadeTo(next, 0.16, false);
        active = next;
        activeName = nextName;
      }

      // Match cadence to actual travel speed. This avoids the old fast-feet /
      // slow-body skating while preserving the authored jog and sprint shape.
      let targetPlayback = 1;
      if (activeName === 'jog') targetPlayback = THREE.MathUtils.clamp((o.speed || 0) / 6.6, 0.72, 1.18);
      if (activeName === 'sprint') targetPlayback = THREE.MathUtils.clamp((o.speed || 0) / 13.2, 0.78, 1.16);
      if (activeName === 'crouchMove') targetPlayback = THREE.MathUtils.clamp((o.speed || 0) / 3.7, 0.7, 1.15);
      playback += (targetPlayback - playback) * (1 - Math.exp(-10 * dt));
      active.setEffectiveTimeScale(playback);
      mixer.update(Math.min(dt, 0.05));
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(mesh); },
  };
  rig.universalAnimator = animator;
  group.userData.animationSource = animator.source;
  return animator;
}

export function attachUniversalAnimator(group) {
  if (!group?.userData?.isHero) return null;
  if (source) return install(group);
  pending.add(group);
  return null;
}

export function preloadUniversalAnimations(onReady) {
  if (source) { onReady?.(); return; }
  if (loading) return;
  loading = true;
  new GLTFLoader().load(URL, (gltf) => {
    source = gltf;
    loading = false;
    for (const group of pending) install(group);
    pending.clear();
    onReady?.();
  }, undefined, (error) => {
    loading = false;
    console.warn('[animations] Universal Animation Library unavailable; using procedural fallback.', error);
  });
}

export function universalAnimationStatus() {
  return { ready: !!source, clipCount: source?.animations?.length || 0, pending: pending.size };
}
