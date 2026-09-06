// La carte à partager : ta collection en une image.
// Script classique (pas de module ES) : l'app reste ouvrable en file://
//
// POURQUOI. La rétrospective et les soixante succès dessinent de belles choses
// que personne d'autre ne verra jamais. Or c'est exactement ce qu'un joueur a
// envie de montrer — et c'est ce qui amène les suivants. La présence Discord
// prouvait déjà que l'application sait sortir d'elle-même ; c'est le même
// geste, un cran plus loin.
//
// 1200 × 630, parce que c'est le format qu'attendent Discord, Twitter et à peu
// près tout ce qui déplie un aperçu. Une image plus grande serait recadrée par
// eux, et le recadrage tombe toujours au mauvais endroit.
//
// TOUT EST DESSINÉ, RIEN N'EST CHARGÉ. Pas de sprite, pas de police d'ailleurs :
// un canvas qui attend une image du réseau produit un PNG vide quand le réseau
// manque, et l'application est faite pour marcher sans lui. Les polices sont
// celles déjà embarquées, et le canvas les a donc sous la main.

const CARTE_L = 1200;
const CARTE_H = 630;

const carteBtn = document.getElementById('carteBtn');
const carteEtat = document.getElementById('carteEtat');

// Les couleurs sont relues sur le document plutôt que recopiées : le thème
// change les jetons, et une carte aux couleurs du thème clair sortie depuis le
// thème sombre aurait l'air d'appartenir à une autre application.
function jeton(nom, defaut){
  try{
    const v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
    return v || defaut;
  }catch(e){ return defaut; }
}

/**
 * Un rectangle aux coins arrondis — le canvas ne sait pas le faire seul.
 *
 * LE RAYON EST BORNÉ PAR LA MOITIÉ DU CÔTÉ LE PLUS COURT. Sans cette borne,
 * arcTo() dégénère dès que la forme est plus fine que ses coins, et laisse
 * traîner un filet au ras du bord : c'était visible sur les barres de
 * génération à peine remplies, qui font quatre pixels de haut pour huit de
 * rayon demandé.
 */
