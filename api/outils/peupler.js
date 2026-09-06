// Peuple la base locale pour essayer l'application pour de vrai.
//
//     cd api
//     node --env-file=.env outils/peupler.js            → pose le décor
//     node --env-file=.env outils/peupler.js --nettoyer → l'enlève
//
// POURQUOI CET OUTIL. Une fonctionnalité sociale ne se juge pas sur une base à
// deux comptes vides. Les échanges, le fil des amis, la cloche : tout cela ne
// montre rien tant qu'il n'y a personne en face, et l'écran a beau être juste,
// on ne voit pas s'il est bon. Créer quatre comptes Discord à la main pour
// regarder une liste s'afficher n'est pas un essai, c'est une corvée.
//
// IL NE TOUCHE À AUCUN COMPTE RÉEL. Les dresseurs posés ici portent des
// identifiants Discord d'une plage réservée (voir FIGURANTS), et `--nettoyer`
// ne supprime QUE ceux-là, nommément. Rien n'est écrit, modifié ni effacé en
// dehors de cette liste — le compte du joueur et ses aventures sont hors
// d'atteinte, y compris s'il porte le même pseudo.
//
// IL PASSE PAR LES VRAIES FONCTIONS. Les dex par `ecrireDex`, les abonnements
// par `suivre`, les échanges par `proposer`/`repondre`/`ecrireMessage`. Un
// script qui écrirait directement en base finirait par poser des lignes que le
// service ne sait plus lire — et validerait un écran sur des données qui
// n'arrivent jamais en vrai. Le journal, les notifications et les compteurs se
// remplissent donc tout seuls, exactement comme en usage.

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { lire, une, ecrire, creerSchema, description } from '../src/base.js';
import { ecrireDex, horodatage } from '../src/comptes.js';
import { suivre } from '../src/amis.js';
import { proposer, repondre, ecrireMessage, conclure } from '../src/echanges.js';

const cle = (v) => createHash('sha256').update(v, 'utf8').digest('hex');
const journal = (m) => console.log(`  ${m}`);

// L'identifiant de l'application, tel que tauri.conf.json le déclare. C'est là
// que la fenêtre va chercher sa session au démarrage.
const IDENTIFIANT = 'fr.tennosei.pokearchive';

// --- Les figurants -----------------------------------------------------------
//
// Des identifiants Discord à dix-sept chiffres commençant par 990, une plage
// que Discord n'attribue pas : ils ont la bonne forme — l'avatar par défaut se
// calcule dessus — sans risquer de tomber sur quelqu'un.
//
// Le premier est CELUI QU'ON INCARNE. Un compte à part, et pas le vrai : on
// essaie des échanges et des refus, et personne n'a envie de faire ça avec son
// propre Pokédex de six mois.

const FIGURANTS = [
  { discord: '99000000000000001', pseudo: 'Toi_essai',  nomDiscord: 'Toi (essai)',  moi: true },
  { discord: '99000000000000002', pseudo: 'Ondine',     nomDiscord: 'Ondine#0001' },
  { discord: '99000000000000003', pseudo: 'Pierre',     nomDiscord: 'Pierre#0002' },
  { discord: '99000000000000004', pseudo: 'Blue',       nomDiscord: 'Blue#0003' },
  // LE SECOND JOUEUR, ET IL EXISTE POUR UNE SEULE RAISON : éprouver ce qui se
  // passe ENTRE DEUX PERSONNES — messages, échanges, notifications — sans avoir
  // à se connecter deux fois à Discord.
  //
  // L'application et le site ne rangent pas leur session au même endroit :
  // l'une dans %APPDATA%, l'autre dans le navigateur. Deux sessions peuvent
  // donc vivre en parallèle, ce qui était impossible tant qu'il n'y avait que
  // la fenêtre.
  { discord: '99000000000000005', pseudo: 'Toi_essai_2', nomDiscord: 'Toi (essai 2)',
    second: true },
];

