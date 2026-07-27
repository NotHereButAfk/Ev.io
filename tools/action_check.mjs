// Action animation check — `npm run test:actions`
//
// The rule this enforces: if it is an ACTION, it has to move the body. Every
// one of these shipped at some point doing nothing visible at all — a reload
// the character didn't react to, a sword lunge where the blade moved and the
// arms carried on swinging with the stride, a sprint-slide that ran the normal
// walk cycle at knee height.
//
// Each case drives the real pose function against a plain-object rig and
// measures how far the joints it is supposed to move actually moved, against a
// control rig doing the same thing WITHOUT the action. A pose that forgets to
// apply something scores zero and fails, which is exactly the bug class here —
// silence rather than a wrong number.
import { applyWalkCycle } from '../src/player/Locomotion.js';
import { applyRifleCarry } from '../src/player/RifleCarry.js';
import { triggerAction, tickActions, applyMeleeCarry, ACTION_TIME } from '../src/player/Actions.js';

const JOINTS = ['legL', 'legR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
                'armL', 'armR', 'elbowL', 'elbowR'];
// Enough of an Object3D for the pose code: the walk cycle writes rotation
// channels directly, the arm IK calls rotation.set() and copies a quaternion.
const joint = () => ({
  rotation: { x: 0, y: 0, z: 0, order: 'XYZ',
              set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
  quaternion: { x: 0, y: 0, z: 0, w: 1,
                copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; } },
});
const newRig = () => {
  const r = { _walkT: 0.6, _moveBlend: 0, _lean: 0 };
  for (const j of JOINTS) r[j] = joint();
  return r;
};
// A stand-in for the weapon Object3D: only position/rotation/quaternion are touched.
const newWeapon = () => ({
  position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
              copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } },
  rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } },
  quaternion: { x: 0, y: 0, z: 0, w: 1,
                copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; } },
});

// Shoulders are set by the IK as a quaternion and elbows as a hinge angle, so
// read both — sampling only rotation.x would score every gun action as zero.
const armPose = (rig) => JOINTS.filter((j) => j.startsWith('arm') || j.startsWith('elbow'))
  .flatMap((j) => { const o = rig[j];
    return [o.rotation.x, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w]; });
const legPose = (rig) => JOINTS.filter((j) => j.startsWith('leg') || j.startsWith('knee') || j.startsWith('ankle'))
  .map((j) => rig[j].rotation.x);
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
const wDiff = (a, b) => Math.max(
  Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y),
  Math.abs(a.position.z - b.position.z),
  Math.abs(a.quaternion.x - b.quaternion.x), Math.abs(a.quaternion.y - b.quaternion.y),
  Math.abs(a.quaternion.z - b.quaternion.z), Math.abs(a.quaternion.w - b.quaternion.w),
  Math.abs(a.rotation.x - b.rotation.x), Math.abs(a.rotation.z - b.rotation.z));

let failures = 0;
const results = [];
function record(name, moved, limit, what) {
  const ok = moved >= limit;
  if (!ok) failures++;
  results.push({ name, moved, limit, ok, what });
}

const dt = 1 / 60;

// ── gun actions: reload / swap / flinch / throw ─────────────────────────────
// Each drives applyRifleCarry against a control with the action left out, so
// what is measured is the action's own contribution and nothing else.
for (const [name, key, what] of [
  ['reload',        'reload', 'weapon rolls over, support hand goes to the mag'],
  ['weapon swap',   'swap',   'weapon drops out of frame and comes back'],
  ['damage flinch', 'flinch', 'weapon dips, arms follow'],
  ['grenade throw', 'throwP', 'off arm winds up and lobs'],
]) {
  const rig = newRig(), ctrl = newRig();
  const w = newWeapon(), wc = newWeapon();
  let armMoved = 0, weaponMoved = 0;
  for (let i = 0; i <= 30; i++) {
    const p = i / 30;                              // 0 → 1 through the action
    applyRifleCarry(rig,  w,  0.2, dt, { swing: 0, kick: 0, [key]: p });
    applyRifleCarry(ctrl, wc, 0.2, dt, { swing: 0, kick: 0 });
    armMoved = Math.max(armMoved, maxDiff(armPose(rig), armPose(ctrl)));
    weaponMoved = Math.max(weaponMoved, wDiff(w, wc));
  }
  record(name, Math.max(armMoved, weaponMoved), 0.10, what);
  // A gun action that only moves the weapon and leaves the hands behind is
  // worse than none — the arms are IK'd onto it and must come along.
  record(name + ' — hands follow', armMoved, 0.05, 'arms track the weapon');
}

