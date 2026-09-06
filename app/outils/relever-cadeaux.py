# -*- coding: utf-8 -*-
"""Convertit le relevé des cadeaux mystères en réserve embarquée.

    cd app && py outils/relever-cadeaux.py [chemin/du/fichier.csv]

D'OÙ VIENT LA SOURCE. Un CSV de 552 distributions sur les neuf générations,
colonnes en anglais, valeurs en français, séparateur point-virgule, UTF-8 avec
BOM. Il porte ses propres colonnes de sources (Poképédia pour l'essentiel).

CE QUE L'OUTIL FAIT, ET POURQUOI IL EXISTE PLUTÔT QU'UN COPIER-COLLER :

  · il relie les libellés de version aux CLÉS de GAMES. Le CSV dit « Or »,
    « Argent », « Cristal » ; l'application connaît 'gsc' et 'cristal'. Sans
    cette table, le filtre par jeu comparerait des chaînes qui ne se
    rencontrent jamais ;

  · il ÉCHOUE sur un libellé inconnu au lieu de le laisser tomber. Un jeu non
    relié ne casse rien à l'exécution : il rend simplement ses distributions
    introuvables, et personne ne s'en aperçoit ;

  · il résout les noms d'espèces contre donnees-embarquees.js, pour la vignette
    et le numéro national. Les noms qui ne tombent pas sont dits en clair à la
    fin plutôt qu'avalés.

Le fichier produit est GÉNÉRÉ : on ne l'édite pas à la main, on relance l'outil.
"""
import collections
import csv
import html as htmlmod
import io
import json
import os
import pathlib
import re
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import urllib.request

ICI = pathlib.Path(__file__).resolve().parent
SRC = ICI.parent / "src" / "js"
SORTIE = SRC / "donnees-cadeaux.js"

DEFAUT = pathlib.Path.home() / "Downloads" / \
    "pokemon_cadeaux_mystere_9_generations_FR_FILTRES.csv"

# Le libelle de version tel que le CSV l'ecrit -> la cle de GAMES.
# Volontairement exhaustive : voir plus bas, un libelle absent arrete l'outil.
JEUX = {
    "Rouge": "rby", "Bleu": "rby", "Vert (JP)": "rby",
    "Jaune": "jaune",
    "Or": "gsc", "Argent": "gsc", "Cristal": "cristal",
    "Rubis": "rse", "Saphir": "rse", "Émeraude": "emeraude",
    "Rouge Feu": "frlg", "Vert Feuille": "frlg",
    "Diamant": "dp", "Perle": "dp", "Platine": "pt",
    "Or HeartGold": "hgss", "Argent SoulSilver": "hgss",
    "Noir": "bw", "Blanc": "bw", "Noir 2": "b2w2", "Blanc 2": "b2w2",
    "X": "xy", "Y": "xy", "Rubis Oméga": "oras", "Saphir Alpha": "oras",
    "Soleil": "sm", "Lune": "sm", "Ultra-Soleil": "usum", "Ultra-Lune": "usum",
    "Let's Go Pikachu": "letsgo", "Let's Go Évoli": "letsgo",
    "Épée": "swsh", "Bouclier": "swsh",
    "Diamant Étincelant": "bdsp", "Perle Scintillante": "bdsp",
    "Écarlate": "sv", "Violet": "sv",
}


# ---------------------------------------------------------------------------
# LE DETAIL D'UNE DISTRIBUTION : ce que le CSV ne porte pas.
#
# Mesure faite avant d'ecrire une ligne : sur les 552 distributions, le CSV
# donne ZERO niveau, ZERO statistique, UNE Ball et UN dresseur d'origine. Cinq
# des six champs demandes n'existent pas.
#
# Ils existent chez Pokepedia, dans le modele {{Pokemon distribue}} : niveau et
# talent sur 100 % des modeles, attaques 88 a 99 %, DO 89 %, ID 80 %, Ball 78 %.
# On va donc les y chercher, par l'API MediaWiki, comme relever-lieux.py le fait
# pour les lieux.
#
# L'APPARIEMENT EST LE POINT FAIBLE, ET IL EST MESURE. Le titre de section du
# wiki ne coincide avec le libelle d'evenement du CSV que dans 23 % des cas ;
# en acceptant qu'un titre soit CONTENU dans l'autre, on monte a 66 %. Le nom du
# Pokemon seul donnerait 85 % mais serait ambigu 239 fois sur 385 — une espece a
# souvent plusieurs distributions dans une meme generation, et associer la
# mauvaise serait pire que de ne rien associer.
#
# On s'en tient donc a la regle qui ne se trompe pas, et UN TIERS DES CARTES
# RESTE SANS DETAIL. L'ecran le dit carte par carte plutot que de laisser des
# champs vides.
#
# ET LA COMPARAISON SE FAIT SUR LES MOTS. Une premiere version comparait des
# sous-chaines : la section « Mew » se retrouvait dans « Mewtwo FEB / Printemps
# 2012 », et la carte de Mewtwo annoncait le niveau 5 et le talent Synchro d'un
# Mew. Vu a l'ecran, pas devine — et c'est bien pire qu'une carte vide, parce
# qu'une valeur fausse a l'air d'une reponse.
API = "https://www.pokepedia.fr/api.php"
ENTETE = {"User-Agent": "PokePension/1.0 (releve personnel de collection)"}

