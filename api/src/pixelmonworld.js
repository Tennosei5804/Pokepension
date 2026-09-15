// Le Pokédex de PixelmonWorld : ce que le serveur fait apparaître, et où.
//
// CE QUE CE FICHIER NE FAIT PAS. Il ne sait rien des Pokémon. Ni les noms, ni
// les types, ni les statistiques, ni les évolutions : l'application les porte
// déjà pour les 1 025 espèces, et les recopier ici ferait deux référentiels à
// tenir d'accord. On n'y trouve que ce qui appartient au SERVEUR — où il
// apparaît, et à quelle rareté.
//
// UNE SEULE SOURCE, ET ELLE N'EST PAS ICI. Zones, sous-zones, raretés et
// apparitions viennent du Pokédex de PixelmonWorld, relevé par
// `cd app && py outils/relever-pixelmonworld.py` puis versé en base par
// `api/outils/importer-pixelmonworld.js`. RIEN ne se saisit à la main : ce
// fichier lit, il n'écrit que la liste des personnes autorisées.
//
// C'est pourquoi on n'y trouvera ni création, ni modification, ni suppression
// de zone ou d'apparition. Une seconde façon d'écrire ces tables serait une
// seconde vérité à tenir d'accord avec le relevé, et c'est exactement la
// dérive que le dépôt a déjà payée ailleurs.
//
// LA HIÉRARCHIE, ET POURQUOI ELLE EST À TROIS ÉTAGES :
//
//     Zone  →  Sous-zone  →  Apparition
//
// C'est celle que PokéPension affiche déjà partout : le relevé des jeux écrit
// « Lac Ouragan • Hautes herbes », et la page Lieux regroupe sur la partie de
// gauche. PixelmonWorld tient la même chose dans une liste plate — « Zone 1 »,
// « Zone 1 Eau », « Zone 1 Forêt » — que le relevé découpe.
//
// UNE MÊME ESPÈCE PEUT REVENIR AUTANT DE FOIS QU'IL LE FAUT, dans plusieurs
// zones et plusieurs sous-zones. Chaque ligne est une apparition indépendante,
// avec sa rareté : aucune unicité ne l'interdit.

import { lire, une, ecrire } from './base.js';
import { ErreurCompte, horodatage } from './comptes.js';

// --- La rareté, et sa conversion en étoiles ---------------------------------
//
// Cinq paliers chez PixelmonWorld, cinq étoiles ici : la conversion tombe
// juste. Elle est écrite une fois, à cet endroit, et sert à l'import comme à
// l'affichage — la page lit cette table pour bâtir son menu de raretés, elle
// n'en tient pas une copie.
//
// L'ordre est celui du commun vers le rare, et c'est lui qui donne l'indice.
export const RARETES = [
  { cle: 'common',    libelle: 'Commun',     etoiles: 1 },
  { cle: 'uncommon',  libelle: 'Peu commun', etoiles: 2 },
  { cle: 'rare',      libelle: 'Rare',       etoiles: 3 },
  { cle: 'epic',      libelle: 'Épique',     etoiles: 4 },
  { cle: 'legendary', libelle: 'Légendaire', etoiles: 5 },
];

