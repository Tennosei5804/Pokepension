package fr.tennosei.pokepensionbridge.commande;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import fr.tennosei.pokepensionbridge.Journal;
import fr.tennosei.pokepensionbridge.donnees.Cache;
import fr.tennosei.pokepensionbridge.donnees.Catalogue;
import fr.tennosei.pokepensionbridge.pont.Acces;
import fr.tennosei.pokepensionbridge.pont.ClientPont;
import fr.tennosei.pokepensionbridge.pont.Decouverte;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * Une ligne `/ps …`, du chat jusqu'à la page ouverte dans PokéPension.
 *
 * <pre>
 *   analyser → s'assurer que PokéPension est là (la lancer sinon)
 *            → catalogue → résoudre les noms en clés → ouvrir
 * </pre>
 *
 * <p>RIEN NE BLOQUE LE JEU : {@link #executer} rend la main aussitôt et tout
 * le reste tourne sur le fil du pont. Ce qui doit s'afficher repasse par la
 * {@link Sortie}, que le mod branche sur le fil du jeu.
 *
 * <p>PEU DE MESSAGES. Une ouverture réussie ne dit qu'une ligne discrète,
 * au-dessus de la barre d'objets ; le chat ne sert qu'à ce qui demande une
 * réponse — plusieurs Pokémon possibles, un nom introuvable, un lancement.
 */
public final class Executeur {

    /** Où le mod écrit : le chat, et la ligne au-dessus de la barre d'objets. */
    public interface Sortie {
        void dire(Message m);

        void barre(String texte);
    }

    private final Acces acces;
    private final Cache cache;
    private final ClientPont client;
    private final Liens liens;
    private final Sortie sortie;
    private final Executor fil;

    public Executeur(Acces acces, Cache cache, ClientPont client, Liens liens, Sortie sortie, Executor fil) {
        this.acces = acces;
        this.cache = cache;
        this.client = client;
        this.liens = liens;
        this.sortie = sortie;
        this.fil = fil;
    }

    /** Sur le fil du jeu : lance la commande et rend la main. */
    public void executer(final String ligne) {
        fil.execute(new Runnable() {
            @Override
            public void run() {
                long debut = System.currentTimeMillis();
                try {
                    executerMaintenant(ligne);
                } catch (Throwable t) {
                    Journal.anomalie("/ps : erreur inattendue pour « " + ligne + " »", t);
                    sortie.dire(Message.pp().texte("Quelque chose s'est mal passé. Le détail est dans logs/latest.log."));
                } finally {
                    Journal.detail("/ps « {} » traité en {} ms", ligne, System.currentTimeMillis() - debut);
                }
            }
        });
    }

    /** Le corps de la commande, BLOQUANT. Les essais l'appellent directement. */
    public void executerMaintenant(String ligne) {
        Analyse a = Analyse.analyser(ligne);
        switch (a.genre) {
            case AIDE:
                aide();
                return;
            case LIEN: {
                Demande d = liens.prendre(a.texte);
                if (d == null) {
                    sortie.dire(Message.pp().texte("Ce lien a expiré — retape la commande."));
                    return;
                }
                Acces.Resultat r = pret();
                if (r != null) {
                    ouvrir(r.decouverte, d, null, false);
                }
                return;
            }
            case ACCUEIL: {
                Acces.Resultat r = pret();
                if (r != null) {
                    ouvrir(r.decouverte, Demande.accueil(), null, false);
                }
                return;
            }
            default:
                break;
        }

        Acces.Resultat r = pret();
        if (r == null) {
            return;
        }
        Catalogue cat;
        try {
            cat = cache.obtenir(r.decouverte, false);
        } catch (IOException e) {
            Journal.detail("catalogue indisponible : {}", e.toString());
            sortie.dire(Message.pp().texte("PokéPension n'a pas donné ses données. Réessaie dans un instant."));
            return;
        }
        Issue issue = Resolveur.resoudre(a, cat);
        if (issue.genre == Issue.Genre.OUVRIR) {
            ouvrir(r.decouverte, issue.demande, a, true);
        } else {
            dire(issue, cat);
        }
    }

    /** PokéPension, prête ; null (et le joueur prévenu) si elle ne l'est pas. */
    private Acces.Resultat pret() {
        Acces.Resultat r = acces.assurer(new Runnable() {
            @Override
            public void run() {
                sortie.dire(Message.pp().texte("Lancement de PokéPension…"));
            }
        });
        switch (r.etat) {
            case PRET:
                return r;
            case PROTOCOLE:
                sortie.dire(Message.pp().texte("Ce mod et PokéPension ne se comprennent plus : "
                        + "mets PokéPension à jour, elle mettra le mod à jour à son tour."));
                return null;
            case DELAI:
                sortie.dire(Message.pp().texte("PokéPension ne répond pas. Réessaie dans un instant."));
                return null;
            default:
                sortie.dire(Message.pp().texte("Impossible de joindre PokéPension."));
                return null;
        }
    }

    private void ouvrir(Decouverte d, Demande demande, Analyse a, boolean reessayer) {
        ClientPont.Reponse rep;
        try {
            rep = client.post(d, "/minecraft/ouvrir", demande.json(), 20000);
        } catch (SocketTimeoutException e) {
            sortie.dire(Message.pp().texte("PokéPension ne répond pas. Réessaie dans un instant."));
            return;
        } catch (IOException e) {
            sortie.dire(Message.pp().texte("Impossible de joindre PokéPension."));
            return;
        }
        JsonElement ok = rep.corps.get("ok");
        if (rep.ok() && ok != null && ok.getAsBoolean()) {
            JsonElement titre = rep.corps.get("titre");
            sortie.barre("PokéPension · " + (titre != null ? titre.getAsString() : demande.libelle));
            return;
        }
        String erreur = rep.erreur();
        Journal.detail("ouverture refusée : HTTP {} {}", rep.statut, rep.corps);
        if (rep.statut == 504) {
            sortie.dire(Message.pp().texte("PokéPension ne répond pas. Réessaie dans un instant."));
            return;
        }
        if ("pixelmonworld".equals(erreur)) {
            // L'état a pu changer depuis le catalogue (connexion perdue) : on le relit.
            Catalogue cat = cache.actuel();
            try {
                cat = cache.obtenir(d, true);
            } catch (IOException e) {
                // On garde ce qu'on avait.
            }
            dire(Issue.inaccessible(), cat);
            return;
        }
        // Le catalogue a changé depuis qu'on l'a lu (un relevé réimporté, une
        // zone renommée) : on le redemande, et on réessaie une fois.
        if (reessayer && a != null && ("inconnu".equals(erreur) || "introuvable".equals(erreur))) {
            try {
                Catalogue cat = cache.obtenir(d, true);
                Issue issue = Resolveur.resoudre(a, cat);
                if (issue.genre == Issue.Genre.OUVRIR) {
                    ouvrir(d, issue.demande, a, false);
                } else {
                    dire(issue, cat);
                }
                return;
            } catch (IOException e) {
                // On retombe sur le message ci-dessous.
            }
        }
        Message m = Message.pp().texte("PokéPension n'a pas pu ouvrir ").valeur(demande.libelle);
        JsonElement valeurs = rep.corps.get("valeurs");
        if (valeurs != null && valeurs.isJsonArray() && ((JsonArray) valeurs).size() > 0) {
            m.texte(" — inconnu : ").valeur(valeurs.toString());
        }
        sortie.dire(m.texte("."));
    }

    private static String majuscule(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private void liste(Message m, List<Issue.Choix> choix) {
        int n = Math.min(choix.size(), Resolveur.CHOIX_MAX);
        for (int i = 0; i < n; i++) {
            if (i > 0) {
                m.texte(" · ");
            }
            m.lien(choix.get(i).libelle, choix.get(i).demande);
        }
        if (choix.size() > n) {
            m.texte(" … (+" + (choix.size() - n) + ")");
        }
    }

    private void dire(Issue issue, Catalogue cat) {
        Message m = Message.pp();
        switch (issue.genre) {
            case AMBIGU:
                m.texte("Plusieurs " + ("zone".equals(issue.sujet) ? "zones" : issue.sujet)
                        + " pour « ").valeur(issue.cherche).texte(" » : ");
                liste(m, issue.choix);
                break;
            case INTROUVABLE:
                m.texte(majuscule(issue.sujet) + " introuvable : ").valeur(issue.cherche);
                if (!issue.choix.isEmpty()) {
                    m.texte(" — tu voulais dire ");
                    liste(m, issue.choix);
                    m.texte(" ?");
                }
                break;
            case INACCESSIBLE: {
                String etat = cat == null ? "" : cat.etatPixelmonworld;
                if ("sans-compte".equals(etat)) {
                    m.texte("Connecte-toi dans PokéPension pour voir les zones de PixelmonWorld.");
                } else if ("hors-ligne".equals(etat)) {
                    m.texte("PokéPension n'arrive pas à joindre son serveur : les zones de PixelmonWorld "
                            + "reviendront avec la connexion. Les fiches, elles, marchent.");
                } else {
                    m.texte("Le Pokédex de PixelmonWorld n'est pas ouvert à ton compte PokéPension.");
                }
                break;
            }
            case INVALIDE:
            default:
                if ("commande".equals(issue.sujet)) {
                    m.texte("Rien trouvé pour « ").valeur(issue.cherche).texte(" ». Tape /ps aide.");
                } else if (issue.cherche.isEmpty() || "valeur".equals(issue.sujet)) {
                    m.texte(issue.detail);
                } else {
                    boolean masculin = "type".equals(issue.sujet);
                    m.texte(majuscule(issue.sujet) + (masculin ? " inconnu : " : " inconnue : "))
                            .valeur(issue.cherche);
                    if (!issue.detail.isEmpty()) {
                        m.texte(". " + issue.detail);
                    }
                }
                break;
        }
        sortie.dire(m);
    }

    private void aide() {
        sortie.dire(Message.pp().texte("Tab complète chaque mot. Alias : p, z, d."));
        sortie.dire(new Message().valeur(" /ps pokemon <nom>").texte(" — la fiche : /ps pokemon Dracaufeu"));
        sortie.dire(new Message().valeur(" /ps zone <zone> [rare …] [type …] [generation …] [sous-zone …]")
                .texte(" — /ps zone Zone 1 rare Rare Épique type Feu"));
        sortie.dire(new Message().valeur(" /ps dex [rare …] [type …] [generation …]")
                .texte(" — le Pokédex du serveur filtré · ").valeur("/ps").texte(" seul ouvre PokéPension"));
    }
}
