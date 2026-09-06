// Dresseurs, sessions, dex.
//
// Aucun mot de passe n'est stocké : l'identité vient de Discord.
// Les jetons de session non plus — la base n'en garde qu'un condensé SHA-256,
// le jeton en clair n'existe que dans l'application du joueur.

import { createHash, randomBytes } from 'node:crypto';
import { lire, une, ecrire } from './base.js';
import { estInterdit } from './pseudos-interdits.js';

const SESSION_JOURS = 90;
const PSEUDO_MIN = 3;
// Douze, et non vingt. Un pseudo s'affiche dans le classement, dans le fil des
// amis et a cote d'un Pokedex : au-dela, il chasse tout le reste de la ligne.
// Les pseudos deja plus longs restent valides en base — les couper d'office
// renommerait des gens sans leur demander. Ils seront ramenes a douze au
// prochain changement, et l'affichage les tronque proprement en attendant.
const PSEUDO_MAX = 12;
const TAILLE_MAX_DEX = 2_000_000;

// Un carnet de bord tape a la main. Large, mais borne : un copier-coller
// malheureux ne doit pas remplir la base a lui seul.
const MAX_NOTES = 8000;

// Les accents sont admis : « Zoé », « Tennôsei » ou « Björn » sont des pseudos
// légitimes, et les refuser reviendrait à demander à quelqu'un d'écorcher son
// propre nom. \p{L} couvre toutes les lettres Unicode ; les emoji, qui ne sont
// ni lettres ni chiffres, restent dehors.
const PSEUDO_OK = /^[\p{L}\p{N}](?:[\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u;
const INTERDITS = /[^\p{L}\p{N} _-]/gu;

export class ErreurCompte extends Error {
  constructor(message, code = 400) { super(message); this.code = code; }
}

export const horodatage = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const cle = (v) => createHash('sha256').update(v, 'utf8').digest('hex');

/**
 * Sert à comparer, jamais à afficher. Replie la casse *et* les accents :
 * « José » et « Jose » donnent la même clé et ne peuvent pas coexister. Sans
 * ce repli, il suffirait d'un accent pour se faire passer pour quelqu'un
 * d'autre, et personne ne verrait la différence dans une liste.
 */
/**
 * La clé d'un pseudo : sert à comparer, jamais à afficher.
 *
 * EXPORTÉE, ET UNE SEULE FOIS. Elle vivait recopiée à l'identique dans amis.js,
 * echanges.js et images.js. Quatre copies d'une fonction qui décide de QUI EST
 * QUI : il aurait suffi qu'une seule dérive pour que la recherche trouve
 * quelqu'un que l'abonnement ne sache plus résoudre.
 */
export const normaliser = (p) => (p || '')
  .trim().replace(/\s+/g, ' ')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase();

const longueur = (s) => [...s.normalize('NFC')].length;

function nettoyerPseudo(brut) {
  const propre = [...(brut || '').normalize('NFC').replace(INTERDITS, '').trim().replace(/\s+/g, ' ')]
    .slice(0, PSEUDO_MAX).join('').replace(/^[-_ ]+|[-_ ]+$/gu, '');
  return longueur(propre) >= PSEUDO_MIN && PSEUDO_OK.test(propre) ? propre : '';
}

/**
 * Le pseudo repris de Discord, à la première connexion.
 *
 * Il n'est pas choisi ici, il est hérité — et quelqu'un dont le nom Discord
 * est grossier ne doit pas pour autant se voir refuser l'entrée. On le remplace
 * silencieusement par le nom neutre, que pseudoLibre() numérotera. Il pourra
 * en choisir un autre ensuite, et celui-là passera par le filtre.
 */
function pseudoHerite(brut) {
  const propre = nettoyerPseudo(brut);
  return propre && !estInterdit(propre) ? propre : '';
}

/** Deux joueurs peuvent porter le même nom sur Discord ; ici, non. */
async function pseudoLibre(souhaite) {
  const racine = souhaite || 'Dresseur';
  for (let i = 0; i < 200; i++) {
    // On tronque par caractères et non par unités de code : couper « é » en
    // deux produirait un accent orphelin.
    const candidat = i === 0
      ? racine
      : `${[...racine].slice(0, PSEUDO_MAX - String(i).length - 1).join('')}-${i}`;
    if (!await une('SELECT id FROM pa_dresseurs WHERE pseudo_cle = ?', [normaliser(candidat)])) {
      return candidat;
    }
  }
  return `Dresseur-${randomBytes(3).toString('hex')}`;
}

/** Retrouve ou crée le dresseur, puis ouvre une session. */
export async function depuisDiscord(profil) {
  const discordId = String(profil.id || '');
  if (!discordId) throw new ErreurCompte("Discord n'a pas renvoyé d'identifiant.", 502);

  let d = await une(
    'SELECT id, pseudo, avatar, cree_le FROM pa_dresseurs WHERE discord_id = ?', [discordId]);
  const nouveau = !d;

  if (nouveau) {
    const pseudo = (await pseudoLibre(pseudoHerite(profil.pseudo))).normalize('NFC');
    const r = await ecrire(
      // visible = 0 EXPLICITEMENT, alors que la colonne vaut 1 par defaut.
      //
      // On n'entre pas dans un classement public par le simple fait de s'etre
      // connecte. Le compte se cree pour synchroniser un Pokedex entre deux
      // machines ; y figurer sous son pseudo devant tout le monde est une
      // seconde decision, et c'est a la personne de la prendre — d'un
      // interrupteur dans les Parametres, pas par omission.
      //
      // Rien n'est perdu pour autant : qui connait le pseudo exact peut
      // toujours suivre et comparer. Ce sont la recherche et le classement qui
      // filtrent sur visible, pas l'acces aux aventures publiques.
      //
      // Le defaut de la colonne reste 1 : le changer ferait disparaitre du
      // classement ceux qui y sont deja et n'ont rien demande.
      `INSERT INTO pa_dresseurs (discord_id, pseudo, pseudo_cle, avatar, discord_nom, cree_le, visible)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [discordId, pseudo, normaliser(pseudo), profil.avatar || '',
       profil.nomDiscord || null, horodatage()]);
    d = { id: r.insertId, pseudo, avatar: profil.avatar || '', cree_le: horodatage() };
  } else {
    // L'avatar et le nom Discord ont pu changer chez Discord, et se
    // rafraîchissent donc à chaque connexion. Jamais le pseudo PokéPension :
    // une fois choisi, il appartient au dresseur, et se renommer sur Discord
    // ne doit pas renommer son dex dans le dos de ses potes.
    await ecrire(
      'UPDATE pa_dresseurs SET avatar = ?, discord_nom = ?, vu_le = ? WHERE id = ?',
      [profil.avatar || '', profil.nomDiscord || null, horodatage(), d.id]);
    d.avatar = profil.avatar || '';
  }

  const jeton = randomBytes(32).toString('base64url');
  const expire = new Date(Date.now() + SESSION_JOURS * 86_400_000);
  await ecrire(
    `INSERT INTO pa_sessions (jeton_cle, dresseur_id, cree_le, expire_le) VALUES (?, ?, ?, ?)`,
    [cle(jeton), d.id, horodatage(), horodatage(expire)]);

  return {
    dresseur: { id: d.id, pseudo: d.pseudo, avatar: d.avatar, discordId },
    jeton, nouveau,
  };
}

export async function session(jeton) {
  if (!jeton) return null;
  const l = await une(
    `SELECT d.id, d.discord_id, d.pseudo, d.avatar, d.cree_le, d.visible,
            d.echanges_ouverts, d.messages_de, s.expire_le
       FROM pa_sessions s JOIN pa_dresseurs d ON d.id = s.dresseur_id
      WHERE s.jeton_cle = ?`, [cle(jeton)]);
  if (!l) return null;
  if (l.expire_le < horodatage()) {
    await ecrire('DELETE FROM pa_sessions WHERE jeton_cle = ?', [cle(jeton)]);
    return null;
  }
  return {
    id: l.id, discordId: l.discord_id, pseudo: l.pseudo,
    avatar: l.avatar, creeLe: l.cree_le,
    visible: l.visible !== 0,
    echangesOuverts: l.echanges_ouverts !== 0,
    messagesDe: l.messages_de || 'tous',
  };
}

export async function deconnecter(jeton) {
  if (jeton) await ecrire('DELETE FROM pa_sessions WHERE jeton_cle = ?', [cle(jeton)]);
}

export async function menage() {
  const r = await ecrire('DELETE FROM pa_sessions WHERE expire_le < ?', [horodatage()]);
  return r.affectedRows;
}

export async function changerPseudo(dresseurId, souhaite) {
  const propre = nettoyerPseudo(souhaite);
  if (!propre) {
    throw new ErreurCompte(
      `Entre ${PSEUDO_MIN} et ${PSEUDO_MAX} caractères : lettres, chiffres, espace, `
      + `tiret et souligné, en commençant et finissant par une lettre ou un chiffre.`);
  }
  // Le refus ne nomme pas le mot qui l'a déclenché : le dire reviendrait à
  // apprendre quoi contourner. Un pseudo s'affiche dans le classement et à
  // côté du Pokédex de gens qui n'ont rien demandé — et personne ne surveille
  // la liste après coup.
  if (estInterdit(propre)) {
    throw new ErreurCompte('Ce pseudo ne convient pas. Choisis-en un autre.');
  }
  const pris = await une('SELECT id FROM pa_dresseurs WHERE pseudo_cle = ? AND id <> ?',
    [normaliser(propre), dresseurId]);
  if (pris) throw new ErreurCompte('Ce pseudo est déjà pris.', 409);

  await ecrire('UPDATE pa_dresseurs SET pseudo = ?, pseudo_cle = ? WHERE id = ?',
    [propre.normalize('NFC'), normaliser(propre), dresseurId]);
  return propre;
}

// --- Les profils ------------------------------------------------------------
// Un compte, plusieurs aventures. Chacune a son dex ; la table pa_dex est
// indexée par profil, plus par dresseur.

const NOM_PREMIER_PROFIL = 'Aventure 1';

/**
 * Le profil sur lequel travailler faute de précision : celui marqué par
 * défaut, sinon le plus ancien. En crée un si le compte n'en a aucun — un
 * dresseur sans aventure n'aurait nulle part où enregistrer.
 */
export async function profilParDefaut(dresseurId) {
  const p = await une(
    `SELECT id FROM pa_profils WHERE dresseur_id = ?
      ORDER BY par_defaut DESC, id ASC LIMIT 1`, [dresseurId]);
  if (p) return p.id;

  // public = 0. UNE AVENTURE NAIT PRIVEE, et celle-ci plus que les autres :
  // personne ne l'a demandee, elle est creee d'office a la premiere connexion.
  // La rendre publique sans que quiconque l'ait voulu, c'est exposer un Pokedex
  // au nom de son proprietaire avant meme qu'il ait vu l'application.
  //
  // Consequence assumee, et c'est le prix du reglage : un compte neuf n'apparait
  // nulle part — ni au classement, ni dans une comparaison, ni dans l'entraide.
  // C'est un interrupteur a lever, pas un defaut a subir.
  const maintenant = horodatage();
  const r = await ecrire(
    `INSERT INTO pa_profils (dresseur_id, nom, nom_cle, public, par_defaut, cree_le, maj_le)
     VALUES (?, ?, ?, 0, 1, ?, ?)`,
    [dresseurId, NOM_PREMIER_PROFIL, normaliser(NOM_PREMIER_PROFIL), maintenant, maintenant]);
  return r.insertId;
}

const PROFIL_MIN = 2;
const PROFIL_MAX = 40;

/**
 * Un nom d'aventure. Plus long et plus libre qu'un pseudo — c'est une phrase,
 * « Ma chasse aux chromatiques », pas une étiquette — mais on écarte les
 * caractères qui n'ont rien à faire dans un libellé.
 *
 * Il passe par le MÊME filtre que les pseudos. Le commentaire d'origine disait
 * qu'un nom d'aventure « n'identifie personne et ne sert qu'à son auteur » :
 * ce n'est plus vrai depuis qu'on consulte le dex des autres. Il s'affiche
 * chez les gens qui viennent voir votre avancée, et une grossièreté y est
 * exactement aussi visible que dans un pseudo.
 *
 * Le découpage en mots sert d'ailleurs mieux ici : sur une phrase de quarante
 * caractères, les racines courtes se lisent en mot entier sans risque.
 */
function nettoyerNomProfil(brut) {
  const propre = [...(brut || '').normalize('NFC').replace(INTERDITS, '').trim().replace(/\s+/g, ' ')]
    .slice(0, PROFIL_MAX).join('').replace(/^[-_ ]+|[-_ ]+$/gu, '');
  if (longueur(propre) < PROFIL_MIN) {
    throw new ErreurCompte(
      `Donne un nom de ${PROFIL_MIN} à ${PROFIL_MAX} caractères : lettres, chiffres, `
      + `espace, tiret et souligné, en commençant et finissant par une lettre ou un chiffre.`);
  }
  if (estInterdit(propre)) {
    throw new ErreurCompte('Ce nom ne convient pas. Choisis-en un autre.');
  }
  return propre;
}

/** Les aventures d'un dresseur, avec leur avancement. */
export async function listerProfils(dresseurId) {
  // On s'assure qu'il en a au moins une : un compte sans aventure n'aurait
  // nulle part où enregistrer, et l'interface n'a alors rien à proposer.
  await profilParDefaut(dresseurId);
  return await lire(
    `SELECT p.id, p.nom, p.public, p.par_defaut, p.mode, p.niveau_formes, p.notes, p.cree_le, p.maj_le,
            COALESCE(x.captures, 0) AS captures, COALESCE(x.shiny, 0) AS shiny
       FROM pa_profils p LEFT JOIN pa_dex x ON x.profil_id = p.id
      WHERE p.dresseur_id = ?
      ORDER BY p.par_defaut DESC, p.id ASC`, [dresseurId]);
}

// Les trois façons de tenir un Pokédex. Le mode ne change rien à ce qu'on
// enregistre — c'est la même liste de noms — mais il dit ce que le total
// signifie, et deux dresseurs qui ne comptent pas pareil ne se comparent pas.
export const MODES = ['capture', 'vu', 'living'];

const modeValide = (m) => (MODES.includes(String(m)) ? String(m) : 'capture');

// Jusqu'où l'aventure compte les formes d'une même espèce, de 1 à 4. Le réglage
// appartient à l'aventure et non à l'ordinateur : deux dresseurs qui se
// comparent doivent compter sur le même dénominateur, sinon changer de niveau
// chez soi fait bouger le score de l'autre.
const niveauValide = (n) => {
  const v = parseInt(n, 10);
  return v >= 1 && v <= 4 ? v : 3;
};

export async function creerProfil(dresseurId, nomSouhaite, mode) {
  const nom = nettoyerNomProfil(nomSouhaite);
  const pris = await une('SELECT id FROM pa_profils WHERE dresseur_id = ? AND nom_cle = ?',
    [dresseurId, normaliser(nom)]);
  if (pris) throw new ErreurCompte('Tu as déjà une aventure de ce nom.', 409);

  const combien = await une('SELECT COUNT(*) AS n FROM pa_profils WHERE dresseur_id = ?',
    [dresseurId]);
  if ((combien?.n ?? 0) >= 20) {
    throw new ErreurCompte('Vingt aventures suffisent : supprimes-en une d\'abord.', 409);
  }

  const maintenant = horodatage();
  const m = modeValide(mode);
  // public = 0, comme partout ailleurs : on publie ce qu'on veut publier, on ne
  // depublie pas ce qu'on n'a pas choisi de montrer. La bascule est sur la
  // ligne de l'aventure, dans le Profil.
  const r = await ecrire(
    `INSERT INTO pa_profils (dresseur_id, nom, nom_cle, public, par_defaut, mode, niveau_formes, cree_le, maj_le)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    // La première aventure devient forcément celle par défaut. Le niveau de
    // formes démarre au défaut : il se règle depuis la barre du Pokédex, pas à
    // la création — on ne fait pas choisir avant d'avoir vu.
    [dresseurId, nom, normaliser(nom), (combien?.n ?? 0) === 0 ? 1 : 0, m,
     niveauValide(undefined), maintenant, maintenant]);
  return { id: r.insertId, nom, public: 0, par_defaut: (combien?.n ?? 0) === 0 ? 1 : 0,
           mode: m, niveau_formes: niveauValide(undefined),
           captures: 0, shiny: 0, cree_le: maintenant, maj_le: maintenant };
}

/** Renommer, publier, ou désigner comme aventure par défaut. */
export async function modifierProfil(dresseurId, profilId, champs) {
  const id = await profilDu(dresseurId, profilId);

  if (champs.nom !== undefined) {
    const nom = nettoyerNomProfil(champs.nom);
    const pris = await une(
      'SELECT id FROM pa_profils WHERE dresseur_id = ? AND nom_cle = ? AND id <> ?',
      [dresseurId, normaliser(nom), id]);
    if (pris) throw new ErreurCompte('Tu as déjà une aventure de ce nom.', 409);
    await ecrire('UPDATE pa_profils SET nom = ?, nom_cle = ? WHERE id = ?',
      [nom, normaliser(nom), id]);
  }

  if (champs.public !== undefined) {
    await ecrire('UPDATE pa_profils SET public = ? WHERE id = ?', [champs.public ? 1 : 0, id]);
  }

  if (champs.niveauFormes !== undefined) {
    await ecrire('UPDATE pa_profils SET niveau_formes = ? WHERE id = ?',
      [niveauValide(champs.niveauFormes), id]);
  }
  if (champs.mode !== undefined) {
    await ecrire('UPDATE pa_profils SET mode = ? WHERE id = ?', [modeValide(champs.mode), id]);
  }

  if (champs.notes !== undefined) {
    // Le carnet appartient a son auteur : on ne nettoie ni ne reformate. On
    // borne seulement, pour qu'un copier-coller malheureux ne remplisse pas la
    // base — et une chaine vide efface, ce qui est le geste attendu.
    const texte = String(champs.notes || '').slice(0, MAX_NOTES);
    await ecrire('UPDATE pa_profils SET notes = ? WHERE id = ?',
      [texte.trim() ? texte : null, id]);
  }

  if (champs.parDefaut) {
    // Une seule aventure par défaut : on retire la distinction aux autres
    // avant de la donner, sinon deux profils la porteraient.
    await ecrire('UPDATE pa_profils SET par_defaut = 0 WHERE dresseur_id = ?', [dresseurId]);
    await ecrire('UPDATE pa_profils SET par_defaut = 1 WHERE id = ?', [id]);
  }

  return await une(
    `SELECT id, nom, public, par_defaut, mode, niveau_formes, notes, cree_le, maj_le
       FROM pa_profils WHERE id = ?`, [id]);
}

export async function supprimerProfil(dresseurId, profilId) {
  const id = await profilDu(dresseurId, profilId);
  const combien = await une('SELECT COUNT(*) AS n FROM pa_profils WHERE dresseur_id = ?',
    [dresseurId]);
  // Supprimer la dernière laisserait le compte sans nulle part où enregistrer.
  if ((combien?.n ?? 0) <= 1) {
    throw new ErreurCompte('C\'est ta seule aventure : renomme-la ou réinitialise-la.', 409);
  }

  const etaitDefaut = await une('SELECT par_defaut FROM pa_profils WHERE id = ?', [id]);
  // Le dex part avec, par cascade sur la clé étrangère.
  await ecrire('DELETE FROM pa_profils WHERE id = ?', [id]);

  // Le compte ne doit pas se retrouver sans aventure par défaut.
  if (etaitDefaut?.par_defaut) {
    const suivante = await une(
      'SELECT id FROM pa_profils WHERE dresseur_id = ? ORDER BY id ASC LIMIT 1', [dresseurId]);
    if (suivante) {
      await ecrire('UPDATE pa_profils SET par_defaut = 1 WHERE id = ?', [suivante.id]);
    }
  }
  return { supprime: id };
}

/** Vérifie qu'un profil appartient bien au dresseur qui le réclame. */
async function profilDu(dresseurId, profilId) {
  const p = await une('SELECT id FROM pa_profils WHERE id = ? AND dresseur_id = ?',
    [profilId, dresseurId]);
  if (!p) throw new ErreurCompte('Profil introuvable.', 404);
  return p.id;
}

// --- Le dex -----------------------------------------------------------------
export async function lireDex(dresseurId, profilId = null) {
  const cible = profilId ? await profilDu(dresseurId, profilId)
                         : await profilParDefaut(dresseurId);
  const l = await une('SELECT donnees, maj_le FROM pa_dex WHERE profil_id = ?', [cible]);
  if (!l) return null;
  try {
    const d = JSON.parse(l.donnees);
    d.majLe = l.maj_le;
    d.profilId = cible;
    return d;
  } catch { return null; }
}

/**
 * Combien d'espèces distinctes ce dex contient, tous Pokédex confondus.
 *
 * On ne comptait que la collection Pokémon HOME. Quelqu'un qui a bouclé Kanto
 * dans Rouge/Bleu sans rien ranger dans HOME apparaissait donc à zéro au
 * classement — c'était le cas du premier compte créé. L'union dédoublonnée
 * reflète ce qui a réellement été attrapé, et un Pokémon coché dans trois jeux
 * ne compte toujours qu'une fois.
 */
function compterEspeces(donnees, champ) {
  const vus = new Set();
  const ajouter = (liste) => { for (const n of liste || []) vus.add(n); };

  // Le format historique range HOME à la racine : « captures » pour les
  // normaux, « shiny » pour les chromatiques.
  ajouter(champ === 'caught' ? (donnees.captures || donnees.caught) : donnees.shiny);
  const parJeu = donnees.dex || {};
  for (const cle of Object.keys(parJeu)) ajouter(parJeu[cle]?.[champ]);

  return vus.size;
}

/**
 * Ce qui vient d'apparaitre dans le dex, compare a ce qui y etait.
 *
 * Le dex est enregistre en bloc : rien n'indique QUAND une case a ete cochee.
 * En confrontant l'ancienne sauvegarde a la nouvelle, on retrouve les ajouts,
 * et on les date. Les retraits ne sont pas journalises — decocher est une
 * correction, pas un evenement de collection.
 */
function nouveautes(avant, apres) {
  const ajouts = [];
  const anciens = avant?.dex || {};
  const recents = apres?.dex || {};

  for (const cle of Object.keys(recents)) {
    for (const champ of ['caught', 'shiny']) {
      const deja = new Set(anciens[cle]?.[champ] || []);
      for (const nom of recents[cle]?.[champ] || []) {
        if (!deja.has(nom)) {
          ajouts.push({ pokemon: String(nom).slice(0, 64), dex: cle.slice(0, 32),
                        chromatique: champ === 'shiny' ? 1 : 0 });
        }
      }
    }
  }
  return ajouts;
}

// Un import massif peut cocher plus d'un millier d'entrees d'un coup. On borne
// l'ecriture : au-dela, l'evenement interessant n'est plus « ce Pokemon a ete
// attrape » mais « une sauvegarde a ete importee », et mille lignes n'y
// ajouteraient rien.
const MAX_JOURNAL = 400;

async function journaliser(profilId, ajouts, quand) {
  if (!ajouts.length) return 0;
  const retenus = ajouts.slice(0, MAX_JOURNAL);
  // Une seule requete pour tout le lot : quatre cents allers-retours
  // rendraient une action groupee interminable.
  const valeurs = retenus.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const params = [];
  for (const a of retenus) params.push(profilId, a.pokemon, a.dex, a.chromatique, quand);
  await ecrire(
    `INSERT INTO pa_historique (profil_id, pokemon, dex, chromatique, ajoute_le)
     VALUES ${valeurs}`, params);
  return retenus.length;
}

/** Le journal d'une aventure, du plus recent au plus ancien. */
export async function historique(dresseurId, profilId, avant = null, limite = 60) {
  const id = await profilDu(dresseurId, profilId);
  const borne = Math.min(Math.max(Number(limite) || 60, 1), 200);
  const curseur = Number(avant);

  // La pagination se fait sur l'identifiant, pas sur un decalage : une
  // insertion pendant la lecture ne decale alors aucune page.
  const lignes = Number.isInteger(curseur) && curseur > 0
    ? await lire(
        `SELECT id, pokemon, dex, chromatique, ajoute_le FROM pa_historique
          WHERE profil_id = ? AND id < ? ORDER BY id DESC LIMIT ${borne}`, [id, curseur])
    : await lire(
        `SELECT id, pokemon, dex, chromatique, ajoute_le FROM pa_historique
          WHERE profil_id = ? ORDER BY id DESC LIMIT ${borne}`, [id]);

  const total = await une('SELECT COUNT(*) AS n FROM pa_historique WHERE profil_id = ?', [id]);
  return { lignes, total: total?.n ?? 0, encore: lignes.length === borne };
}

export async function ecrireDex(dresseurId, donnees, profilId = null) {
  if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) {
    throw new ErreurCompte('Dex illisible.');
  }
  // UN OBJET SANS LE MOINDRE CHAMP N'EST PAS UNE SAUVEGARDE, c'est une requete
  // arrivee sans corps — express.json() rend `{}` quand il n'a rien a lire.
  // L'objet passait le garde ci-dessus, comptait zero espece, et ECRASAIT la
  // collection. Un pont mal cable a suffi ; le prochain ne doit pas pouvoir.
  //
  // Vider volontairement une aventure reste possible : « Reinitialiser » passe
  // par construireDex(), qui porte toujours `version` et la forme complete.
  // Ce n'est pas une absence de champs, c'est des champs vides.
  if (!Object.keys(donnees).length) {
    throw new ErreurCompte('Sauvegarde vide : rien n’est arrivé au serveur.');
  }
  const captures = compterEspeces(donnees, 'caught');
  const shiny = compterEspeces(donnees, 'shiny');

  // « majLe » et « profilId » sont ajoutés par lireDex à la *réponse*. Relus
  // puis réécrits, ils finiraient par s'incruster dans la sauvegarde : on les
  // retire avant d'enregistrer, la base n'a pas à stocker ses propres en-têtes.
  //
  // Par copie et non par déstructuration : « profilId » est déjà le nom d'un
  // paramètre de cette fonction, et le redéclarer rendait tout le fichier
  // illisible pour Node.
  const propre = { ...donnees };
  delete propre.majLe;
  delete propre.profilId;
  const brut = JSON.stringify(propre);
  if (brut.length > TAILLE_MAX_DEX) throw new ErreurCompte('Dex trop volumineux.', 413);

  const cible = profilId ? await profilDu(dresseurId, profilId)
                         : await profilParDefaut(dresseurId);
  const maj = horodatage();

  // L'etat precedent, lu avant d'ecrire : c'est la seule occasion de savoir ce
  // qui change. Une lecture de plus par sauvegarde, pour un journal qu'on ne
  // pourrait pas reconstituer autrement.
  let precedent = null;
  const ancienne = await une('SELECT donnees FROM pa_dex WHERE profil_id = ?', [cible]);
  if (ancienne) { try { precedent = JSON.parse(ancienne.donnees); } catch { precedent = null; } }
  // ON DUPLICATE KEY : une seule requête, et pas de fenêtre entre un SELECT et
  // un INSERT où deux écritures se marcheraient dessus. La clé est désormais
  // le profil ; dresseur_id reste renseigné, il évite une jointure ailleurs.
  await ecrire(
    `INSERT INTO pa_dex (profil_id, dresseur_id, donnees, captures, shiny, maj_le)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE donnees = VALUES(donnees), captures = VALUES(captures),
       shiny = VALUES(shiny), maj_le = VALUES(maj_le)`,
    [cible, dresseurId, brut, captures, shiny, maj]);
  await ecrire('UPDATE pa_profils SET maj_le = ? WHERE id = ?', [maj, cible]);

  // Le journal ne doit jamais faire echouer une sauvegarde : la progression
  // compte plus que sa chronique.
  let journalises = 0;
  try {
    journalises = await journaliser(cible, nouveautes(precedent, propre), maj);
  } catch (e) {
    console.error('journal des captures :', e.message);
  }

  return { captures, shiny, majLe: maj, profilId: cible, journalises };
}

/**
 * Les autres dresseurs et leur avancement — c'est ce qui permet de comparer.
 * On ne renvoie que les compteurs, pas les dex entiers : inutile de faire
 * transiter des mégaoctets pour afficher une liste.
 */
/**
 * Un dresseur, une ligne — celle de son aventure principale.
 *
 * Sans ce choix, quelqu'un qui ouvre trois aventures apparaîtrait trois fois,
 * dont deux à zéro : le classement se remplirait de doublons vides. Les
 * aventures privées en sont exclues, et restent visibles de leur seul auteur.
 */
/**
 * Le classement.
 *
 * LE MODE ET LE NIVEAU DE FORMES PARTENT AVEC LE SCORE, et c'est le point.
 * Une aventure « vu » compte les Pokemon rencontres, une « living » exige un
 * exemplaire de chacun en meme temps, et niveau_formes decide combien de formes
 * alternatives entrent dans le total. Trois cent captures ne veulent donc pas
 * dire la meme chose d'une ligne a l'autre, et les classer ensemble sans le
 * dire presentait comme une performance ce qui n'est qu'une regle differente.
 *
 * On ne filtre pas ici : retirer les autres modes ferait disparaitre des gens
 * de la liste sans qu'ils sachent pourquoi. C'est l'application qui affiche la
 * base de chaque score, et qui offre de s'en tenir a un seul mode.
 */
export async function classement() {
  return await lire(
    `SELECT d.pseudo, d.discord_id, d.avatar, d.discord_nom,
            p.nom                   AS profil,
            p.mode                  AS mode,
            p.niveau_formes         AS niveau_formes,
            COALESCE(x.captures, 0) AS captures,
            COALESCE(x.shiny, 0)    AS shiny,
            x.maj_le
       FROM pa_dresseurs d
       LEFT JOIN pa_profils p
              ON p.id = (SELECT id FROM pa_profils
                          WHERE dresseur_id = d.id AND public = 1
                          ORDER BY par_defaut DESC, id ASC LIMIT 1)
       LEFT JOIN pa_dex x ON x.profil_id = p.id
      WHERE d.visible = 1
      ORDER BY captures DESC, shiny DESC, d.pseudo ASC
      LIMIT 200`);
}

/**
 * Le profil public d'un dresseur : qui il est, ce qu'il aime, ce qu'il a joue.
 *
 * UNE SEULE REQUETE POUR TOUTE LA FICHE. La page d'un dresseur montrait deja
 * ses aventures ; elle montre maintenant sa carte, ses donnees jeux et sa date
 * d'inscription. Les servir en quatre appels aurait fait quatre allers-retours
 * pour une page qu'on ouvre d'un clic, et un affichage qui se remplit par
 * morceaux sous les yeux.
 *
 * `creeLe` sort d'ici et de nulle part ailleurs : la colonne existait depuis le
 * premier jour, personne ne la lisait. Depuis quand quelqu'un est la est la
 * premiere chose qu'on regarde sur un profil.
 */
export async function profilsPublics(pseudo) {
  const d = await une(
    `SELECT id, pseudo, avatar, discord_id, discord_nom, cree_le FROM pa_dresseurs
      WHERE pseudo_cle = ?`, [normaliser(pseudo)]);
  if (!d) return null;
  const profils = await lire(
    `SELECT p.id, p.nom, p.par_defaut, p.mode, p.niveau_formes, p.maj_le,
            COALESCE(x.captures, 0) AS captures, COALESCE(x.shiny, 0) AS shiny
       FROM pa_profils p LEFT JOIN pa_dex x ON x.profil_id = p.id
      WHERE p.dresseur_id = ? AND p.public = 1
      ORDER BY p.par_defaut DESC, p.id ASC`, [d.id]);
  const chez = await lireCarte(d.id);
  return {
    dresseur: { pseudo: d.pseudo, avatar: d.avatar, discordId: d.discord_id,
                nomDiscord: d.discord_nom || null, creeLe: d.cree_le },
    profils,
    carte: chez.carte,
    parties: chez.parties
  };
}

// --- La carte de dresseur et les donnees jeux --------------------------------
//
// DEUX TABLES, UN SEUL ALLER-RETOUR. `pa_cartes` tient ce qui ne depend d'aucun
// jeu, `pa_parties` une ligne par jeu joue. Elles se lisent et s'ecrivent
// ensemble parce qu'elles s'affichent ensemble : les separer aurait double le
// nombre d'appels sans rien rendre de plus clair.
//
// RIEN N'EST DEDUIT DE LA COLLECTION, et c'est le point. Le Pokemon qu'on a le
// plus attrape n'est pas le Pokemon qu'on prefere, et une equipe de fin de
// partie ne se lit dans aucune case cochee. Tout ce qui est ici est saisi.

const CARTE_FAVORIS_MAX = 3;
const CARTE_EQUIPE_MAX = 6;
const CARTE_SPINOFF_MAX = 60;
const CARTE_PHRASE_MAX = 120;
const CARTE_NOTE_MAX = 300;
const CARTE_JEUX_MAX = 60;

// Les trois etats d'un jeu, tels que l'application les enregistre. Un etat
// inconnu retombe sur « en cours » plutot que d'etre refuse : une version plus
// recente de l'application ne doit pas voir son ecriture rejetee en bloc.
const CARTE_ETATS = new Set(['en-cours', 'fini', 'abandon']);

// Les slugs d'espece et les cles de jeu ont la meme forme cote application :
// minuscules, chiffres et tirets. On la verifie ici plutot que de faire
// confiance, parce que ces valeurs ressortent telles quelles chez les autres.
const CARTE_SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Une liste de slugs propre : bornee, sans doublon, sans vide. */
const slugs = (v, max) => (Array.isArray(v) ? v : [])
  .map((x) => String(x || '').trim().toLowerCase())
  .filter((x) => CARTE_SLUG.test(x))
  .filter((x, i, t) => t.indexOf(x) === i)
  .slice(0, max);

/** Une ligne de texte libre : espaces reduits, longueur bornee. */
const ligne = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Neuf mille heures : au-dessus, c'est une faute de frappe et non un souvenir.
// La borne existe pour que la fiche reste lisible, pas pour juger de personne.
const CARTE_HEURES_MAX = 9999;

/**
 * Un nombre d'heures, ou null.
 *
 * NULL ET ZERO NE SONT PAS LA MEME CHOSE. « Je ne sais plus » est l'etat
 * normal d'un souvenir ancien ; « zero heure » serait un mensonge affiche sur
 * sa fiche. Un champ vide rend donc null, et l'affichage saute la mention.
 */
function heuresValides(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, CARTE_HEURES_MAX);
}

/**
 * Un jour « AAAA-MM-JJ », ou null.
 *
 * On verifie que la date EXISTE, et pas seulement qu'elle a la bonne forme :
 * « 2024-02-31 » passe toute expression reguliere et n'est aucun jour. Le
 * detour par Date puis la comparaison de la chaine rendue est ce qui l'attrape.
 */
function jourValide(v) {
  const t = String(v ?? '').trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(t + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * La carte et les parties d'un dresseur, dans la forme que l'application range
 * deja dans son localStorage — voir parties.js. Une carte absente rend une
 * carte vide et non `null` : l'affichage n'a alors aucun cas particulier a
 * traiter, et le formulaire se remplit des memes champs dans les deux cas.
 */
export async function lireCarte(dresseurId) {
  const c = await une(
    'SELECT jeu, spinoff, favoris, phrase FROM pa_cartes WHERE dresseur_id = ?', [dresseurId]);
  const lignes = await lire(
    `SELECT jeu, etat, equipe, note, heures, debut, fin FROM pa_parties
      WHERE dresseur_id = ? ORDER BY jeu ASC`, [dresseurId]);

  const parties = {};
  for (const l of lignes) {
    parties[l.jeu] = {
      etat: l.etat,
      // Une chaine vide donne [''] au decoupage, et non [] : le filtre l'ecarte.
      equipe: (l.equipe || '').split(',').filter(Boolean),
      note: l.note || '',
      // null tel quel, et surtout pas rabattu sur 0 ou '' : voir heuresValides.
      heures: l.heures === null ? null : Number(l.heures),
      debut: l.debut || null,
      fin: l.fin || null
    };
  }
  return {
    carte: {
      jeu: c?.jeu || '',
      spinoff: c?.spinoff || '',
      favoris: (c?.favoris || '').split(',').filter(Boolean),
      phrase: c?.phrase || ''
    },
    parties
  };
}

/**
 * Remplace la carte et les donnees jeux par ce que l'application envoie.
 *
 * REMPLACER PLUTOT QUE FUSIONNER. L'application detient la verite complete :
 * elle envoie l'etat entier a chaque changement, comme pour le dex. Fusionner
 * aurait rendu impossible le seul geste qu'on veut vraiment pouvoir faire —
 * retirer un jeu de sa liste.
 *
 * Les jeux absents de l'envoi sont donc supprimes, mais par une requete qui
 * nomme les survivants : un DELETE suivi d'un INSERT complet aurait vide la
 * liste de quelqu'un pendant l'instant ou la seconde requete echoue.
 */
export async function ecrireCarte(dresseurId, entree) {
  const c = entree?.carte || {};
  const quand = horodatage();

  await ecrire(
    `INSERT INTO pa_cartes (dresseur_id, jeu, spinoff, favoris, phrase, maj_le)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE jeu = VALUES(jeu), spinoff = VALUES(spinoff),
       favoris = VALUES(favoris), phrase = VALUES(phrase), maj_le = VALUES(maj_le)`,
    [dresseurId,
     slugs([c.jeu], 1)[0] || '',
     ligne(c.spinoff, CARTE_SPINOFF_MAX),
     slugs(c.favoris, CARTE_FAVORIS_MAX).join(','),
     ligne(c.phrase, CARTE_PHRASE_MAX),
     quand]);

  const brutes = entree?.parties && typeof entree.parties === 'object' ? entree.parties : {};
  const jeux = Object.keys(brutes).filter((k) => CARTE_SLUG.test(k)).slice(0, CARTE_JEUX_MAX);

  if (jeux.length) {
    await ecrire(
      `DELETE FROM pa_parties WHERE dresseur_id = ?
        AND jeu NOT IN (${jeux.map(() => '?').join(',')})`, [dresseurId, ...jeux]);
  } else {
    await ecrire('DELETE FROM pa_parties WHERE dresseur_id = ?', [dresseurId]);
  }

  for (const jeu of jeux) {
    const p = brutes[jeu] || {};
    // La fin avant le debut est refusee en RETIRANT la fin, pas en rejetant la
    // ligne : c'est presque toujours une saisie en cours — on tape la fin, on
    // n'a pas encore corrige le debut — et perdre l'equipe et la note pour
    // deux dates a l'envers serait une punition sans rapport avec la faute.
    const debut = jourValide(p.debut);
    let fin = jourValide(p.fin);
    if (debut && fin && fin < debut) fin = null;

    await ecrire(
      `INSERT INTO pa_parties (dresseur_id, jeu, etat, equipe, note, heures, debut, fin, maj_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE etat = VALUES(etat), equipe = VALUES(equipe),
         note = VALUES(note), heures = VALUES(heures), debut = VALUES(debut),
         fin = VALUES(fin), maj_le = VALUES(maj_le)`,
      [dresseurId, jeu,
       CARTE_ETATS.has(p.etat) ? p.etat : 'en-cours',
       slugs(p.equipe, CARTE_EQUIPE_MAX).join(','),
       ligne(p.note, CARTE_NOTE_MAX),
       heuresValides(p.heures), debut, fin,
       quand]);
  }

  return await lireCarte(dresseurId);
}

/** Chercher un dresseur par son pseudo, même partiel. */
export async function chercherDresseurs(requete) {
  const motif = `%${normaliser(requete).replace(/[%_]/g, '\\$&')}%`;
  return await lire(
    `SELECT pseudo, avatar, discord_id, discord_nom FROM pa_dresseurs
      WHERE pseudo_cle LIKE ? AND visible = 1
      ORDER BY pseudo ASC LIMIT 25`, [motif]);
}

/**
 * Figurer ou non dans la liste des dresseurs.
 *
 * CE QUE CELA FAIT, ET CE QUE CELA NE FAIT PAS. Se retirer sort du classement
 * et de la recherche : on ne se fait plus trouver. Cela ne rend rien prive pour
 * autant — qui connait le pseudo exact peut toujours aller voir les aventures
 * publiques, et ceux qui suivent deja continuent de voir passer les captures.
 *
 * C'est deliberе. Rendre un compte introuvable ET muet d'un seul interrupteur
 * ferait disparaitre quelqu'un du fil de ses amis sans qu'ils comprennent
 * pourquoi. Pour ne rien montrer, l'outil existe deja et il est plus precis :
 * marquer ses aventures comme privees.
 */
/**
 * Ouvrir ou fermer sa porte aux propositions d'echange.
 *
 * FERMER N'ANNULE RIEN DE CE QUI EXISTE. Les echanges deja proposes, acceptes
 * ou en discussion continuent leur vie : on ferme la porte, on ne vide pas la
 * piece. Quelqu'un qui attend une reponse depuis trois jours ne doit pas voir
 * son echange disparaitre parce que l'autre a change un reglage.
 */
// Qui peut m'ecrire. Trois valeurs, et rien d'autre n'est accepte : une chaine
// inconnue arrivant par la route deviendrait un quatrieme etat silencieux, dont
// personne ne saurait dire ce qu'il autorise.
export const QUI_PEUT_ECRIRE = ['tous', 'amis', 'personne'];

/**
 * Ouvrir sa boite a tout le monde, a ses seuls amis, ou a personne.
 *
 * POURQUOI UN REGLAGE A PART DE `echanges_ouverts`. Recevoir une proposition
 * d'echange et recevoir un message ne se subissent pas pareil : l'une se refuse
 * d'un clic et disparait, l'autre se lit. Beaucoup voudront rester joignables
 * pour echanger tout en fermant la conversation aux inconnus — et l'inverse
 * existe aussi.
 */
export async function changerMessagesDe(dresseurId, valeur) {
  const v = QUI_PEUT_ECRIRE.indexOf(valeur) !== -1 ? valeur : 'tous';
  await ecrire('UPDATE pa_dresseurs SET messages_de = ? WHERE id = ?', [v, dresseurId]);
  return { messagesDe: v };
}

export async function changerEchangesOuverts(dresseurId, ouverts) {
  const v = ouverts ? 1 : 0;
  await ecrire('UPDATE pa_dresseurs SET echanges_ouverts = ? WHERE id = ?', [v, dresseurId]);
  return { echangesOuverts: v === 1 };
}

export async function changerVisibilite(dresseurId, visible) {
  const v = visible ? 1 : 0;
  await ecrire('UPDATE pa_dresseurs SET visible = ? WHERE id = ?', [v, dresseurId]);
  return { visible: v === 1 };
}

/**
 * Le dex d'un pote, pour la comparaison. Sans profil précisé, c'est son
 * aventure principale publique. Une aventure privée n'est jamais servie.
 */
export async function dexDe(pseudo, profilId = null) {
  const d = await une('SELECT id, pseudo FROM pa_dresseurs WHERE pseudo_cle = ?',
    [normaliser(pseudo)]);
  if (!d) return null;

  const p = profilId
    ? await une(`SELECT id, nom, mode, niveau_formes FROM pa_profils
                  WHERE id = ? AND dresseur_id = ? AND public = 1`, [profilId, d.id])
    : await une(`SELECT id, nom, mode, niveau_formes FROM pa_profils WHERE dresseur_id = ? AND public = 1
                  ORDER BY par_defaut DESC, id ASC LIMIT 1`, [d.id]);
  if (!p) return { pseudo: d.pseudo, profil: null, dex: null };

  const l = await une('SELECT donnees, maj_le FROM pa_dex WHERE profil_id = ?', [p.id]);
  let dex = null;
  if (l) {
    try { dex = JSON.parse(l.donnees); dex.majLe = l.maj_le; } catch { dex = null; }
  }
  // Le niveau part avec le dex : la barre de comparaison doit savoir sur quel
  // dénominateur l'autre dresseur compte, et non supposer le sien.
  return { pseudo: d.pseudo,
           profil: { id: p.id, nom: p.nom, mode: p.mode, niveau_formes: p.niveau_formes },
           dex };
}

export async function nombreDresseurs() {
  return (await une('SELECT COUNT(*) AS n FROM pa_dresseurs'))?.n ?? 0;
}

// --- Emporter ses données ---------------------------------------------------

/**
 * Tout ce qu'un dresseur possède, en un objet.
 *
 * Le service tourne sur un hébergement gratuit. Le jour où il ferme — ou celui
 * où l'envie change — il ne doit pas retenir les collections en otage. C'est
 * aussi la seule sauvegarde que le dresseur contrôle lui-même : celle du
 * serveur ne lui appartient pas.
 *
 * Ce qui n'y est PAS : les sessions, qui sont des jetons de connexion et non
 * des données, et l'identifiant Discord, qui appartient à Discord.
 */
export async function exporter(dresseurId) {
  const d = await une(
    'SELECT pseudo, avatar, cree_le FROM pa_dresseurs WHERE id = ?', [dresseurId]);
  if (!d) throw new ErreurCompte('Dresseur introuvable.', 404);

  const profils = await lire(
    `SELECT id, nom, public, par_defaut, mode, niveau_formes, cree_le, maj_le
       FROM pa_profils WHERE dresseur_id = ? ORDER BY id`, [dresseurId]);

  for (const p of profils) {
    const l = await une('SELECT donnees FROM pa_dex WHERE profil_id = ?', [p.id]);
    try { p.dex = l ? JSON.parse(l.donnees) : null; } catch { p.dex = null; }
    p.historique = await lire(
      `SELECT pokemon, dex, chromatique, ajoute_le FROM pa_historique
        WHERE profil_id = ? ORDER BY id`, [p.id]);
    delete p.id;   // un identifiant de base n'a aucun sens hors de la base
  }

  return {
    exporteLe: horodatage(),
    // LE NOM DU FORMAT NE SUIT PAS CELUI DU PROJET, et c'est deliberé : il est
    // ecrit dans chaque fichier deja exporte. Le changer rendrait illisibles
    // toutes les sauvegardes en circulation pour ne gagner qu'un mot juste.
    format: 'pokearchive-1',
    dresseur: { pseudo: d.pseudo, avatar: d.avatar, creeLe: d.cree_le },
    aventures: profils,
  };
}



// --- La rarete ---------------------------------------------------------------
//
// Le classement ne compte QUE le nombre. Il ne dit rien de la rarete : avoir un
// Mew et avoir un Roucool y pesent pareil, ce qui est faux pour tout le monde
// sauf pour le compteur.
//
// Or la base sait deja repondre : il suffit de compter, entree par entree,
// combien de dresseurs la possedent. Une seule lecture, et trois ecrans y
// gagnent — la fiche (« 3 dresseurs sur 240 l'ont »), un tri « mes pieces
// rares », et un classement qui recompense autre chose que la quantite.
//
// QUELLES COLLECTIONS COMPTENT. Celles qui sont deja publiques, et une par
// dresseur : son aventure principale. C'est exactement la regle du classement,
// et la reprendre evite deux verites differentes sur la meme page. Personne
// n'apparait dans ce calcul sans y etre deja.
//
// POURQUOI UN CACHE, ET POURQUOI DOUZE HEURES. Le dex est un bloc JSON, pas des
// lignes : compter demande de relire chaque collection. C'est peu couteux a
// vingt joueurs et deraisonnable a chaque ouverture de fiche. Douze heures
// suffisent — une rarete ne bouge pas dans la journee, et personne ne regarde
// ce chiffre pour le voir changer.

const RARETE_TTL = 12 * 3600_000;
const RARETE_MAX_DEX = 2000;

let rareteCache = { quand: 0, valeur: null };

/** Tous les noms d'un dex, sans doublon — racine et Pokedex de jeux confondus. */
function nomsDuDex(donnees) {
  const vus = new Set();
  const ajouter = (l) => { for (const n of l || []) vus.add(String(n)); };
  ajouter(donnees.captures || donnees.caught);
  const parJeu = donnees.dex || {};
  for (const cle of Object.keys(parJeu)) ajouter(parJeu[cle]?.caught);
  return vus;
}

export async function rarete() {
  if (rareteCache.valeur && Date.now() - rareteCache.quand < RARETE_TTL) {
    return rareteCache.valeur;
  }

  const lignes = await lire(
    `SELECT x.donnees FROM pa_dex x
       JOIN pa_profils p ON p.id = x.profil_id
       JOIN pa_dresseurs d ON d.id = p.dresseur_id
      WHERE p.public = 1 AND p.par_defaut = 1 AND d.visible = 1
      LIMIT ${RARETE_MAX_DEX}`);

  const compte = Object.create(null);
  let dresseurs = 0;
  for (const l of lignes) {
    let donnees;
    try { donnees = JSON.parse(l.donnees); } catch { continue; }
    if (!donnees || typeof donnees !== 'object') continue;
    dresseurs++;
    for (const nom of nomsDuDex(donnees)) {
      compte[nom] = (compte[nom] || 0) + 1;
    }
  }

  // Sous cinq dresseurs, le chiffre ne dit rien : « 1 sur 2 » n'est pas une
  // rarete, c'est un hasard. On rend alors un ensemble vide, et l'application
  // n'affiche rien plutot que d'annoncer une statistique qui n'en est pas une.
  const valeur = dresseurs >= 5
    ? { dresseurs, entrees: compte, calculeLe: horodatage() }
    : { dresseurs, entrees: {}, calculeLe: horodatage(),
        note: 'Trop peu de collections publiques pour en tirer une rareté.' };

  rareteCache = { quand: Date.now(), valeur };
  return valeur;
}

// --- Relire une sauvegarde ---------------------------------------------------
//
// C'est la piece qui manquait. « pokearchive-1 » etait produit des deux cotes —
// par l'application et par le site — et relu par aucun : le site et
// l'application ne pouvaient pas se rejoindre, un vidage de navigateur effacait
// tout sans recours, et quiconque venait d'ailleurs devait recocher neuf cents
// cases a la main. Personne ne le fait.
//
// LA REGLE DE FUSION, telle que site/LISEZMOI.md la specifie :
//
//   · LE DEX SE REUNIT, il ne se remplace pas. Cocher est monotone : on ajoute
//     des captures, on n'en retire pratiquement jamais. L'union des deux cotes
//     est presque toujours la bonne reponse. Un decochage volontaire serait
//     perdu par cette regle — c'est un choix assume : perdre une correction se
//     repare en deux clics, perdre trois mois de cochage ne se repare pas.
//
//   · L'HISTORIQUE SE DEDOUBLONNE sur (pokemon, dex, chromatique, ajoute_le).
//     Deux fois la meme capture le meme jour dans le meme jeu est la meme
//     capture. C'est ce qui rend l'import REJOUABLE : importer deux fois le
//     meme fichier ne double pas le journal.
//
//   · MAJ_LE DEPARTAGE ce qui ne se reunit pas — le nom d'une aventure, son
//     mode, son niveau de formes. La le plus recent gagne.
//
// L'IMPORT N'ECRIT PAS PAR ecrireDex(), et c'est volontaire : celui-ci
// journalise la difference a la date du jour. Un import porte ses propres
// dates, et les faire toutes tomber aujourd'hui effacerait justement ce que le
// fichier avait garde.

// Un fichier peut porter des annees de journal. On borne, sans quoi une
// sauvegarde forgee ferait ecrire un million de lignes.
const IMPORT_MAX_LIGNES = 20_000;
const IMPORT_MAX_AVENTURES = 20;

/** L'union de deux dex, dans la forme de la sauvegarde. */
function reunirDex(ancien, nouveau) {
  const sortie = { ...(ancien || {}) };
  const listes = (o, cle) => (Array.isArray(o?.[cle]) ? o[cle] : []);

  // Les deux listes historiques de la racine : elles alimentent la collection
  // Pokemon HOME dans les vieux exports, et des applications plus anciennes
  // les relisent encore.
  for (const cle of ['captures', 'caught', 'shiny']) {
    const reunion = new Set([...listes(ancien, cle), ...listes(nouveau, cle)]);
    if (reunion.size) sortie[cle] = [...reunion];
  }

  const parJeu = { ...(ancien?.dex || {}) };
  for (const jeu of Object.keys(nouveau?.dex || {})) {
    const a = parJeu[jeu] || {};
    const b = nouveau.dex[jeu] || {};
    parJeu[jeu] = {
      caught: [...new Set([...listes(a, 'caught'), ...listes(b, 'caught')])],
      shiny: [...new Set([...listes(a, 'shiny'), ...listes(b, 'shiny')])],
    };
  }
  if (Object.keys(parJeu).length) sortie.dex = parJeu;

  // Les chasses ne se reunissent pas ligne a ligne : ce sont des compteurs, et
  // additionner deux compteurs de la meme chasse donnerait un nombre faux. On
  // garde celles du cote qui en a le plus — c'est le plus avance des deux.
  const chassesA = Array.isArray(ancien?.chasses) ? ancien.chasses : [];
  const chassesB = Array.isArray(nouveau?.chasses) ? nouveau.chasses : [];
  sortie.chasses = chassesB.length > chassesA.length ? chassesB : chassesA;

  // Les fiches de capture se reunissent par cle, et LA VALEUR EXISTANTE GAGNE.
  // C'est la meme regle que le dex : un import ajoute, il n'ecrase pas. Une
  // Ball notee ici et une autre dans le fichier ne se departagent pas — on
  // garde celle qui etait deja la, et l'autre n'est pas perdue puisque le
  // fichier, lui, existe toujours.
  const details = { ...(nouveau?.detailsCapture || {}) };
  for (const jeu of Object.keys(ancien?.detailsCapture || {})) {
    details[jeu] = { ...(details[jeu] || {}), ...ancien.detailsCapture[jeu] };
  }
  if (Object.keys(details).length) sortie.detailsCapture = details;

  // Les chasses ABOUTIES, elles, se reunissent : chacune est un evenement
  // date, pas un compteur. On dedoublonne sur (pokemon, dex, fin).
  const finies = new Map();
  for (const c of [...(ancien?.chassesFinies || []), ...(nouveau?.chassesFinies || [])]) {
    if (!c || typeof c !== 'object') continue;
    finies.set(`${c.pokemon}|${c.dex}|${c.fin}`, c);
  }
  if (finies.size) sortie.chassesFinies = [...finies.values()];

  return sortie;
}

/** Une ligne de journal venue d'un fichier, ramenee a ce que la base accepte. */
function ligneImportable(l) {
  if (!l || typeof l !== 'object') return null;
  const pokemon = String(l.pokemon || '').slice(0, 64);
  const dex = String(l.dex || '').slice(0, 32);
  const quand = String(l.ajoute_le || l.ajouteLe || '').slice(0, 64);
  if (!pokemon || !dex || !quand) return null;
  return { pokemon, dex, chromatique: l.chromatique ? 1 : 0, quand };
}

/**
 * Verse le contenu d'un fichier « pokearchive-1 » dans le compte.
 *
 * Rend le detail de ce qui s'est passe, aventure par aventure : un import qui
 * annonce seulement « termine » ne dit pas si le fichier a servi a quelque
 * chose, et c'est la premiere question qu'on se pose.
 */
export async function importer(dresseurId, contenu) {
  if (!contenu || typeof contenu !== 'object' || Array.isArray(contenu)) {
    throw new ErreurCompte('Fichier illisible.');
  }
  if (contenu.format !== 'pokearchive-1') {
    throw new ErreurCompte(
      'Ce fichier n\'est pas une sauvegarde PokéPension (format « pokearchive-1 » attendu).');
  }
  const aventures = Array.isArray(contenu.aventures) ? contenu.aventures : [];
  if (!aventures.length) throw new ErreurCompte('Ce fichier ne contient aucune aventure.');
  if (aventures.length > IMPORT_MAX_AVENTURES) {
    throw new ErreurCompte(`Ce fichier contient ${aventures.length} aventures : c'est trop.`);
  }

  const existants = await lire(
    'SELECT id, nom, nom_cle, mode, niveau_formes, maj_le FROM pa_profils WHERE dresseur_id = ?',
    [dresseurId]);
  const parCle = new Map(existants.map((p) => [p.nom_cle, p]));
  let combien = existants.length;

  const maintenant = horodatage();
  const detail = [];

  for (const a of aventures) {
    if (!a || typeof a !== 'object') continue;

    // Un nom refuse ne doit pas faire echouer l'import entier : on le repli
    // sur un nom neutre plutot que de perdre le dex qui va avec.
    let nom;
    try { nom = nettoyerNomProfil(a.nom); }
    catch { nom = `Import ${detail.length + 1}`; }
    const cle = normaliser(nom);

    let cible = parCle.get(cle);
    let creee = false;

    if (!cible) {
      if (combien >= IMPORT_MAX_AVENTURES) {
        detail.push({ nom, ignoree: 'Vingt aventures suffisent : celle-ci n\'a pas été créée.' });
        continue;
      }
      const r = await ecrire(
        `INSERT INTO pa_profils
           (dresseur_id, nom, nom_cle, public, par_defaut, mode, niveau_formes, cree_le, maj_le)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        // Jamais par defaut d'office : une aventure importee ne doit pas
        // prendre la place de celle qu'on est en train de jouer. Sauf s'il n'y
        // en avait aucune — il en faut bien une.
        [dresseurId, nom, cle, combien === 0 ? 1 : 0,
         modeValide(a.mode), niveauValide(a.niveau_formes),
         String(a.cree_le || maintenant).slice(0, 64), maintenant]);
      cible = { id: r.insertId, nom, nom_cle: cle,
                mode: modeValide(a.mode), niveau_formes: niveauValide(a.niveau_formes),
                maj_le: null };
      parCle.set(cle, cible);
      combien++;
      creee = true;
    } else if (a.maj_le && (!cible.maj_le || String(a.maj_le) > String(cible.maj_le))) {
      // Le fichier est plus recent : c'est lui qui dit le mode et le niveau.
      await ecrire('UPDATE pa_profils SET mode = ?, niveau_formes = ? WHERE id = ?',
        [modeValide(a.mode), niveauValide(a.niveau_formes), cible.id]);
    }

    // --- Le dex : l'union ---
    let precedent = null;
    const ligne = await une('SELECT donnees FROM pa_dex WHERE profil_id = ?', [cible.id]);
    if (ligne) { try { precedent = JSON.parse(ligne.donnees); } catch { precedent = null; } }

    const avant = compterEspeces(precedent || {}, 'caught');
    const reuni = reunirDex(precedent, a.dex);
    const captures = compterEspeces(reuni, 'caught');
    const shiny = compterEspeces(reuni, 'shiny');

    const brut = JSON.stringify(reuni);
    if (brut.length > TAILLE_MAX_DEX) {
      throw new ErreurCompte(`L'aventure « ${nom} » dépasse la taille maximale une fois fusionnée.`, 413);
    }
    await ecrire(
      `INSERT INTO pa_dex (profil_id, dresseur_id, donnees, captures, shiny, maj_le)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE donnees = VALUES(donnees), captures = VALUES(captures),
         shiny = VALUES(shiny), maj_le = VALUES(maj_le)`,
      [cible.id, dresseurId, brut, captures, shiny, maintenant]);
    await ecrire('UPDATE pa_profils SET maj_le = ? WHERE id = ?', [maintenant, cible.id]);

    // --- Le journal : dedoublonne sur les quatre colonnes ---
    let journalisees = 0;
    const brutes = Array.isArray(a.historique) ? a.historique.slice(0, IMPORT_MAX_LIGNES) : [];
    if (brutes.length) {
      const deja = new Set((await lire(
        'SELECT pokemon, dex, chromatique, ajoute_le FROM pa_historique WHERE profil_id = ?',
        [cible.id])).map((l) => `${l.pokemon}|${l.dex}|${l.chromatique}|${l.ajoute_le}`));

      const aEcrire = [];
      for (const b of brutes) {
        const l = ligneImportable(b);
        if (!l) continue;
        const empreinte = `${l.pokemon}|${l.dex}|${l.chromatique}|${l.quand}`;
        if (deja.has(empreinte)) continue;
        deja.add(empreinte);      // le fichier peut aussi se repeter lui-meme
        aEcrire.push(l);
      }

      // Par lots : une seule requete de vingt mille lignes depasse la taille de
      // paquet que MySQL accepte par defaut.
      const LOT = 500;
      for (let i = 0; i < aEcrire.length; i += LOT) {
        const lot = aEcrire.slice(i, i + LOT);
        const valeurs = lot.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const params = [];
        for (const l of lot) params.push(cible.id, l.pokemon, l.dex, l.chromatique, l.quand);
        await ecrire(
          `INSERT INTO pa_historique (profil_id, pokemon, dex, chromatique, ajoute_le)
           VALUES ${valeurs}`, params);
      }
      journalisees = aEcrire.length;
    }

    detail.push({
      nom, creee, captures, shiny,
      gagnees: Math.max(0, captures - avant),
      journalisees,
    });
  }

  return {
    ok: true,
    aventures: detail.length,
    creees: detail.filter((d) => d.creee).length,
    gagnees: detail.reduce((n, d) => n + (d.gagnees || 0), 0),
    journalisees: detail.reduce((n, d) => n + (d.journalisees || 0), 0),
    detail,
  };
}

// --- Les sessions ouvertes --------------------------------------------------

/**
 * Les connexions en cours, la plus récente d'abord.
 *
 * L'empreinte du jeton ne sort jamais : elle sert à reconnaître la session
 * courante, ici, et rien de plus. Ce qu'on rend est une poignée numérique.
 */
export async function sessions(dresseurId, jetonCourant) {
  const courante = jetonCourant ? cle(jetonCourant) : null;
  const l = await lire(
    `SELECT id, jeton_cle, cree_le, expire_le FROM pa_sessions
      WHERE dresseur_id = ? ORDER BY cree_le DESC`, [dresseurId]);
  return l.map((s) => ({
    id: s.id,
    creeLe: s.cree_le,
    expireLe: s.expire_le,
    courante: s.jeton_cle === courante,
  }));
}

/** Ferme une session précise. La sienne comprise — c'est se déconnecter. */
export async function fermerSession(dresseurId, sessionId) {
  const r = await ecrire('DELETE FROM pa_sessions WHERE id = ? AND dresseur_id = ?',
    [Number(sessionId) || 0, dresseurId]);
  if (!r.affectedRows) throw new ErreurCompte('Session introuvable.', 404);
  return r.affectedRows;
}

/**
 * Ferme tout sauf celle d'où vient la demande.
 *
 * C'est le geste qu'on cherche après s'être connecté sur la machine d'un ami :
 * tout couper sans se déconnecter soi-même.
 */
export async function fermerLesAutres(dresseurId, jetonCourant) {
  const r = await ecrire(
    'DELETE FROM pa_sessions WHERE dresseur_id = ? AND jeton_cle <> ?',
    [dresseurId, jetonCourant ? cle(jetonCourant) : '']);
  return r.affectedRows;
}

// --- Le journal des captures ------------------------------------------------

/**
 * Ce qui a été coché, toutes aventures confondues.
 *
 * L'accueil en montrait les dernières et rien d'autre, alors que la table
 * garde tout depuis le premier jour. On pagine par identifiant décroissant et
 * non par date : deux captures de la même seconde garderaient sinon un ordre
 * instable, et la pagination sauterait des lignes.
 */
export async function journal(dresseurId, avant = null, limite = 50) {
  const borne = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const curseur = Number(avant);
  const params = [dresseurId];
  let filtre = '';
  if (Number.isInteger(curseur) && curseur > 0) {
    filtre = 'AND h.id < ?';
    params.push(curseur);
  }

  // La borne est interpolée, jamais passée en paramètre : MySQL refuse un
  // marqueur dans un LIMIT de requête préparée. Elle est sûre parce qu'elle
  // sort de Math.min/Math.max — c'est un nombre, pas une saisie. Même règle
  // que historique() juste au-dessus, et pour la même raison.
  const l = await lire(
    `SELECT h.id, h.pokemon, h.dex, h.chromatique, h.ajoute_le, p.nom AS aventure
       FROM pa_historique h JOIN pa_profils p ON p.id = h.profil_id
      WHERE p.dresseur_id = ? ${filtre}
      ORDER BY h.id DESC LIMIT ${borne + 1}`, params);

  // Une ligne de plus que demandé : sa présence dit qu'il y a une suite, sans
  // avoir à compter la table entière à chaque page.
  const encore = l.length > borne;
  return { lignes: l.slice(0, borne), encore };
}

// Deux ans de jours, et dix jeux : au-dela, la retrospective ne raconte plus
// rien de plus, elle pese seulement davantage.
const RETRO_JOURS = 730;
const RETRO_JEUX = 10;

/**
 * La rétrospective : ce que le journal raconte, une fois compté.
 *
 * pa_historique garde chaque capture avec sa date depuis le premier jour, et
 * personne ne s'en servait pour raconter quoi que ce soit. Le journal montre
 * les lignes une à une ; celle-ci les additionne.
 *
 * DEUX AGRÉGATS ET NON MILLE LIGNES. On pourrait tout renvoyer et compter dans
 * l'application, mais un journal de plusieurs milliers d'entrées traverserait
 * le réseau à chaque ouverture du Profil pour en tirer six chiffres. La base
 * sait grouper ; c'est son métier.
 *
 * `ajoute_le` est un horodatage ISO en VARCHAR — « 2026-08-25T01:00:00Z ». Ses
 * dix premiers caractères sont donc la date, et le tri lexicographique y est le
 * tri chronologique : c'est tout l'intérêt de ce format, et la raison pour
 * laquelle la colonne n'a jamais eu besoin d'être un DATETIME.
 *
 * La limite de jours est interpolée et non passée en paramètre : MySQL refuse
 * un marqueur dans un LIMIT de requête préparée. Elle est sûre parce qu'elle
 * est écrite en dur ici, jamais reçue de l'extérieur.
 */
export async function retrospective(dresseurId) {
  const jours = await lire(
    `SELECT LEFT(h.ajoute_le, 10) AS jour,
            COUNT(*)              AS combien,
            SUM(h.chromatique)    AS chromatiques
       FROM pa_historique h JOIN pa_profils p ON p.id = h.profil_id
      WHERE p.dresseur_id = ?
      GROUP BY jour
      ORDER BY jour DESC
      LIMIT ${RETRO_JOURS}`, [dresseurId]);

  const jeux = await lire(
    `SELECT h.dex, COUNT(*) AS combien
       FROM pa_historique h JOIN pa_profils p ON p.id = h.profil_id
      WHERE p.dresseur_id = ?
      GROUP BY h.dex
      ORDER BY combien DESC
      LIMIT ${RETRO_JEUX}`, [dresseurId]);

  // Le total et le premier jour ne se déduisent pas des lignes ci-dessus : la
  // première est plafonnée à deux ans, et quelqu'un qui joue depuis plus
  // longtemps verrait son total rétréci sans que rien ne le dise.
  const tout = await une(
    `SELECT COUNT(*) AS total, MIN(h.ajoute_le) AS premier
       FROM pa_historique h JOIN pa_profils p ON p.id = h.profil_id
      WHERE p.dresseur_id = ?`, [dresseurId]);

  return {
    jours: jours.map((j) => ({
      jour: j.jour,
      combien: Number(j.combien) || 0,
      chromatiques: Number(j.chromatiques) || 0,
    })),
    jeux: jeux.map((g) => ({ dex: g.dex, combien: Number(g.combien) || 0 })),
    total: Number(tout && tout.total) || 0,
    premier: (tout && tout.premier) || null,
  };
}

/**
 * De quoi calculer les succès de quelqu'un d'autre.
 *
 * CE QU'ON DONNE, ET CE QU'ON NE DONNE PAS. Les succès se déduisent du journal,
 * mais le journal lui-même — quel Pokémon, quel jour, à quelle heure — n'a pas à
 * sortir. On rend donc l'AGRÉGAT : combien en tout, combien par jour, sur quels
 * jeux. Assez pour un seuil ou une série, pas assez pour reconstituer les
 * soirées de quelqu'un.
 *
 * Le dex, lui, est déjà public : le classement l'affiche, la page de visite le
 * compare Pokémon par Pokémon. Le rendre ici n'ouvre rien de neuf, et c'est ce
 * qui permet à l'application de calculer les succès par Pokédex — elle seule
 * connaît la composition de chacun, l'API l'ignore et n'a pas à l'apprendre.
 *
 * Les aventures privées restent dehors, comme partout ailleurs.
 */
/**
 * Le dex d'un visite, dans la forme qu'attendent les succes.
 *
 * PAR JEU, et pas seulement l'ensemble. Arpenter Rouge / Bleu, c'est y etre
 * alle : le mesurer sur le dex d'ensemble rendait le succes plus facile chez
 * les autres que chez soi, et le meme intitule ne disait pas la meme chose
 * selon qui le regardait. Le detail existe dans la sauvegarde depuis toujours
 * — c'est succesDe() qui le jetait.
 *
 * La racine reste : « captures » est le format historique de HOME, « caught »
 * le recent, et les deux se rencontrent encore dans la base.
 */
function dexPourSucces(dex) {
  const vide = { caught: [], shiny: [], jeux: {} };
  if (!dex) return vide;
  const jeux = {};
  const parJeu = dex.dex || {};
  for (const cle of Object.keys(parJeu)) {
    jeux[String(cle).slice(0, 32)] = {
      caught: parJeu[cle]?.caught || [],
      shiny: parJeu[cle]?.shiny || [],
    };
  }
  return { caught: dex.captures || dex.caught || [], shiny: dex.shiny || [], jeux };
}

export async function succesDe(pseudo) {
  const d = await une(
    'SELECT id, pseudo FROM pa_dresseurs WHERE pseudo_cle = ? AND visible = 1',
    [normaliser(pseudo)]);
  if (!d) return null;

  const jours = await lire(
    `SELECT LEFT(h.ajoute_le, 10) AS jour,
            COUNT(*)              AS combien,
            SUM(h.chromatique)    AS chromatiques
       FROM pa_historique h JOIN pa_profils p ON p.id = h.profil_id
      WHERE p.dresseur_id = ? AND p.public = 1
      GROUP BY jour
      ORDER BY jour DESC
      LIMIT ${RETRO_JOURS}`, [d.id]);

  const jeux = await lire(
    `SELECT h.dex, COUNT(*) AS combien
       FROM pa_historique h JOIN pa_profils p ON p.id = h.profil_id
      WHERE p.dresseur_id = ? AND p.public = 1
      GROUP BY h.dex ORDER BY combien DESC LIMIT ${RETRO_JEUX}`, [d.id]);

  // MIN(ajoute_le) et non le dernier des jours ci-dessus : celui-la est
  // plafonne a deux ans, et dirait « un an » de quelqu'un qui joue depuis cinq.
  const tout = await une(
    `SELECT COUNT(*) AS total, MIN(h.ajoute_le) AS premier
       FROM pa_historique h JOIN pa_profils p ON p.id = h.profil_id
      WHERE p.dresseur_id = ? AND p.public = 1`, [d.id]);

  const amis = await une(
    'SELECT COUNT(*) AS n FROM pa_amis WHERE dresseur_id = ?', [d.id]);

  // Ses aventures publiques : le meme compte que la page de visite affiche
  // deja sous son nom. Sans lui, « Touche-a-tout » se mesurerait sur les
  // notres, et dirait de lui ce qui est vrai de nous.
  const av = await une(
    'SELECT COUNT(*) AS n FROM pa_profils WHERE dresseur_id = ? AND public = 1', [d.id]);

  // dexDe rend une ENVELOPPE { pseudo, profil, dex } et non le dex : lire
  // .caught dessus donnait undefined, et tous les succes par Pokedex d'un
  // visite tombaient a zero sans que rien ne le signale.
  const enveloppe = await dexDe(pseudo);
  const dex = enveloppe ? enveloppe.dex : null;

  return {
    pseudo: d.pseudo,
    resume: {
      jours: jours.map((j) => ({
        jour: j.jour,
        combien: Number(j.combien) || 0,
        chromatiques: Number(j.chromatiques) || 0,
      })),
      jeux: jeux.map((g) => ({ dex: g.dex, combien: Number(g.combien) || 0 })),
      total: Number(tout && tout.total) || 0,
      premier: (tout && tout.premier) || null,
    },
    // Un nombre, pas la liste : qui suit qui ne regarde pas les succès.
    amis: Number(amis && amis.n) || 0,
    aventures: Number(av && av.n) || 0,
    dex: dexPourSucces(dex),
  };
}

// --- Administration ---------------------------------------------------------

/**
 * Renommer quelqu'un, quand son pseudo ne peut pas rester.
 *
 * Le filtre de pseudos refuse à la saisie, mais aucune liste n'arrête un
 * déterminé : il reste les fautes volontaires, les langues non listées, et
 * l'insulte qui n'en est une que pour celui qui la reçoit. Sans ce filet, un
 * pseudo passé au travers s'affichait pour toujours dans le classement.
 *
 * Le nouveau nom passe par les MÊMES règles que les autres : rien ne servirait
 * de remplacer une grossièreté par une autre.
 */
export async function renommerDresseur(pseudoActuel, nouveau) {
  const d = await une('SELECT id FROM pa_dresseurs WHERE pseudo_cle = ?',
    [normaliser(pseudoActuel || '')]);
  if (!d) throw new ErreurCompte('Dresseur introuvable.', 404);
  return { id: d.id, pseudo: await changerPseudo(d.id, nouveau) };
}

// --- Partager le Pokédex d'un jeu --------------------------------------------
//
// CE QU'ON DONNE, ET CE QU'ON NE DONNE PAS. Le dex d'une aventure est un seul
// JSON qui contient TOUS les jeux, plus les chasses. Un lien de partage ne
// laisse sortir qu'un seul seau — celui du jeu nommé dans le lien. Partager son
// Rouge Feu ne montre ni son Écarlate, ni ses chasses en cours, ni le reste.
// C'est découpé ici, dans la couche qui lit la base, et non dans la page : une
// page peut être réécrite, une réponse d'API part telle qu'elle est construite.
//
// Le lecteur n'a pas de compte et n'en aura pas. Ces trois fonctions-ci sont
// donc les seules du fichier dont la sortie est visible sans jeton.

// L'alphabet d'un code qu'on lit à voix haute et qu'on retape à la main : ni O
// ni 0, ni I ni 1, ni L. Les confondre ferait échouer un lien sans que personne
// comprenne pourquoi — et le premier réflexe serait d'accuser le partage.
const PARTAGE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PARTAGE_LONGUEUR = 8;

/**
 * Un code de partage : huit caractères, en deux groupes de quatre.
 *
 * Le tiret n'est pas dans le code, il est dans son écriture — on le retire à la
 * lecture. Quelqu'un qui recopie « K7M2QX4P » sans tiret doit tomber juste.
 */
function nouveauCodePartage() {
  const octets = randomBytes(PARTAGE_LONGUEUR);
  let code = '';
  for (let i = 0; i < PARTAGE_LONGUEUR; i++) {
    code += PARTAGE_ALPHABET[octets[i] % PARTAGE_ALPHABET.length];
  }
  return code;
}

/**
 * L'adresse de l'avatar Discord, composee ici plutot que chez le lecteur.
 *
 * Meme regle que `avatarDiscord()` cote application, aux memes bornes : avec
 * un hash, l'avatar choisi ; sans, celui que Discord attribue d'office. La
 * difference est qu'ici l'identifiant ne quitte pas le serveur.
 */
function avatarDiscordUrl(discordId, hash, taille = 96) {
  if (!discordId) return '';
  if (hash) {
    const ext = String(hash).startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.${ext}?size=${taille}`;
  }
  let n = 0;
  try { n = Number((BigInt(discordId) >> 22n) % 6n); } catch { n = 0; }
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
}

/** La forme lisible : « K7M2-QX4P ». */
export function ecrireCodePartage(code) {
  return code.slice(0, 4) + '-' + code.slice(4);
}

/**
 * Le code tel qu'il est rangé, à partir de ce qu'on a tapé.
 *
 * On accepte les minuscules, les tirets et les espaces : un code se recopie
 * depuis un salon Discord, pas depuis un presse-papier propre.
 */
export function normaliserCodePartage(brut) {
  const c = String(brut || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === PARTAGE_LONGUEUR ? c : '';
}

/**
 * Ouvrir — ou rouvrir — le partage du Pokédex d'un jeu.
 *
 * IDEMPOTENT PAR AVENTURE ET PAR JEU. Repartager le même Pokédex rend le même
 * code : sinon chaque clic sèmerait un lien de plus, et celui qu'on a déjà collé
 * quelque part deviendrait un mort-vivant qu'on ne saurait plus retrouver pour
 * le révoquer. Un lien révoqué puis redemandé, en revanche, repart sous un code
 * NEUF — révoquer doit vouloir dire quelque chose.
 */
export async function creerPartage(dresseurId, profilId, jeu) {
  const cleJeu = String(jeu || '').trim().slice(0, 32);
  if (!cleJeu) throw new ErreurCompte('Aucun jeu à partager.');

  const p = await une('SELECT id FROM pa_profils WHERE id = ? AND dresseur_id = ?',
    [profilId, dresseurId]);
  if (!p) throw new ErreurCompte('Cette aventure n\'est pas la tienne.');

  // Le lien VIVANT, s'il y en a un. On ne regarde pas les éteints : ils
  // gardent leur code pour pouvoir répondre « retiré », et rouvrir doit
  // donner un code neuf — sans quoi révoquer ne voudrait rien dire.
  const vivant = await une(
    'SELECT code FROM pa_partages WHERE profil_id = ? AND jeu = ? AND actif = 1',
    [p.id, cleJeu]);
  if (vivant) return { code: vivant.code, neuf: false };

  const code = nouveauCodePartage();
  await ecrire(
    `INSERT INTO pa_partages (code, dresseur_id, profil_id, jeu, cree_le)
     VALUES (?, ?, ?, ?, ?)`,
    [code, dresseurId, p.id, cleJeu, horodatage()]);
  return { code, neuf: true };
}

/** Les liens qu'on a ouverts, actifs comme éteints. */
export async function partagesDe(dresseurId) {
  const l = await lire(
    `SELECT p.code, p.jeu, p.actif, p.vues, p.cree_le, p.vu_le,
            pr.id AS profil_id, pr.nom AS profil
       FROM pa_partages p
       JOIN pa_profils pr ON pr.id = p.profil_id
      WHERE p.dresseur_id = ?
      ORDER BY p.actif DESC, p.cree_le DESC`, [dresseurId]);
  return l.map((x) => ({
    code: x.code, lisible: ecrireCodePartage(x.code),
    jeu: x.jeu, profilId: x.profil_id, profil: x.profil,
    actif: x.actif !== 0, vues: x.vues, creeLe: x.cree_le, vuLe: x.vu_le,
  }));
}

/**
 * Éteindre un lien.
 *
 * On garde la ligne plutôt que de l'effacer : le code doit continuer de
 * répondre « ce lien a été retiré », et non « inconnu ». Qui l'a reçu de bonne
 * foi mérite de savoir que ce n'est pas lui qui s'est trompé.
 */
export async function revoquerPartage(dresseurId, code) {
  const c = normaliserCodePartage(code);
  if (!c) throw new ErreurCompte('Code de partage invalide.');
  const r = await ecrire(
    'UPDATE pa_partages SET actif = 0 WHERE code = ? AND dresseur_id = ?', [c, dresseurId]);
  if (!r.affectedRows) throw new ErreurCompte('Ce lien n\'est pas le tien, ou n\'existe plus.');
  return { ok: true };
}

/**
 * Lire un partage. SANS JETON — c'est le seul endroit du fichier dans ce cas.
 *
 * Rend le strict nécessaire pour dessiner la page : qui, quelle aventure, quel
 * jeu, et le seau de CE jeu. Pas le reste du dex, pas les chasses, pas l'adresse
 * Discord, pas les autres aventures, pas le journal.
 */
export async function lirePartage(code) {
  const c = normaliserCodePartage(code);
  if (!c) return null;

  const p = await une(
    `SELECT p.id, p.jeu, p.actif, p.cree_le,
            d.pseudo, d.avatar, d.discord_id,
            pr.id AS profil_id, pr.nom AS profil, pr.mode, pr.niveau_formes
       FROM pa_partages p
       JOIN pa_dresseurs d ON d.id = p.dresseur_id
       JOIN pa_profils  pr ON pr.id = p.profil_id
      WHERE p.code = ?`, [c]);
  if (!p) return null;
  if (!p.actif) return { retire: true };

  const l = await une('SELECT donnees, maj_le FROM pa_dex WHERE profil_id = ?', [p.profil_id]);
  let seau = { caught: [], shiny: [] };
  if (l) {
    try {
      const tout = JSON.parse(l.donnees);
      // LE DÉCOUPAGE, ET IL EST ICI. `tout.dex` porte un seau par jeu ; on n'en
      // sort qu'un. Rendre `tout` et laisser la page choisir aurait envoyé la
      // collection entière sur le réseau à chaque visite.
      const b = tout && tout.dex && tout.dex[p.jeu];
      if (b) {
        seau = { caught: Array.isArray(b.caught) ? b.caught : [],
                 shiny: Array.isArray(b.shiny) ? b.shiny : [] };
      }
    } catch { /* dex illisible : on rend un seau vide plutôt qu'une erreur */ }
  }

  await ecrire('UPDATE pa_partages SET vues = vues + 1, vu_le = ? WHERE id = ?',
    [horodatage(), p.id]);

  return {
    pseudo: p.pseudo,
    // L'ADRESSE DE L'AVATAR, ET PAS L'IDENTIFIANT DISCORD. Le lien se colle
    // n'importe ou, et se lit sans compte : y faire figurer un identifiant
    // Discord donnerait a n'importe quel passant de quoi remonter au compte.
    // Il ne servait qu'a composer cette adresse-la — on la compose ici.
    avatar: avatarDiscordUrl(p.discord_id, p.avatar),
    profil: p.profil,
    mode: p.mode,
    niveauFormes: p.niveau_formes,
    jeu: p.jeu,
    dex: seau,
    majLe: l ? l.maj_le : null,
    partageLe: p.cree_le,
  };
}
