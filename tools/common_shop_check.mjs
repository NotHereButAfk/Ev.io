import {createServer} from 'vite';
import {chromium} from 'playwright';
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 const result=await page.evaluate(async()=>{
  const {MenuUI}=await import('/src/ui/MainMenu.js');const {Shop}=await import('/src/core/Shop.js');
  const menu=Object.create(MenuUI.prototype),root=document.createElement('div');document.body.append(root);
  menu._nightMarket=(await import('/server/nightmarket.mjs')).getNightMarket();
  menu._renderShop=()=>menu._renderShopGrid(root);menu._renderShop();
  const cards=[...root.querySelectorAll('.shop-skin-card')];
  if(cards.length!==5 || root.querySelectorAll('.shop-skin-grid').length!==1) throw Error('Expected exactly five offers');
  if(root.querySelectorAll('.shop-btn-buy').length!==5) throw Error('All five offers must be purchasable');
  const ids = menu._nightMarket.items.map(s => s.id).join();
  menu._renderShop();
  if(menu._nightMarket.items.map(s => s.id).join()!==ids) throw Error('Reopening rerolled market');
  const {Armory}=await import('/src/core/Armory.js');
  const {Loadout}=await import('/src/core/Loadout.js');
  const {Game}=await import('/src/core/Game.js');
  Armory.grantSkin('m4_sovereign_gold');Armory.equipSkin('m4','m4_sovereign_gold');Loadout.setGun('m4');
  if(Game.prototype._computeSkinKillMult()!==1)throw Error('cosmetic Legendary must not grant earnings bonuses');
  return 'Five stable weekly offers, purchase buttons and cosmetic ownership passed';
 });console.log(result);
} finally {await browser.close();await server.close();}
process.exit(0);
