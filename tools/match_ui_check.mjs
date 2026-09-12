import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root=fileURLToPath(new URL('..',import.meta.url));
const server=await createServer({root,server:{host:'127.0.0.1',port:0,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
let browser;
try {
 await server.listen();browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--no-sandbox','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.route(/fonts\.(?:googleapis|gstatic)\.com/,r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto(server.resolvedUrls.local[0]);
 await page.waitForFunction(()=>window.__game?.previewCharacter?.userData.isEvCharacter,null,{timeout:60000});
 for(const mapId of ['daytime-rook','winter-graveyard']) {
  await page.evaluate(id=>window.__game._showMapLoading('deathmatch',id,{autoHide:false}),mapId);
  const layout=await page.evaluate(async()=>{
   const panel=document.querySelector('.ml-panel').getBoundingClientRect();
   const screen=document.getElementById('map-loading');
   const image=new Image();image.src=screen.style.getPropertyValue('--ml-image').slice(5,-2);await image.decode();
   return {ratio:panel.width/innerWidth,image:image.naturalWidth,title:screen.querySelector('.ml-name').textContent};
  });
  assert(Math.abs(layout.ratio-.2385)<.01);assert(layout.image>=1280);assert(!layout.title.includes('LOADING'));
  if(process.env.MATCH_UI_SHOTS) {fs.mkdirSync(process.env.MATCH_UI_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.MATCH_UI_SHOTS}/loading-${mapId}.png`});}
 }
 await page.evaluate(()=>{window.__game._hideMapLoading();document.querySelector('#play-btn').click();});
 await page.waitForFunction(()=>window.__game.state==='playing');
 await page.evaluate(()=>{
  const g=window.__game;g._menuOpen=false;
  for(const id of ['top-nav','nav-side','share-game','social-icons','center-play'])document.getElementById(id)?.classList.add('hidden');
  const rows=g._buildScoreboardRows();rows[0]={...rows[0],isYou:true,isBot:false,name:'<img src=x onerror=alert(1)>',score:1200,kills:12,deaths:3,assists:2};
  g.hud.showScoreboard(rows,'Deathmatch',{shotsFired:20,hits:5,damageDealt:420,headshots:2,bestStreak:4,earnedCoins:60});
 });
 assert.equal(await page.locator('#sb-rows tr').count(),8);
 assert.deepEqual(await page.locator('#sb-rows tr').first().locator('td').allTextContents(),['1.','<img src=x onerror=alert(1)>YOU','1,200','2','12','3','4.0']);
 assert.equal(await page.locator('#sb-rows img').count(),8,'names must remain text');
 assert(await page.locator('.sb-portrait').first().evaluate(img=>img.complete&&img.naturalWidth>0));
 if(process.env.MATCH_UI_SHOTS) {
  await page.evaluate(()=>{
   document.querySelector('#sb-rows .sb-player-name').textContent='Guest2246';
   document.querySelectorAll('#sb-rows tr').forEach((row,i)=>row.classList.toggle('sb-row-you',i===0));
  });
  await page.screenshot({path:`${process.env.MATCH_UI_SHOTS}/scoreboard-desktop.png`});
 }
 await page.keyboard.press('ArrowRight');assert(await page.locator('#sb-earn-view').isVisible());assert.equal(await page.locator('#sb-earned').textContent(),'60');
 await page.keyboard.press('ArrowRight');assert(await page.locator('#sb-performance-view').isVisible());assert((await page.locator('#sb-performance').textContent()).includes('25.0%'));
 await page.evaluate(()=>window.__game.hud.showScoreboard(window.__game._buildScoreboardRows()));
 assert(await page.locator('#sb-performance-view').isVisible(),'refresh preserves selected tab');
 await page.keyboard.press('ArrowRight');
 await page.setViewportSize({width:390,height:844});
 const bounds=await page.locator('.sb-panel').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);
 if(process.env.MATCH_UI_SHOTS)await page.screenshot({path:`${process.env.MATCH_UI_SHOTS}/scoreboard-mobile.png`});
 await page.evaluate(()=>window.__game.hud.hideScoreboard());assert(!await page.locator('#scoreboard-overlay').isVisible());
 assert.deepEqual(errors,[]);
 console.log('Match UI passed: both map images, responsive scoreboard, real stats, escaped names, portraits and working tabs');
}finally{await browser?.close();await server.close();}
