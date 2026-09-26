# -*- coding: utf-8 -*-
"""Le banc d'essai : l'application tourne, et se verifie elle-meme.

    cd app && py outils/banc.py

Puis ouvrir http://127.0.0.1:8125 : le rapport s'affiche en haut de la page.
Ctrl+C pour arreter.

Aucune connexion Discord, aucune ecriture en base, aucun risque pour tes
aventures : le pont Tauri est remplace par des reponses en dur, et l'etat vit en
memoire le temps de la page. On peut donc supprimer, vider, renommer sans que
rien ne parte au serveur.

Pourquoi un banc plutot que des tests unitaires : l'application est faite de
scripts classiques qui se parlent par des variables globales, sans modules ni
exports. Il n'y a rien a importer isolement — le seul endroit ou le cablage
existe vraiment, c'est la page chargee. Le banc la charge, la pilote, et regarde.

Ce qu'il verifie est dans outils/banc-verifications.js. A ajouter une
verification chaque fois qu'un bug passe : c'est la seule facon qu'il grossisse
au bon endroit.
"""
import functools
import http.server
import re
import pathlib
import socketserver
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

OUTILS = pathlib.Path(__file__).resolve().parent
SRC = OUTILS.parent / "src"
PORT = 8125

# --- Le pont Tauri simule ---------------------------------------------------
# L'etat est mutable : supprimer une aventure la retire vraiment de la liste.
# Sans ca, on ne verrait pas si l'ecran retombe bien sur une autre — le seul
# point qui merite d'etre verifie apres une suppression.
STUB = r"""
const MOI = { captures:['bulbasaur','ivysaur','charmander','squirtle','mew','celebi',
                        'pikachu-original-cap','zarude','meltan'],
              shiny:['bulbasaur','celebi'] };
const AMI = { captures:['bulbasaur','venusaur','charmander','pikachu'], shiny:['pikachu'] };
const CHASSES = [{ dex:'swsh', espece:'pikachu', compteur:412, methode:'masuda', chromatique:true }];

const dexDe = (c) => ({ version:1, player:'Tennosei_', exportedAt:new Date().toISOString(),
  dex:{ national:{ caught:c.captures, shiny:c.shiny } },
  captures:c.captures, shiny:c.shiny, chasses:CHASSES });

let DERNIER_ID = 2;
const PROFILS = [
  { id:1, nom:'Aventure 1', public:1, par_defaut:1, mode:'living', niveau_formes:3,
    captures:4, shiny:1, cree_le:'', maj_le:'' },
  { id:2, nom:'Ma chasse', public:1, par_defaut:0, mode:'capture', niveau_formes:1,
    captures:0, shiny:0, cree_le:'', maj_le:'' },
];

// Une photo deja posee, comme sur une chasse aboutie d'il y a trois mois :
// c'est l'etat courant du tableau, pas la case vide.
let DERNIERE_IMAGE = 1;
const IMAGES = new Map([[1, []]]);
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
// Celle que le serveur refuse d'envoyer : elle appartient a une aventure
// privee, que le destinataire ne pourrait pas ouvrir. Le pont la refuse
// pareil, pour que l'ecran ait un refus a montrer.
const PHOTO_PRIVEE = 4242;

let DERNIER_TROC = 2;
const ECHANGES = [
  { id:1, sens:'recu', dex:'rby', jeDonne:'machop', jeRecois:'grimer', etat:'propose',
    mot:'Ce soir ?', messages:0, quand:'', majLe:'',
    avec:{ pseudo:'Amie_Test', avatar:null, discordId:'2' } },
  { id:2, sens:'propose', dex:'rby', jeDonne:'kadabra', jeRecois:'abra',
    etat:'accepte', mot:null, messages:1, quand:'', majLe:'',
    avec:{ pseudo:'Amie_Test', avatar:null, discordId:'2' } },
];
const MESSAGES = [
  { id:1, echange:2, texte:'Je suis en ligne', quand:'', pseudo:'Amie_Test', deMoi:false },
];
const NOTIFS = [
  { id:11, genre:'echange', echange:1, titre:'Amie_Test te propose un echange',
    detail:null, lu:false, quand:'', etat:'propose', dex:'rby',
    jeDonne:'machop', jeRecois:'grimer' },
  { id:10, genre:'message', echange:2, titre:"Amie_Test t’a ecrit",
    detail:'Je suis en ligne', lu:true, quand:'', etat:'accepte', dex:'rby',
    jeDonne:'kadabra', jeRecois:'abra' },
];

// Les messages directs, en memoire le temps de la page.
const DIRECTS = [];

const REPONSES = {
  etat:            () => ({ connecte:true }),
  moi:             () => ({ dresseur:{ id:1, pseudo:'Tennosei_', discordId:'1', avatar:null },
                            resume:{ captures:4, shiny:1, majLe:null } }),
  profils:         () => ({ profils: PROFILS.map(x => ({ ...x })) }),
  lire_dex:        () => ({ ...dexDe(MOI), profilId:1 }),
  ecrire_dex:      () => ({ profilId:1, captures:MOI.captures.length, shiny:MOI.shiny.length }),
  historique:      () => ({ lignes:[], reste:false, total:0, encore:false }),
  // La recherche NE VOIT QUE LES COMPTES VISIBLES, comme le vrai service :
  // « Jack » n'y figure pas alors qu'on le suit. C'est exactement le cas que la
  // messagerie doit rattraper en filtrant aussi la liste d'amis.
  dresseurs:       (a) => { const q = ((a&&a.recherche)||'').toLowerCase();
                            const tous = [{ pseudo:'Amie_Test', discord_id:'2', avatar:null,
                              profil:'Aventure 1', captures:4, shiny:1 }];
                            return { dresseurs: tous.filter(d => d.pseudo.toLowerCase().includes(q)) }; },
  // Les gens qu'on suit. « Jack » sert l'exemple : taper « Ja » doit le sortir
  // sans que le serveur ait son mot a dire.
  amis:            () => ({ amis:[
                              { pseudo:'Ondine', discord_id:'2', avatar:null, discord_nom:null,
                                depuis:'', vu_jusqua:0, aventure:'Aventure 1',
                                captures:3, shiny:0, maj_le:null },
                              { pseudo:'Jack', discord_id:'3', avatar:null, discord_nom:null,
                                depuis:'', vu_jusqua:0, aventure:'Aventure 1',
                                captures:7, shiny:2, maj_le:null }] }),
  profils_de:      () => ({ dresseur:{ pseudo:'Amie_Test', discordId:'2', avatar:null },
                            profils:[{ id:9, nom:'Aventure 1', public:1, par_defaut:1,
                                       mode:'capture', captures:4, shiny:1 }] }),
  // L'amie suit le niveau 1 : de quoi verifier que la barre de comparaison
  // le signale au lieu de compter en silence sur le notre.
  dex_de:          () => ({ pseudo:'Amie_Test',
                            profil:{ id:9, nom:'Aventure 1', mode:'capture', niveau_formes:1 },
                            dex:dexDe(AMI) }),
  changer_pseudo:  (a) => ({ pseudo:(a && a.pseudo) || 'Tennosei_' }),
  creer_profil:    (a) => { const n = { id: ++DERNIER_ID, nom:(a&&a.nom)||'Nouvelle', public:1,
                              par_defaut:0, mode:(a&&a.mode)||'capture', niveau_formes:3,
                              captures:0, shiny:0,
                              cree_le:'', maj_le:'' };
                            PROFILS.push(n); return { profil:{ ...n } }; },
  modifier_profil: (a) => { const x = PROFILS.find(y => y.id === (a&&a.id));
                            if(x && a && a.nom != null) x.nom = a.nom;
                            if(x && a && a.mode != null) x.mode = a.mode;
                            if(x && a && a.niveauFormes != null) x.niveau_formes = a.niveauFormes;
                            return { ok:true }; },
  supprimer_profil:(a) => { const i = PROFILS.findIndex(y => y.id === (a&&a.id));
                            if(i < 0) throw new Error('PROFIL_INTROUVABLE');
                            if(PROFILS.length <= 1) throw new Error("C'est ta seule aventure.");
                            const [ote] = PROFILS.splice(i, 1);
                            if(ote.par_defaut && PROFILS.length) PROFILS[0].par_defaut = 1;
                            return { ok:true }; },
  deconnexion:     () => ({ ok:true }),
  connexion:       () => ({ pseudo:'Tennosei_' }),

  // --- Les echanges et les notifications ------------------------------------
  //
  // Deux echanges, un dans chaque sens : c'est le minimum pour verifier que
  // l'ecran ne propose pas « Accepter » sur sa propre proposition, et que les
  // noms sont remis dans le sens du lecteur.
  //
  // jeDonne / jeRecois arrivent DEJA retournes par l'API — c'est elle qui sait
  // de quel cote on est. Le stub reproduit cette forme et pas la forme brute
  // de la table, sinon il validerait un ecran qui lit autre chose que ce que
  // le serveur envoie.
  echanges:        () => ({ echanges: ECHANGES.map(e => ({ ...e })) }),
  echange_proposer:(a) => { const n = { id: ++DERNIER_TROC, sens:'propose', dex:(a&&a.dex)||'rby',
                              jeDonne:(a&&a.offert)||'?', jeRecois:(a&&a.demande)||'?',
                              etat:'propose', mot:(a&&a.mot)||null, messages:0,
                              quand:'', majLe:'',
                              avec:{ pseudo:(a&&a.pseudo)||'Amie_Test', avatar:null, discordId:'2' } };
                            ECHANGES.unshift(n); return { id:n.id, etat:'propose' }; },
  echange_reponse: (a) => { const e = ECHANGES.find(x => x.id === (a&&a.id));
                            if(!e) throw new Error("Cet echange n’existe pas.");
                            if(e.sens !== 'recu') throw new Error("C’est a l’autre de repondre.");
                            e.etat = (a&&a.reponse) === 'accepte' ? 'accepte' : 'refuse';
                            return { id:e.id, etat:e.etat }; },
  echange_annuler: (a) => { const e = ECHANGES.find(x => x.id === (a&&a.id));
                            if(!e) throw new Error("Cet echange n’existe pas.");
                            e.etat = 'annule'; return { id:e.id, etat:'annule' }; },
  echange_fait:    (a) => { const e = ECHANGES.find(x => x.id === (a&&a.id));
                            if(!e) throw new Error("Cet echange n’existe pas.");
                            e.etat = 'fait'; return { id:e.id, etat:'fait' }; },
  echange_messages:(a) => { const e = ECHANGES.find(x => x.id === (a&&a.id));
                            if(!e) throw new Error("Cet echange n’existe pas.");
                            return { echange:{ ...e }, messages: MESSAGES.filter(m => m.echange === e.id) }; },
  echange_ecrire:  (a) => { MESSAGES.push({ id: MESSAGES.length + 1, echange:(a&&a.id),
                              texte:(a&&a.texte)||'', quand:'', pseudo:'Tennosei_', deMoi:true });
                            return { id: MESSAGES.length, quand:'' }; },
  changer_messages_de: (a) => { const v = (a&&a.valeur)||'tous';
                            // Le serveur rabat une valeur inconnue sur « tous » :
                            // le pont fait pareil, sinon l'ecran croirait avoir
                            // pose un quatrieme etat qui n'existe pas.
                            const bons = ['tous','amis','personne'];
                            return { messagesDe: bons.indexOf(v) !== -1 ? v : 'tous' }; },

  // --- La messagerie --------------------------------------------------------
  // Les messages directs vivent en memoire, comme le reste : le banc peut donc
  // en envoyer et les relire sans qu'aucune ligne ne parte au serveur.
  messages_chercher: (a) => { const q = ((a&&a.q)||'').toLowerCase();
                            // Le vrai service cherche en base ; ici on filtre
                            // ce que le pont a en memoire. Ce qu'on eprouve a
                            // l'ecran, c'est l'affichage des resultats.
                            return { resultats: DIRECTS
                              .filter(m => (m.texte||'').toLowerCase().includes(q))
                              .map(m => ({ id:m.id, texte:m.texte, quand:'',
                                           avec:'Ondine', deMoi:!!m.deMoi,
                                           espece:m.espece||null })) }; },
  messages_liste:  () => ({ conversations: DIRECTS.length
                              ? [{ pseudo:'Ondine', avatar:null, discordId:'2',
                                   dernier: DIRECTS[DIRECTS.length - 1].texte,
                                   deMoi: DIRECTS[DIRECTS.length - 1].deMoi,
                                   quand:'', nonLus:0 }]
                              : [] }),
  // Un message d'echange au milieu des directs : c'est tout l'objet de la
  // fusion, et l'ecran doit le distinguer par son sujet.
  messages_avec:   (a) => ({ avec:{ pseudo:(a&&a.pseudo)||'Ondine', avatar:null, discordId:'2' },
                             messages: [
                               { id:0, texte:'d’accord pour demain ?', quand:'', deMoi:false,
                                 echange:{ id:1, dex:'rby', etat:'accepte',
                                           jeDonne:'machop', jeRecois:'abra', don:false } },
                               ...DIRECTS.map(m => ({ espece:null, image:null, ...m, echange:null })) ] }),
  messages_ecrire: (a) => { const texte = (a&&a.texte)||'';
                            const espece = (a&&a.espece)||null;
                            const image = (a&&a.image)||null;
                            // Le meme filtre qu'au serveur, en beaucoup plus
                            // simple : le banc n'eprouve pas le filtre ici, il
                            // eprouve que l'ecran affiche le refus.
                            if(/sale con/.test(texte)) throw new Error('Ton message ne passe pas. Reformule-le.');
                            // LE REFUS DE LA PHOTO PRIVEE, comme au serveur :
                            // c'est le seul moyen d'eprouver que l'ecran le
                            // MONTRE au lieu de vider le champ en silence.
                            if(image === PHOTO_PRIVEE){
                              // MOT POUR MOT LE REFUS DU SERVEUR, accents
                              // compris : c'est ce texte que l'ecran affiche,
                              // et une imitation approximative ferait passer
                              // une verification sur un message qui n'existe pas.
                              throw new Error('Cette photo appartient à une aventure privée : '
                                + 'ton correspondant ne pourrait pas la voir. Rends l’aventure '
                                + 'publique, ou envoie-la autrement.');
                            }
                            DIRECTS.push({ id: DIRECTS.length + 1, texte, espece, image,
                                           quand:'', deMoi:true });
                            return { id: DIRECTS.length, quand:'' }; },

  veille:          () => ({ amis:{ annonces:[] },
                            notifications:{ notifications: NOTIFS.map(n => ({ ...n })),
                              nonLues: NOTIFS.filter(n => !n.lu).length },
                            messagesNonLus: 3 }),
  notifications:   () => ({ notifications: NOTIFS.map(n => ({ ...n })),
                            nonLues: NOTIFS.filter(n => !n.lu).length }),
  notifications_lues: () => { NOTIFS.forEach(n => { n.lu = true; }); return { ok:true, nonLues:0 }; },

  // --- Les photos de chasse -------------------------------------------------
  //
  // Le stub retient les OCTETS RECUS : c'est la seule facon de verifier que
  // l'application redessine bien avant d'envoyer, et n'expedie pas le fichier
  // d'origine avec ses metadonnees.
  image_envoyer:   (a) => { const id = ++DERNIERE_IMAGE;
                            IMAGES.set(id, (a && a.octets) || []);
                            return { ok:true, id, octets:((a&&a.octets)||[]).length,
                                     largeur:0, hauteur:0 }; },
  image_charger:   (a) => { if(!IMAGES.has(a && a.id)) throw new Error('Photo introuvable.');
                            return PIXEL; },
  image_supprimer: (a) => { IMAGES.delete(a && a.id); return { ok:true, id:(a&&a.id) }; },
  images_place:    () => ({ combien: IMAGES.size, octets: 0,
                            combienMax: 60, octetsMax: 41943040 }),

  // --- Le Pokedex de PixelmonWorld ------------------------------------------
  //
  // Le VRAI releve, mis dans la forme que l'API rend : banc.py le lit dans
  // api/releves/pixelmonworld.json et le sert sur /banc/pw-pokedex.json. Un
  // Pokedex invente de dix especes aurait valide des filtres sur des cas qui
  // n'existent pas ; celui-ci a ses 951 entrees, ses formes regionales qui
  // partagent un numero, et Karaclee dans deux zones.
  pw_moi:          () => ({ lire:true, admin:false, gestionAcces:false }),
  pw_pokedex:      () => fetch('/banc/pw-pokedex.json').then(r => r.json()),
};

// Le journal des appels : sans lui, on ne peut pas distinguer « la fenetre s'est
// fermee » de « la suppression est vraiment partie ».
window.__appels = [];

// CE QU'UNE VERIFICATION PEUT FORCER LE TEMPS D'UN CONTROLE. compte.js retient
// `invoke` dans une constante au chargement : remplacer window.__TAURI__ apres
// coup n'a donc aucun effet sur lui, et une verification qui croit simuler une
// panne reseau simule en realite... rien du tout. Elle passait au vert sur du
// code qui n'avait pas ete exerce.
//
// Le detour passe donc par le pont lui-meme, qui est le seul point que tout le
// monde traverse. Une entree rend une valeur, ou leve si c'est une Error.
window.__forcer = {};
window.__TAURI__ = { core: { invoke: async function(cmd, args){
  window.__appels.push({ cmd: cmd, args: args || null });
  if(Object.prototype.hasOwnProperty.call(window.__forcer, cmd)){
    const v = window.__forcer[cmd];
    // TAURI REJETTE AVEC UNE CHAINE NUE, pas une Error : le Rust rend
    // `Result<_, String>`, et c'est cette chaine qui arrive telle quelle. Le
    // code de l'application la compare donc directement — `String(e) ===
    // 'SESSION_INVALIDE'`. Une verification qui leve une Error eprouve un cas
    // qui n'existe pas : `String(new Error('X'))` vaut « Error: X ».
    // D'ou les deux formes, et la premiere est celle qui ressemble au reel.
    if(v && v.__rejet !== undefined) throw v.__rejet;
    if(v instanceof Error) throw v;
    return v;
  }
  const f = REPONSES[cmd];
  if(!f) throw new Error('commande non simulee : ' + cmd);
  return f(args);
} } };
"""

