# -*- coding: utf-8 -*-
"""Ouvrir le site en local.

    cd site && py outils/servir.py
    cd site && py outils/servir.py --port 9000

IL REASSEMBLE AVANT DE SERVIR, toujours. Un site servi depuis un public/ perime
montre du code qui n'est plus sur le disque, et l'on cherche pendant dix
minutes pourquoi une correction « ne prend pas ». Le cout est d'une seconde.

POURQUOI UN SERVEUR ET NON file:// : les navigateurs refusent aux pages ouvertes
en file:// l'acces au localStorage sur certaines configurations, et bloquent
tout chargement de script juge distant. Le site s'appuie sur les deux. Un
serveur local, meme minimal, supprime toute la classe de problemes.
"""
import argparse
import gzip
import http.server
import io
import os
import pathlib
import sys
import webbrowser

ICI = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ICI / "public"

sys.path.insert(0, str(ICI / "outils"))
from assembler import batir                                    # noqa: E402


# Ce qui gagne a etre compresse. Les .png et .woff2 le sont deja dans leur
# format : les repasser au gzip couterait du temps pour quelques octets.
COMPRESSIBLES = (".js", ".css", ".html", ".json", ".svg", ".txt", ".md")

# En dessous, l'en-tete et le tour de compression coutent plus qu'ils ne
# rapportent.
SEUIL = 1024


