# -*- coding: utf-8 -*-
"""Batit site/public/ depuis app/src/ et site/source/.

    cd site && py outils/assembler.py

UNE SEULE SOURCE, ET C'EST app/src. Le frontend de PokePension est deja du web
ordinaire : sur ses trente-sept scripts, cinq seulement nomment __TAURI__, et
trois se taisent proprement s'il manque. Le recopier a la main dans site/ en
ferait un second client a maintenir, et deux clients divergent toujours — le
jour ou l'un gagne un onglet, l'autre l'ignore et personne ne le remarque avant
des semaines.

On assemble donc, on ne duplique pas. Ce que site/source ajoute tient en trois
fichiers : le pont qui remplace Tauri, une feuille de style pour ce qui n'a de
sens que sur le web.

public/ EST JETABLE. Il est dans le .gitignore, se refait en une commande, et
ne doit jamais etre modifie a la main : la prochaine execution ecraserait tout.
C'est pour cette raison qu'on l'efface au debut plutot que de le mettre a jour
— un fichier supprime de app/src doit disparaitre d'ici, et une copie
incrementale l'y laisserait pour toujours.
"""
import json
import os
import pathlib
import re
import stat
import shutil
import sys
import time

ICI = pathlib.Path(__file__).resolve().parent.parent
SRC = ICI.parent / "app" / "src"
SOURCE = ICI / "source"
PUBLIC = ICI / "public"

# Ce qu'on emporte de l'application. Sprites/ vient aussi : il est vide, mais
# c'est un point d'extension — un .png depose la passe avant les sources en
# ligne, et le site doit offrir la meme possibilite.
DOSSIERS = ["css", "js", "logos", "polices", "types", "Sprites"]


def nettoyer(dossier: pathlib.Path) -> bool:
    """Effacer public/, meme si OneDrive tient un fichier une seconde de trop.

    Le dossier est sous OneDrive, qui le synchronise en tache de fond : une
    suppression peut echouer sur un fichier verrouille ou passe en lecture
    seule. On retire l'attribut et on retente, plutot que d'abandonner un
    assemblage pour un dossier vide de deux .gitkeep.
    """
    if not dossier.exists():
        return True

    def reessayer(fonction, chemin, _exc):
        try:
            os.chmod(chemin, stat.S_IWRITE)
            fonction(chemin)
        except OSError:
            pass                               # on repassera au tour suivant

    for essai in range(4):
        try:
            shutil.rmtree(dossier, onexc=reessayer)
        except TypeError:
            shutil.rmtree(dossier, onerror=lambda f, c, e: reessayer(f, c, e))
        except OSError:
            pass
        if not dossier.exists():
            return True
        time.sleep(0.4 * (essai + 1))

    print("Impossible d'effacer %s" % dossier)
    print("Un programme le tient ouvert — souvent l'explorateur ou OneDrive.")
    print("Ferme-le et relance, ou supprime le dossier a la main.")
    return False


def horodater(html: str, racine: pathlib.Path) -> str:
    """Ajouter ?v=<date du fichier> a chaque script et feuille de style.

    Non pas pour contourner un cache trop zele, mais parce que le contraire est
    pire : un navigateur qui garde l'ancien js apres un assemblage laisse croire
    que la modification n'a pas pris. On horodate par FICHIER et non d'un cachet
    global, pour ne refaire descendre que ce qui a bouge — les huit megaoctets
    de js ne doivent pas repartir a chaque retouche de css.
    """
    def marque(chemin: str) -> str:
        f = racine / chemin
        try:
            return "%s?v=%d" % (chemin, int(f.stat().st_mtime))
        except OSError:
            return chemin                      # absent : on laisse tel quel

    html = re.sub(r'(<script src=")([^"?]+\.js)"',
                  lambda m: m.group(1) + marque(m.group(2)) + '"', html)
    html = re.sub(r'(<link[^>]+href=")([^"?]+\.css)"',
                  lambda m: m.group(1) + marque(m.group(2)) + '"', html)
    return html


# Les quatre reserves qui se chargent A LA DEMANDE. Elles pesent 5,3 Mo a elles
# seules : les precharger triplerait l'installation pour des panneaux qu'on
# n'ouvre pas toujours — c'est exactement le raisonnement qui les avait sorties
# du demarrage. Le service worker les prend en cache a leur premier usage.
A_LA_DEMANDE = ("donnees-lieux.js", "donnees-attaques.js",
                "donnees-descriptions.js", "donnees-cobblemon.js")