# --- Le Pokedex de PixelmonWorld, tel que l'API le rendrait -----------------
#
# Le releve est la seule source de ces tables (voir importer-pixelmonworld.js) :
# on le range ici exactement comme l'import puis GET /api/pw/pokedex le feraient
# — une zone par nom, ses sous-zones, une apparition par couple espece-libelle.
# Les cles suivent la meme regle que l'import, sans quoi l'adresse d'un filtre
# eprouvee ici ne vaudrait pas sur le site.
RELEVE_PW = OUTILS.parent.parent / "api" / "releves" / "pixelmonworld.json"


def cle_zone(nom):
    """cleZoneDe() de l'import, a l'identique."""
    import unicodedata
    nu = "".join(c for c in unicodedata.normalize("NFD", str(nom or ""))
                 if unicodedata.category(c) != "Mn").lower()
    nu = re.sub(r"[^a-z0-9]+", "-", nu).strip("-")[:64]
    return nu or "zone"


@functools.lru_cache(maxsize=1)
def pokedex_pw():
    import json
    releve = json.loads(RELEVE_PW.read_text(encoding="utf-8"))
    etoiles = {r["libelle"]: r["etoiles"] for r in releve["raretes"]}

    zones, par_nom, par_libelle = [], {}, {}
    for z in releve["zones"]:
        cle = z["cle"] if z["cle"] and not z["sousZone"] else cle_zone(z["zone"])
        zone = par_nom.get(z["zone"])
        if zone is None:
            zone = {"id": len(zones) + 1, "cle": cle, "nom": z["zone"],
                    "genre": z.get("genre") or "lieu", "description": z.get("note") or "",
                    "image": "", "spawns": 0, "sousZones": []}
            zones.append(zone)
            par_nom[z["zone"]] = zone
        sous = None
        if z["sousZone"]:
            sous = {"id": 100 + sum(len(x["sousZones"]) for x in zones) + 1,
                    "cle": cle_zone(z["sousZone"]), "nom": z["sousZone"],
                    "description": "", "spawns": 0}
            zone["sousZones"].append(sous)
        par_libelle[z["libelle"]] = (zone, sous)

    especes, n = [], 0
    for f in releve["especes"]:
        cle = (f.get("espece") or f.get("nomEn") or "").strip().lower()
        spawns = []
        for libelle in f.get("zones") or []:
            if libelle not in par_libelle:
                continue
            zone, sous = par_libelle[libelle]
            n += 1
            zone["spawns"] += 1
            if sous:
                sous["spawns"] += 1
            spawns.append({"id": n, "espece": cle, "zoneId": zone["id"], "zone": zone["nom"],
                           "zoneCle": zone["cle"], "zoneGenre": zone["genre"],
                           "sousZoneId": sous["id"] if sous else None,
                           "sousZone": sous["nom"] if sous else "",
                           "etoiles": etoiles.get(f.get("rarete"), 0),
                           "rarete": f.get("rarete") or ""})
        # L'ordre de l'API : celui des zones sur la carte, pas celui de la fiche.
        spawns.sort(key=lambda s: (s["zoneId"], s["id"]))
        especes.append({"espece": cle, "numero": f.get("numero") or 0,
                        "nomFr": f.get("nomFr") or "", "nomEn": f.get("nomEn") or "",
                        "generation": f.get("generation") or 0, "types": f.get("types") or [],
                        "etoiles": etoiles.get(f.get("rarete"), 0),
                        "rarete": f.get("rarete") or "", "sprite": f.get("sprite") or "",
                        "spawns": spawns})
    especes.sort(key=lambda e: (e["numero"], e["espece"]))
    return json.dumps({"majLe": "", "raretes": releve["raretes"], "zones": zones,
                       "especes": especes}, ensure_ascii=False).encode("utf-8")


