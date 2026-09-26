// Le catalogue que PokéPension rend au mod, tiré de l'application elle-même.
//
//   cd app && py outils/banc.py          (dans un premier terminal)
//   node minecraft/outils/catalogue-banc.js
//
// Le banc charge la vraie interface, avec le vrai relevé de PixelmonWorld ; on y
// appelle mcCatalogue() — la fonction même que le pont relaie au mod — et l'on
// range sa réponse dans les ressources des essais du mod. Les essais Java
// travaillent ainsi sur les 1 351 entrées et les 48 lieux réels, pas sur un
// échantillon inventé. Le rapport du banc est recopié au passage.
const path = require('path');
const fs = require('fs');
let playwright;
try { playwright = require('playwright'); }
catch (e) { playwright = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright')); }

(async function(){
  const navigateur = await playwright.chromium.launch();
  const page = await navigateur.newPage();
  const erreurs = [];
  page.on('pageerror', function(e){ erreurs.push(String(e)); });
  let fin = null;
  page.on('console', function(m){ if(m.text().indexOf('[banc]') === 0) fin = m.text(); });
  await page.goto('http://127.0.0.1:8125/', { waitUntil: 'load' });
  for(let i = 0; i < 600 && !fin; i++) await page.waitForTimeout(500);

  const echecs = await page.$$eval('#bancRapport .ko', function(l){ return l.map(function(x){ return x.innerText; }); });
  const pont = await page.$$eval('#bancRapport .l', function(l){
    return l.map(function(x){ return x.innerText; }).filter(function(t){ return /\/ps|catalogue|ouverture/.test(t); });
  });
  const catalogue = await page.evaluate(async function(){
    showPage('pixelmonworld');
    await chargerPagePW();
    return await mcCatalogue();
  });
  const cible = path.join(__dirname, '..', 'src', 'test', 'resources', 'catalogue-banc.json');
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.writeFileSync(cible, JSON.stringify(catalogue) + '\n');

  console.log(fin || '[banc] pas de fin annoncée');
  pont.forEach(function(t){ console.log('  · ' + t.replace(/\n/g, '\n    ')); });
  if(echecs.length){ console.log('ÉCHECS :'); echecs.forEach(function(t){ console.log('  ✗ ' + t.replace(/\n/g, ' — ')); }); }
  if(erreurs.length){ console.log('Erreurs de page :'); erreurs.forEach(function(t){ console.log('  ! ' + t); }); }
  console.log('catalogue : ' + catalogue.pokemon.length + ' Pokémon, ' + catalogue.zones.length + ' zones → '
    + path.relative(process.cwd(), cible));
  await navigateur.close();
  process.exit(echecs.length || !fin ? 1 : 0);
})();
