# -*- coding: utf-8 -*-
"""Rapatrie les sauvegardes du VPS sur cette machine.

    py outils/rapatrier-sauvegardes.py
    py outils/rapatrier-sauvegardes.py --ou D:/ailleurs

POURQUOI DANS CE SENS, ET PAS L'INVERSE. Une sauvegarde qui reste sur la
machine de la base ne protege que d'une commande SQL de trop : le jour ou le
VPS disparait, elle disparait avec. Il faut donc qu'une copie vive ailleurs.

Mais le VPS ne peut pas la POUSSER vers un ordinateur de bureau : celui-ci n'a
pas d'adresse joignable depuis Internet, et il est eteint la moitie du temps.
C'est donc lui qui vient chercher, quand il est allume. Un « pull » demande
aussi moins de confiance qu'un « push » : le serveur n'a aucun acces ici.

CE QUI N'EST PAS FAIT ICI, ET POURQUOI. Un envoi automatique vers un stockage
tiers — S3, Backblaze, un autre serveur — serait mieux : il ne depend pas d'une
machine allumee. Il demande une destination et une cle que ce script n'a pas a
inventer. Le jour ou elles existent, l'unite systemd du VPS gagne une ligne et
ce script devient un filet de plus, pas le seul.
"""
import argparse
import pathlib
import subprocess
import sys

VPS = "root@163.5.143.197"
CLE = pathlib.Path.home() / ".ssh" / "bdp_vps"
CONTENEUR = "deploiement-pokepension-api-1"
DEDANS = "/api/sauvegardes"

ICI = pathlib.Path(__file__).resolve().parent.parent
DEFAUT = ICI / "api" / "sauvegardes" / "vps"


def ssh(commande):
    """Une commande sur le VPS. Rend sa sortie, ou leve."""
    r = subprocess.run(
        ["ssh", "-i", str(CLE), "-o", "BatchMode=yes", "-o", "ConnectTimeout=15",
         VPS, commande],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        raise SystemExit("Le VPS n'a pas repondu :\n  %s" % (r.stderr or "").strip())
    return r.stdout


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ou", default=str(DEFAUT),
                   help="ou deposer les fichiers (defaut : api/sauvegardes/vps)")
    args = p.parse_args()
    cible = pathlib.Path(args.ou)
    cible.mkdir(parents=True, exist_ok=True)

    print("Sauvegardes de PokePension — %s" % VPS)
    if not CLE.is_file():
        raise SystemExit("Cle introuvable : %s" % CLE)

    # Les fichiers vivent dans un volume Docker : on passe par le conteneur
    # plutot que de fouiller /var/lib/docker, dont le chemin n'est pas un
    # contrat et change d'une version a l'autre.
    noms = [n.strip() for n in
            ssh("docker exec %s ls -1 %s" % (CONTENEUR, DEDANS)).splitlines()
            if n.strip().endswith(".json")]
    if not noms:
        raise SystemExit("Aucune sauvegarde sur le VPS. Le minuteur a-t-il tourne ?")

    neufs = 0
    for nom in sorted(noms):
        f = cible / nom
        if f.exists():
            print("  =  %s (deja la)" % nom)
            continue
        # `docker exec cat` plutot qu'un `docker cp` : cp exige un chemin sur
        # l'hote, et l'on tient a ne rien supposer de l'emplacement du volume.
        contenu = ssh("docker exec %s cat %s/%s" % (CONTENEUR, DEDANS, nom))
        f.write_text(contenu, encoding="utf-8")
        print("  +  %s (%.1f Ko)" % (nom, len(contenu) / 1024))
        neufs += 1

    total = sorted(cible.glob("pokepension-*.json"))
    print()
    print("%d nouvelle(s), %d sauvegarde(s) sur cette machine." % (neufs, len(total)))
    print("  %s" % cible)
    if total:
        print("  la plus recente : %s" % total[-1].name)
    # Le dossier est dans le .gitignore : ce sont les collections de gens, elles
    # n'ont rien a faire dans un depot public.
    return 0


if __name__ == "__main__":
    sys.exit(main())
