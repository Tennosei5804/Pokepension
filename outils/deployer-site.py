# -*- coding: utf-8 -*-
"""Assemble le site pour la production et le pose sur le VPS.

    py outils/deployer-site.py
    py outils/deployer-site.py --essai     assemble et prepare, n'envoie rien

UNE COMMANDE, ET LA MEME DANS TOUS LES TERMINAUX. La marche a suivre tenait en
deux lignes de bash avec des « … » a remplir : l'adresse du VPS, la cle, le
chemin de l'archive. Tapee dans PowerShell, la premiere echoue — ni
« POKEPENSION_API=… py » ni /tmp n'y existent. Ici Python fait l'archive et
ssh le transport, comme dans publier-binaire.py : aucun shell n'intervient.

CE QUI SE PASSE, DANS L'ORDRE :

  1. site/outils/assembler.py, avec l'adresse de PRODUCTION de l'API. Sans
     elle la page part vers http://127.0.0.1:8787 et n'appelle rien — elle
     s'ouvre, et rien ne marche. On relit donc dex.html avant d'envoyer quoi
     que ce soit.
  2. Une archive de site/public/ : fichiers en 644, dossiers en 755, au nom
     de root. Elle ne porte pas le dossier racine, qui garde donc sur le
     serveur les droits qu'il a.
  3. L'archive monte ENTIERE dans /tmp avant d'etre depliee, et l'on compare
     la taille recue. Une connexion qui tombe en chemin laisse le site tel
     qu'il etait, pas a moitie remplace.
  4. On relit le site en ligne : sw.js doit porter la version qu'on vient
     d'assembler, et /dex l'adresse de production.

CE QUI N'EST PAS FAIT : SUPPRIMER. Comme l'envoi a la main, l'archive ajoute et
ecrase, elle n'efface jamais. Une page retiree de la table ADRESSES reste
servie tant qu'on ne l'a pas effacee du serveur a la main — voir bbd8db1.

L'API n'est pas concernee : elle se deploie a part (LISEZMOI.md, « Deployer »).
"""
import argparse
import io
import os
import pathlib
import re
import subprocess
import sys
import tarfile
import time
import urllib.request

VPS = "root@163.5.143.197"
CLE = pathlib.Path.home() / ".ssh" / "bdp_vps"
DOSSIER = "/opt/pokepension/site/public"
ARCHIVE = "/tmp/pokepension-site.tgz"
API = "https://api.pokepension.fr"
SITE = "https://pokepension.fr"

ICI = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ICI / "site" / "public"


def ssh(commande, entree=None):
    """Une commande sur le VPS. Rend sa sortie, ou leve.

    En octets et non en texte : l'archive passe par l'entree standard, et un
    decodage en chemin la corromprait."""
    r = subprocess.run(
        ["ssh", "-i", str(CLE), "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
         VPS, commande],
        input=entree, capture_output=True)
    if r.returncode:
        raise SystemExit("Le VPS a refuse :\n  %s"
                         % r.stderr.decode("utf-8", "replace").strip())
    return r.stdout.decode("utf-8", "replace").strip()


