// Verse le relevé de PixelmonWorld dans la base.
//
//   node --env-file=.env outils/importer-pixelmonworld.js
//   node --env-file=.env outils/importer-pixelmonworld.js --a-blanc
//
// Le relevé vient de `cd app && py outils/relever-pixelmonworld.py`, qui lit
// le Pokédex du serveur et écrit releves/pixelmonworld.json. Cet outil-ci le
// range dans les tables que le panneau d'administration modifie ensuite.
//
// --- LA RÈGLE QUI COMPTE ----------------------------------------------------
//
// IL EST REJOUABLE, ET IL FAIT LE MÉNAGE.
//
// Au second passage, il ne recrée rien : il met à jour ce qui a bougé, ajoute
// ce qui est neuf, et RETIRE les apparitions que le site ne donne plus. Sans ce
// dernier point, un Pokémon déplacé par l'équipe du serveur resterait affiché
// dans son ancienne zone, et le Pokédex enverrait chercher là où il n'y a plus
// rien.
//
// Les ZONES, elles, ne sont jamais supprimées. Une zone vidée de ses
// apparitions reste, avec sa description : le site la remplira peut-être à
// nouveau, et rien ne se perd à l'attendre. C'est la seule asymétrie, et elle
// est volontaire.
//
// RIEN NE SE SAISIT À LA MAIN NULLE PART. Ce relevé est la seule source de ces
// tables — aucune route d'API ne les écrit, et le panneau d'administration ne
// gère que la liste des personnes autorisées. Il n'y a donc aucune correction
// manuelle à préserver, et c'est ce qui rend l'import aussi simple.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { base, lire, une, ecrire, description } from '../src/base.js';
import { creerSchema } from '../src/base.js';
import { horodatage } from '../src/comptes.js';
import { etoilesDeRarete, libelleDeRarete } from '../src/pixelmonworld.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
// Dans api/releves/ et non api/donnees/, que .gitignore écarte : ce dernier
// porte les photos de chasse des joueurs.
const RELEVE = path.join(ICI, '..', 'releves', 'pixelmonworld.json');

const aBlanc = process.argv.includes('--a-blanc');
const journal = (...m) => console.log(...m);

/**
 * La clé de forme de l'application.
 *
 * ELLE EST RÉSOLUE PAR LE RELEVÉ, pas ici. Le site écrit « nidoranf » là où
 * l'application dit « nidoran-f », et « deoxys » là où elle ne connaît que
 * deoxys-normal : c'est le relevé qui réconcilie les deux, en lisant la
 * réserve embarquée de l'application. Voir resoudre() dans
 * app/outils/relever-pixelmonworld.py.
 *
 * On retombe sur `nomEn` pour un relevé plus ancien, écrit avant que la
 * résolution n'existe : la clé y est alors juste dans 903 cas sur 951, et
 * l'import reste possible plutôt que de refuser un fichier qu'on sait lire.
 */
const cleEspece = (fiche) =>
  String(fiche.espece || fiche.nomEn || '').trim().toLowerCase();

async function lireReleve() {
  let brut;
  try {
    brut = await fs.readFile(RELEVE, 'utf8');
  } catch {
    console.error(`Relevé introuvable : ${path.relative(process.cwd(), RELEVE)}`);
    console.error('Lance d’abord : cd app && py outils/relever-pixelmonworld.py');
    process.exit(1);
  }
  return JSON.parse(brut);
}

/**
 * Les zones et sous-zones du relevé, créées si elles manquent.
 *
 * Rend deux tables de correspondance : le libellé plat du site — « Zone 1
 * Eau » — vers l'identifiant de la zone et celui de la sous-zone. C'est ce
 * couple que les apparitions vont chercher.
 */