class Serveur(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        # Sur TOUTES les réponses, pas seulement la page : sans ça le navigateur
        # garde les scripts en cache et le banc valide un code qui n'est plus
        # celui du disque. Un banc qui dit « tout va bien » sur du code périmé
        # est pire que pas de banc du tout.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            html = (SRC / "index.html").read_text(encoding="utf-8")
            # Le stub doit exister avant que les scripts de l'application ne
            # s'executent ; les verifications, apres. D'ou les deux endroits.
            html = html.replace("<script src=\"js/donnees.js\">",
                                "<script>%s</script>\n<script src=\"js/donnees.js\">" % STUB, 1)
            html = html.replace("</body>",
                                '<script src="js/donnees-home.js"></script>\n'
                                '<script src="js/donnees-pokedex.js"></script>\n'
                                '<script src="outils/banc-verifications.js"></script>\n</body>', 1)
            # Une empreinte différente à chaque chargement. Les en-têtes
            # « no-store » ne suffisent pas : le navigateur garde les scripts
            # dans sa mémoire de page et ne redemande rien. Sans ça, le banc
            # peut valider un code qui n'est plus sur le disque — et c'est
            # arrivé pendant sa mise au point.
            marque = str(time.time())
            html = re.sub(r'(<script src="[^"]+\.js)"', r'\1?v=' + marque + '"', html)
            # Les feuilles de style aussi : sans elles, une correction de mise
            # en page reste invisible et l'on croit que le CSS ne s'applique pas.
            html = re.sub(r'(<link[^>]+href="[^"]+\.css)"', r'\1?v=' + marque + '"', html)
            corps = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            self.wfile.write(corps)
            return
        if self.path.split("?")[0] == "/banc/pw-pokedex.json":
            corps = pokedex_pw()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            self.wfile.write(corps)
            return
        if self.path.startswith("/outils/"):
            fichier = OUTILS / self.path[len("/outils/"):].split("?")[0]
            if fichier.exists() and fichier.suffix == ".js":
                corps = fichier.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(corps)))
                self.end_headers()
                self.wfile.write(corps)
                return
            self.send_error(404)
            return
        return super().do_GET()

    def log_message(self, *a):
        pass          # le journal HTTP noierait le rapport


def main():
    if not (SRC / "index.html").exists():
        sys.exit("index.html introuvable sous %s — lance depuis le dossier app/." % SRC)
    socketserver.TCPServer.allow_reuse_address = True
    # La racine est app/src, quel que soit le dossier d'où l'on lance : sans ça
    # tous les scripts remontent en 404 et la page reste blanche.
    handler = functools.partial(Serveur, directory=str(SRC))
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as srv:
        print("Banc d'essai   http://127.0.0.1:%d" % PORT)
        print("Le rapport s'affiche en haut de la page. Ctrl+C pour arrêter.")
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nArrêté.")


main()