# Le cache vit dans le dossier temporaire du systeme, jamais dans le depot : ce
# sont des pages d'un wiki communautaire, pas des donnees du projet.
CACHE = pathlib.Path(tempfile.gettempdir()) / "pokearchive-pokepedia"


def wikitexte(titre):
    """Le source d'une page, du cache si on l'a deja."""
    CACHE.mkdir(exist_ok=True)
    f = CACHE / (re.sub(r"[^A-Za-z0-9]+", "_", titre)[:80] + ".wiki")
    if f.exists():
        return io.open(f, encoding="utf-8").read()
    p = urllib.parse.urlencode({"action": "parse", "page": titre, "prop": "wikitext",
                                "format": "json", "formatversion": "2"})
    r = urllib.request.Request(API + "?" + p, headers=ENTETE)
    with urllib.request.urlopen(r, timeout=60) as rep:
        d = json.loads(rep.read().decode("utf-8"))
    if "error" in d:
        return ""
    w = d["parse"]["wikitext"]
    io.open(f, "wb").write(w.encode("utf-8"))
    time.sleep(1)          # on ne martele pas un wiki tenu par des benevoles
    return w


def sans_accents(s):
    """Minuscules, sans accents, sans ponctuation — et LES LIGATURES DÉPLIÉES.

    NFD ne décompose pas Œ : elle n'est pas une lettre accentuée mais une lettre
    à part entière. Le filtre [^a-z0-9] la supprimait donc purement, et « Œufs
    Mystère » devenait « ufs mystere » : impossible à rapprocher de « Oeuf
    Mystère » chez Pokébip. Toute une famille de distributions ratait sa fiche et
    tombait dans le repli — celui qui ne vérifiait pas l'espèce.
    """
    s = (s or "")
    for lig, deux in (("Œ", "OE"), ("œ", "oe"), ("Æ", "AE"), ("æ", "ae")):
        s = s.replace(lig, deux)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def modeles_distribues(w):
    """Les {{Pokemon distribue}} d'une page, avec la section qui les porte."""
    out, section = [], ""
    for bout in re.split(r"^(={2,4}[^=].*?=*)$", w, flags=re.M):
        b = bout.strip()
        if b.startswith("="):
            section = b.strip("= ").strip()
            continue
        for m in re.finditer(r"\{\{\s*Pok[ée]mon distribu[ée]\s*(\|[^{}]*?)\}\}",
                             bout, re.S):
            ch = {}
            for c in m.group(1).split("|"):
                if "=" in c:
                    k, v = c.split("=", 1)
                    ch[k.strip().lower()] = re.sub(r"\[\[|\]\]|<[^>]+>", "", v).strip()
            ch["_section"] = section
            out.append(ch)
    return out