const IDS = FIGURANTS.map((f) => f.discord);

// Des noms d'espèce tels que l'application les écrit : anglais, minuscules.
// C'est la clé, pas le nom affiché — « machoc » n'existe pas ici, « machop » si.
const KANTO = [
  'bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon', 'charizard',
  'squirtle', 'wartortle', 'blastoise', 'caterpie', 'metapod', 'butterfree',
  'weedle', 'kakuna', 'beedrill', 'pidgey', 'pidgeotto', 'pidgeot', 'rattata',
  'raticate', 'spearow', 'fearow', 'ekans', 'arbok', 'pikachu', 'raichu',
  'sandshrew', 'sandslash', 'nidoran-f', 'nidorina', 'nidoqueen', 'nidoran-m',
  'nidorino', 'nidoking', 'clefairy', 'clefable', 'vulpix', 'ninetales',
  'jigglypuff', 'wigglytuff', 'zubat', 'golbat', 'oddish', 'gloom', 'vileplume',
  'paras', 'parasect', 'venonat', 'venomoth', 'diglett', 'dugtrio', 'meowth',
  'persian', 'psyduck', 'golduck', 'mankey', 'primeape', 'growlithe', 'arcanine',
  'poliwag', 'poliwhirl', 'poliwrath', 'abra', 'kadabra', 'alakazam', 'machop',
  'machoke', 'machamp', 'bellsprout', 'weepinbell', 'victreebel', 'tentacool',
  'tentacruel', 'geodude', 'graveler', 'golem', 'ponyta', 'rapidash', 'slowpoke',
  'slowbro', 'magnemite', 'magneton', 'farfetchd', 'doduo', 'dodrio', 'seel',
  'dewgong', 'grimer', 'muk', 'shellder', 'cloyster', 'gastly', 'haunter',
  'gengar', 'onix', 'drowzee', 'hypno', 'krabby', 'kingler', 'voltorb',
  'electrode', 'exeggcute', 'exeggutor', 'cubone', 'marowak', 'hitmonlee',
  'hitmonchan', 'lickitung', 'koffing', 'weezing', 'rhyhorn', 'rhydon',
  'chansey', 'tangela', 'kangaskhan', 'horsea', 'seadra', 'goldeen', 'seaking',
  'staryu', 'starmie', 'mr-mime', 'scyther', 'jynx', 'electabuzz', 'magmar',
  'pinsir', 'tauros', 'magikarp', 'gyarados', 'lapras', 'ditto', 'eevee',
  'vaporeon', 'jolteon', 'flareon', 'porygon', 'omanyte', 'omastar', 'kabuto',
  'kabutops', 'aerodactyl', 'snorlax', 'articuno', 'zapdos', 'moltres',
  'dratini', 'dragonair', 'dragonite', 'mewtwo', 'mew',
];

/** Une part de Kanto, prise à intervalle régulier : jamais deux dex identiques. */
function dexDe(combien, decalage) {
  const pris = [];
  for (let i = decalage; pris.length < combien && i < KANTO.length * 3; i += 2) {
    pris.push(KANTO[i % KANTO.length]);
  }
  return [...new Set(pris)];
}

/**
 * Une sauvegarde de la forme EXACTE que l'application envoie.
 *
 * Ce n'est pas un détail de confort. `buildSavePayload` mêle trois choses dans
 * un seul bloc : les Pokédex par jeu, deux listes `caught`/`shiny` à la racine
 * qui redisent la collection Pokémon HOME, et tout ce qui n'a pas de table à
 * soi — chasses, tableau de chasse, objectifs, fiches de capture. Un décor qui
 * n'écrirait que `dex` donnerait une fenêtre à moitié vide, et surtout une
 * fenêtre qui ne ressemble à celle de personne.
 *
 * Les chasses et les objectifs ne sont donc pas un supplément : sans eux,
 * l'écran ✨ Chasse et la jauge d'objectif de l'accueil n'ont rien à montrer.
 */
