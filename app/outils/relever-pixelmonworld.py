# -*- coding: utf-8 -*-
"""
Relevé du Pokédex de PixelmonWorld, depuis le site du serveur.

    cd app && py outils/relever-pixelmonworld.py

PixelmonWorld est un serveur Pixelmon, et son Pokédex est la seule source qui
dise ce qu'on y croise : quelle espèce, à quelle rareté, dans quelles zones.

    https://www.pixelmonworld.fr/pokedex

Il n'a pas d'API : les pages sont rendues côté serveur, et le relevé les lit
telles qu'elles sortent. Cloudflare refuse un client sans User-Agent — la même
mésaventure que l'API Discord, et la même réponse ci-dessous.

CE QUE LE SITE DONNE, ET CE QU'IL NE DONNE PAS. Une fiche de PixelmonWorld
tient en cinq lignes : numéro, types, génération, rareté, zones. Il n'y a ni
niveaux, ni heure, ni météo, ni biome, et la RARETÉ EST PORTÉE PAR L'ESPÈCE,
pas par l'apparition — Magicarpe est « Commun » dans ses quatre zones à la
fois. Le relevé ne peut donc pas inventer une rareté par zone : il pose la
rareté de l'espèce sur chacun de ses spawns, et le panneau d'administration
sert ensuite à la corriger zone par zone. C'est exactement le partage voulu :
le relevé amorce, la main affine.

Sortie : api/releves/pixelmonworld.json — un relevé, pas une base. C'est
`api/outils/importer-pixelmonworld.js` qui le verse en base, sans jamais
écraser une saisie faite à la main.

--- Les trois choix de fond -------------------------------------------------

1. LA CLÉ EST LE NUMÉRO + LA FORME, MAIS ELLE SE RÉSOUT. Le site publie
   « 103 - Noadkoko d'Alola » sous l'adresse /pokedex/103-exeggutor-alola : le
   numéro national et le nom anglais de la forme y sont tous les deux. C'est ce
   couple qui sert de clé, jamais le nom français — l'application suit PokeAPI,
   et un nom français se traduit mal dans les deux sens.

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
   « Zone 1 », « Zone 1 Colline », « Zone 1 Eau », « Zone 1 Forêt ». Les
   séparer rend la hiérarchie que le serveur a manifestement en tête, et que
   PokéPension affiche partout ailleurs — un lieu, puis son détail.

3. « ÉVOLUTION » N'EST PAS UN LIEU. Cinq libellés sur quarante-huit ne
   désignent aucun endroit : Evolution, Sites de Fouille, Quête, Tour de
   Combat, Inconnue. Les ranger parmi les zones enverrait chercher une
   « Évolution » sur la carte. Ils gardent leur libellé et portent un genre à
   part, pour que la fiche puisse dire « il ne s'attrape pas : il s'obtient ».
"""

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

SITE = 'https://www.pixelmonworld.fr'
LISTE = SITE + '/pokedex'

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
RARETES = [
    ('common',    'Commun',      1),
    ('uncommon',  'Peu commun',  2),
    ('rare',      'Rare',        3),
    ('epic',      'Épique',      4),
    ('legendary', 'Légendaire',  5),
]

