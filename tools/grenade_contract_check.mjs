#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { consumeThrowable } from '../src/core/GameplayInput.js';
import { GrenadeSystem } from '../src/weapons/GrenadeSystem.js';
import { applyAuthoritativeResources } from '../src/net/AuthoritativePresentation.js';
import { updateExplosion } from '../src/effects/ExplosionEffect.js';

const inputFor = (pressed) => ({
  consumeJustPressed(code) { return code === pressed; },
});
assert.equal(consumeThrowable(inputFor('KeyG')), 'frag', 'G is not wired to frag');
assert.equal(consumeThrowable(inputFor('KeyF')), 'smoke', 'F is not wired to smoke');
assert.equal(consumeThrowable(inputFor('KeyE')), null, 'stale E smoke binding survived');

const system = new GrenadeSystem(new THREE.Scene());
let routedDamage = 0;
system.onSelfDamage = (damage) => { routedDamage += damage; };
const player = { position: new THREE.Vector3(), takeDamage: () => assert.fail('bypassed Game death flow') };
system._fragExplode(new THREE.Vector3(), player);
assert.equal(routedDamage, 80, 'frag self-damage did not route through the Game damage/death callback');
assert.equal(system.explosions.length, 1, 'frag did not create a visible explosion');
const visibleExplosion = system.explosions[0];
assert.ok(visibleExplosion.root.children.length >= 6, 'frag explosion is missing layered fire/smoke/sparks');
assert.ok(visibleExplosion.root.position.y > 0, 'frag explosion is buried in the floor');
assert.ok(visibleExplosion.life >= 1.2, 'frag explosion disappears too quickly to see');
updateExplosion(visibleExplosion, 0.1);
assert.ok(visibleExplosion.shockwave.scale.x > 1, 'frag shockwave did not visibly expand');

const presentationPlayer = { shield: 0, stamina: 100 };
const inventory = { frags: 0, smokes: 0 };
applyAuthoritativeResources(presentationPlayer, {
  sim: { stamina: 37 },
  self: { shield: 19, abilities: { frag: 1, smoke: 2 } },
}, inventory);
assert.deepEqual(presentationPlayer, { shield: 19, stamina: 37 }, 'authoritative stamina did not reach HUD player');
assert.deepEqual(inventory, { frags: 1, smokes: 2 }, 'authoritative grenade inventory did not reach HUD');
console.log('grenade contract passed: G/F bindings, layered explosion, damage flow, stamina and inventory all replicate');