function sauvegarde(pseudo, caught, shiny) {
  const jours = (n) => new Date(Date.now() - n * 86400_000).toISOString();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    player: pseudo,
    dex: { rby: { caught, shiny }, national: { caught, shiny } },
    // Les deux listes historiques, que le classement et les anciens exports
    // lisent à la racine.
    caught,
    shiny,

    // Deux chasses en cours, à des stades très différents : une qui commence,
    // une qui s'éternise. C'est la seconde qui montre si l'écran tient la
    // route — un compteur à 4 ne dit rien d'un affichage.
    chasses: [
      { pokemon: 'ponyta', dex: 'rby', methode: 'rencontre',
        bonus: [], compteur: 12, debut: jours(1) },
      { pokemon: 'gastly', dex: 'rby', methode: 'rencontre',
        bonus: ['charme'], compteur: 1847, debut: jours(23) },
    ],
    // Et deux abouties : sans elles, le tableau de chasse reste caché.
    chassesFinies: [
      { pokemon: 'magikarp', dex: 'rby', methode: 'peche', bonus: [],
        compteur: 402, taux: 4096, debut: jours(40), fin: jours(31) },
      { pokemon: 'eevee', dex: 'rby', methode: 'rencontre', bonus: ['charme'],
        compteur: 2311, taux: 1365, debut: jours(30), fin: jours(6) },
    ],

    // Un objectif nommé, avec sa jauge sur l'accueil. Les entrées sont figées
    // en liste de noms à la création — c'est le principe : le but ne bouge plus
    // quand les filtres changent.
    objectifs: [
      { id: 1, nom: 'Les starters de Kanto', quoi: 'Trois lignées, neuf cases',
        dex: 'rby', shiny: false,
        entrees: ['bulbasaur', 'ivysaur', 'venusaur', 'charmander', 'charmeleon',
                  'charizard', 'squirtle', 'wartortle', 'blastoise'],
        cree: jours(12) },
    ],

    // Deux fiches de capture, pour voir le bloc replié et l'emplacement.
    detailsCapture: {
      rby: {
        pikachu: { ball: 'poke', nature: 'Jovial', surnom: 'Étincelle',
                   origine: 'Forêt de Jade', date: '2026-08-02', ruban: '',
                   ot: pseudo, note: 'Le tout premier', emplacement: 'home' },
        gyarados: { ball: 'super', nature: 'Rigide', surnom: '',
                    origine: 'Route 4', date: '2026-08-19', ruban: '',
                    ot: pseudo, note: '', emplacement: 'banque' },
      },
    },
  };
}

// --- Le ménage ---------------------------------------------------------------

async function nettoyer() {
  const marques = await lire(
    `SELECT id, pseudo FROM pa_dresseurs WHERE discord_id IN (${IDS.map(() => '?').join(',')})`,
    IDS);
  if (!marques.length) return journal('rien à enlever');

  // Les clés étrangères sont toutes en ON DELETE CASCADE : effacer le dresseur
  // emporte ses aventures, son dex, son journal, ses abonnements, ses échanges,
  // ses messages et ses notifications. Une seule requête suffit donc, et rien
  // ne reste orphelin.
  await ecrire(
    `DELETE FROM pa_dresseurs WHERE discord_id IN (${IDS.map(() => '?').join(',')})`, IDS);
  journal(`${marques.length} figurant(s) effacé(s) : ${marques.map((m) => m.pseudo).join(', ')}`);

  // Les échanges où un figurant était en face d'un compte réel sont partis avec
  // lui ; ceux du compte réel entre eux n'ont jamais été touchés.
  const restant = await une('SELECT COUNT(*) AS n FROM pa_dresseurs');
  journal(`${restant.n} dresseur(s) restant(s) en base — tous réels`);
}

// --- La pose -----------------------------------------------------------------

