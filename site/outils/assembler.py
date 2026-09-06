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
sens que sur le web, et le bandeau qui dit ou vivent les donnees.

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
ICONES = {"32.png": "32x32.png", "128.png": "128x128.png",
          "256.png": "128x128@2x.png", "512.png": "icon.png"}


def coquille(html: str) -> list:
    """Ce qu'il faut avoir en cache pour que l'application s'ouvre sans reseau.

    La liste se LIT dans la page qu'on vient d'ecrire, elle ne se tient pas a
    la main : un script ajoute a index.html doit entrer dans la coquille sans
    que personne n'ait a y penser. Une liste manuelle aurait derive des le
    premier ajout — c'est deja arrive a la liste des menus deroulants.
    """
    fichiers = ["./", "./index.html", "./manifeste.webmanifest"]

    for chemin in re.findall(r'<script src="([^"?]+)', html):
        if any(chemin.endswith(n) for n in A_LA_DEMANDE):
            continue
        fichiers.append("./" + chemin)
    for chemin in re.findall(r'<link[^>]+href="([^"?]+\.css)', html):
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


def poser_pwa(html: str) -> str:
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
    print("  %-10s icones/ (%d)" % ("+", len(list(cible.iterdir()))))

    # 2. Le manifeste.
    m = SOURCE / "manifeste.webmanifest"
    if not m.is_file():
        print("Manquant : site/source/manifeste.webmanifest")
        return html
    shutil.copyfile(m, PUBLIC / "manifeste.webmanifest")

    # 3. Le service worker, sa coquille et sa version.
    liste = coquille(html)
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
        '<link rel="manifest" href="manifeste.webmanifest">\n'
        '<meta name="theme-color" content="#b5211f">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-title" content="PokéPension">\n'
        '<link rel="apple-touch-icon" href="icones/256.png">\n'
    )
    html = html.replace("</head>", tete + "</head>", 1)

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
    html = html.replace("</body>", inscription + "</body>", 1)
    return html


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
    injection = (
        '<script>window.POKEPENSION_API = %s;</script>' % json.dumps(api)
        + chr(10)
        + '<script src="js/pont-api.js"></script>'
        + chr(10))
    html = html.replace(ancre, injection + ancre, 1)
    print("  %-10s API visee : %s" % ("=", api))

    # 2. La feuille du site en DERNIER, pour qu'elle l'emporte a specificite
    #    egale sur celles de l'application.
    html = html.replace("</head>", '<link rel="stylesheet" href="css/site.css">\n</head>', 1)

    # 3. Le bandeau, juste apres <body>. Il dit ou vivent les donnees, et ce
    #    n'est pas un detail : sans lui, on croit sa collection sauvegardee
    #    quelque part alors qu'elle tient dans un localStorage.
    # Le bandeau disait  aucun compte a creer, tout reste dans ce navigateur .
    # C'etait vrai du pont localStorage ; ca ne l'est plus. Le laisser serait
    # mentir sur ce qui part au serveur, ce qu'aucun bandeau n'a le droit de
    # faire.
    bandeau = (
        '<div class="site-bandeau" role="status">'
        '<b>Version web — même compte, mêmes données que '
        "l'application.</b> Connecte-toi avec Discord : tu retrouves tes "
        "aventures, tes amis, tes échanges et tes messages. Seul l'overlay "
        "OBS manque à l'appel — il demande une écoute locale, ce "
        "qu'un navigateur ne sait pas faire."
        '</div>'
    )
    # Mesure : body est en display:flex, flex-direction:row, pour centrer le
    # boitier. Un frere pose la devient un second element de la rangee — le
    # bandeau s'y retrouvait large de 80 px et haut de 784, colle a gauche.
    # .dex, lui, est une colonne : le bandeau y prend toute la largeur.
    ancre_dex = '<div class="dex">'
    if ancre_dex not in html:
        print("Le boitier a change de classe dans index.html : %s" % ancre_dex)
        return 1
    html = html.replace(ancre_dex, ancre_dex + "\n" + bandeau, 1)

    html = horodater(html, PUBLIC)

    # 4. De quoi s'installer et s'ouvrir hors ligne. Voir poser_pwa().
    html = poser_pwa(html)

    (PUBLIC / "index.html").write_text(html, encoding="utf-8")

    print()
    print("public/ bati en %.1f s — %.1f Mo, index.html compris."
          % (time.time() - depart, poids / 1048576))
    print("Pour l'ouvrir :  py outils/servir.py")
    return 0


if __name__ == "__main__":
    sys.exit(batir())
