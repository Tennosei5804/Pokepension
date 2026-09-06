# -*- coding: utf-8 -*-
"""Le banc d'essai du site.

    cd site && py outils/banc.py

Assemble, sert, ouvre une fenetre, et joue les verifications de
outils/banc-site.js. Le rapport s'affiche par-dessus la page.

POURQUOI UN BANC A PART. Celui de app/ verifie la reserve et l'interface avec un
jeu de FAUSSES reponses ; celui-ci verifie le PONT, dont les reponses sont
vraies, et la mise en page a des largeurs que la fenetre de bureau ne prend
jamais. Les deux ne peuvent pas se confondre : l'un remplacerait l'autre.

CE QU'IL NE FAUT PAS OUBLIER. Les verifications ecrasent la reserve du site —
elles cochent, effacent, rechargent. banc-site.js la range avant de commencer et
la remet a la fin, mais on evite quand meme de lancer le banc sur le navigateur
ou l'on tient sa vraie collection.
"""
import argparse
import http.server
import pathlib
import re
import sys
import webbrowser

ICI = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ICI / "public"
OUTILS = ICI / "outils"

sys.path.insert(0, str(OUTILS))
from assembler import batir                                    # noqa: E402
from servir import Serveur as ServeurCompressant                # noqa: E402


class Banc(ServeurCompressant):
    """Le serveur du site, plus le script des verifications.

    On injecte a la volee plutot que d'ecrire un second index.html : celui du
    site est deja assemble, et le dupliquer ferait deux pages a tenir d'accord
    — exactement ce que l'assemblage existe pour eviter.
    """

    def do_GET(self):
        # Le banc s'ouvre a la racine, comme avant : c'est l'adresse qu'on
        # tape. Ce qu'il y sert, en revanche, est le Pokedex.
        if self.path.split("?")[0] in ("/", "/index.html", "/dex", "/dex.html"):
            return self.page()
        if self.path.split("?")[0] == "/outils/banc-site.js":
            return self.script()
        if self.path.split("?")[0] == "/outils/pont-simule.js":
            return self.pont()
        return super().do_GET()

    def pont(self):
        """L'ancien pont localStorage, servi depuis la source.

        Il n'est plus copie dans public/ : le site en production parle a
        l'API. Il n'a plus qu'un usage, celui-ci, et le servir d'ici plutot
        que de le recopier evite d'avoir deux ponts dans le dossier livre.
        """
        corps = (ICI / "source" / "pont.js").read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(corps)

    def page(self):
        # C'EST LE POKEDEX QU'ON VERIFIE, pas la page d'accueil du site.
        # Depuis que le site a deux pages, index.html est la vitrine et
        # dex.html l'application : lire la premiere ferait echouer les vingt
        # verifications d'un coup, sur une page qui n'a jamais pretendu porter
        # showPage ni le pont.
        html = (PUBLIC / "dex.html").read_text(encoding="utf-8")
        # Apres tous les scripts de l'application : les verifications se servent
        # de showPage, de invoke et du pont, qui doivent exister avant elles.
        # LE PONT SIMULE REMPLACE LE PONT HTTP, et c'est ce qui rend ce banc
        # possible. Depuis que le site parle a la vraie API, il n'a pas de
        # session au chargement : il demande a se connecter, part chez Discord,
        # et aucune verification ne peut s'executer.
        #
        # Le banc a besoin d'un monde clos, comme celui de l'application. C'est
        # exactement ce que faisait l'ancien pont localStorage : il reste dans
        # site/source, et sert desormais a cela.
        # L'assembleur horodate chaque script — src="js/pont-api.js?v=123" —
        # donc on vise par expression et non par egalite : chercher la chaine
        # exacte ne trouvait rien, en silence.
        html = re.sub(r'<script src="js/pont-api\.js[^"]*"></script>',
                      '<script src="/outils/pont-simule.js"></script>', html, count=1)
        html = html.replace("</body>",
                            '<script src="/outils/banc-site.js"></script>\n</body>', 1)
        # Un horodatage neuf a chaque chargement : sans lui, le navigateur garde
        # les scripts en memoire de page et le banc valide un code qui n'est
        # plus sur le disque. C'est arrive au banc de l'application.
        import time
        marque = str(time.time())
        html = re.sub(r'(<script src="[^"]+\.js)(\?v=\d+)?"',
                      r'\1?v=' + marque + '"', html)
        html = re.sub(r'(<link[^>]+href="[^"]+\.css)(\?v=\d+)?"',
                      r'\1?v=' + marque + '"', html)
        corps = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(corps)

    def script(self):
        f = OUTILS / "banc-site.js"
        if not f.is_file():
            self.send_error(404, "banc-site.js introuvable")
            return
        corps = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(corps)


def main() -> int:
    p = argparse.ArgumentParser(description="Le banc d'essai du site PokeArchive.")
    p.add_argument("--port", type=int, default=8131)
    p.add_argument("--sans-navigateur", action="store_true")
    args = p.parse_args()

    if batir() != 0:
        return 1
    print()

    adresse = "http://127.0.0.1:%d" % args.port
    try:
        serveur = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Banc)
    except OSError as e:
        print("Port %d indisponible (%s). Essaie --port 9001." % (args.port, e))
        return 1

    print("Banc du site sur %s" % adresse)
    print("Le rapport s'affiche dans la fenetre. Ctrl+C pour arreter.")
    if not args.sans_navigateur:
        webbrowser.open(adresse)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nArrete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