async function poserZones(releve) {
  const maintenant = horodatage();
  const parLibelle = new Map();
  // Les zones déjà vues pendant CE passage. « Zone 1 » revient quatre fois
  // dans le relevé — une par sous-zone — et sans ce cache, la lecture à blanc
  // annoncerait quarante-huit zones à créer là où il y en a dix-neuf : elle
  // ne peut pas les relire en base, puisqu'elle n'écrit rien.
  const vues = new Map();
  let zonesCreees = 0;
  let sousCreees = 0;

  // L'ordre du relevé est celui de la carte : Zone 1, ses sous-zones, Zone 2…
  // On le garde en base, pour que les menus sortent dans cet ordre-là sans
  // que personne n'ait à les ranger.
  let ordre = 0;

  for (const z of releve.zones) {
    ordre += 10;
    const cleZone = z.cle && !z.sousZone ? z.cle : cleZoneDe(z.zone);
    let zone = vues.get(cleZone)
      || await une('SELECT * FROM pa_pw_zones WHERE cle = ?', [cleZone]);
    if (!zone) {
      if (!aBlanc) {
        const r = await ecrire(
          `INSERT INTO pa_pw_zones (cle, nom, genre, description, image, ordre, actif, cree_le, maj_le)
           VALUES (?, ?, ?, ?, '', ?, 1, ?, ?)`,
          [cleZone, z.zone, z.genre || 'lieu', z.note || null, ordre, maintenant, maintenant]);
        zone = { id: r.insertId, cle: cleZone, nom: z.zone };
      } else {
        zone = { id: 0, cle: cleZone, nom: z.zone };
      }
      zonesCreees += 1;
    }
    vues.set(cleZone, zone);

    let sousId = null;
    if (z.sousZone) {
      const cleSous = cleZoneDe(z.sousZone);
      let sous = zone.id
        ? await une('SELECT * FROM pa_pw_sous_zones WHERE zone_id = ? AND cle = ?',
            [zone.id, cleSous])
        : null;
      if (!sous) {
        if (!aBlanc && zone.id) {
          const r = await ecrire(
            `INSERT INTO pa_pw_sous_zones (zone_id, cle, nom, description, ordre, actif, cree_le, maj_le)
             VALUES (?, ?, ?, NULL, ?, 1, ?, ?)`,
            [zone.id, cleSous, z.sousZone, ordre, maintenant, maintenant]);
          sous = { id: r.insertId };
        } else {
          sous = { id: 0 };
        }
        sousCreees += 1;
      }
      sousId = sous.id;
    }

    parLibelle.set(z.libelle, { zoneId: zone.id, sousZoneId: sousId, genre: z.genre });
  }

  return { parLibelle, zonesCreees, sousCreees };
}

const cleZoneDe = (nom) => String(nom || '').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'zone';

/**
 * Les espèces : ce que le serveur dit de chacune, rareté comprise.
 *
 * CELLES QUI NE SONT PLUS DANS LE RELEVÉ SONT RETIRÉES, comme les apparitions.
 * Ce n'est pas une précaution théorique : le jour où le relevé a appris à
 * résoudre « nidoranf » en « nidoran-f », les quarante-huit anciennes clés sont
 * restées en base à côté des neuves, et le Pokédex a montré neuf cent
 * quatre-vingt-dix-neuf espèces dont quarante-huit doublons sans sprite ni
 * fiche. Un import qui ajoute sans retirer finit toujours par là.
 */
async function poserEspeces(releve) {
  const maintenant = horodatage();
  let neuves = 0;
  let majs = 0;
  const attendues = new Set();

  for (const f of releve.especes) {
    const espece = cleEspece(f);
    if (!espece) continue;
    attendues.add(espece);
    const rarete = libelleDeRarete(f.rarete);
    const etoiles = etoilesDeRarete(f.rarete);
    const deja = await une('SELECT espece FROM pa_pw_especes WHERE espece = ?', [espece]);

    if (!aBlanc) {
      await ecrire(
        `INSERT INTO pa_pw_especes
           (espece, numero, nom_fr, nom_en, generation, types, etoiles, rarete, sprite,
            actif, maj_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE numero = VALUES(numero), nom_fr = VALUES(nom_fr),
           nom_en = VALUES(nom_en), generation = VALUES(generation), types = VALUES(types),
           etoiles = VALUES(etoiles), rarete = VALUES(rarete), sprite = VALUES(sprite),
           maj_le = VALUES(maj_le)`,
        [espece, Number(f.numero) || 0, f.nomFr || '', f.nomEn || '',
         Number(f.generation) || 0, (f.types || []).join(','), etoiles,
         rarete.slice(0, 32), f.sprite || '', maintenant]);
    }
    if (deja) majs += 1; else neuves += 1;
  }

  let retirees = 0;
  for (const l of await lire('SELECT espece FROM pa_pw_especes')) {
    if (attendues.has(l.espece)) continue;
    if (!aBlanc) await ecrire('DELETE FROM pa_pw_especes WHERE espece = ?', [l.espece]);
    retirees += 1;
  }
  return { neuves, majs, retirees };
}

/**
 * Les apparitions.
 *
 * UNE PAR COUPLE ESPÈCE-ZONE : c'est exactement ce que le site publie. Une
 * espèce présente dans quatre endroits donne quatre lignes — Magicarpe —, et
 * deux sous-zones de la même zone font deux lignes distinctes.
 *
 * CELLES QUI NE SONT PLUS DANS LE RELEVÉ SONT RETIRÉES : un Pokémon déplacé
 * par l'équipe du serveur doit disparaître de son ancienne zone.
 */