# Les icones de l'application Tauri font aussi celles du site : c'est le meme
# produit, et en tenir deux jeux les ferait diverger a la premiere retouche.
# La largeur des vignettes de la page d'accueil. 300 pour 150 affiches :
# les ecrans a deux pixels par point restent nets.
LARGEUR_VIGNETTE = 300

ICONES = {"32.png": "32x32.png", "128.png": "128x128.png",
          "256.png": "128x128@2x.png", "512.png": "icon.png"}

# LE .ico VA A LA RACINE, ET PAS DANS icones/. Les navigateurs demandent
# « /favicon.ico » d'eux-memes, sans lire le HTML, des qu'ils ouvrent un
# onglet : sans ce fichier-la, chaque visite commence par un 404 dans le
# journal du serveur.
ICONE_RACINE = ("favicon.ico", "icon.ico")

# Les liens d'icone, seuls — sans manifeste ni service worker. La page de
# partage les veut ; elle ne veut pas installer une application a quelqu'un
# qui a juste clique sur un lien.
ICONES_TETE = (
    '<link rel="icon" href="/favicon.ico" sizes="any">\n'
    '<link rel="icon" type="image/png" href="/icones/32.png" sizes="32x32">\n'
    '<meta name="theme-color" content="#b5211f">\n'
)


def coquille(html: str, accueil: str = "") -> list:
    """Ce qu'il faut avoir en cache pour que l'application s'ouvre sans reseau.

    La liste se LIT dans la page qu'on vient d'ecrire, elle ne se tient pas a
    la main : un script ajoute a index.html doit entrer dans la coquille sans
    que personne n'ait a y penser. Une liste manuelle aurait derive des le
    premier ajout — c'est deja arrive a la liste des menus deroulants.
    """
    # LES DEUX ADRESSES DE LA PAGE D'ACCUEIL, et les deux du Pokedex.
    # « ./dex » est ce que porte le lien ; « ./dex.html » est le fichier que le
    # serveur rend derriere. Le service worker met en cache par ADRESSE : ne
    # garder que l'une des deux laisse l'autre hors ligne sur un ecran de
    # dinosaure.
    fichiers = ["./", "./index.html", "./dex", "./dex.html",
                "./" + ICONE_RACINE[0],
                "./manifeste.webmanifest"]

    for page in (html, accueil):
        if not page:
            continue
        for chemin in re.findall(r'<script src="([^"?]+)', page):
            if any(chemin.endswith(n) for n in A_LA_DEMANDE):
                continue
            fichiers.append("./" + chemin)
        for chemin in re.findall(r'<link[^>]+href="([^"?]+\.css)', page):
            fichiers.append("./" + chemin)

    # Les polices, les bannieres et les logos de type : sans eux l'application
    # s'ouvre hors ligne mais sans son allure, ce qui donne l'impression d'un
    # chargement rate plutot que d'un mode hors ligne.
    for dossier in ("polices", "types", "logos", "icones"):
        d = PUBLIC / dossier
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                fichiers.append("./%s/%s" % (dossier, f.name))

    # Sans doublon, et dans un ordre stable : la version se calcule dessus.
    vus, sortie = set(), []
    for f in fichiers:
        if f not in vus:
            vus.add(f)
            sortie.append(f)
    return sortie


