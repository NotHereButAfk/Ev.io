#!/usr/bin/env node
// Geometry gate for the cyborg body (src/player/LowPolyModels.js).
//
// The mesh is free to change; the numbers the ANIMATION reads off it are not.
// Locomotion.js solves ground contact against a fixed hip/knee/ankle chain and
// a fixed sole footprint, RifleCarry.js IKs both arms against a fixed shoulder
// position and bone length, and rigCharacterLimbs() places every pivot at the
// MEAN x of the parts it collects — so a plate nudged sideways silently moves
// a joint. This checks all of that against the built mesh.

import * as THREE from 'three';
import { buildLowPolyCharacter, LOWPOLY_IDS, isSharedGeometry } from '../src/player/LowPolyModels.js';
import { rigCharacterLimbs } from '../src/player/PreviewCharacter.js';
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (c, msg, detail = '') => {
  if (!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${msg}${detail ? '  ' + detail : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Exactly the buckets rigCharacterLimbs uses.
const ARM_RE = /uarm|farm|elbow|hand|shoulder|pau|pvs/i;
const LEG_RE = /thigh|lleg|knee|boot|shinp|sole|grv|kn_|knsph|tpl|cg_/i;
const LEG_FT = /boot|sole|foot|toe|ankle/i;

for (const id of LOWPOLY_IDS) {
  console.log(`\n── ${id} ──`);
  const g = buildLowPolyCharacter(id);
  g.updateWorldMatrix(true, true);

  // ── geometry sanity ────────────────────────────────────────────────────────
  let tris = 0, verts = 0, bad = 0, meshes = 0, degenerateNormals = 0;
  g.traverse((o) => {
    if (!o.isMesh || o.name === 'outline') return;
    meshes++;
    const p = o.geometry.attributes.position, n = o.geometry.attributes.normal;
    verts += p.count;
    tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
    for (let i = 0; i < p.count; i++) {
      if (!Number.isFinite(p.getX(i)) || !Number.isFinite(p.getY(i)) || !Number.isFinite(p.getZ(i))) bad++;
      if (n) {
        const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
        if (!Number.isFinite(l)) bad++;
        else if (l < 0.5) degenerateNormals++;
      }
    }
  });
  ok(bad === 0, 'no NaN positions or normals', `${bad} bad`);
  // Duplicated corner vertices on the armour plates are meant to sit on
  // zero-area quads; a handful is the technique working, a flood is a bug.
  ok(degenerateNormals / verts < 0.06, 'unnormalised normals stay rare',
     `${degenerateNormals}/${verts} = ${(100 * degenerateNormals / verts).toFixed(1)}%`);
  console.log(`        ${meshes} meshes, ${verts} verts, ${tris | 0} tris (before outlines)`);

  // ── the sole plane ─────────────────────────────────────────────────────────
  // Locomotion.js plants HEEL(y −0.27, z +0.10) and TOE(y −0.27, z −0.20) in
  // ankle-local space, i.e. y 0 / z +0.10 / z −0.20 in the body's.
  const wp = new THREE.Vector3(), v = new THREE.Vector3();
  const footBox = new THREE.Box3();
  let bodyLow = Infinity;
  g.traverse((o) => {
    if (!o.isMesh || o.name === 'outline') return;
    const p = o.geometry.attributes.position;
    const isFoot = LEG_FT.test(o.name);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      bodyLow = Math.min(bodyLow, v.y);
      if (isFoot) footBox.expandByPoint(v);
    }
  });
  ok(near(footBox.min.y, 0, 0.004), 'sole sits on y = 0', `min ${footBox.min.y.toFixed(4)}`);
  ok(bodyLow > -0.004, 'nothing pokes through the floor', `lowest ${bodyLow.toFixed(4)}`);
  ok(footBox.min.z <= -0.19 && footBox.min.z >= -0.23,
     'toe reaches z ≈ −0.20', `${footBox.min.z.toFixed(3)}`);
  ok(footBox.max.z >= 0.09 && footBox.max.z <= 0.14,
     'heel reaches z ≈ +0.10', `${footBox.max.z.toFixed(3)}`);

  // ── limb-bucket mean x (this is where every pivot lands) ───────────────────
  const mean = { armL: [], armR: [], legL: [], legR: [] };
  g.traverse((o) => {
    if (!o.isMesh || !o.name || o.name === 'outline') return;
    o.getWorldPosition(wp);
    const side = wp.x < 0 ? 'L' : 'R';
    if (ARM_RE.test(o.name) && Math.abs(wp.x) > 0.12) mean['arm' + side].push(wp.x);
    else if (LEG_RE.test(o.name) && Math.abs(wp.x) > 0.04) mean['leg' + side].push(wp.x);
  });
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  ok(near(Math.abs(avg(mean.armL)), 0.27, 1e-6) && near(Math.abs(avg(mean.armR)), 0.27, 1e-6),
     'shoulder pivots land on |x| = 0.27',
     `${avg(mean.armL).toFixed(6)} / ${avg(mean.armR).toFixed(6)}`);
  ok(near(Math.abs(avg(mean.legL)), 0.11, 1e-6) && near(Math.abs(avg(mean.legR)), 0.11, 1e-6),
     'hip pivots land on |x| = 0.11',
     `${avg(mean.legL).toFixed(6)} / ${avg(mean.legR).toFixed(6)}`);

  // ── headshot zone (bots tag by mesh.position.y >= 1.90) ────────────────────
  let headParts = 0;
  g.traverse((o) => { if (o.isMesh && o.name !== 'outline' && o.position.y >= 1.90) headParts++; });
  ok(headParts >= 8, 'skull parts are inside the bots\' head zone', `${headParts} parts`);

  // ── the rig itself ─────────────────────────────────────────────────────────
  const rig = rigCharacterLimbs(g);
  ok(!!rig, 'rigs');
  if (rig) {
    const P = (o) => o.getWorldPosition(new THREE.Vector3());
    const hip = P(rig.legL), knee = P(rig.kneeL), ankle = P(rig.ankleL);
    const sh = P(rig.armR), el = P(rig.elbowR);
    ok(near(hip.y, 1.21, 1e-6), 'hip at y 1.21', hip.y.toFixed(5));
    ok(near(knee.y, 0.62, 1e-6), 'knee at y 0.62', knee.y.toFixed(5));
    ok(near(ankle.y, 0.27, 1e-6), 'ankle at y 0.27', ankle.y.toFixed(5));
    ok(near(sh.y, 1.76, 1e-6) && near(sh.x, 0.27, 1e-6),
       'shoulder at (0.27, 1.76)', `${sh.x.toFixed(5)}, ${sh.y.toFixed(5)}`);
    ok(near(sh.y - el.y, 0.48, 1e-6), 'UP_ARM = 0.48', (sh.y - el.y).toFixed(5));
    ok(near(hip.y - knee.y, 0.59, 1e-6), 'THIGH_L = 0.59', (hip.y - knee.y).toFixed(5));
    ok(near(knee.y - ankle.y, 0.35, 1e-6), 'SHIN_L = 0.35', (knee.y - ankle.y).toFixed(5));

    // Every limb has to have actually collected parts, or the walk cycle drives
    // empty pivots and the body strides with its legs standing still.
    for (const k of ['legL', 'legR', 'armL', 'armR', 'kneeL', 'kneeR', 'elbowL', 'elbowR', 'ankleL', 'ankleR']) {
      const n = rig[k]?.children.filter(c => c.isMesh).length ?? 0;
      ok(n > 0, `${k} owns geometry`, `${n} meshes`);
    }

    // A swung limb must actually move its skin.
    rig.legL.rotation.x = 0.6;
    rig.kneeL.rotation.x = -0.9;
    g.updateWorldMatrix(true, true);
    const moved = P(rig.ankleL);
    ok(moved.distanceTo(ankle) > 0.15, 'swinging the hip carries the foot',
       `${moved.distanceTo(ankle).toFixed(3)} m`);
  }
}

// ── shared buffers ───────────────────────────────────────────────────────────
// Bodies of the same chassis reuse geometry, which is what keeps eight bots off
// the frame budget. It also means a single dispose() would empty every body on
// the map at once, so every teardown path has to check before freeing.
console.log('\n── shared geometry ──');
{
  const a = buildLowPolyCharacter('vanguard'), b = buildLowPolyCharacter('vanguard');
  const geoOf = (g) => { const out = []; g.traverse(o => { if (o.isMesh) out.push(o.geometry); }); return out; };
  const ga = geoOf(a), gb = geoOf(b);
  const same = ga.filter((x, i) => x === gb[i]).length;
  ok(same === ga.length, 'a second body of the same chassis reuses every buffer',
     `${same}/${ga.length}`);
  ok(ga.every(isSharedGeometry), 'every reused buffer is tagged shared');

  // Anything that walks a character and frees geometry must gate on the tag.
  for (const f of ['src/player/Avatar.js', 'src/ui/ArmorPreviewRenderer.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const frees = /geometry.{0,3}dispose/.test(src);
    ok(!frees || /isSharedGeometry/.test(src),
       `${f} checks the tag before disposing`, frees ? 'disposes' : 'never disposes');
  }
}

console.log(fails ? `\n${fails} mesh check(s) FAILED` : '\nall mesh checks passed');
process.exit(fails ? 1 : 0);