async function creerFigurant(f) {
  const quand = horodatage();
  const deja = await une('SELECT id FROM pa_dresseurs WHERE discord_id = ?', [f.discord]);
  if (deja) return deja.id;

  const r = await ecrire(
    `INSERT INTO pa_dresseurs
       (discord_id, pseudo, pseudo_cle, avatar, discord_nom, cree_le, visible)
     VALUES (?, ?, ?, NULL, ?, ?, 1)`,
    [f.discord, f.pseudo, f.pseudo.toLowerCase(), f.nomDiscord, quand]);

  // visible = 1 EXPLICITEMENT, à rebours du défaut des vrais comptes. Un
  // figurant qu'on ne trouve pas dans la recherche ne sert à rien : c'est
  // justement par là qu'on va le chercher pour lui proposer un échange.
  await ecrire(
    `INSERT INTO pa_profils (dresseur_id, nom, nom_cle, public, par_defaut,
                             mode, niveau_formes, cree_le, maj_le)
     VALUES (?, 'Aventure 1', 'aventure 1', 1, 1, 'capture', 3, ?, ?)`,
    [r.insertId, quand, quand]);

  return r.insertId;
}

async function poser() {
  const ids = {};
  for (const f of FIGURANTS) {
    ids[f.pseudo] = await creerFigurant(f);
  }
  journal(`${FIGURANTS.length} dresseurs : ${FIGURANTS.map((f) => f.pseudo).join(', ')}`);

  const moi = ids.Toi_essai;

  // 1. Les collections. Par `ecrireDex`, donc le journal se remplit tout seul —
  //    c'est lui que lit le fil des amis, et il n'existe pas autrement.
  const collections = [
    ['Toi_essai', 48, 0, 6],
    ['Ondine',    95, 1, 11],
    ['Pierre',    62, 5, 4],
    ['Blue',     140, 3, 22],
  ];
  for (const [pseudo, combien, decalage, chromatiques] of collections) {
    const caught = dexDe(combien, decalage);
    const shiny = caught.slice(0, chromatiques);
    await ecrireDex(ids[pseudo], sauvegarde(pseudo, caught, shiny));
    journal(`${pseudo} : ${caught.length} captures dont ${shiny.length} chromatiques`);
  }

  // 2. Les abonnements. APRÈS les dex : `suivre` pose vu_jusqua au maximum du
  //    moment, si bien que ce qui précède compte comme déjà vu. Sans cet ordre,
  //    ouvrir l'application déverserait trois cents notifications d'un coup.
  for (const p of ['Ondine', 'Pierre', 'Blue']) await suivre(moi, p);
  await suivre(ids.Ondine, 'Toi_essai');
  await suivre(ids.Pierre, 'Toi_essai');
  journal('abonnements : tu suis les trois, deux te suivent en retour');

  // 3. De quoi remplir la cloche et le fil : quelques captures APRÈS
  //    l'abonnement, donc non lues. Trois, pas trois cents.
  const apres = dexDe(95, 1);
  await ecrireDex(ids.Ondine, sauvegarde('Ondine',
    [...apres, 'lapras', 'snorlax', 'dratini'],
    [...apres.slice(0, 11), 'dratini']));
  journal('Ondine attrape trois Pokémon de plus — dont un chromatique');

  // 4. Les échanges, un par état, pour voir les cinq écrans possibles.
  const recu = await proposer(ids.Ondine, {
    pseudo: 'Toi_essai', dex: 'rby',
    offert: 'lapras', demande: 'growlithe',
    mot: 'Je te le donne ce soir si tu veux',
  });

  await proposer(moi, {
    pseudo: 'Pierre', dex: 'rby', offert: 'abra', demande: 'geodude', mot: null,
  });

  const accepte = await proposer(ids.Blue, {
    pseudo: 'Toi_essai', dex: 'rby', offert: 'dratini', demande: 'eevee',
    mot: 'Échange contre échange',
  });
  await repondre(moi, accepte.id, 'accepte');
  await ecrireMessage(ids.Blue, accepte.id, 'Je suis en ligne à partir de 21 h');
  await ecrireMessage(moi, accepte.id, 'Parfait, à tout à l’heure');
  await ecrireMessage(ids.Blue, accepte.id, 'Code de salon : 1234-5678');

  const refuse = await proposer(ids.Pierre, {
    pseudo: 'Toi_essai', dex: 'rby', offert: 'zubat', demande: 'mewtwo', mot: null,
  });
  await repondre(moi, refuse.id, 'refuse');

  const fait = await proposer(ids.Ondine, {
    pseudo: 'Toi_essai', dex: 'rby', offert: 'staryu', demande: 'bellsprout', mot: null,
  });
  await repondre(moi, fait.id, 'accepte');
  await conclure(moi, fait.id);

  journal('échanges : 1 à répondre, 1 en attente chez Pierre, 1 accepté avec 3 messages,');
  journal('           1 refusé, 1 conclu');

  // 5. La session, pour entrer sans passer par Discord.
  const jeton = randomBytes(32).toString('hex');
  const dans90Jours = new Date(Date.now() + 90 * 86400_000);
  await ecrire(
    'INSERT INTO pa_sessions (jeton_cle, dresseur_id, cree_le, expire_le) VALUES (?, ?, ?, ?)',
    [cle(jeton), moi, horodatage(), horodatage(dans90Jours)]);

  const nonLues = await une(
    'SELECT COUNT(*) AS n FROM pa_notifications WHERE dresseur_id = ? AND lu = 0', [moi]);
  journal(`${nonLues.n} notification(s) non lue(s) pour la cloche`);

  // La session du second, pour le navigateur. Le même mécanisme : une ligne
  // dans pa_sessions, le jeton en clair rendu à l'appelant et jamais stocké.
  const deuxieme = await une(
    "SELECT id FROM pa_dresseurs WHERE discord_id = '99000000000000005'");
  let jeton2 = null;
  if (deuxieme) {
    jeton2 = randomBytes(32).toString('hex');
    await ecrire(
      'INSERT INTO pa_sessions (jeton_cle, dresseur_id, cree_le, expire_le) VALUES (?, ?, ?, ?)',
      [cle(jeton2), deuxieme.id, horodatage(), horodatage(dans90Jours)]);
  }

  return { jeton, pseudo: 'Toi_essai', jeton2, pseudo2: 'Toi_essai_2' };
}