def detail_de(modele):
    """Le modele brut devient le detail qu'on affichera, ou None s'il est vide.

    LA CASSE EST NORMALISEE PARTOUT. Le wiki est ecrit a plusieurs mains :
    « Memoire » et « memoire » designent la meme Ball, « Psy » et « psy » le meme
    type. Deux etiquettes differentes pour une meme chose se verraient a l'ecran,
    et personne ne saurait laquelle croire.

    LES TYPES RESTENT EN FRANCAIS, pas convertis en identifiants ici : c'est
    TYPES_FR, cote application, qui fait foi, et l'inverser au moment du rendu
    evite d'ecrire une seconde table de correspondance dans cet outil.
    """
    def prop(cle):
        return (modele.get(cle, "") or "").strip()

    def typeNom(cle):
        v = prop(cle)
        return v[:1].upper() + v[1:] if v else ""

    capacites = []
    for i in (1, 2, 3, 4):
        nom = prop("cap-nom%d" % i)
        if not nom:
            continue
        capacites.append({
            "nom": nom,
            "type": typeNom("cap-type%d" % i),
            # Une attaque que ce Pokemon ne peut pas apprendre autrement : c'est
            # souvent la raison d'etre de la distribution.
            "even": bool(prop("cap-even%d" % i)),
        })

    def net(v):
        v = prop(v)
        return "" if v in ("-", "Aucun", "Aucune") else v

    d = {
        "do": net("do"),
        "id": net("id"),
        "ball": ball_normale(prop("ball")),
        "niveau": net("niveau"),
        "nature": net("nature"),
        "talent": net("talent"),
        "ruban": net("ruban"),
        "objet": net("objet"),
        "surnom": net("nom"),
        "genre": genre_normal(prop("sexe")),
        "nom_us": "",
        "types": [x for x in (typeNom("type"), typeNom("type2")) if x],
        "capacites": capacites,
        "espece": int(re.sub(r"[^0-9]", "", prop("num")) or 0),
    }
    plein = any(v for k, v in d.items() if k not in ("capacites", "types"))
    return d if plein or capacites or d["types"] else None


def contigu(petit, grand):
    """La suite de mots `petit` apparait-elle telle quelle dans `grand` ?"""
    if not petit or len(petit) > len(grand):
        return False
    for i in range(len(grand) - len(petit) + 1):
        if grand[i:i + len(petit)] == petit:
            return True
    return False


# ---------------------------------------------------------------------------
# LE MINIDEX EVENEMENTIEL DE POKEBIP : une page par espece.
#
# POURQUOI IL A REMPLACE POKEPEDIA COMME SOURCE PRINCIPALE. Les deux portent le
# meme detail, mais pas dans la meme forme. Chez Pokepedia, tous les evenements
# d'une generation vivent sur une page, sous des titres de section qu'il fallait
# apparier a nos libelles : 263 lignes sur 552, mesure. Ici l'adresse contient le
# numero national — /minidex-evenementiel/231-phanpy — donc on arrive DEJA sur la
# bonne espece, et il ne reste qu'a choisir parmi ses deux ou trois evenements.
#
# Elle donne en plus le NOM ANGLAIS de chaque distribution, que le CSV n'a pas et
# que Pokepedia ne structure pas.
#
# Les types et les Balls y sont des noms de fichier — sol.png, poke.png — donc
# des identifiants propres, la ou Pokepedia ecrivait « Psy » ou « psy » selon le
# contributeur.
EVENDEX = "https://www.pokebip.com/page/jeux-video/evendex/minidex-evenementiel/"
CACHE_BIP = pathlib.Path(tempfile.gettempdir()) / "pokearchive-evendex"

# Un navigateur ordinaire : le site refuse les requetes sans en-tete credible.
ENTETE_BIP = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/120.0 Safari/537.36"}


def page_bip(chemin, cle):
    CACHE_BIP.mkdir(exist_ok=True)
    f = CACHE_BIP / (re.sub(r"[^A-Za-z0-9]+", "_", cle)[:80] + ".html")
    if f.exists():
        return io.open(f, encoding="utf-8", errors="replace").read()
    r = urllib.request.Request(chemin, headers=ENTETE_BIP)
    try:
        with urllib.request.urlopen(r, timeout=45) as rep:
            h = rep.read().decode("utf-8", "replace")
    except Exception:
        return ""
    io.open(f, "wb").write(h.encode("utf-8"))
    time.sleep(0.6)          # on ne martele pas un site tenu par des benevoles
    return h


def bip_texte(x):
    x = re.sub(r"<br\s*/?>", " / ", x)
    x = re.sub(r"<[^>]+>", "", x)
    return htmlmod.unescape(re.sub(r"\s+", " ", x)).strip()


def bip_images(x, dossier):
    """Les noms de fichier d'un dossier d'icones, sans extension ni generation."""
    return (re.findall(r"/pages/icones/" + dossier + r"/[^/\"]*/([a-z0-9-]+)\.png", x)
            or re.findall(r"/pages/icones/" + dossier + r"/([a-z0-9-]+)\.png", x))


