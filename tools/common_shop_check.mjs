import {createServer} from 'vite';
import {chromium} from 'playwright';
const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0]);
 const result=await page.evaluate(async()=>{
  const {MenuUI}=await import('/src/ui/MainMenu.js');const {Shop}=await import('/src/core/Shop.js');
  const menu=Object.create(MenuUI.prototype),root=document.createElement('div');document.body.append(root);
  menu._renderShop=()=>menu._renderShopGrid(root);menu._renderShop();
  const cards=[...root.querySelectorAll('.shop-skin-grid:first-of-type .shop-skin-card')];
  if(cards.length!==10||cards.some(c=>c.dataset.rarity!=='common'||!c.textContent.includes('$20.00')))throw Error('catalog/pricing mismatch');
  await Promise.all([...root.querySelectorAll('.shop-preview-char img')].map(i=>i.decode()));
  const grids=[...root.querySelectorAll('.shop-skin-grid')];
  if(grids.length!==6 || grids.slice(1).some(g=>g.querySelectorAll('.shop-skin-card').length!==5))throw Error('five gun groups required');
  if(root.querySelectorAll('.shop-btn-buy').length!==35)throw Error('all new skins must be purchasable');

  Shop.unlock('arctic_ghost');menu._renderShop();
  const card=root.querySelector('.shop-skin-card');const equip=[...card.querySelectorAll('button')].find(b=>b.textContent==='EQUIP');
  if(!equip)throw Error('missing equip');equip.click();if(Shop.getEquipped()!=='arctic_ghost')throw Error('equip failed');
  return '10 Common cards, $20 checkout buttons, ten loaded model previews, purchased Equip works';
 });console.log(result);
} finally {await browser.close();await server.close();}
process.exit(0);