def vignettes_jeux() -> int:
    """Les logos des jeux, en petit, pour la page d'accueil.

    LES ORIGINAUX FONT 698 PIXELS DE LARGE ET 4,7 Mo A EUX VINGT-QUATRE.
    L'application les affiche un a la fois, en tete d'un Pokedex ouvert :
    ce poids ne se voit pas. La page d'accueil, elle, les montre TOUS, et
    servir quatre megaoctets et demi a quelqu'un qui decouvre le site
    serait lui faire payer la visite au prix de l'application.

    On en pose donc une copie a 300 px, en WebP. Mesure : de 4,7 Mo a
    environ 400 Ko, sans difference visible a la taille d'affichage.

    SANS PILLOW, ON NE CASSE PAS L'ASSEMBLAGE : la page retombe sur les
    originaux, qui sont deja copies dans logos/. Elle sera lourde, elle ne
    sera pas absente — et le message dit quoi installer.
    """
    origine = PUBLIC / "logos"
    if not origine.is_dir():
        return 0
    try:
        from PIL import Image
    except ImportError:
        print("  %-10s vignettes : Pillow absent, la page d'accueil servira "
              "les logos en pleine taille (py -m pip install Pillow)" % "!")
        return 0

    cible = PUBLIC / "vignettes"
    cible.mkdir(exist_ok=True)
    n = 0
    for f in sorted(origine.glob("*.png")):
        try:
            im = Image.open(f).convert("RGBA")
            ratio = LARGEUR_VIGNETTE / im.width
            if ratio < 1:
                im = im.resize((LARGEUR_VIGNETTE, max(1, round(im.height * ratio))),
                               Image.LANCZOS)
            im.save(cible / (f.stem + ".webp"), "WEBP", quality=82, method=5)
            n += 1
        except OSError:
            continue          # un fichier illisible ne fait pas tomber le reste
    poids = sum(x.stat().st_size for x in cible.iterdir())
    print("  %-10s vignettes/ (%d logos, %.0f Ko au lieu de %.0f)"
          % ("+", n, poids / 1024,
             sum(x.stat().st_size for x in origine.glob("*.png")) / 1024))
    return n


def poser_pwa(html: str, accueil: str) -> tuple:
    """Le manifeste, les icones, le service worker, et son inscription.

    Tout est ECRIT ICI plutot que dans app/src/index.html : une application de
    bureau n'a ni manifeste ni service worker, et lui en poser un ne ferait que
    du bruit dans sa console. C'est exactement la frontiere que site/source
    existe pour tenir.
    """
    # 1. Les icones, reprises de celles de Tauri.
    cible = PUBLIC / "icones"
    cible.mkdir(exist_ok=True)
    origine = SRC.parent / "src-tauri" / "icons"
    for nom, source in ICONES.items():
        f = origine / source
        if f.is_file():
            shutil.copyfile(f, cible / nom)
    f = origine / ICONE_RACINE[1]
    if f.is_file():
        shutil.copyfile(f, PUBLIC / ICONE_RACINE[0])
    print("  %-10s icones/ (%d) + %s" % ("+", len(list(cible.iterdir())),
                                         ICONE_RACINE[0]))

    # 2. Le manifeste.
    m = SOURCE / "manifeste.webmanifest"
    if not m.is_file():
        print("Manquant : site/source/manifeste.webmanifest")
        return html, accueil
    shutil.copyfile(m, PUBLIC / "manifeste.webmanifest")

    # 3. Le service worker, sa coquille et sa version.
    liste = coquille(html, accueil)
    # La version est celle des FICHIERS, pas un numero tenu a la main : un
    # numero s'oublie, et un cache qu'on oublie de purger sert du code mort en
    # croyant bien faire.
    recent = 0
    for chemin in liste:
        f = PUBLIC / chemin[2:]
        try:
            recent = max(recent, int(f.stat().st_mtime))
        except OSError:
            pass
    version = "%d-%d" % (recent, len(liste))

    gabarit = (SOURCE / "sw.js").read_text(encoding="utf-8")
    gabarit = (gabarit.replace("__VERSION__", version)
                      .replace("__COQUILLE__", json.dumps(liste, ensure_ascii=False)))
    # A LA RACINE, et non dans js/ : un service worker ne controle que les
    # adresses situees SOUS la sienne. Depose dans js/, il ne verrait ni
    # index.html ni les feuilles de style, et ne servirait donc a rien.
    (PUBLIC / "sw.js").write_text(gabarit, encoding="utf-8")
    print("  %-10s sw.js (%d fichiers en coquille, version %s)" % ("+", len(liste), version))

    # 4. Les balises, et l'inscription.
    tete = (
        # L'ICONE DU LOGICIEL DEVIENT CELLE DU SITE. C'est la meme image
        # que celle de la fenetre et du raccourci de bureau : un onglet,
        # une tuile d'ecran d'accueil et une application qui se
        # reconnaissent entre eux valent mieux que trois dessins.
        '<link rel="icon" href="favicon.ico" sizes="any">\n'
        '<link rel="icon" type="image/png" href="icones/32.png" sizes="32x32">\n'
        '<link rel="icon" type="image/png" href="icones/128.png" sizes="128x128">\n'
        '<link rel="manifest" href="manifeste.webmanifest">\n'
        '<meta name="theme-color" content="#b5211f">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-title" content="PokéPension">\n'
        '<link rel="apple-touch-icon" href="icones/256.png">\n'
    )
    # SUR LES DEUX PAGES. Le manifeste et le service worker valent pour le
    # site entier : quelqu'un qui arrive sur l'accueil et l'installe depuis la
    # doit obtenir la meme application que depuis le Pokedex.
    html = html.replace("</head>", tete + "</head>", 1)
    accueil = accueil.replace("</head>", tete + "</head>", 1)

    inscription = (
        "\n<script>\n"
        "// Le service worker : l'application s'ouvre alors sans reseau, et\n"
        "// s'installe sur l'ecran d'accueil. Il ne s'inscrit qu'en HTTP(S) —\n"
        "// un fichier ouvert directement n'y a pas droit, et le tenter\n"
        "// remplirait la console d'une erreur sans consequence.\n"
        "if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){\n"
        "  window.addEventListener('load', function(){\n"
        "    navigator.serviceWorker.register('sw.js').catch(function(e){\n"
        "      console.warn('Service worker refuse :', e);\n"
        "    });\n"
        "  });\n"
        "}\n"
        "</script>\n"
    )
    # LA BARRE DU BAS, SUR LA PAGE DU POKEDEX SEULEMENT. Elle se construit a
    # partir des onglets de l'application : elle se charge donc apres eux, et
    # nulle part ailleurs — l'accueil et la page de partage n'ont pas de
    # navigation a reprendre.
    html = html.replace("</body>",
                        '<script src="js/barre-mobile.js"></script>' + chr(10)
                        + "</body>", 1)
    html = html.replace("</body>", inscription + "</body>", 1)
    accueil = accueil.replace("</body>", inscription + "</body>", 1)
    return html, accueil