def evendex_liste():
    """Les pages du minidex, decouvertes depuis le menu de l'une d'elles.

    On ne tient pas la liste a la main : le menu la porte, et une espece ajoutee
    par Pokebip apparait au relevé suivant sans qu'on touche a rien.
    """
    h = page_bip(EVENDEX + "231-phanpy", "menu")
    liens = re.findall(r"minidex-evenementiel/(\d+)-([a-z0-9-]+)", h)
    vus = {}
    for num, slug in liens:
        vus.setdefault(int(num), slug)
    return vus


def evendex_evenements(page):
    """Chaque table 'bipcode' portant un « Nom Event » est une distribution."""
    out = []
    for tb in re.findall(r'<table[^>]*class="bipcode".*?</table>', page, re.S):
        if "Nom Event" not in tb:
            continue
        ev = {"capacites": [], "types": [], "cap_types": []}
        # Le numero national, lu dans le titre : « #231 Phanpy ». C'est lui qui
        # permet de verifier, plus tard, qu'un detail n'a pas atterri sur la
        # mauvaise espece.
        mt = re.search(r"#(\d+)", bip_texte(tb[:400]))
        if mt:
            ev["espece"] = int(mt.group(1))
        entete_ball = False
        for l in re.findall(r"<tr.*?</tr>", tb, re.S):
            cellules = re.findall(r"<(?:th|td)[^>]*>(.*?)</(?:th|td)>", l, re.S)
            plats = [bip_texte(c) for c in cellules]

            for i, p in enumerate(plats):
                suiv = cellules[i + 1] if i + 1 < len(cellules) else ""
                plat = plats[i + 1] if i + 1 < len(plats) else ""
                if p == "Nom Event":
                    # SUR LE TEXTE APLATI : les marqueurs (FR) et (US) sont
                    # enrobes de <strong><em>, et decouper le balisage laissait
                    # des bouts de balise dans le nom.
                    m = re.match(r"^(.*?)\s*\(FR\)\s*/\s*(.*?)\s*\(US\)\s*$", plat)
                    if m:
                        ev["nom_fr"] = m.group(1).strip().strip("/ ")
                        ev["nom_us"] = m.group(2).strip().strip("/ ")
                    else:
                        ev["nom_fr"] = re.sub(r"\s*\((FR|US)\)\s*", "", plat).strip()
                        ev["nom_us"] = ""
                elif p == "Informations":
                    ev["infos"] = plat
                elif p == "Type":
                    ev["types"] = bip_images(suiv, "types")
                elif p == "Genre":
                    g = re.findall(r"evendex/images/(male|femelle)\.png", suiv)
                    ev["genre"] = {"male": "M", "femelle": "F"}.get(
                        g[0] if len(g) == 1 else "", " / ".join(g) and "M / F")
                elif p in ("Niveau", "Talent", "Nature"):
                    ev[p.lower()] = plat
                elif p == "DO":
                    ev["do"] = plat
                elif p.startswith("N") and "ID" in p:
                    ev["id"] = plat

            # La colonne des capacites : un rowspan qui alterne nom et icone.
            for c in cellules:
                if c.count("/pages/icones/types/") >= 2 and "<br" in c:
                    types = bip_images(c, "types")
                    noms = []
                    for bout in re.split(r"<br\s*/?>", c):
                        n = bip_texte(bout)
                        if n and n != "-" and "<img" not in bout:
                            noms.append({"nom": n, "exclusive": "<strong>" in bout})
                    if noms:
                        ev["capacites"] = noms
                        ev["cap_types"] = types

            # Ball / objet / ruban : la rangee qui suit leur en-tete.
            if "Ball" in plats and "Objet tenu" in plats:
                entete_ball = True
            elif entete_ball and "ball" not in ev:
                b = bip_images(l, "balls")
                if b:
                    ev["ball"] = b[0]
                if len(plats) >= 3:
                    ev["objet"] = plats[1]
                    ev["ruban"] = plats[2]
        out.append(ev)
    return out


