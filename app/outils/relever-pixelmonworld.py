# -*- coding: utf-8 -*-
"""
Relevé du Pokédex de PixelmonWorld, depuis le site du serveur.

    cd app && py outils/relever-pixelmonworld.py

PixelmonWorld est un serveur Pixelmon, et son Pokédex est la seule source qui
dise ce qu'on y croise : quelle espèce, à quelle rareté, dans quelles zones.

    https://pixelmonworld.fr/pokedex

Il n'a pas d'API : les pages sont rendues côté serveur, et le relevé les lit
telles qu'elles sortent. Cloudflare refuse un client sans User-Agent — la même
mésaventure que l'API Discord, et la même réponse ci-dessous.

LE SITE A CHANGÉ ENTRE LE 16 ET LE 27 SEPTEMBRE 2026, avec la sortie de
Kaura 2.0, et le relevé d'avant n'y trouvait plus une seule fiche :

  · `www.pixelmonworld.fr` répond 500 ; seule l'adresse sans www sert ;
  · les fiches ont des adresses françaises — /pokedex/bulbizarre ; l'ancienne
    /pokedex/1-bulbasaur répond 404 ;
  · la liste arrive par morceaux en HTMX (`?server=kaura&page=N`, avec
    l'en-tête HX-Request), et ses liens sont écrits pour Alpine :
    `:href="'/pokedex/…'"` ;
  · ce qui dépend du serveur de jeu — rareté, zones — n'est montré que sous
    `x-show="server == 'kaura'"`. Kaura est le seul serveur du site ce jour-là,
    mais ce qui ne s'afficherait que pour un autre ne se relève pas.

CE QUE LE SITE DONNE, ET CE QU'IL NE DONNE PAS. Une fiche de PixelmonWorld
tient en sept lignes : nom, nom anglais, numéro, génération, rareté, types,
zones. Il n'y a ni niveaux, ni heure, ni météo, ni biome, et la RARETÉ EST
PORTÉE PAR L'ESPÈCE, pas par l'apparition — Magicarpe a la même dans toutes
ses zones à la fois. Le relevé ne peut donc pas inventer une rareté par zone :
il pose la rareté de l'espèce sur chacun de ses spawns.

Sortie : api/releves/pixelmonworld.json — un relevé, pas une base. C'est
`api/outils/importer-pixelmonworld.js` qui le verse en base.

--- Les trois choix de fond -------------------------------------------------

1. LA CLÉ EST LE NUMÉRO + LA FORME, MAIS ELLE SE RÉSOUT. Le site publie
   « Rattata d'Alola » sous l'adresse /pokedex/rattata-d-alola, mais son image
   s'appelle rattata-alola-7138c780.webp : le nom anglais de la forme y est.
   C'est ce nom, avec le numéro national, qui sert de clé, jamais le nom
   français — l'application suit PokeAPI, et un nom français se traduit mal
   dans les deux sens.

   MAIS LES DEUX ÉCRITURES NE SE SUPERPOSENT PAS TOUT À FAIT. Quarante-huit
   espèces sur 951 tombaient à côté, et le défaut se voyait à l'œil : ni sprite,
   ni fiche à ouvrir — un trou dans la grille. Deux causes, et deux remèdes :

   · LE SITE LAISSE TOMBER LA PONCTUATION. « nidoranf » pour « nidoran-f »,
     « hooh » pour « ho-oh », « tapukoko » pour « tapu-koko », « mrmime » pour
     « mr-mime ». Comparer les deux écritures débarrassées de tout ce qui n'est
     pas une lettre les réconcilie.

   · LE SITE NOMME L'ESPÈCE, L'APPLICATION NE CONNAÎT QUE SES FORMES. « deoxys »
     n'existe pas chez PokeAPI : il y a deoxys-normal, -attack, -defense,
     -speed. On retombe alors sur la forme PAR DÉFAUT — celle dont l'identifiant
     d'entrée est le numéro national lui-même, ce qui est la règle de PokeAPI et
     non une table écrite à la main.

   Les deux se combinent : « darmanitan-galar » ne vaut pas darmanitan-standard
   mais darmanitan-galar-standard, et c'est le préfixe qui le dit.

2. « ZONE 1 EAU » EST UNE SOUS-ZONE, ET ON LE DIT. Le site tient une liste
   plate de quarante-huit libellés où la zone et sa sous-zone sont collées :
   « Zone 1 », « Zone 1 Collines », « Zone 1 Eau », « Zone 1 Forêt ». Les
   séparer rend la hiérarchie que le serveur a manifestement en tête, et que
   PokéPension affiche partout ailleurs — un lieu, puis son détail.

3. « ÉVOLUTION » N'EST PAS UN LIEU. Cinq libellés sur quarante-huit ne
   désignent aucun endroit : Évolution, Fossile, Quête, Tour de Combat,
   Inconnue. Les ranger parmi les zones enverrait chercher une « Évolution »
   sur la carte. Ils gardent leur libellé et portent un genre à part, pour que
   la fiche puisse dire « il ne s'attrape pas : il s'obtient ».
"""