// --- La session côté fenêtre -------------------------------------------------

/**
 * Écrit le session.json que la fenêtre lit au démarrage.
 *
 * C'est ce qui remplace la connexion Discord : l'application ne redemande rien
 * si elle trouve un jeton valide en arrivant. Elle ne le relit QU'AU LANCEMENT
 * — il faut donc la fermer et la rouvrir après ce script, la rafraîchir ne
 * suffit pas.
 */
function poserSession(session) {
  const dossier = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), IDENTIFIANT)
    : path.join(os.homedir(), '.config', IDENTIFIANT);

  fs.mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, 'session.json');

  // La session existante est mise de côté plutôt qu'écrasée : c'est celle du
  // vrai compte, et la perdre obligerait à repasser par Discord pour rien.
  const garde = path.join(dossier, 'session.avant-essai.json');
  if (fs.existsSync(fichier) && !fs.existsSync(garde)) {
    fs.copyFileSync(fichier, garde);
    journal(`session réelle mise de côté dans ${path.basename(garde)}`);
  }

  fs.writeFileSync(fichier, JSON.stringify({
    jeton: session.jeton,
    pseudo: session.pseudo,
    connecte: true,
    api: 'http://127.0.0.1:8787',
  }, null, 2), 'utf8');
  journal(`session posée dans ${fichier}`);

  // LES JETONS POUR LE NAVIGATEUR, dans un fichier à part.
  //
  // Le stockage d'un navigateur se range par origine, et rien d'extérieur n'y
  // écrit : impossible de lui poser une session comme on le fait pour la
  // fenêtre. On dépose donc les jetons ici, et `site/outils/servir.py` les
  // propose sur sa page /session — un clic, pas une ligne à coller dans une
  // console que Chrome verrouille désormais.
  //
  // HORS DU DÉPÔT, à côté de la session de l'application : ni dans public/ qui
  // est livré, ni dans le dépôt qui est publié. Un jeton n'a rien à faire dans
  // l'un ni dans l'autre.
  const pourWeb = path.join(dossier, 'session-navigateur.json');
  const comptes = [{ pseudo: session.pseudo, jeton: session.jeton }];
  if (session.jeton2) comptes.push({ pseudo: session.pseudo2, jeton: session.jeton2 });
  fs.writeFileSync(pourWeb, JSON.stringify({ comptes }, null, 2), 'utf8');
  journal(`${comptes.length} session(s) navigateur dans ${path.basename(pourWeb)}`);
}