# ---------------------------------------------------------------------------
# DEUX SOURCES, UN SEUL VOCABULAIRE.
#
# Pokebip nomme ses Balls par le fichier de l'icone — memoire, poke, reve — et
# Pokepedia par leur nom francais, avec la casse du contributeur : « Memoire »,
# « memoire », « Poke ». Le genre suit le meme sort : « mf » ici, deux images la.
#
# Sans cette mise au meme format, l'ecran afficherait deux etiquettes pour une
# meme chose, et la table des sprites raterait la moitie des lignes.
BALLS_NOM = {
    "memoire": "Mémoire", "poke": "Poké", "sombre": "Sombre", "soin": "Soin",
    "hyper": "Hyper", "luxe": "Luxe", "safari": "Safari", "reve": "Rêve",
    "lune": "Lune", "rapide": "Rapide", "chrono": "Chrono", "masse": "Masse",
    "filet": "Filet", "scuba": "Scuba", "faste": "Faste", "appat": "Appât",
    "speed": "Rapide", "premier": "Premier",
}


def ball_normale(v):
    """Un nom de Ball unique, quelle que soit la source qui l'a ecrit."""
    v = (v or "").strip()
    if not v or v in ("-", "Aucun", "Aucune"):
        return ""
    cle = sans_accents(v).replace(" ball", "").strip()
    return BALLS_NOM.get(cle, v[:1].upper() + v[1:])


def genre_normal(v):
    """« M », « F », « M / F », ou rien.

    Pokepedia ecrit « mf », « m », « f » ; Pokebip pose deux images. Les deux
    disent la meme chose et doivent le dire pareil.
    """
    v = sans_accents(v or "")
    if not v or v == "-":
        return ""
    if v in ("mf", "m f", "m / f"):
        return "M / F"
    if v == "m":
        return "M"
    if v == "f":
        return "F"
    return ""


def bip_detail(ev):
    """Une distribution Pokebip devient le detail qu'on affiche."""
    def net(v):
        v = (ev.get(v) or "").strip()
        return "" if v in ("-", "Aucun", "Aucune") else v

    caps = []
    for i, c in enumerate(ev.get("capacites", [])):
        types = ev.get("cap_types", [])
        caps.append({
            "nom": c["nom"],
            "type": (types[i].capitalize() if i < len(types) else ""),
            "even": c["exclusive"],
        })
    return {
        "do": net("do"),
        "id": net("id"),
        "ball": ball_normale(ev.get("ball")),
        "niveau": net("niveau"),
        "nature": net("nature"),
        "talent": net("talent"),
        "ruban": net("ruban"),
        "objet": net("objet"),
        "surnom": "",
        "genre": genre_normal(ev.get("genre")),
        "nom_us": net("nom_us"),
        "types": [x.capitalize() for x in ev.get("types", [])],
        "capacites": caps,
        # L'ESPECE DONT CE RELEVE PARLE. Le banc s'en sert pour verifier qu'il
        # est bien pose sur elle : une fiche de Germignon s'est retrouvee sur
        # Phanpy — type Plante, Danse-Fleur, le surnom japonais de Chicorita —
        # parce que l'appariement de repli regardait le titre et jamais l'espece.
        "espece": ev.get("espece", 0),
    }