def git(*args):
    r = subprocess.run(["git"] + list(args), cwd=ICI, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    return r.stdout.strip() if r.returncode == 0 else ""


def assembler():
    """Bati public/ pour la production. Rend la version du service worker."""
    env = dict(os.environ, POKEPENSION_API=API)
    r = subprocess.run([sys.executable, str(ICI / "site" / "outils" / "assembler.py")],
                       cwd=ICI / "site", env=env)
    if r.returncode:
        raise SystemExit("L'assemblage a echoue (code %d) : rien n'a ete envoye."
                         % r.returncode)

    balise = 'window.POKEPENSION_API = "%s"' % API
    if balise not in (PUBLIC / "dex.html").read_text(encoding="utf-8"):
        raise SystemExit("dex.html ne porte pas l'adresse de production (%s).\n"
                         "  Rien n'a ete envoye." % API)

    m = re.search(r"const VERSION = '([^']+)'",
                  (PUBLIC / "sw.js").read_text(encoding="utf-8"))
    if not m:
        raise SystemExit("sw.js ne porte pas de version : rien n'a ete envoye.")
    return m.group(1)


def archiver():
    """public/ en .tgz, en memoire. Rend (octets, nombre de fichiers)."""
    fichiers = [0]

    def normaliser(info):
        # Les droits d'un disque Windows ne veulent rien dire sur le VPS : selon
        # l'outil, ils sortent en 666 et 777, et un tar deplie par root les
        # applique tels quels.
        info.uid = info.gid = 0
        info.uname = info.gname = "root"
        if info.isdir():
            info.mode = 0o755
        else:
            info.mode = 0o644
            fichiers[0] += 1
        return info

    tampon = io.BytesIO()
    with tarfile.open(fileobj=tampon, mode="w:gz") as tar:
        for f in sorted(PUBLIC.iterdir()):
            tar.add(str(f), arcname=f.name, filter=normaliser)
    return tampon.getvalue(), fichiers[0]


def lire(adresse):
    req = urllib.request.Request(adresse, headers={
        "Cache-Control": "no-cache", "User-Agent": "pokepension-deployer-site"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def relire(version):
    """Le site en ligne sert-il ce qu'on vient de poser ? Rend la liste des
    ecarts, vide si tout va bien."""
    ecarts = []
    # Un parametre en plus, pour qu'aucun cache en chemin ne rende l'ancien.
    frais = "?deploiement=%d" % time.time()
    try:
        if ("const VERSION = '%s'" % version) not in lire(SITE + "/sw.js" + frais):
            ecarts.append("sw.js ne porte pas la version %s" % version)
    except OSError as e:
        ecarts.append("sw.js illisible : %s" % e)
    try:
        if ('window.POKEPENSION_API = "%s"' % API) not in lire(SITE + "/dex" + frais):
            ecarts.append("/dex ne porte pas l'adresse de production")
    except OSError as e:
        ecarts.append("/dex illisible : %s" % e)
    return ecarts


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--essai", action="store_true",
                   help="assemble et prepare l'archive, sans rien envoyer")
    args = p.parse_args()

    commit = git("log", "-1", "--format=%h %s")
    if commit:
        print("Code deploye : %s" % commit)
    if git("status", "--porcelain", "--", "app/src", "site/source"):
        print("Attention : des modifications non committees dans app/src ou "
              "site/source partent aussi.")

    if not args.essai and not CLE.is_file():
        raise SystemExit("Cle introuvable : %s" % CLE)

    version = assembler()
    donnees, nombre = archiver()
    print()
    print("Archive : %d fichiers, %.1f Mo — version %s"
          % (nombre, len(donnees) / 1048576, version))

    if args.essai:
        print("Essai : rien n'a ete envoye.")
        return 0

    if ssh("test -d %s && echo oui || echo non" % DOSSIER) != "oui":
        raise SystemExit("%s n'existe pas sur le VPS : rien n'a ete envoye." % DOSSIER)

    print("Envoi vers le VPS…")
    ssh("cat > %s" % ARCHIVE, entree=donnees)
    recu = int(ssh("stat -c%%s %s" % ARCHIVE))
    if recu != len(donnees):
        ssh("rm -f %s" % ARCHIVE)
        raise SystemExit("Taille recue %d, attendue %d. Le site n'a pas change."
                         % (recu, len(donnees)))

    ssh("tar xzf %s --no-same-owner -C %s && rm -f %s" % (ARCHIVE, DOSSIER, ARCHIVE))
    print("Pose dans %s." % DOSSIER)

    ecarts = relire(version)
    if ecarts:
        print()
        print("Le site est pose, mais la relecture en ligne ne suit pas :")
        for e in ecarts:
            print("  · %s" % e)
        return 1

    print("En ligne : %s sert la version %s." % (SITE, version))
    return 0


if __name__ == "__main__":
    sys.exit(main())
