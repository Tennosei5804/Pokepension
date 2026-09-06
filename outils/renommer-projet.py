# -*- coding: utf-8 -*-
"""PokeArchive -> PokePension : renomme le projet, sans casser l'existant.

    py outils/renommer-projet.py --etat    ce qui changerait, sans ecrire
    py outils/renommer-projet.py           applique

CE QUI EST RENOMME
  Les noms affiches, les identifiants techniques, la variable d'API, le
  nom de la caisse Rust, celui du paquet npm.

CE QUI NE L'EST PAS, ET POURQUOI
  1. « fr.tennosei.pokearchive », l'identifiant Tauri. Le systeme s'en
     sert pour reconnaitre l'application : le changer en ferait une
     AUTRE aux yeux de Windows et de macOS. Les installations existantes
     cesseraient de se mettre a jour, et l'application perdrait son
     dossier de donnees. Il ne s'affiche nulle part.

  2. Les ~150 cles de localStorage « pokearchive-... » : le jeton de
     session, les couleurs, la langue des noms, le volume des cris, les
     filtres ouverts. Les renommer DECONNECTE tout le monde et remet
     chaque reglage a zero. Elles ne s'affichent nulle part non plus.

  3. Le prefixe « pa_ » des tables. Douze tables a renommer pour rien
     que personne ne verra.

  Ces trois-la sont des identifiants internes : leur valeur ne tient
  qu'a leur stabilite. Un nom de produit change ; une cle, non.
"""
import argparse
import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Les dossiers qu'on ne traverse pas : dependances, artefacts de
# compilation, et le tas de donnees engendrees du site.
IGNORES = {".git", "node_modules", "target", "__pycache__", "gen", "public"}
EXTENSIONS = {".js", ".json", ".rs", ".toml", ".md", ".py", ".html",
              ".css", ".yml", ".yaml", ".conf", ".sh", ".txt"}

# Ce qu'on protege, dans l'ordre : chaque motif est mis de cote avant les
# remplacements et remis apres. C'est plus sur qu'une regle negative, qui
# aurait rate un cas et l'aurait su trop tard.
PROTEGES = [
    # 1. l'identifiant Tauri, sous toutes ses ecritures
    re.compile(r"fr\.tennosei\.pokearchive"),
    # 2. les cles de stockage : « pokearchive-mot » entre guillemets
    re.compile(r"""(['"])pokearchive-[a-z0-9-]+\1"""),
    # 3. le prefixe des tables
    re.compile(r"\bpa_[a-z]+\b"),
]

# Les remplacements, du plus specifique au plus general.
REGLES = [
    ("POKEARCHIVE_API", "POKEPENSION_API"),
    ("pokearchive_lib", "pokepension_lib"),
    ("pokearchive-api", "pokepension-api"),
    ("PokéArchive",     "PokéPension"),
    ("PokeArchive",     "PokePension"),
    ("POKEARCHIVE",     "POKEPENSION"),
    ("pokearchive",     "pokepension"),
]


def transformer(texte):
    """Applique les regles en laissant intacts les motifs proteges."""
    coffre = []

    def ranger(m):
        coffre.append(m.group(0))
        return "\x00%d\x00" % (len(coffre) - 1)

    for motif in PROTEGES:
        texte = motif.sub(ranger, texte)

    for avant, apres in REGLES:
        texte = texte.replace(avant, apres)

    for i, garde in enumerate(coffre):
        texte = texte.replace("\x00%d\x00" % i, garde)
    return texte


def fichiers():
    # Ce script se decrit lui-meme en citant l ancien nom : se renommer
    # rendrait sa propre explication incomprehensible.
    moi = os.path.abspath(__file__)
    for dossier, sous, noms in os.walk(RACINE):
        sous[:] = [d for d in sous if d not in IGNORES]
        for n in noms:
            c = os.path.join(dossier, n)
            if os.path.abspath(c) == moi:
                continue
            if os.path.splitext(n)[1].lower() in EXTENSIONS:
                yield c


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--etat", action="store_true",
                    help="montre ce qui changerait sans rien ecrire")
    args = ap.parse_args()

    touches, total, protegees = 0, 0, 0
    for chemin in fichiers():
        try:
            avant = io.open(chemin, encoding="utf-8").read()
        except (UnicodeDecodeError, PermissionError):
            continue
        if "okearchive" not in avant and "OKEARCHIVE" not in avant:
            continue

        protegees += sum(len(m.findall(avant)) for m in PROTEGES)
        apres = transformer(avant)
        if apres == avant:
            continue

        n = sum(apres.count(b) - avant.count(b) for _, b in REGLES)
        rel = os.path.relpath(chemin, RACINE)
        print("  %-58s %3d" % (rel, n))
        touches += 1
        total += n
        if not args.etat:
            io.open(chemin, "w", encoding="utf-8", newline="\n").write(apres)

    print()
    print("%d fichier(s), %d remplacement(s)" % (touches, total))
    print("%d occurrence(s) protegee(s) : identifiant Tauri, cles de "
          "stockage, prefixe pa_" % protegees)
    if args.etat:
        print("\n(rien n'a ete ecrit)")
    else:
        print("\nRESTE A FAIRE A LA MAIN :")
        print("  - renommer le dossier PokeArchive/ en PokePension/")
        print("  - le depot GitHub, et son adresse")
        print("  - cote serveur : /opt/pokearchive, la base et son "
              "utilisateur (voir deploiement/)")


if __name__ == "__main__":
    sys.exit(main())