def relever_details(lignes, par_nom):
    """Rend, pour chaque ligne du CSV, son detail ou None.

    DEUX SOURCES, DANS CET ORDRE.

    Pokebip d'abord : son adresse porte le numero national, donc on arrive deja
    sur la bonne espece et il ne reste qu'a choisir parmi ses quelques
    evenements. Le choix se fait sur les mots communs entre le libelle du CSV et
    le nom francais OU anglais de la distribution — et quand l'espece n'a qu'un
    seul evenement pour une seule ligne, il n'y a rien a choisir.

    Pokepedia ensuite, pour ce que Pokebip ne couvre pas : 269 de nos 318 especes
    ont une fiche la-bas, pas toutes.

    ON NE DEVINE JAMAIS À MOITIÉ. Sans mot commun et sans unicite, la ligne reste
    sans detail : l'ecran le dit, et c'est preferable a un niveau faux qui aurait
    l'air d'une reponse.
    """
    # ---- Pokebip -----------------------------------------------------------
    besoins = {}
    for l in lignes:
        e = resoudre(l["pokemon"], par_nom)
        besoins.setdefault(e[0] if e else 0, []).append(l)

    catalogue = evendex_liste()
    par_espece = {}
    vus = 0
    for num in sorted(besoins):
        slug = catalogue.get(num)
        if not num or not slug:
            continue
        evs = evendex_evenements(page_bip(EVENDEX + "%03d-%s" % (num, slug),
                                          "%03d-%s" % (num, slug)))
        if evs:
            par_espece[num] = evs
            vus += len(evs)

    def mots(s):
        return {x for x in sans_accents(s).split() if len(x) > 2}

    details, pris_bip = [], 0
    for l in lignes:
        e = resoudre(l["pokemon"], par_nom)
        evs = par_espece.get(e[0] if e else 0, [])
        choisi = None
        if len(evs) == 1 and len(besoins.get(e[0] if e else 0, [])) == 1:
            # Une seule distribution connue, une seule ligne : rien a choisir.
            choisi = evs[0]
        elif evs:
            cible = mots(l["event"])
            meilleur, score = None, 0
            for ev in evs:
                c = max(len(cible & mots(ev.get("nom_fr", ""))),
                        len(cible & mots(ev.get("nom_us", ""))))
                if c > score:
                    meilleur, score = ev, c
            # Deux mots communs au moins : un seul serait souvent le nom de
            # l'espece, present partout, et n'apprendrait rien.
            if score >= 2:
                choisi = meilleur
        if choisi:
            details.append(bip_detail(choisi))
            pris_bip += 1
        else:
            details.append(None)

    # ---- Pokepedia, en repli -----------------------------------------------
    pages = sorted({l["source_distribution_fr"] for l in lignes
                    if "pokepedia" in (l["source_distribution_fr"] or "")})
    sections = []
    for u in pages:
        titre = urllib.parse.unquote(u.rsplit("/", 1)[-1]).replace("_", " ")
        for m in modeles_distribues(wikitexte(titre)):
            s = sans_accents(m.get("_section", ""))
            if s:
                sections.append((s, m))

    pris_wiki = 0
    for i, l in enumerate(lignes):
        if details[i]:
            continue
        attendu = resoudre(l["pokemon"], par_nom)
        attendu = attendu[0] if attendu else 0
        mots_e = sans_accents(l["event"]).split()
        trouve, longueur = None, 0
        for s, m in sections:
            mots_s = s.split()
            if not mots_s:
                continue
            # L'ESPECE D'ABORD, LE TITRE ENSUITE. Sans ce garde, « OEufs Mystere
            # — Serie 1 » — un evenement qui couvre une trentaine d'especes —
            # collait la fiche de Germignon sur la ligne de Phanpy : type Plante,
            # Danse-Fleur, et le surnom japonais de Chicorita. Le titre seul ne
            # designe pas un Pokemon, et le modele porte son numero.
            try:
                num = int(re.sub(r"[^0-9]", "", m.get("num", "")) or 0)
            except ValueError:
                num = 0
            if attendu and num and num != attendu:
                continue
            if contigu(mots_s, mots_e) or contigu(mots_e, mots_s):
                if len(mots_s) > longueur:
                    trouve, longueur = m, len(mots_s)
        if trouve:
            d = detail_de(trouve)
            if d:
                d.setdefault("nom_us", "")
                d.setdefault("genre", d.get("genre", ""))
                details[i] = d
                pris_wiki += 1

    print("   Pokebip : %d evenements sur %d especes, %d lignes appariees"
          % (vus, len(par_espece), pris_bip))
    print("   Pokepedia en repli : %d lignes de plus" % pris_wiki)
    return details, vus + len(sections)


def especes_connues():
    """Nom francais -> (numero national, id de forme).

    LES DEUX, ET PAS SEULEMENT LE PREMIER. Zoroark de Hisui porte le numero
    national 571, comme le Zoroark ordinaire — et c'est bien celui-la qu'il faut
    afficher. Mais son rendu se demande par l'id de FORME, 10239 : avec le seul
    numero national, l'ecran montrait le Zoroark d'Unys sous le nom de celui de
    Hisui. Le meme piege attend Miaouss, qui a trois formes pour un numero.
    """
    t = io.open(SRC / "donnees-embarquees.js", encoding="utf-8").read()
    d = json.loads(t[t.index("DONNEES_EMBARQUEES = ") + 21: t.rindex("};") + 1])
    par_nom = {}
    for e in d["entrees"]:
        par_nom.setdefault(e["display"], (e["speciesId"], e["id"]))
    return par_nom