function pave(ctx, x, y, l, h, r){
  r = Math.max(0, Math.min(r, l / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + h, r);
  ctx.arcTo(x + l, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

/** Une jauge circulaire, comme celles de l'accueil. */
function anneau(ctx, cx, cy, rayon, part, couleur, fond){
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = fond;
  ctx.beginPath();
  ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
  ctx.stroke();
  if(part <= 0) return;
  ctx.strokeStyle = couleur;
  ctx.beginPath();
  // Depuis midi, dans le sens des aiguilles : c'est le sens de l'accueil.
  ctx.arc(cx, cy, rayon, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, part));
  ctx.stroke();
}

/**
 * Ce que la carte raconte.
 *
 * Tout vient de ce qui est déjà à l'écran : la collection HOME, le périmètre
 * du niveau de formes de l'aventure, et la rétrospective si elle est chargée.
 * Aucune requête — une image qui demande le réseau n'est pas une image qu'on
 * sort en deux secondes.
 */
function chiffresDeLaCarte(){
  const pool = poolHome();
  const home = bucketFor('national');
  const total = pool.length;
  const parGen = new Map();
  pool.forEach(function(e){
    let b = parGen.get(e.gen);
    if(!b){ b = { total: 0, pris: 0 }; parGen.set(e.gen, b); }
    b.total++;
    if(home.caught.has(e.name)) b.pris++;
  });
  const gens = Array.from(parGen.keys())
    .filter(function(g){ return g >= 1 && g <= 9; })
    .sort(function(a, b){ return a - b; })
    .map(function(g){ return { gen: g, ...parGen.get(g) }; });

  return {
    pseudo: playerName || 'Dresseur',
    aventure: (typeof profilCourant !== 'undefined' && profilCourant)
      ? profilCourant.nom : null,
    mode: (typeof profilCourant !== 'undefined' && profilCourant)
      ? (profilCourant.mode || 'capture') : 'capture',
    total: total,
    captures: home.caught.size,
    chromatiques: home.shiny.size,
    gens: gens,
    depuis: (typeof retroDonnees !== 'undefined' && retroDonnees && retroDonnees.premier)
      ? String(retroDonnees.premier).slice(0, 10) : null,
    journal: (typeof retroDonnees !== 'undefined' && retroDonnees)
      ? (retroDonnees.total || 0) : 0
  };
}

function dessinerCarte(){
  const c = chiffresDeLaCarte();
  const toile = document.createElement('canvas');
  toile.width = CARTE_L;
  toile.height = CARTE_H;
  const ctx = toile.getContext('2d');

  const rouge = jeton('--dex-red', '#ee3a3a');
  const rougeProfond = jeton('--dex-red-deep', '#b5211f');
  const rougeSombre = jeton('--dex-red-darker', '#7c1614');
  const ecran = jeton('--screen', '#f6f5f0');
  const encre = jeton('--ink', '#1c1e29');
  const encreDouce = jeton('--ink-soft', '#6b7080');
  const pris = jeton('--caught', '#2f9e63');
  const or = jeton('--gold', '#f2a900');
  const bord = jeton('--card-border', '#e7e6ef');

  // Le boîtier : le même dégradé que l'application.
  const fond = ctx.createLinearGradient(0, 0, CARTE_L, CARTE_H);
  fond.addColorStop(0, rouge);
  fond.addColorStop(0.58, rougeProfond);
  fond.addColorStop(1, rougeSombre);
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, CARTE_L, CARTE_H);

  // L'écran, à l'intérieur.
  ctx.fillStyle = ecran;
  pave(ctx, 46, 46, CARTE_L - 92, CARTE_H - 92, 26);
  ctx.fill();

  // Le sur-titre et le nom.
  ctx.fillStyle = rougeProfond;
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillText('POKÉARCHIVE', 92, 116);

  ctx.fillStyle = encre;
  ctx.font = '800 54px Outfit, sans-serif';
  ctx.fillText(c.pseudo, 92, 178);

  ctx.fillStyle = encreDouce;
  ctx.font = '400 22px Outfit, sans-serif';
  const sousTitre = (c.aventure ? c.aventure + '  ·  ' : '')
    + ((typeof MODES_DEX !== 'undefined' && MODES_DEX[c.mode])
        ? MODES_DEX[c.mode].court : 'Pokédex');
  ctx.fillText(sousTitre, 92, 212);

  // Les deux jauges.
  const partN = c.total ? c.captures / c.total : 0;
  const partS = c.total ? c.chromatiques / c.total : 0;

  anneau(ctx, 190, 360, 78, partN, pris, bord);
  ctx.fillStyle = encre;
  ctx.font = '700 40px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(Math.round(partN * 100) + '%', 190, 374);
  ctx.fillStyle = encreDouce;
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText('⬤ forme normale', 190, 478);
  ctx.fillStyle = encre;
  ctx.font = '600 26px "JetBrains Mono", monospace';
  ctx.fillText(c.captures + ' / ' + c.total, 190, 450);

  anneau(ctx, 400, 360, 78, partS, or, bord);
  ctx.fillStyle = encre;
  ctx.font = '700 40px "JetBrains Mono", monospace';
  ctx.fillText(Math.round(partS * 100) + '%', 400, 374);
  ctx.fillStyle = encreDouce;
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText('✨ chromatiques', 400, 478);
  ctx.fillStyle = encre;
  ctx.font = '600 26px "JetBrains Mono", monospace';
  ctx.fillText(String(c.chromatiques), 400, 450);
  ctx.textAlign = 'left';

  // Les barres par génération, à droite.
  const x0 = 560, y0 = 300, largeur = CARTE_L - 92 - x0, hauteur = 150;
  ctx.fillStyle = encreDouce;
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('PAR GÉNÉRATION', x0, 268);

  const pas = largeur / Math.max(1, c.gens.length);
  const barre = Math.min(46, pas - 12);
  c.gens.forEach(function(g, i){
    const x = x0 + i * pas + (pas - barre) / 2;
    const part = g.total ? g.pris / g.total : 0;
    ctx.fillStyle = bord;
    pave(ctx, x, y0, barre, hauteur, 8);
    ctx.fill();
    const h = Math.max(4, hauteur * part);
    ctx.fillStyle = pris;
    pave(ctx, x, y0 + hauteur - h, barre, h, 8);
    ctx.fill();
    ctx.fillStyle = encreDouce;
    ctx.font = '500 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(g.gen), x + barre / 2, y0 + hauteur + 24);
    ctx.textAlign = 'left';
  });

  // Le pied : d'où l'on part, et ce que le journal a compté.
  ctx.fillStyle = encreDouce;
  ctx.font = '400 18px Outfit, sans-serif';
  const bouts = [];
  if(c.depuis) bouts.push('collection ouverte le ' + c.depuis);
  if(c.journal) bouts.push(c.journal + ' captures au journal');
  bouts.push(new Date().toISOString().slice(0, 10));
  ctx.fillText(bouts.join('  ·  '), 92, CARTE_H - 78);

  return toile;
}

async function enregistrerCarte(){
  if(!carteBtn) return;
  carteBtn.disabled = true;
  carteEtat.textContent = 'Dessin…';
  try{
    const toile = dessinerCarte();
    const blob = await new Promise(function(tenir){
      toile.toBlob(tenir, 'image/png');
    });
    if(!blob) throw new Error('Le dessin n\'a pas pu être converti en image.');

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pokepension-' + (playerName || 'dresseur').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + new Date().toISOString().slice(0, 10) + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Comme pour l'export JSON : révoquer trop tôt annule le téléchargement.
    setTimeout(function(){ URL.revokeObjectURL(url); }, 30_000);

    carteEtat.textContent = 'Image enregistrée — 1200 × 630.';
  }catch(e){
    carteEtat.textContent = '';
    prevenirErreur('L\'image n\'a pas pu être créée', String(e));
  }finally{
    carteBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', function(){
  if(carteBtn) carteBtn.addEventListener('click', enregistrerCarte);
});