def batir() -> int:
    if not SRC.is_dir():
        print("Introuvable : %s" % SRC)
        print("L'outil s'attend a etre lance depuis le depot, site/ a cote de app/.")
        return 1

    depart = time.time()

    # On efface d'abord. Voir l'en-tete : une copie incrementale garderait a
    # jamais les fichiers retires de app/src.
    if not nettoyer(PUBLIC):
        return 1
    PUBLIC.mkdir(parents=True)

    poids = 0
    for nom in DOSSIERS:
        origine = SRC / nom
        if not origine.is_dir():
            print("  (absent, ignore : %s)" % nom)
            continue
        cible = PUBLIC / nom
        shutil.copytree(origine, cible)
        n = sum(1 for f in cible.rglob("*") if f.is_file())
        o = sum(f.stat().st_size for f in cible.rglob("*") if f.is_file())
        poids += o
        print("  %-10s %4d fichier(s)  %7.1f Ko" % (nom, n, o / 1024))

    # Le pont et la feuille du site rejoignent les dossiers de l'application :
    # les chemins relatifs de index.html marchent alors sans exception.
    # essai.html vit A LA RACINE et non dans un dossier : c'est une page a
    # part, pas un morceau de l'application. Elle sert a poser un jeu d'essai
    # dans le localStorage — sans collection, la moitie des ecrans n'affichent
    # que leur etat vide, et on ne verifie alors que des messages
    # d'indisponibilite.
    for source, dest in [("pont-api.js", PUBLIC / "js" / "pont-api.js"),
                         ("site.css", PUBLIC / "css" / "site.css"),
                         ("accueil-site.css", PUBLIC / "css" / "accueil-site.css"),
                         ("partage-site.css", PUBLIC / "css" / "partage-site.css"),
                         ("partage-site.js", PUBLIC / "js" / "partage-site.js"),
                         ("barre-mobile.js", PUBLIC / "js" / "barre-mobile.js"),
                         ("essai.html", PUBLIC / "essai.html")]:
        f = SOURCE / source
        if not f.is_file():
            print("Manquant : site/source/%s" % source)
            return 1
        shutil.copyfile(f, dest)
        print("  %-10s %s" % ("+", dest.relative_to(PUBLIC)))

    html = (SRC / "index.html").read_text(encoding="utf-8")

    # 1. Le pont AVANT tout le reste. compte.js cherche window.__TAURI__ des son
    #    execution et arrete l'application s'il manque : il doit deja etre la.
    ancre = '<script src="js/donnees.js">'
    if ancre not in html:
        print("L'ancre des scripts a change dans index.html : %s" % ancre)
        return 1
    # L'ADRESSE DE L'API, POSEE A LA CONSTRUCTION. Le site local et le site de
    # production ne parlent pas au meme serveur, et la deduire de
    # window.location serait faux dans les deux cas : le site local tourne sur
    # 8130 et l'API sur 8787, la production sur deux sous-domaines.
    api = os.environ.get("POKEPENSION_API", "http://127.0.0.1:8787").rstrip("/")
    balise_api = '<script>window.POKEPENSION_API = %s;</script>' % json.dumps(api)
    injection = balise_api + chr(10) + '<script src="js/pont-api.js"></script>' + chr(10)
    html = html.replace(ancre, injection + ancre, 1)
    print("  %-10s API visee : %s" % ("=", api))

    # 2. La feuille du site en DERNIER, pour qu'elle l'emporte a specificite
    #    egale sur celles de l'application.
    html = html.replace("</head>", '<link rel="stylesheet" href="css/site.css">\n</head>', 1)

    # 3. LE BANDEAU EST PARTI, et sa raison avec lui. Il annoncait « aucun
    #    compte a creer, tout reste dans ce navigateur » — vrai du pont
    #    localStorage, faux depuis que le site a de vrais comptes. Il avait
    #    ete reecrit pour dire « meme compte, memes donnees », ce que la page
    #    d'accueil dit desormais mieux et une seule fois, au lieu de le
    #    repeter en tete de chaque visite a quelqu'un qui le sait deja.

    html = horodater(html, PUBLIC)

    # 4. LA PAGE D'ACCUEIL DU SITE. Elle prend l'adresse racine ; l'application,
    #    elle, descend sur dex.html. Un visiteur arrive donc sur une page qui
    #    dit ce que c'est, et entre dans le Pokedex quand il le decide — au
    #    lieu de recevoir treize megaoctets et une modale de connexion avant
    #    d'avoir lu une ligne.
    #
    #    L'application de bureau n'a pas de page d'accueil et n'en veut pas :
    #    elle S'OUVRE sur le Pokedex, on l'a lancee pour ca. C'est pourquoi
    #    cette page vit dans site/source et non dans app/src.
    vignettes_jeux()

    f_accueil = SOURCE / "accueil.html"
    if not f_accueil.is_file():
        print("Manquant : site/source/accueil.html")
        return 1
    accueil = f_accueil.read_text(encoding="utf-8")
    ancre_pont = '<script src="js/pont-api.js"></script>'
    if ancre_pont not in accueil:
        print("Le pont a change d'ancre dans accueil.html : %s" % ancre_pont)
        return 1
    # Meme adresse d'API que l'application : la page d'accueil ouvre une vraie
    # session, avec le vrai pont, et non une connexion ecrite a part.
    accueil = accueil.replace(ancre_pont, balise_api + chr(10) + ancre_pont, 1)
    accueil = horodater(accueil, PUBLIC)

    # 5. De quoi s'installer et s'ouvrir hors ligne. Voir poser_pwa().
    html, accueil = poser_pwa(html, accueil)

    # LA PAGE D'UN LIEN DE PARTAGE. Elle n'inscrit PAS le service worker :
    # c'est une page pour quelqu'un de passage, qui a cliqué sur un lien reçu
    # dans un salon. Lui installer une application hors ligne au passage serait
    # prendre une décision à sa place. Elle reçoit l'adresse de l'API et
    # l'icône, rien de plus.
    f_partage = SOURCE / "partage.html"
    if not f_partage.is_file():
        print("Manquant : site/source/partage.html")
        return 1
    partage = f_partage.read_text(encoding="utf-8")
    ancre_p = '<script src="/js/donnees.js"></script>'
    if ancre_p not in partage:
        print("L'ancre des donnees a change dans partage.html : %s" % ancre_p)
        return 1
    partage = partage.replace(ancre_p, balise_api + chr(10) + ancre_p, 1)
    partage = partage.replace("</head>", ICONES_TETE + "</head>", 1)
    partage = horodater(partage, PUBLIC)
    (PUBLIC / "partage.html").write_text(partage, encoding="utf-8")

    (PUBLIC / "dex.html").write_text(html, encoding="utf-8")
    (PUBLIC / "index.html").write_text(accueil, encoding="utf-8")
    print("  %-10s index.html  +  dex.html  +  partage.html" % "+")

    print()
    print("public/ bati en %.1f s — %.1f Mo, les deux pages comprises."
          % (time.time() - depart, poids / 1048576))
    print("Pour l'ouvrir :  py outils/servir.py")
    return 0


if __name__ == "__main__":
    sys.exit(batir())