/** Remet la session réelle, si on l'avait mise de côté. */
function rendreSession() {
  const dossier = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), IDENTIFIANT)
    : path.join(os.homedir(), '.config', IDENTIFIANT);
  const fichier = path.join(dossier, 'session.json');
  const garde = path.join(dossier, 'session.avant-essai.json');

  // Les jetons du navigateur partent avec le reste : les laisser proposerait
  // d'ouvrir des sessions dont les lignes n'existent plus en base.
  const pourWeb = path.join(dossier, 'session-navigateur.json');
  if (fs.existsSync(pourWeb)) {
    fs.unlinkSync(pourWeb);
    journal('sessions navigateur effacées');
  }

  if (fs.existsSync(garde)) {
    fs.copyFileSync(garde, fichier);
    fs.unlinkSync(garde);
    journal('session réelle remise en place');
  } else if (fs.existsSync(fichier)) {
    fs.unlinkSync(fichier);
    journal('session d’essai retirée — la fenêtre redemandera Discord');
  }
}

// --- Entrée ------------------------------------------------------------------

const nettoyage = process.argv.includes('--nettoyer');

console.log(`\nPokéPension — ${nettoyage ? 'ménage' : 'décor'} local`);
console.log(`base : ${description()}\n`);

await creerSchema(journal);

if (nettoyage) {
  await nettoyer();
  rendreSession();
  console.log('\nC’est propre. Relance la fenêtre.\n');
} else {
  // ON EFFACE D'ABORD, comme le banc de l'API. Relancer l'outil sur un décor
  // déjà posé échouait sur « Tu lui as déjà proposé cet échange » — une erreur
  // juste, au mauvais moment, et qui laissait la moitié du décor en place.
  // Poser doit pouvoir se rejouer.
  await nettoyer();
  const session = await poser();
  poserSession(session);
  console.log('\nC’est posé. FERME ET ROUVRE la fenêtre : elle relit sa session');
  console.log('au démarrage, et rien d’autre.\n');
  // LE SECOND JOUEUR, POUR LE NAVIGATEUR. On ne peut pas lui ecrire un fichier
  // de session : un navigateur range la sienne dans son propre stockage, par
  // origine, et rien d'exterieur n'y accede. On rend donc la ligne a coller.
  //
  // C'est ce qui permet d'eprouver DEUX comptes a la fois : la fenetre tient
  // Toi_essai, le navigateur tient Toi_essai_2, et ils se parlent pour de bon.
  if (session.jeton2) {
    console.log('Pour ouvrir un second compte DANS LE NAVIGATEUR :');
    console.log('  ouvre http://127.0.0.1:8130/session et clique le compte voulu.');
    console.log('');
    console.log(`  La fenetre tient ${session.pseudo}, le navigateur tiendra`);
    console.log(`  ${session.pseudo2} : deux comptes a la fois, pour s'ecrire.`);
    console.log('');
  }

  console.log('Pour tout enlever :  node --env-file=.env outils/peupler.js --nettoyer\n');
}

process.exit(0);