async function poserSpawns(releve, parLibelle) {
  const maintenant = horodatage();
  const attendus = new Set();
  let neuves = 0;
  let majs = 0;
  const sansZone = new Set();

  for (const f of releve.especes) {
    const espece = cleEspece(f);
    if (!espece) continue;
    const rarete = libelleDeRarete(f.rarete);
    const etoiles = etoilesDeRarete(f.rarete);

    for (const libelle of f.zones || []) {
      const cible = parLibelle.get(libelle);
      if (!cible) { sansZone.add(libelle); continue; }
      const clef = `${espece}|${cible.zoneId}|${cible.sousZoneId ?? 0}`;
      attendus.add(clef);

      const deja = await une(
        `SELECT id FROM pa_pw_spawns
          WHERE espece = ? AND zone_id = ? AND ${cible.sousZoneId
            ? 'sous_zone_id = ?' : 'sous_zone_id IS NULL'}`,
        cible.sousZoneId ? [espece, cible.zoneId, cible.sousZoneId] : [espece, cible.zoneId]);

      if (deja) {
        if (!aBlanc) {
          await ecrire(
            `UPDATE pa_pw_spawns SET etoiles = ?, rarete = ?, maj_le = ? WHERE id = ?`,
            [etoiles, rarete.slice(0, 32), maintenant, deja.id]);
        }
        majs += 1;
      } else {
        if (!aBlanc) {
          await ecrire(
            `INSERT INTO pa_pw_spawns
               (espece, zone_id, sous_zone_id, etoiles, rarete, ordre, actif, cree_le, maj_le)
             VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`,
            [espece, cible.zoneId, cible.sousZoneId, etoiles, rarete.slice(0, 32),
             maintenant, maintenant]);
        }
        neuves += 1;
      }
    }
  }

  // Le ménage : les lignes du relevé précédent que le site ne donne plus.
  let retirees = 0;
  const anciennes = await lire(
    'SELECT id, espece, zone_id, sous_zone_id FROM pa_pw_spawns');
  for (const a of anciennes) {
    const clef = `${a.espece}|${Number(a.zone_id)}|${a.sous_zone_id === null ? 0 : Number(a.sous_zone_id)}`;
    if (attendus.has(clef)) continue;
    if (!aBlanc) await ecrire('DELETE FROM pa_pw_spawns WHERE id = ?', [a.id]);
    retirees += 1;
  }

  return { neuves, majs, retirees, sansZone: [...sansZone] };
}

async function main() {
  const releve = await lireReleve();
  journal(`base : ${description()}`);
  journal(`relevé du ${releve.genereLe} — ${releve.especes.length} espèces, `
    + `${releve.zones.length} zones`);
  if (aBlanc) journal('À BLANC : rien ne sera écrit.');

  await creerSchema(journal);

  const z = await poserZones(releve);
  journal(`zones     : ${z.zonesCreees} créées, ${z.sousCreees} sous-zones créées`);

  const e = await poserEspeces(releve);
  journal(`espèces   : ${e.neuves} nouvelles, ${e.majs} mises à jour, `
    + `${e.retirees} retirées (absentes du relevé)`);

  const s = await poserSpawns(releve, z.parLibelle);
  journal(`apparitions : ${s.neuves} nouvelles, ${s.majs} mises à jour, `
    + `${s.retirees} retirées (absentes du relevé)`);
  if (s.sansZone.length) {
    journal(`ZONES INCONNUES, apparitions ignorées : ${s.sansZone.join(', ')}`);
  }

  // À BLANC, les identifiants valent zéro et les comptes ne veulent rien dire :
  // on ne les affiche donc pas comme s'ils décrivaient la base.
  if (!aBlanc) {
    const fin = await une(
      `SELECT (SELECT COUNT(*) FROM pa_pw_especes) AS especes,
              (SELECT COUNT(*) FROM pa_pw_spawns)  AS spawns,
              (SELECT COUNT(*) FROM pa_pw_zones)   AS zones,
              (SELECT COUNT(*) FROM pa_pw_sous_zones) AS sous`);
    journal(`en base   : ${fin.especes} espèces, ${fin.spawns} apparitions, `
      + `${fin.zones} zones, ${fin.sous} sous-zones`);
  }

  await base().end();
}

main().catch(async (e) => {
  console.error(e);
  try { await base().end(); } catch { /* le pool est déjà tombé */ }
  process.exit(1);
});