class Serveur(http.server.SimpleHTTPRequestHandler):
    """Le meme serveur, mais qui compresse.

    POURQUOI CA COMPTE ICI. Le premier chargement pese 2 634 Ko sans
    compression, dont 1 642 pour la seule reserve embarquee — six secondes et
    demie sur une 3G. Ces fichiers sont du JSON dans du JS : mesure, gzip les
    divise par 4,8 en moyenne et par 5,8 pour la reserve. On tombe sous les
    550 Ko.

    Tout hebergeur serieux le fait ; le serveur de la bibliotheque standard,
    non. Sans ce bout de code, on met au point sur une page qui pese cinq fois
    ce qu'elle pesera, et l'on ne sait pas ce qu'on livre.
    """

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(PUBLIC), **kw)

    # Les pages sans extension : « /dex » rend dex.html. Le site a deux pages,
    # l'accueil sur la racine et le Pokedex a cote, et une adresse propre vaut
    # mieux qu'un « .html » dans la barre pour une page qu'on met en favori.
    # Caddy fait la meme chose en production, par try_files.
    SANS_EXTENSION = {"/dex": "/dex.html"}

    def _reecrire(self):
        chemin = self.path.split("?")[0].rstrip("/") or "/"
        cible = self.SANS_EXTENSION.get(chemin)
        if cible:
            reste = self.path[len(self.path.split("?")[0]):]
            self.path = cible + reste

    def do_GET(self):
        if self.path.split("?")[0] == "/session":
            return self.page_session()
        self._reecrire()
        return super().do_GET()

    def do_HEAD(self):
        self._reecrire()
        return super().do_HEAD()

    def page_session(self):
        """Ouvrir une session d essai d un clic, sans passer par la console.

        POURQUOI CETTE PAGE EXISTE. Le jeton se range dans le stockage du
        navigateur, par origine : aucun outil exterieur ne peut l y ecrire, et
        `peupler.js` ne pouvait que rendre une ligne a coller. Or Chrome refuse
        desormais tout collage dans la console sans qu on tape d abord une
        formule — la manoeuvre demandait donc deux gestes obscurs pour une
        session d essai.

        ELLE NE SERT QUE LE DEVELOPPEMENT LOCAL. Elle vit dans servir.py, pas
        dans public/ : elle n est jamais livree, et le fichier qu elle lit vit
        hors du depot, a cote de la session de l application.
        """
        jetons = self.jetons_dessai()
        if not jetons:
            corps = ("<p>Aucune session d’essai. Lance d’abord :</p>"
                     "<pre>cd api &amp;&amp; node --env-file=.env outils/peupler.js</pre>")
        else:
            boutons = "".join(
                '<button data-j="%s">Ouvrir la session de <b>%s</b></button>' % (j, p)
                for p, j in jetons)
            corps = ("<p>Choisis le compte d’essai à ouvrir dans CE navigateur.</p>"
                     + boutons)
        page = (
            "<!DOCTYPE html><html lang=fr><head><meta charset=utf-8>"
            "<title>Session d’essai</title><style>"
            "body{margin:0;min-height:100vh;display:grid;place-items:center;"
            "background:#0e0f14;color:#e8e9f0;font-family:system-ui,sans-serif;"
            "text-align:center;padding:24px;gap:12px}"
            "button{display:block;margin:8px auto;padding:11px 18px;border:0;"
            "border-radius:9px;background:#5865f2;color:#fff;font-size:15px;"
            "cursor:pointer}button:hover{background:#4752c4}"
            "pre{background:#1a1c25;padding:10px 14px;border-radius:8px;font-size:12px}"
            "</style></head><body><div><h1>Session d’essai</h1>" + corps +
            "<script>document.querySelectorAll('button').forEach(function(b){"
            "b.addEventListener('click',function(){"
            "localStorage.setItem('pokearchive-jeton',b.dataset.j);"
            "location.href='/';});});</script></div></body></html>")
        octets = page.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(octets)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(octets)

    @staticmethod
    def jetons_dessai():
        """Ce que peupler.js a laisse, hors du depot.

        A COTE DE LA SESSION DE L APPLICATION, dans le dossier de configuration
        du systeme : jamais dans public/, qui est livre, ni dans le depot, qui
        est publie. Un jeton n a rien a faire dans l un ni dans l autre.
        """
        import json
        base = os.environ.get("APPDATA") or os.path.expanduser("~/.config")
        f = pathlib.Path(base) / "fr.tennosei.pokearchive" / "session-navigateur.json"
        if not f.is_file():
            return []
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            return []
        return [(c.get("pseudo", "?"), c.get("jeton", "")) for c in d.get("comptes", [])
                if c.get("jeton")]

    def send_head(self):
        chemin = pathlib.Path(self.translate_path(self.path))
        accepte = "gzip" in self.headers.get("Accept-Encoding", "")
        if (not accepte or not chemin.is_file()
                or chemin.suffix.lower() not in COMPRESSIBLES
                or chemin.stat().st_size < SEUIL):
            return super().send_head()

        try:
            brut = chemin.read_bytes()
        except OSError:
            return super().send_head()

        # Niveau 6 : le meme compromis que la plupart des serveurs. Le 9 coute
        # trois fois plus de temps pour environ deux pour cent de moins.
        corps = gzip.compress(brut, 6)
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(chemin)))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(corps)))
        if self.path in ("/", "/index.html", "/dex", "/dex.html"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        self.end_headers()
        return io.BytesIO(corps)

    def end_headers(self):
        # Les fichiers portent deja ?v=<date> dans index.html, ce qui suffit a
        # les faire redescendre quand ils changent. Mais index.html lui-meme n'a
        # pas de tel repere : sans cet en-tete, le navigateur garde l'ancienne
        # page et donc les anciens ?v=, et l'assemblage ne se voit jamais.
        #
        # send_head() pose deja l'en-tete quand il compresse : on ne le repete
        # pas, un doublon dans la reponse serait au mieux ignore.
        if self.path in ("/", "/index.html", "/dex", "/dex.html") and "Content-Encoding" not in self._headers_buffer_noms():
            self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def _headers_buffer_noms(self):
        """Les en-tetes deja poses pour cette reponse."""
        return b"".join(getattr(self, "_headers_buffer", []) or []).decode("latin-1", "replace")

    def log_message(self, format, *args):
        # Le journal par defaut ecrit une ligne par fichier : plus de mille au
        # premier chargement. On ne garde que ce qui a echoue.
        code = str(args[1]) if len(args) > 1 else ""
        if code.startswith(("4", "5")):
            super().log_message(format, *args)


def main() -> int:
    p = argparse.ArgumentParser(description="Servir le site PokePension en local.")
    p.add_argument("--port", type=int, default=8130)
    p.add_argument("--sans-navigateur", action="store_true",
                   help="ne pas ouvrir de fenetre")
    p.add_argument("--sans-assemblage", action="store_true",
                   help="servir public/ tel quel, sans le refaire")
    args = p.parse_args()

    if not args.sans_assemblage:
        if batir() != 0:
            return 1
        print()
    elif not PUBLIC.is_dir():
        print("public/ n'existe pas : lance d'abord py outils/assembler.py")
        return 1

    adresse = "http://127.0.0.1:%d" % args.port
    try:
        serveur = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Serveur)
    except OSError as e:
        print("Port %d indisponible (%s). Essaie --port 9000." % (args.port, e))
        return 1

    print("Site servi sur %s" % adresse)
    print("Ctrl+C pour arreter.")
    if not args.sans_navigateur:
        webbrowser.open(adresse)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nArrete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