import html as entites
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)                       # app/
DEPOT = os.path.dirname(RACINE)                     # racine du dépôt
# Dans api/releves/ et NON dans api/donnees/ : ce dernier est ignoré par git —
# il porte les photos de chasse des joueurs. Un relevé posé là serait absent du
# dépôt sans que rien ne le dise, et il faudrait le refaire sur chaque machine.
SORTIE = os.path.join(DEPOT, 'api', 'releves', 'pixelmonworld.json')

SITE = 'https://pixelmonworld.fr'
LISTE = SITE + '/pokedex'
# Le serveur de jeu relevé : la valeur par défaut du champ caché « server » de
# la page, et celle que testent ses x-show.
SERVEUR = 'kaura'

# Cloudflare rejette un client sans User-Agent identifiable par un 403 au corps
# vide. Même cause et même remède que dans api/src/discord.js.
AGENT = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
         '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')

# Trois fils, et pas dix : on relève le site de quelqu'un d'autre, une fois par
# saison. Trois suffisent à tenir les mille pages en quelques minutes sans
# peser sur son serveur.
FILS = 3
PAUSE = 0.05

# La rareté de PixelmonWorld, et son nombre d'étoiles.
#
# Cinq paliers d'un côté, cinq étoiles de l'autre : la conversion tombe juste,
# et c'est la seule raison pour laquelle elle est écrite ici plutôt que devinée
# à l'affichage. Le nombre d'étoiles est une DONNÉE — il part en base avec le
# reste, et le jour où le serveur ajoute un palier, il se règle ici et nulle
# part ailleurs.
#
# Le filtre du site numérote ses paliers de 1 à 5 dans ce même ordre : le
# relevé le relit à chaque passage (voir comparer_raretes()), et c'est ce qui
# dit que cette table est toujours la bonne.
RARETES = [
    ('common',    'Commun',      1),
    ('uncommon',  'Peu commun',  2),
    ('rare',      'Rare',        3),
    ('epic',      'Épique',      4),
    ('legendary', 'Légendaire',  5),
]

# Le nom anglais de chaque type, rangé par identifiant PokeAPI (1 = normal).
#
# Le site n'écrit plus les types qu'en français — ses pictogrammes sont des SVG
# sans nom. Le relevé garde pourtant la clé anglaise des relevés précédents :
# le nom français mène à l'identifiant par TYPES_FR, la table de l'application
# (app/src/js/donnees.js), lue plutôt que recopiée ; celle-ci ne fait que
# l'étape suivante.
TYPES_POKEAPI = ['normal', 'fighting', 'flying', 'poison', 'ground', 'rock',
                 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric',
                 'psychic', 'ice', 'dragon', 'dark', 'fairy']

# Les libellés qui ne désignent aucun endroit. Relevés un par un sur la liste
# des zones du site, et non devinés par un motif : « Océan » et « Lac Rime »
# n'ont pas non plus la forme « Zone N », et ce sont pourtant de vrais lieux.
# Comparés sans accents : le site a écrit « Evolution », puis « Évolution ».
HORS_CARTE = {
    'Évolution':      "Il s'obtient en faisant évoluer sa pré-évolution.",
    'Fossile':        "Il s'obtient à partir d'un fossile.",
    'Quête':          "Il s'obtient au bout d'une quête.",
    'Tour de Combat': 'Il se gagne à la Tour de Combat.',
    'Inconnue':       "Le Pokédex du serveur ne dit pas où on le trouve.",
}

# « Zone 1 Eau » → zone « Zone 1 », sous-zone « Eau ».
# « Bull'o Biome Volcan » → zone « Bull'o », sous-zone « Biome Volcan ».
DECOUPES = [
    re.compile(r"^(Zone\s+\d+)\s+(.+)$"),
    re.compile(r"^(Bull'o)\s+(.+)$"),
]

