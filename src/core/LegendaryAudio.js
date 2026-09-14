import { WEAPON_SKINS } from '../../server/weaponskins.mjs';
const skins = new Map(WEAPON_SKINS.filter(s => s.rarity === 'legendary').map(s => [s.shootSound, s]));
const gunProfiles = { m4: [0.16,1.1], magnum: [0.24,0.8], battlerifle: [0.18,1], energyshotgun: [0.34,0.6], plasmarifle: [0.22,1.3] };

export function createLegendaryShot(soundId, sampleRate) {
  const skin = skins.get(soundId);
  if (!skin) return null;
  const [duration,pitch] = gunProfiles[skin.weaponId];
  const style = skin.legendaryStyle;
  const bases = [620,180,1100,360,95];
  const data = new Float32Array(Math.ceil(duration*sampleRate));
  let noise = 1234567 + style*7919, phase = 0;
  for(let i=0;i<data.length;i++) {
    const t=i/sampleRate, progress=t/duration;
    noise ^= noise<<13;noise ^= noise>>>17;noise ^= noise<<5;
    const n=(noise>>>0)/2147483648-1;
    const frequency = bases[style]*pitch*(0.3+0.7*Math.exp(-t*16));
    phase += 2*Math.PI*frequency/sampleRate;
    const body = Math.sin(phase);
    const overtone = Math.sin(phase*[2,0.51,2.76,1.5,0.5][style]+Math.sin(t*70)*[0.1,1.2,0.2,2,0.8][style]);
    const crack = n*Math.exp(-t*[70,20,100,50,25][style]);
    const envelope = Math.min(1,t/0.002)*Math.exp(-progress*5)*Math.min(1,(duration-t)/0.012);
    data[i] = Math.tanh((body*0.6+overtone*0.25+crack*[0.3,0.9,0.15,0.4,0.65][style])*1.7)*envelope*0.58;
  }
  return data;
}