const SANS_ACCENT = (s) => String(s || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Le nombre d'étoiles d'une rareté, par sa clé ou par son libellé.
 *
 * REND 0 QUAND ON NE SAIT PAS, et zéro veut dire « pas mesuré » — pas « zéro
 * étoile ». La fiche n'affiche alors aucune étoile plutôt que cinq étoiles
 * creuses, qui annonceraient à tort un Pokémon banal.
 */
export function etoilesDeRarete(valeur) {
  const nu = SANS_ACCENT(valeur);
  if (!nu) return 0;
  const trouve = RARETES.find((r) => r.cle === nu || SANS_ACCENT(r.libelle) === nu);
  return trouve ? trouve.etoiles : 0;
}

/** Le libellé officiel d'une rareté, ou ce que le relevé nous a donné. */
export function libelleDeRarete(valeur) {
  const nu = SANS_ACCENT(valeur);
  const trouve = RARETES.find((r) => r.cle === nu || SANS_ACCENT(r.libelle) === nu);
  return trouve ? trouve.libelle : String(valeur || '').trim();
}

// --- Qui a le droit d'entrer -------------------------------------------------
//
// Ouvert ou fermé, et rien entre les deux. L'administrateur ajoute un
// identifiant Discord, l'allume, l'éteint, le retire. Il n'y a pas de rôle, pas
// de niveau, pas de rédacteur : personne ne modifie le Pokédex, puisqu'il vient
// entièrement du relevé.

/**
 * Le droit d'un identifiant Discord sur le Pokédex.
 *
 * L'administrateur du service a tout, sans figurer dans la liste : il est déjà
 * désigné par ADMIN_DISCORD_ID, et l'obliger à s'ajouter lui-même à sa propre
 * liste serait un piège à la première installation — personne pour ouvrir la
 * porte du dedans.
 */
export async function droits(discordId, estAdmin = false) {
  if (estAdmin) return { lire: true, admin: true };
  const l = await une(
    'SELECT id FROM pa_pw_acces WHERE discord_id = ? AND actif = 1',
    [String(discordId || '')]);
  return { lire: Boolean(l), admin: false };
}

/** La liste des accès, avec le dresseur derrière chaque identifiant. */
export async function listerAcces() {
  // LA JOINTURE EST EXTERNE, et c'est tout l'intérêt : on peut autoriser
  // quelqu'un qui ne s'est pas encore connecté. Sa ligne existe alors sans
  // dresseur en face, et le panneau affiche l'identifiant nu — « jamais
  // connecté » — au lieu de la faire disparaître.
  return await lire(
    `SELECT a.id, a.discord_id, a.libelle, a.note, a.actif, a.ajoute_le, a.ajoute_par,
            d.pseudo, d.avatar, d.vu_le
       FROM pa_pw_acces a
       LEFT JOIN pa_dresseurs d ON d.discord_id = a.discord_id
      ORDER BY a.actif DESC, a.ajoute_le ASC`);
}

const idDiscordValide = (v) => /^\d{5,32}$/.test(String(v || '').trim());

/**
 * Ouvrir un accès, ou le corriger.
 *
 * Le même appel sert aux deux : recoller un identifiant déjà présent le
 * rallume et met son libellé à jour, au lieu d'échouer sur un doublon. C'est
 * ce qu'on attend d'un panneau où l'on repasse pour rouvrir une porte.
 */
export async function poserAcces({ discordId, libelle, note }, par = '') {
  const id = String(discordId || '').trim();
  if (!idDiscordValide(id)) {
    throw new ErreurCompte(
      'Un identifiant Discord est une suite de chiffres — clic droit sur le '
      + 'profil, « Copier l’identifiant ».', 400);
  }
  await ecrire(
    `INSERT INTO pa_pw_acces (discord_id, libelle, note, actif, ajoute_le, ajoute_par)
     VALUES (?, ?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE libelle = VALUES(libelle), note = VALUES(note), actif = 1`,
    [id, String(libelle || '').slice(0, 120), String(note || '').slice(0, 255),
     horodatage(), String(par || '').slice(0, 64)]);
  return await une('SELECT * FROM pa_pw_acces WHERE discord_id = ?', [id]);
}

/**
 * Allumer ou éteindre un accès.
 *
 * ÉTEINDRE N'EFFACE PAS. Fermer la porte de quelqu'un ne doit pas effacer
 * qu'on la lui avait ouverte : on le rallume d'un clic, sans recoller son
 * identifiant ni retrouver qui c'était.
 */
export async function basculerAcces(id, actif) {
  const r = await ecrire('UPDATE pa_pw_acces SET actif = ? WHERE id = ?',
    [actif ? 1 : 0, Number(id)]);
  if (!r.affectedRows) throw new ErreurCompte('Cet accès n’existe pas.', 404);
  return await une('SELECT * FROM pa_pw_acces WHERE id = ?', [Number(id)]);
}

export async function retirerAcces(id) {
  const r = await ecrire('DELETE FROM pa_pw_acces WHERE id = ?', [Number(id)]);
  if (!r.affectedRows) throw new ErreurCompte('Cet accès n’existe pas.', 404);
  return { ok: true };
}

/**
 * Les dresseurs connus, pour le « + » du panneau.
 *
 * On ne demande pas de taper un identifiant à la main quand la personne s'est
 * déjà connectée : elle est dans pa_dresseurs, avec son pseudo. Son accès
 * éventuel sort avec elle, pour que le panneau puisse le marquer plutôt que de
 * la proposer une seconde fois.
 */
export async function dresseursConnus(recherche = '') {
  const q = String(recherche || '').trim();
  const params = [];
  let filtre = '';
  if (q) {
    filtre = 'WHERE d.pseudo LIKE ? OR d.discord_id = ?';
    params.push(`%${q}%`, q);
  }
  return await lire(
    `SELECT d.discord_id, d.pseudo, d.avatar, d.vu_le, a.actif
       FROM pa_dresseurs d
       LEFT JOIN pa_pw_acces a ON a.discord_id = d.discord_id
       ${filtre}
      ORDER BY d.vu_le DESC
      LIMIT 60`, params);
}

// --- La lecture du Pokédex ---------------------------------------------------

/**
 * Toutes les zones, leurs sous-zones, et combien de Pokémon s'y trouvent.
 *
 * EN TROIS REQUÊTES ET NON EN UNE PAR ZONE. Vingt zones font vingt
 * allers-retours si on les compte une à une, pour une page qui s'ouvre en
 * entier. On lit donc les tables à plat, et on assemble ici.
 */
export async function zones() {
  const [lignes, sous, comptes] = await Promise.all([
    lire('SELECT * FROM pa_pw_zones WHERE actif = 1 ORDER BY ordre ASC, nom ASC'),
    lire('SELECT * FROM pa_pw_sous_zones WHERE actif = 1 ORDER BY ordre ASC, nom ASC'),
    lire(`SELECT zone_id, sous_zone_id, COUNT(*) AS n FROM pa_pw_spawns
           WHERE actif = 1 GROUP BY zone_id, sous_zone_id`),
  ]);

  const parZone = new Map();
  const parSous = new Map();
  for (const c of comptes) {
    parZone.set(Number(c.zone_id), (parZone.get(Number(c.zone_id)) || 0) + Number(c.n));
    if (c.sous_zone_id !== null) parSous.set(Number(c.sous_zone_id), Number(c.n));
  }

  const sousParZone = new Map();
  for (const s of sous) {
    if (!sousParZone.has(Number(s.zone_id))) sousParZone.set(Number(s.zone_id), []);
    sousParZone.get(Number(s.zone_id)).push({
      id: Number(s.id), cle: s.cle, nom: s.nom, description: s.description || '',
      spawns: parSous.get(Number(s.id)) || 0,
    });
  }

  return lignes.map((z) => ({
    id: Number(z.id), cle: z.cle, nom: z.nom, genre: z.genre,
    description: z.description || '', image: z.image || '',
    spawns: parZone.get(Number(z.id)) || 0,
    sousZones: sousParZone.get(Number(z.id)) || [],
  }));
}

const enSpawn = (l) => ({
  id: Number(l.id),
  espece: l.espece,
  zoneId: Number(l.zone_id),
  zone: l.zone_nom || '',
  zoneCle: l.zone_cle || '',
  zoneGenre: l.zone_genre || 'lieu',
  sousZoneId: l.sous_zone_id === null ? null : Number(l.sous_zone_id),
  sousZone: l.sous_zone_nom || '',
  etoiles: Number(l.etoiles) || 0,
  rarete: l.rarete || '',
});

const SELECT_SPAWN = `
  SELECT s.*, z.nom AS zone_nom, z.cle AS zone_cle, z.genre AS zone_genre,
         sz.nom AS sous_zone_nom
    FROM pa_pw_spawns s
    JOIN pa_pw_zones z ON z.id = s.zone_id
    LEFT JOIN pa_pw_sous_zones sz ON sz.id = s.sous_zone_id
   WHERE s.actif = 1 AND z.actif = 1`;

/** Les apparitions, toutes ou celles d'une espèce. */
export async function spawns({ espece = '' } = {}) {
  const lignes = await lire(
    `${SELECT_SPAWN} ${espece ? 'AND s.espece = ?' : ''}
      ORDER BY z.ordre ASC, z.nom ASC, s.ordre ASC, s.etoiles ASC, s.id ASC`,
    espece ? [String(espece)] : []);
  return lignes.map(enSpawn);
}

const enEspece = (l) => ({
  espece: l.espece,
  numero: Number(l.numero) || 0,
  nomFr: l.nom_fr || '',
  nomEn: l.nom_en || '',
  generation: Number(l.generation) || 0,
  types: l.types ? String(l.types).split(',').filter(Boolean) : [],
  etoiles: Number(l.etoiles) || 0,
  rarete: l.rarete || '',
  sprite: l.sprite || '',
});

export async function especes() {
  const lignes = await lire(
    'SELECT * FROM pa_pw_especes WHERE actif = 1 ORDER BY numero ASC, espece ASC');
  return lignes.map(enEspece);
}

/**
 * Le Pokédex entier, en un seul appel.
 *
 * UN APPEL ET PAS DEUX MILLE. La page a besoin des 951 espèces et de leurs
 * 1 175 apparitions pour filtrer par zone sans redemander au serveur à chaque
 * clic — c'est ce que fait déjà le Pokédex des jeux, qui tient sa grille en
 * mémoire. Le tout pèse quelques centaines de kilo-octets, une fois par
 * session.
 */
export async function pokedex() {
  const [lignesEspeces, lignesSpawns, lignesZones] = await Promise.all([
    especes(), spawns(), zones(),
  ]);

  // Les apparitions rejoignent leur espèce. La rareté de l'espèce reste à
  // part : c'est celle que publie le Pokédex du serveur, quand celle d'une
  // apparition vaut pour un endroit.
  const parEspece = new Map();
  for (const s of lignesSpawns) {
    if (!parEspece.has(s.espece)) parEspece.set(s.espece, []);
    parEspece.get(s.espece).push(s);
  }

  return {
    majLe: horodatage(),
    raretes: RARETES,
    zones: lignesZones,
    especes: lignesEspeces.map((e) => ({ ...e, spawns: parEspece.get(e.espece) || [] })),
  };
}