// ── melee swing ─────────────────────────────────────────────────────────────
{
  const rig = newRig(), ctrl = newRig();
  const w = newWeapon(), wc = newWeapon();
  let armMoved = 0, bladeMoved = 0;
  for (let i = 0; i <= 30; i++) {
    const p = i / 30;
    applyMeleeCarry(rig,  w,  { swing: p, moving: false, phase: 0.6, run: 0, dt });
    applyMeleeCarry(ctrl, wc, { swing: 1, moving: false, phase: 0.6, run: 0, dt });
    armMoved = Math.max(armMoved, maxDiff(armPose(rig), armPose(ctrl)));
    bladeMoved = Math.max(bladeMoved, wDiff(w, wc));
  }
  record('melee swing', armMoved, 0.8, 'arm drives the strike');
  record('melee swing — blade follows', bladeMoved, 0.5, 'blade tracks the arm');

  // "The blade moved" is not enough — it moved plenty while sitting a forearm's
  // length away from the arm swinging it, because the two were keyed
  // separately. Walk the arm to the hand independently and check the blade is
  // actually there. Same rig metrics as RifleCarry; both joints pitch about X.
  const SH_Y = 1.76, UP = 0.48, FORE = 0.385;
  let worstGap = 0;
  for (let i = 0; i <= 30; i++) {
    const p = i / 30;
    applyMeleeCarry(rig, w, { swing: p, moving: false, phase: 0.6, run: 0, dt });
    const a = rig.armR.rotation.x, e = rig.elbowR.rotation.x, tot = a + e;
    const hy = SH_Y - UP * Math.cos(a) - FORE * Math.cos(tot);
    const hz = -UP * Math.sin(a) - FORE * Math.sin(tot);
    worstGap = Math.max(worstGap, Math.hypot(w.position.y - hy, w.position.z - hz));
  }
  const inHand = worstGap < 0.05;
  if (!inHand) failures++;
  results.push({ name: 'melee swing — blade in hand', moved: inHand ? 1 : 0, limit: 1, ok: inHand,
                 what: inHand ? 'grip holds through the arc'
                              : `blade is ${worstGap.toFixed(2)}m from the hand` });
}

// ── slide ───────────────────────────────────────────────────────────────────
{
  const rig = newRig(), ctrl = newRig();
  const o = { speed: 9.6, moving: true, run: 1, dt };
  for (let i = 0; i < 120; i++) { applyWalkCycle(rig, o); applyWalkCycle(ctrl, o); }
  let legMoved = 0, leanMoved = 0;
  for (let i = 0; i < 40; i++) {
    const g = applyWalkCycle(rig, { ...o, slide: 1 });
    const c = applyWalkCycle(ctrl, o);
    legMoved = Math.max(legMoved, maxDiff(legPose(rig), legPose(ctrl)));
    leanMoved = Math.max(leanMoved, Math.abs(g.lean - c.lean));
  }
  record('slide', legMoved, 0.8, 'lead leg out, trailing leg folded under');
  record('slide — torso tips back', leanMoved, 0.15, 'body leans over the trailing leg');
}

// ── one-shot clocks ─────────────────────────────────────────────────────────
{
  const rig = newRig();
  triggerAction(rig, 'throw');
  const seen = [];
  for (let i = 0; i < Math.ceil(ACTION_TIME.throw / dt) + 10; i++) {
    seen.push(tickActions(rig, dt).throw);
  }
  const ran = seen.filter((v) => v > 0).length;
  const rose = seen.every((v, i) => i === 0 || v === 0 || seen[i - 1] === 0 || v >= seen[i - 1]);
  const ended = seen[seen.length - 1] === 0;
  record('throw clock runs', ran / 60, ACTION_TIME.throw * 0.8, `${ran} frames`);
  if (!rose) { failures++; results.push({ name: 'throw clock is monotonic', moved: 0, limit: 1, ok: false, what: 'progress went backwards' }); }
  if (!ended) { failures++; results.push({ name: 'throw clock ends', moved: 0, limit: 1, ok: false, what: 'never finished' }); }

  // Re-triggering mid-action restarts it — a second hit during a flinch.
  triggerAction(rig, 'flinch');
  for (let i = 0; i < 8; i++) tickActions(rig, dt);
  const mid = tickActions(rig, dt).flinch;
  triggerAction(rig, 'flinch');
  const after = tickActions(rig, dt).flinch;
  if (!(after < mid)) {
    failures++;
    results.push({ name: 'flinch restarts', moved: 0, limit: 1, ok: false,
                   what: `re-trigger did not reset (${mid.toFixed(2)} → ${after.toFixed(2)})` });
  } else {
    results.push({ name: 'flinch restarts', moved: 1, limit: 1, ok: true, what: 'a second hit resets it' });
  }
}

// ── report ──────────────────────────────────────────────────────────────────
console.log('every action has to move the body — measured against the same');
console.log('pose with the action left out\n');
const pad = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  const amt = r.moved >= 1 && r.limit === 1 ? '     ' : r.moved.toFixed(2).padStart(5);
  console.log('   %s %s %s   %s', r.ok ? ' ok ' : 'FAIL', r.name.padEnd(pad), amt, r.what);
}
console.log(failures ? `\n${failures} FAILED` : '\nall action checks passed');
process.exit(failures ? 1 : 0);
