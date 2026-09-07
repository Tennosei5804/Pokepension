# -*- coding: utf-8 -*-
"""Pose l'installateur d'une release sur le VPS, et son derniere.json.

    py outils/publier-binaire.py v0.42.3
    py outils/publier-binaire.py v0.42.3 --verifier-seulement

CE QUI SE PASSE, ET DANS QUEL SENS. Le VPS va chercher le fichier LUI-MEME sur
GitHub. Il ne passe jamais par cette machine, et c'est deliberé :

  · Defender supprime l'installateur des qu'il touche le disque ici — detection
    Trojan:Win32/Cloxer, voir app/outils/faux-positif/. Un telechargement local
    pour re-televerser derriere, c'est neuf megaoctets qui disparaissent entre
    les deux, et l'on croit a une panne de reseau.
  · Le fichier fait le trajet une fois au lieu de deux, entre deux machines
    reliees bien mieux que ne l'est une connexion domestique.

LA RELEASE DOIT ETRE PUBLIEE D'ABORD. Les fichiers d'un brouillon ne sont pas
telechargeables publiquement : le VPS recevrait une page d'erreur de GitHub,
enregistree sous un nom en .exe, et le site servirait ca sans broncher. Le
script refuse donc de continuer tant que la release est en brouillon.

LE NOM SUR LE SERVEUR NE CHANGE PAS. GitHub nomme son fichier avec le numero de
version ; ici il devient PokePension-Windows-x64.exe, toujours le meme, parce
que https://pokepension.fr/telecharger pointe dessus et qu'une adresse de
telechargement qui change a chaque version casse tous les liens deja partages.
"""
import argparse
import json
import pathlib
import subprocess
import sys

VPS = "root@163.5.143.197"
CLE = pathlib.Path.home() / ".ssh" / "bdp_vps"
DOSSIER = "/opt/pokepension/telechargements"
NOM = "PokePension-Windows-x64.exe"


def ssh(commande, entree=None):
    """Une commande sur le VPS. Rend sa sortie, ou leve."""
    r = subprocess.run(
        ["ssh", "-i", str(CLE), "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
         VPS, commande],
        input=entree, capture_output=True, text=True,
        encoding="utf-8", errors="replace")
    if r.returncode:
        raise SystemExit("Le VPS a refuse :\n  %s" % (r.stderr or "").strip())
    return r.stdout.strip()


def gh(*args):
    r = subprocess.run(["gh"] + list(args), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode:
        raise SystemExit("gh a echoue :\n  %s" % (r.stderr or "").strip())
    return r.stdout


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("tag", help="le tag de la release, par exemple v0.42.3")
    p.add_argument("--verifier-seulement", action="store_true",
                   help="ne depose rien, montre seulement ce qui est en ligne")
    args = p.parse_args()

    if not CLE.is_file():
        raise SystemExit("Cle introuvable : %s" % CLE)

    if args.verifier_seulement:
        print(ssh("cd %s && ls -la && sha256sum %s && cat derniere.json"
                  % (DOSSIER, NOM)))
        return 0

    infos = json.loads(gh("release", "view", args.tag,
                          "--json", "assets,isDraft,tagName"))
    if infos.get("isDraft"):
        raise SystemExit(
            "La release %s est encore en BROUILLON.\n"
            "  Ses fichiers ne sont pas telechargeables : le VPS ramenerait une\n"
            "  page d'erreur deguisee en .exe. Publie-la d'abord :\n"
            "      gh release edit %s --draft=false" % (args.tag, args.tag))

    exes = [a for a in infos["assets"] if a["name"].lower().endswith(".exe")]
    if len(exes) != 1:
        raise SystemExit("Attendu un seul .exe dans la release, trouve %d : %s"
                         % (len(exes), [a["name"] for a in infos["assets"]]))
    actif = exes[0]
    url = actif.get("url") or actif.get("apiUrl")
    print("Release %s — %s (%d octets)" % (args.tag, actif["name"], actif["size"]))

    # -fL : suivre la redirection vers le stockage, et ECHOUER sur un code
    # d'erreur au lieu d'enregistrer la page d'erreur. Sans -f, une 404 devient
    # un « installateur » de quelques centaines d'octets.
    print("Le VPS telecharge depuis GitHub…")
    ssh("curl -fL --retry 3 -o %s/%s.neuf %s" % (DOSSIER, NOM, url))

    taille = int(ssh("stat -c%%s %s/%s.neuf" % (DOSSIER, NOM)))
    if taille != actif["size"]:
        ssh("rm -f %s/%s.neuf" % (DOSSIER, NOM))
        raise SystemExit("Taille recue %d, attendue %d. Rien n'a ete remplace."
                         % (taille, actif["size"]))
    empreinte = ssh("sha256sum %s/%s.neuf" % (DOSSIER, NOM)).split()[0]

    # On ne remplace qu'une fois le fichier verifie : tant que la taille n'est
    # pas la bonne, l'ancien installateur reste en ligne et telechargeable.
    ssh("mv %s/%s.neuf %s/%s && chmod 755 %s/%s"
        % (DOSSIER, NOM, DOSSIER, NOM, DOSSIER, NOM))

    # derniere.json nourrit le bloc de telechargement de l'accueil — voir
    # site/source/accueil.html. L'updater de l'application, lui, ne le lit pas :
    # il interroge latest.json sur la release GitHub.
    manifeste = {
        "version": infos["tagName"].lstrip("v"),
        "fichier": NOM,
        "octets": taille,
        "sha256": empreinte,
        "systeme": "Windows x64",
        "construitPar": "GitHub Actions, tag %s" % infos["tagName"],
        "poseLe": ssh("date -u +%Y-%m-%dT%H:%M:%SZ"),
    }
    ssh("cat > %s/derniere.json" % DOSSIER,
        entree=json.dumps(manifeste, ensure_ascii=False, indent=2) + "\n")

    print()
    print("Pose : %s" % NOM)
    print("  %d octets" % taille)
    print("  sha256 %s" % empreinte)
    print()
    print("A verifier maintenant :")
    print("  curl -sIL https://pokepension.fr/telecharger | grep -i content-length")
    print("  https://pokepension.fr  — le bloc doit annoncer la %s"
          % manifeste["version"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
