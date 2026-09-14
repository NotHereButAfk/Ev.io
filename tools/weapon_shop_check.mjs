import assert from 'node:assert/strict';
import {WEAPON_SKINS} from '../server/weaponskins.mjs';
import {STORE_ITEMS} from '../server/storecatalog.mjs';
import {Armory} from '../src/core/Armory.js';
const data=new Map([['sio_armory',JSON.stringify({m4:'ember',sword:'fireball',__owned:['ember','fireball']})]]);
globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
assert.equal(WEAPON_SKINS.length,25);
assert.deepEqual(STORE_ITEMS.filter(s=>s.kind==='weapon').map(s=>s.id),WEAPON_SKINS.map(s=>s.id));
assert.equal(Armory.getSkinId('m4'),null);assert.equal(Armory.getSkinId('sword'),null);assert.deepEqual(Armory.ownedSkins(),[]);
for(const skin of WEAPON_SKINS){
 assert.equal(Armory.ownsSkin(skin.id),false);
 Armory.equipSkin(skin.weaponId,skin.id);assert.notEqual(Armory.getSkinId(skin.weaponId),skin.id);
 Armory.grantSkin(skin.id);Armory.equipSkin(skin.weaponId,skin.id);assert.equal(Armory.getSkinId(skin.weaponId),skin.id);
 const wrong=skin.weaponId==='m4'?'magnum':'m4';Armory.equipSkin(wrong,skin.id);assert.notEqual(Armory.getSkinId(wrong),skin.id);
}
console.log('25 paid weapon skins: catalog parity, retired equipment fallback, purchase ownership and exclusive equip passed');