def resoudre(nom, par_nom):
    """Le numero national, ou None.

    Trois ecritures a rapprocher, parce que les deux cotes ne nomment pas les
    formes pareil :

      · « Pikachu (casquette) » — le CSV met la forme entre parentheses ;
      · « Miaouss de Galar » — il l'ecrit aussi en toutes lettres, la ou la
        reserve dit « Miaouss (Galar) ». Onze noms tombaient la-dessus ;
      · une forme que la reserve ne distingue pas : on retombe sur l'espece.
    """
    if nom in par_nom:
        return par_nom[nom]

    # « X de Galar » -> « X (Galar) ». La preposition varie, la reserve non.
    for prep in (" de ", " d'"):
        if prep in nom:
            base, forme = nom.split(prep, 1)
            candidat = "%s (%s)" % (base.strip(), forme.strip())
            if candidat in par_nom:
                return par_nom[candidat]

    racine = nom.split("(")[0].strip()
    if racine in par_nom:
        return par_nom[racine]
    for cle in par_nom:
        if cle.startswith(nom + " (") or cle.startswith(racine + " ("):
            return par_nom[cle]
    return None


def main():
    source = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAUT
    if not source.exists():
        print("introuvable : %s" % source)
        return 1

    lignes = list(csv.DictReader(io.open(source, encoding="utf-8-sig"),
                                 delimiter=";"))
    par_nom = especes_connues()

    inconnus = sorted({j.strip() for l in lignes for j in l["games"].split("|")
                       if j.strip() and j.strip() not in JEUX})
    if inconnus:
        print("ARRET : libelles de jeu non relies a GAMES —")
        for j in inconnus:
            print("   " + j)
        return 1

    # Les chaines qui se repetent beaucoup sont internees : la methode et la
    # region reviennent des dizaines de fois, le titre de l'evenement presque
    # jamais. Interner tout aurait alourdi le fichier au lieu de l'alleger.
    textes, index = [], {}

    def n(s):
        s = (s or "").strip()
        if not s:
            return -1
        if s not in index:
            index[s] = len(textes)
            textes.append(s)
        return index[s]

    CATS = ["normal", "legendaire", "fabuleux"]
    SHINY = ["non_applicable", "non_shiny", "shiny_possible", "shiny_garanti"]

    print("relevé du détail chez Poképédia…")
    details, nb_sections = relever_details(lignes, par_nom)
    print("   %d sections lues, %d lignes appariées sur %d"
          % (nb_sections, sum(1 for d in details if d), len(lignes)))

    # Les détails sont mis en commun : une même distribution vaut souvent pour
    # plusieurs lignes du CSV — un évènement qui touche six jeux en fait six.
    details_uniques, index_detail = [], {}

    def poser_detail(d):
        if not d:
            return -1
        cle = json.dumps(d, sort_keys=True, ensure_ascii=False)
        if cle not in index_detail:
            index_detail[cle] = len(details_uniques)
            details_uniques.append(d)
        return index_detail[cle]

    sortie, perdus = [], []
    for rang, l in enumerate(lignes):
        trouve = resoudre(l["pokemon"], par_nom)
        if trouve is None:
            perdus.append(l["pokemon"])
        espece, forme = trouve if trouve else (0, 0)
        jeux = sorted({JEUX[j.strip()] for j in l["games"].split("|") if j.strip()})
        cat = l["pokemon_category"].strip()
        sh = l["shiny_status"].strip() or "non_applicable"
        sortie.append([
            l["pokemon"].strip(),
            espece,
            int(l["generation"]),
            jeux,
            CATS.index(cat) if cat in CATS else 0,
            SHINY.index(sh) if sh in SHINY else 0,
            l["event"].strip(),
            n(l["method"]),
            n(l["regions"]),
            l["period"].strip(),
            n(l["source_distribution_fr"]),
            forme,
            poser_detail(details[rang]),
        ])

    entete = (
        "// Les cadeaux mystères, distribution par distribution — GÉNÉRÉ, ne pas\n"
        "// éditer à la main.\n"
        "//\n"
        "//   cd app && py outils/relever-cadeaux.py\n"
        "//\n"
        "// DISTRIBUTIONS ET NON CADEAUX : fiche.js declare deja un CADEAUX, la\n"
        "// table de qui offre le starter. Deux const du meme nom dans deux\n"
        "// scripts classiques font lever le SECOND, et tout ce qu il declare\n"
        "// disparait — fiche.js est mort en entier une journee pour cela.\n"
        "//\n"
        "// %d distributions sur les neuf générations. Le relevé est MONDIAL : la\n"
        "// colonne `region` dit où chacune a eu lieu, et beaucoup n'ont jamais\n"
        "// touché l'Europe. L'écran l'affiche plutôt que de le taire — promettre un\n"
        "// évènement auquel personne n'a eu accès serait pire que de l'omettre.\n"
        "//\n"
        "// Chaque entrée est un tableau, pour tenir dans un fichier qu'on charge à\n"
        "// l'ouverture de l'onglet :\n"
        "//\n"
        "//   0 nom        tel que la source l'écrit, forme comprise\n"
        "//   1 espece     numéro national, 0 si le nom n'a pas été résolu\n"
        "//   2 gen        génération de la distribution, pas de l'espèce\n"
        "//   3 jeux       clés de GAMES\n"
        "//   4 categorie  index dans DISTRIBUTIONS_CATEGORIES\n"
        "//   5 chromatique index dans DISTRIBUTIONS_CHROMA\n"
        "//   6 evenement  le nom de la distribution\n"
        "//   7 methode    index dans DISTRIBUTIONS_TEXTES\n"
        "//   8 regions    index dans DISTRIBUTIONS_TEXTES\n"
        "//   9 periode    la date ou la plage, telle qu'écrite\n"
        "//  10 source     index dans DISTRIBUTIONS_TEXTES\n"
        "//  11 forme      id de FORME, pour le sprite. Zoroark de Hisui porte\n"
        "//              le numero national 571 comme le Zoroark ordinaire, mais\n"
        "//              son rendu se demande par 10239 : avec le seul numero,\n"
        "//              l'ecran montrait la mauvaise bete sous le bon nom.\n"
        "//  12 detail     index dans DISTRIBUTIONS_DETAILS, ou -1. DO, ID, Ball,\n"
        "//              niveau, nature, talent, ruban, objet, surnom et\n"
        "//              attaques — releves chez Pokepedia. UN TIERS DES LIGNES\n"
        "//              N EN A PAS : le titre de section du wiki ne se laisse\n"
        "//              apparier au libelle d evenement que dans deux tiers des\n"
        "//              cas, et associer la mauvaise distribution serait pire\n"
        "//              que de n en associer aucune.\n"
        "//              Le detail porte : do, id, surnom, genre, niveau, nature,\n"
        "//              talent, ball, objet, ruban, types[] et capacites[] —\n"
        "//              chaque capacite avec son type et un drapeau even pour\n"
        "//              celles qui ne s apprennent pas autrement.\n"
        "//              Le detail porte aussi `espece`, le numero dont il parle :\n"
        "//              le banc verifie qu il correspond a la ligne.\n"
        "//\n"
        "// Les index pointent vers DISTRIBUTIONS_TEXTES : méthode et région se répètent\n"
        "// des dizaines de fois, le titre de l'évènement presque jamais — interner\n"
        "// les seconds aurait alourdi le fichier au lieu de l'alléger.\n"
        % len(sortie))

    corps = (
        entete
        + "\nconst DISTRIBUTIONS_CATEGORIES = %s;\n" % json.dumps(CATS, ensure_ascii=False)
        + "const DISTRIBUTIONS_CHROMA = %s;\n" % json.dumps(SHINY, ensure_ascii=False)
        + "\nconst DISTRIBUTIONS_TEXTES = %s;\n" % json.dumps(textes, ensure_ascii=False)
        + "\nconst DISTRIBUTIONS_DETAILS = %s;\n"
          % json.dumps(details_uniques, ensure_ascii=False)
        + "\nconst DISTRIBUTIONS = %s;\n" % json.dumps(sortie, ensure_ascii=False)
    )
    # ENCODER AVANT D'OUVRIR : si l'encodage échoue, le fichier existant n'a pas
    # encore été tronqué.
    octets = corps.encode("utf-8")
    io.open(SORTIE, "wb").write(octets)

    print("%s — %d distributions, %d octets" % (SORTIE.name, len(sortie), len(octets)))
    print("   %d textes internés, %d détails distincts"
          % (len(textes), len(details_uniques)))
    par_gen = collections.Counter(x[2] for x in sortie)
    print("   par génération : "
          + ", ".join("%d=%d" % (g, par_gen[g]) for g in sorted(par_gen)))
    if perdus:
        print("   %d nom(s) non résolu(s) : %s"
              % (len(perdus), ", ".join(sorted(set(perdus))[:12])))
    else:
        print("   tous les noms résolus contre la réserve embarquée")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