# Une balise ouvrante entière. Les attributs d'Alpine contiennent des « => » —
# `zones.filter(z => z != 3)` — et un simple [^>]* s'arrêterait en plein
# milieu : on saute donc les valeurs entre guillemets d'un bloc.
BALISE = r'<%s((?:[^>"]|"[^"]*")*)>'

# Une pastille — rareté, type — et son texte. Le motif part de class="badge" et
# non d'un <span> quelconque : les types sont rangés dans un <span class="flex">
# qui, sinon, avalait la première pastille jusqu'à son </span>.
PASTILLE = r'<span\s+class="badge"((?:[^>"]|"[^"]*")*)>(.*?)</span>'


def pastilles(html):
    """Le texte des pastilles montrées pour SERVEUR, dans l'ordre."""
    return [sans_balises(t) for a, t in re.findall(PASTILLE, html or '', re.S) if visible(a)]


def lire(url, htmx=False, essais=3):
    """Une page, ou une erreur claire. Trois essais : le site a des hoquets."""
    entetes = {
        'User-Agent': AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
    }
    if htmx:
        # L'en-tête que pose le HTMX du site : la liste répond alors par le
        # seul morceau de grille demandé.
        entetes['HX-Request'] = 'true'
    demande = urllib.request.Request(url, headers=entetes)
    dernier = None
    for n in range(essais):
        try:
            with urllib.request.urlopen(demande, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except (urllib.error.URLError, OSError) as e:
            dernier = e
            time.sleep(1.5 * (n + 1))
    raise SystemExit('Page illisible : %s (%s)' % (url, dernier))


def sans_balises(texte):
    texte = re.sub(r'<[^>]+>', ' ', texte)
    return re.sub(r'\s+', ' ', entites.unescape(texte)).strip()


def sans_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def visible(attributs):
    """Ce qu'Alpine montrerait pour SERVEUR : ce qui est réservé à un autre
    serveur de jeu ne compte pas."""
    test = re.search(r'x-show="([^"]*)"', attributs)
    if not test or 'server ==' not in test.group(1):
        return True
    return ("'%s'" % SERVEUR) in test.group(1)


def cle_zone(libelle):
    """Une clé stable pour une zone, indépendante de l'orthographe du site.

    Le site a déjà changé d'écriture pour la même chose — « Evolution » est
    devenu « Évolution ». On ne se sert donc pas de ses libellés ni de ses
    identifiants comme identité : on refabrique la clé depuis le libellé, sans
    accents ni ponctuation.
    """
    nu = sans_accents(libelle).lower()
    nu = re.sub(r"[^a-z0-9]+", '-', nu).strip('-')
    return nu or 'zone'


def hors_carte(libelle):
    """La note d'un libellé qui ne désigne aucun lieu, ou None."""
    cle = cle_zone(libelle)
    for nom, note in HORS_CARTE.items():
        if cle_zone(nom) == cle:
            return note
    return None


def decouper_zone(libelle):
    """Le libellé plat du site, rendu à sa hiérarchie : zone, puis sous-zone."""
    note = hors_carte(libelle)
    if note is not None:
        return {'zone': libelle, 'sous': '', 'genre': 'hors-carte', 'note': note}
    for motif in DECOUPES:
        m = motif.match(libelle)
        if m:
            return {'zone': m.group(1), 'sous': m.group(2), 'genre': 'lieu', 'note': ''}
    return {'zone': libelle, 'sous': '', 'genre': 'lieu', 'note': ''}


def rang_zone(nom):
    """« Zone 2 » avant « Zone 10 », et les lieux nommés après les numérotées."""
    m = re.match(r'^Zone\s+(\d+)$', nom)
    if m:
        return (0, int(m.group(1)), '')
    return (1, 0, sans_accents(nom).lower())


def boutons(html, filtre):
    """Les boutons d'un filtre de la page : (valeur, libellé), dans l'ordre.

    `filtre` est le nom du tableau d'Alpine — « zones », « rarities » — et la
    valeur celle que le bouton y pousse : 3, 101, ou 'null' pour « Inconnue ».
    """
    sortie = []
    for attributs, libelle in re.findall(BALISE % 'button' + r'(.*?)</button>', html, re.S):
        m = re.search(r'%s\.includes\(([^)]*)\)' % filtre, attributs)
        if m and visible(attributs):
            sortie.append((m.group(1).strip("'"), sans_balises(libelle)))
    return sortie


def relever_zones(html):
    """La liste des zones, lue dans les boutons de filtre de la page."""
    zones = []
    vues = set()
    for _, libelle in boutons(html, 'zones'):
        if not libelle or libelle in vues:
            continue
        vues.add(libelle)
        d = decouper_zone(libelle)
        zones.append({
            'libelle': libelle,
            'cle': cle_zone(libelle),
            'zone': d['zone'],
            'sousZone': d['sous'],
            'genre': d['genre'],
            'note': d['note'],
        })
    return zones


def comparer_raretes(html):
    """Les paliers du filtre du site confrontés à RARETES : la liste des écarts.

    Vide, elle dit que les étoiles posées en base sont celles du site : le
    palier n du filtre vaut n étoiles, et porte le même nom.
    """
    attendus = {n: libelle for _, libelle, n in RARETES}
    publies = {}
    for valeur, libelle in boutons(html, 'rarities'):
        if valeur.isdigit():
            publies[int(valeur)] = libelle
    ecarts = []
    for n in sorted(set(attendus) | set(publies)):
        a, p = attendus.get(n, ''), publies.get(n, '')
        if sans_accents(a).lower() != sans_accents(p).lower():
            ecarts.append('%d : « %s » ici, « %s » sur le site' % (n, a, p))
    return publies, ecarts


def relever_liste(page):
    """Les cartes d'un morceau de liste, et s'il en vient un autre après.

    Une carte donne l'adresse de la fiche, son numéro, son nom, sa rareté et
    l'image dont le nom porte l'écriture anglaise de la forme.
    """
    html = lire('%s?server=%s&page=%d' % (LISTE, SERVEUR, page), htmx=True)
    cartes = []
    for bloc in html.split('<a :href="')[1:]:
        m = re.match(r"'(/pokedex/[^']+)'\"", bloc)
        if not m:
            continue
        bloc = bloc[:bloc.find('</a>')]
        nom = re.search(r'<h2[^>]*>(.*?)</h2>', bloc, re.S)
        numero = re.search(r'<p class="subtitle">\s*#?(\d+)', bloc)
        image = re.search(r'src="/media/pokedex/pokemon/image/([^"]+)"', bloc)
        coin = re.search(r'<p class="top-right">(.*?)</p>', bloc, re.S)
        raretes = pastilles(coin.group(1) if coin else '')
        cartes.append({
            'chemin': m.group(1),
            'numero': int(numero.group(1)) if numero else 0,
            'nomFr': sans_balises(nom.group(1)) if nom else '',
            'rarete': raretes[0] if raretes else '',
            'image': image.group(1) if image else '',
        })
    # Le bouton « plus » (#more) n'existe que s'il reste un morceau à charger :
    # c'est le seul signe de fin que le site donne.
    return cartes, 'id="more"' in html


def nom_de_forme(image):
    """« rattata-alola-7138c780.webp » → « rattata-alola » : le nom sans son
    empreinte, qui change à chaque nouvelle image."""
    m = re.match(r'^(.+?)-[0-9a-f]{8}\.[a-z]+$', image or '')
    return m.group(1) if m else ''


def relever_fiche(carte, types_fr):
    """Une fiche : sa génération, ses types, sa rareté, ses zones."""
    html = lire(SITE + carte['chemin'])

    # <p><strong>Rareté</strong><br />…</p> : l'étiquette, puis la valeur.
    champs = {}
    for etiquette, valeur in re.findall(r'<p>\s*<strong>(.*?)</strong>(.*?)</p>', html, re.S):
        cle = re.sub(r'[^a-z]', '', sans_accents(sans_balises(etiquette)).lower())
        champs.setdefault(cle, valeur)

    raretes = pastilles(champs.get('rarete'))
    noms_types = pastilles(champs.get('types') or champs.get('type'))
    types = [types_fr.get(sans_accents(t).lower(), '?' + t) for t in noms_types]
    generation = sans_balises(champs.get('generation', ''))
    index = re.search(r'\d+', sans_balises(champs.get('index', '')))

    # Les zones sont une liste, dans un <div> et non un <p>.
    zones = []
    bloc = re.search(r'<div class="span-full">\s*<strong>\s*Zone(.*?)</ul>', html, re.S)
    for attributs, texte in re.findall(BALISE % 'li' + r'(.*?)</li>', bloc.group(1) if bloc else '', re.S):
        if visible(attributs) and sans_balises(texte):
            zones.append(sans_balises(texte))

    # Le petit sprite est dans la chaîne d'évolution, sur la carte de la fiche
    # elle-même ; une espèce seule n'en a pas toujours, et garde alors l'image
    # de la liste.
    sprite = re.search(r'<a href="%s"[^>]*>\s*<article[^>]*>\s*<img src="/media/pokedex/pokemon/(sprite/[^"]+)"'
                       % re.escape(carte['chemin']), html)

    return {
        'chemin': carte['chemin'],
        'slug': carte['chemin'].rsplit('/', 1)[-1],
        'numero': int(index.group()) if index else carte['numero'],
        # Le nom de l'image, et non celui de la fiche : « rattata-alola » et
        # pas « Rattata-alola », à l'écriture des relevés précédents.
        'nomEn': nom_de_forme(carte['image']) or sans_balises(champs.get('nomanglais', '')).lower(),
        'nomFr': sans_balises(champs.get('nom', '')) or carte['nomFr'],
        'generation': int(generation) if generation.isdigit() else 0,
        'types': list(dict.fromkeys(types)),
        'rarete': raretes[0] if raretes else carte['rarete'],
        'zones': list(dict.fromkeys(zones)),
        'sprite': sprite.group(1) if sprite else ('image/' + carte['image'] if carte['image'] else ''),
        # Le nom anglais de la fiche, second recours de la résolution ; retiré
        # avant l'écriture.
        '_anglais': sans_balises(champs.get('nomanglais', '')).lower().replace(' ', '-'),
    }


# --- Résoudre un nom du site en clé de l'application --------------------------
#
# La réserve embarquée EST le référentiel de l'application : la lire ici évite
# d'écrire une table de correspondance, qui aurait dérivé à la première
# génération suivante.

def charger_entrees():
    """Les entrées de l'application : { nom: (id, numéro d'espèce) }."""
    chemin = os.path.join(RACINE, 'src', 'js', 'donnees-embarquees.js')
    with io.open(chemin, encoding='utf-8') as f:
        texte = f.read()
    marque = 'const DONNEES_EMBARQUEES = '
    i = texte.index(marque)
    reserve = json.loads(texte[i + len(marque):texte.rindex('}') + 1])
    return reserve.get('entrees', [])


def charger_types():
    """{ nom français sans accents : clé anglaise }, depuis TYPES_FR."""
    chemin = os.path.join(RACINE, 'src', 'js', 'donnees.js')
    with io.open(chemin, encoding='utf-8') as f:
        texte = f.read()
    bloc = re.search(r'const TYPES_FR = \{(.*?)\};', texte, re.S).group(1)
    return {sans_accents(nom).lower(): TYPES_POKEAPI[int(n) - 1]
            for n, nom in re.findall(r"(\d+):\s*'([^']+)'", bloc)}


def lettres(nom):
    """Le nom réduit à ses lettres et ses chiffres : « ho-oh » → « hooh »."""
    return re.sub(r'[^a-z0-9]', '', str(nom).lower())


# La région en adjectif, devant l'espèce : « paldean-tauros », « Hisuian
# Lilligant ». Trois fiches seulement l'écrivent ainsi ; les cinquante-deux
# autres formes régionales du site la mettent derrière, comme PokeAPI —
# growlithe-hisui. Sans ce retournement, les trois tombaient sur l'espèce de
# base par la forme par défaut, et écrasaient sa fiche en base.
REGIONS = {'alolan': 'alola', 'galarian': 'galar', 'hisuian': 'hisui', 'paldean': 'paldea'}


def forme_regionale(nom):
    """« paldean-tauros » → « tauros-paldea » ; tout autre nom tel quel."""
    tete, _, reste = nom.partition('-')
    return '%s-%s' % (reste, REGIONS[tete]) if tete in REGIONS and reste else nom


def resoudre(nom_site, numero, entrees, par_nom, par_lettres, par_numero):
    """La clé de l'application pour une fiche du site, ou '' si rien ne colle.

    Quatre passes, de la plus sûre à la plus large. L'ordre compte : la
    troisième rendrait darmanitan-standard pour « darmanitan-galar », qui est
    une AUTRE bestiole — le préfixe passe donc avant elle.
    """
    if nom_site in par_nom:
        return nom_site

    nu = lettres(nom_site)
    if nu in par_lettres:
        return par_lettres[nu]

    # Les formes de cette espèce, l'application n'en connaissant parfois
    # aucune sous le nom nu.
    formes = par_numero.get(numero, [])

    # Le préfixe : « darmanitan-galar » → darmanitan-galar-standard, et pas
    # darmanitan-standard. On préfère la forme par défaut quand plusieurs
    # candidates commencent pareil — « deoxys » a les quatre.
    prefixes = [e for e in formes if lettres(e['name']).startswith(nu)]
    if prefixes:
        defaut = [e for e in prefixes if e['id'] == e.get('speciesId', e['id'])]
        return (defaut or prefixes)[0]['name']

    # La forme par défaut, sans autre indice : chez PokeAPI, c'est celle dont
    # l'identifiant d'entrée vaut le numéro national.
    defaut = [e for e in formes if e['id'] == e.get('speciesId', e['id'])]
    if defaut:
        return defaut[0]['name']
    return ''


def main():
    limite = None
    if '--limite' in sys.argv:
        limite = int(sys.argv[sys.argv.index('--limite') + 1])

    print('Relevé de %s, serveur %s' % (LISTE, SERVEUR))
    premiere = lire(LISTE)
    zones = relever_zones(premiere)
    raretes_site, ecarts = comparer_raretes(premiere)
    print('  %d zones, %d paliers de rareté au filtre du site.' % (len(zones), len(raretes_site)))
    if not zones:
        raise SystemExit('Aucune zone lue : la page a encore changé.')

    # 1. Les cartes, morceau par morceau, jusqu'au dernier.
    #
    # Un morceau qui n'apporte aucune fiche neuve arrête aussi la marche : sans
    # cette garde, un site qui renverrait toujours la même page ferait tourner
    # le relevé cent fois pour rien.
    cartes = []
    vues = set()
    p = 0
    while True:
        p += 1
        lot, encore = relever_liste(p)
        neuves = [c for c in lot if c['chemin'] not in vues]
        vues.update(c['chemin'] for c in neuves)
        cartes.extend(neuves)
        print('  page %2d — %d fiches (%d)' % (p, len(neuves), len(cartes)))
        if limite and len(cartes) >= limite:
            cartes = cartes[:limite]
            break
        if not encore or not neuves:
            break
        if p >= 100:
            raise SystemExit('Plus de cent pages : la pagination du site a changé.')
        time.sleep(PAUSE)

    # 2. Les fiches, en parallèle : c'est là qu'est le gros du relevé.
    types_fr = charger_types()
    print('  %d fiches à lire…' % len(cartes))
    fiches = []
    with ThreadPoolExecutor(max_workers=FILS) as bassin:
        for i, fiche in enumerate(bassin.map(lambda c: relever_fiche(c, types_fr), cartes), 1):
            fiches.append(fiche)
            if i % 100 == 0:
                print('    %d/%d' % (i, len(cartes)))

    # 3. Les zones citées par une fiche sans être au menu : on les ajoute, pour
    #    qu'aucune apparition ne se perde à l'import.
    citees = set()
    for f in fiches:
        citees.update(f['zones'])
    inconnues = sorted(citees - {z['libelle'] for z in zones})
    for libelle in inconnues:
        d = decouper_zone(libelle)
        zones.append({'libelle': libelle, 'cle': cle_zone(libelle), 'zone': d['zone'],
                      'sousZone': d['sous'], 'genre': d['genre'], 'note': d['note']})
    zones.sort(key=lambda z: (z['genre'] == 'hors-carte', rang_zone(z['zone']),
                              sans_accents(z['sousZone']).lower()))

    # 4. Les raretés rencontrées, pour que l'import sache ce qu'il verse. Une
    #    rareté que le relevé voit sans la connaître s'affiche ici : elle vaut
    #    zéro étoile, et c'est un signal, pas un silence.
    par_libelle = {lib: (slug, lib, n) for slug, lib, n in RARETES}
    vues_raretes = sorted({f['rarete'] for f in fiches if f['rarete']})
    manquantes = [v for v in vues_raretes if v not in par_libelle]
    types_inconnus = sorted({t for f in fiches for t in f['types'] if t.startswith('?')})

    # 5. La clé de l'application, pour chaque fiche.
    #
    #    ELLE EST RÉSOLUE ICI ET NON À L'AFFICHAGE : la base garde alors des
    #    clés que l'application comprend, et ni l'import ni la page n'ont à
    #    savoir que les deux écritures diffèrent.
    entrees = charger_entrees()
    par_nom = {e['name']: e for e in entrees}
    par_lettres = {}
    par_numero = {}
    for e in entrees:
        par_lettres.setdefault(lettres(e['name']), e['name'])
        par_numero.setdefault(e.get('speciesId', e['id']), []).append(e)

    rattrapees = []
    perdues = []
    for f in fiches:
        anglais = f.pop('_anglais')
        cle = (resoudre(forme_regionale(f['nomEn']), f['numero'],
                        entrees, par_nom, par_lettres, par_numero)
               or resoudre(forme_regionale(anglais), f['numero'],
                           entrees, par_nom, par_lettres, par_numero))
        f['espece'] = cle
        if not cle:
            perdues.append(f)
        elif cle != f['nomEn']:
            rattrapees.append((f['nomEn'], cle))

    # Deux fiches sur la même clé n'en font qu'une en base, et la seconde y
    # écrase la rareté de la première : cela se dit ici.
    par_cle = {}
    for f in fiches:
        if f['espece']:
            par_cle.setdefault(f['espece'], []).append(f)
    doublons = {k: v for k, v in par_cle.items() if len(v) > 1}

    releve = {
        'genereLe': time.strftime('%Y-%m-%d'),
        'source': '%s?server=%s' % (LISTE, SERVEUR),
        'raretes': [{'cle': s, 'libelle': l, 'etoiles': n} for s, l, n in RARETES],
        'zones': zones,
        'especes': sorted(fiches, key=lambda f: (f['numero'], f['slug'])),
    }

    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with io.open(SORTIE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(releve, f, ensure_ascii=False, indent=1)
        f.write('\n')

    spawns = sum(len(f['zones']) for f in fiches)
    print()
    print('%d espèces, %d zones, %d apparitions.' % (len(fiches), len(zones), spawns))
    print("%d clés rattrapées sur l'écriture de l'application." % len(rattrapees))
    for avant, apres in rattrapees[:60]:
        # « -> » et non « → » : la console Windows est en cp1252, et la
        # flèche y lève une UnicodeEncodeError qui tue le script APRÈS qu'il
        # a écrit son fichier — on croit alors le relèvement raté.
        print('    %-22s -> %s' % (avant, apres))
    if perdues:
        # Sans clé, l'espèce entre quand même en base : le Pokédex du serveur
        # l'annonce, et la taire mentirait. Elle n'aura ni sprite local ni
        # fiche — d'où cet avertissement, qui est le seul endroit où on peut
        # encore le corriger.
        print('SANS CORRESPONDANCE (%d) : %s'
              % (len(perdues), ', '.join('%d %s' % (f['numero'], f['nomEn']) for f in perdues)))
    if doublons:
        print('MÊME CLÉ POUR PLUSIEURS FICHES (%d) : %s' % (len(doublons), ', '.join(
            '%s <- %s' % (k, ' + '.join('%s (%s)' % (f['slug'], f['rarete']) for f in v))
            for k, v in sorted(doublons.items()))))
    sans_zone = [f for f in fiches if not f['zones']]
    if sans_zone:
        print('SANS ZONE (%d) : %s' % (len(sans_zone), ', '.join(f['slug'] for f in sans_zone[:40])))
    print('Zones hors carte : %s'
          % ', '.join(z['libelle'] for z in zones if z['genre'] == 'hors-carte'))
    print('Raretés relevées : %s' % ', '.join(
        '%s %d' % (r, sum(1 for f in fiches if f['rarete'] == r)) for r in vues_raretes))
    if ecarts:
        print('LE FILTRE DU SITE NE DIT PLUS LA MÊME CHOSE QUE RARETES : %s' % ' ; '.join(ecarts))
    else:
        print('Paliers du site conformes à RARETES (1 à %d étoiles).' % len(RARETES))
    if manquantes:
        print('RARETÉS INCONNUES (zéro étoile) : %s' % ', '.join(manquantes))
    if types_inconnus:
        print('TYPES INCONNUS DE TYPES_FR : %s' % ', '.join(types_inconnus))
    print('Écrit dans %s — %.0f Ko.'
          % (os.path.relpath(SORTIE, DEPOT), os.path.getsize(SORTIE) / 1024.0))


if __name__ == '__main__':
    main()