# Les libellés qui ne désignent aucun endroit. Relevés un par un sur la liste
# des zones du site, et non devinés par un motif : « Océan » et « Lac Rime »
# n'ont pas non plus la forme « Zone N », et ce sont pourtant de vrais lieux.
HORS_CARTE = {
    'Evolution':      "Il s'obtient en faisant évoluer sa pré-évolution.",
    'Sites de Fouille': 'Il sort des sites de fouille.',
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


def lire(url, essais=3):
    """Une page, ou une erreur claire. Trois essais : le site a des hoquets."""
    demande = urllib.request.Request(url, headers={
        'User-Agent': AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
    })
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
    texte = (texte.replace('&#039;', "'").replace('&amp;', '&')
                  .replace('&quot;', '"').replace('&nbsp;', ' ')
                  .replace('&lt;', '<').replace('&gt;', '>'))
    return re.sub(r'\s+', ' ', texte).strip()


def sans_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def cle_zone(libelle):
    """Une clé stable pour une zone, indépendante de l'orthographe du site.

    Le site mélange deux écritures pour la même chose — « zone-1-colline » et
    « Zone%201%20Eau » se suivent dans son propre menu. On ne se sert donc pas
    de ses adresses comme identité : on refabrique la clé depuis le libellé.
    """
    nu = sans_accents(libelle).lower()
    nu = re.sub(r"[^a-z0-9]+", '-', nu).strip('-')
    return nu or 'zone'


def decouper_zone(libelle):
    """Le libellé plat du site, rendu à sa hiérarchie : zone, puis sous-zone."""
    if libelle in HORS_CARTE:
        return {'zone': libelle, 'sous': '', 'genre': 'hors-carte',
                'note': HORS_CARTE[libelle]}
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


def relever_zones(html):
    """La liste des zones, lue dans le menu de filtres de la page."""
    zones = []
    vues = set()
    for q, libelle in re.findall(r'href=/pokedex\?([^>]*)>([^<]*)</a>', html):
        if 'zone=' not in q:
            continue
        libelle = sans_balises(libelle)
        if not libelle or libelle.startswith('Toutes'):
            continue
        if libelle in vues:
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


def relever_liste(page):
    """Les espèces d'une page de liste : leur adresse, leur numéro, leur nom."""
    html = lire('%s?page=%d' % (LISTE, page))
    sortie = []
    for href, bloc in re.findall(
            r'<a class="[^"]*" href="(/pokedex/[^"]+)">(.*?)</a>', html, re.S):
        nom = sans_balises(re.search(r'<p class="ck[^"]*">(.*?)</p>', bloc, re.S).group(1)) \
            if re.search(r'<p class="ck[^"]*">(.*?)</p>', bloc, re.S) else ''
        m = re.match(r'^(\d+)\s*-\s*(.+)$', nom)
        sortie.append({
            'chemin': href,
            'numero': int(m.group(1)) if m else 0,
            'nomFr': m.group(2).strip() if m else nom,
        })
    total = re.search(r'Total:\s*(\d+)', html)
    return sortie, int(total.group(1)) if total else 0


def relever_fiche(chemin):
    """Une fiche : sa génération, ses types, sa rareté, ses zones."""
    html = lire(SITE + chemin)
    bloc = re.search(r'<ul>(.*?)</ul>', html, re.S)
    corps = bloc.group(1) if bloc else ''

    def champ(nom):
        m = re.search(r'<strong>%s:</strong>(.*?)</li>' % nom, corps, re.S)
        return m.group(1) if m else ''

    types = re.findall(r'/images/pokedex/types/svg/([a-z]+)\.svg', champ('Type\\(s\\)'))
    rarete = sans_balises(champ('Raret&eacute;') or champ('Rareté'))
    generation = sans_balises(champ('G&eacute;n&eacute;ration') or champ('Génération'))
    zones = [sans_balises(z) for z in
             re.findall(r'<span class="dB cQ[^"]*">(.*?)</span>', champ('Zone\\(s\\)'), re.S)]
    sprite = re.search(r'data-src="/images/pokedex/still/([^"]+)"', html)
    nom = re.search(r'<p class="bk dE">(.*?)</p>', html, re.S)

    # Le nom anglais est dans l'adresse — « 103-exeggutor-alola ». Il porte la
    # FORME, ce que le nom français ne fait pas toujours, et c'est lui qui
    # servira à retrouver l'espèce dans la réserve de l'application.
    slug = chemin.rsplit('/', 1)[-1]
    m = re.match(r'^(\d+)-(.+)$', slug)

    return {
        'chemin': chemin,
        'slug': slug,
        'numero': int(m.group(1)) if m else 0,
        'nomEn': m.group(2) if m else slug,
        'nomFr': sans_balises(nom.group(1)) if nom else '',
        'generation': int(generation) if generation.isdigit() else 0,
        'types': list(dict.fromkeys(types)),
        'rarete': rarete,
        'zones': [z for z in zones if z],
        'sprite': sprite.group(1) if sprite else '',
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


def lettres(nom):
    """Le nom réduit à ses lettres et ses chiffres : « ho-oh » → « hooh »."""
    return re.sub(r'[^a-z0-9]', '', str(nom).lower())


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

    print('Relevé de %s' % LISTE)
    premiere = lire(LISTE)
    zones = relever_zones(premiere)
    total = int(re.search(r'Total:\s*(\d+)', premiere).group(1))
    print('  %d espèces annoncées, %d zones.' % (total, len(zones)))

    # 1. Les adresses, page par page.
    #
    # ON MARCHE JUSQU'À LA PAGE VIDE, sans faire confiance au pied de page. Sa
    # pagination ne publie que la page suivante — « Page 1 / 32 » est écrit en
    # toutes lettres, mais les liens ne vont pas au-delà de 2. En déduire le
    # nombre de pages aurait relevé soixante espèces sur neuf cent cinquante,
    # et le relevé aurait eu l'air d'avoir réussi.
    especes = []
    p = 0
    while True:
        p += 1
        lot, _ = relever_liste(p)
        if not lot:
            break
        especes.extend(lot)
        print('  page %2d — %d espèces (%d)' % (p, len(lot), len(especes)))
        if limite and len(especes) >= limite:
            especes = especes[:limite]
            break
        if len(especes) >= total:
            break
        time.sleep(PAUSE)

    # 2. Les fiches, en parallèle : c'est là qu'est le gros du relevé.
    print('  %d fiches à lire…' % len(especes))
    fiches = []
    with ThreadPoolExecutor(max_workers=FILS) as bassin:
        for i, fiche in enumerate(bassin.map(
                lambda e: relever_fiche(e['chemin']), especes), 1):
            fiches.append(fiche)
            if i % 100 == 0:
                print('    %d/%d' % (i, len(especes)))

    # 3. Les zones effectivement citées par une fiche. Le menu du site en
    #    annonce quarante-huit ; si une n'accueille personne, elle n'entre pas
    #    en base — une zone vide se crée à la main, pas par accident.
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
    vues = sorted({f['rarete'] for f in fiches if f['rarete']})
    manquantes = [v for v in vues if v not in par_libelle]

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
        cle = resoudre(f['nomEn'], f['numero'], entrees, par_nom, par_lettres, par_numero)
        f['espece'] = cle
        if not cle:
            perdues.append(f)
        elif cle != f['nomEn']:
            rattrapees.append((f['nomEn'], cle))

    releve = {
        'genereLe': time.strftime('%Y-%m-%d'),
        'source': LISTE,
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
    print('Zones hors carte : %s'
          % ', '.join(z['libelle'] for z in zones if z['genre'] == 'hors-carte'))
    if manquantes:
        print('RARETÉS INCONNUES (zéro étoile) : %s' % ', '.join(manquantes))
    print('Écrit dans %s — %.0f Ko.'
          % (os.path.relpath(SORTIE, DEPOT), os.path.getsize(SORTIE) / 1024.0))


if __name__ == '__main__':
    main()
