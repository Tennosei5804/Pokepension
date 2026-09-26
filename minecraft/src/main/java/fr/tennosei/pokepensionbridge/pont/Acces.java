package fr.tennosei.pokepensionbridge.pont;

import com.google.gson.JsonElement;

import java.io.File;
import java.io.IOException;

/**
 * S'assurer que PokéPension est là, et la lancer sinon.
 *
 * <pre>
 *   fichier de découverte → /minecraft/statut → prête ?  oui → c'est bon
 *                                              pas encore → on attend
 *                              personne ne répond → on la lance, et on attend
 * </pre>
 *
 * <p>Tout ici BLOQUE, et ne tourne donc que sur le fil du pont — jamais sur
 * celui du jeu, qui ne gèle pas une image pendant qu'on attend l'application.
 */
public final class Acces {

    public enum Etat {
        /** PokéPension répond et son interface est prête. */
        PRET,
        /** Personne ne répond, et on n'a pas demandé de la lancer. */
        INJOIGNABLE,
        /** Fermée, et impossible de trouver de quoi la lancer. */
        INTROUVABLE,
        /** Lancée, mais toujours pas prête au bout du délai. */
        DELAI,
        /** Elle répond, mais ne parle pas le même protocole que ce mod. */
        PROTOCOLE
    }

    public static final class Resultat {
        public final Etat etat;
        public final Decouverte decouverte;

        Resultat(Etat etat, Decouverte decouverte) {
            this.etat = etat;
            this.decouverte = decouverte;
        }

        public boolean pret() {
            return etat == Etat.PRET;
        }
    }

    private enum Sonde { PRET, PAS_PRET, ABSENT, AUTRE_JETON, PROTOCOLE }

    /** Entre deux lancements, pour ne pas en empiler si l'on tape `/ps` trois fois. */
    private static final long LANCEMENT_ESPACE_MS = 60000;

    private final ClientPont client;
    private final long attenteMaxMs;
    private volatile long lanceLe;

    /** @param attenteMaxMs combien attendre, au plus, qu'une PokéPension lancée soit prête */
    public Acces(ClientPont client, long attenteMaxMs) {
        this.client = client;
        this.attenteMaxMs = attenteMaxMs;
    }

    private Sonde sonder(Decouverte d) {
        if (d == null) {
            return Sonde.ABSENT;
        }
        try {
            ClientPont.Reponse r = client.get(d, "/minecraft/statut", 1500);
            if (r.statut == 403) {
                JsonElement app = r.corps.get("app");
                return app != null && "pokepension".equals(app.getAsString()) ? Sonde.AUTRE_JETON : Sonde.ABSENT;
            }
            if (!r.ok()) {
                return Sonde.ABSENT;
            }
            JsonElement p = r.corps.get("protocole");
            if (p == null || p.getAsInt() != Decouverte.PROTOCOLE) {
                return Sonde.PROTOCOLE;
            }
            JsonElement pret = r.corps.get("pret");
            return pret != null && pret.getAsBoolean() ? Sonde.PRET : Sonde.PAS_PRET;
        } catch (IOException e) {
            return Sonde.ABSENT;
        } catch (RuntimeException e) {
            return Sonde.ABSENT;
        }
    }

    /** Sans rien lancer : PokéPension est-elle là, prête ? */
    public Resultat sansLancer() {
        Decouverte d = Decouverte.lire();
        Sonde s = sonder(d);
        return new Resultat(s == Sonde.PRET ? Etat.PRET : s == Sonde.PROTOCOLE ? Etat.PROTOCOLE : Etat.INJOIGNABLE, d);
    }

    /**
     * PokéPension, prête à répondre.
     *
     * @param annonce appelé une fois, juste avant de la lancer : c'est le seul
     *                moment où le joueur doit attendre, on le lui dit.
     */
    public Resultat assurer(Runnable annonce) {
        Decouverte d = Decouverte.lire();
        Sonde s = sonder(d);
        if (s == Sonde.PRET) {
            return new Resultat(Etat.PRET, d);
        }
        if (s == Sonde.PROTOCOLE) {
            return new Resultat(Etat.PROTOCOLE, d);
        }
        // Une PokéPension qui répond avec un autre jeton vient de redémarrer :
        // son fichier sera réécrit dans l'instant. Au-delà de quelques
        // secondes, ce n'est plus ça, et on ne la relance pas pour autant.
        long echeance = System.currentTimeMillis() + (s == Sonde.AUTRE_JETON ? 5000 : attenteMaxMs);
        if (s == Sonde.ABSENT) {
            long maintenant = System.currentTimeMillis();
            if (maintenant - lanceLe > LANCEMENT_ESPACE_MS) {
                File exe = Lanceur.chercher(d);
                if (exe == null) {
                    return new Resultat(Etat.INTROUVABLE, d);
                }
                if (annonce != null) {
                    annonce.run();
                }
                try {
                    Lanceur.lancer(exe);
                } catch (IOException e) {
                    return new Resultat(Etat.INTROUVABLE, d);
                }
                lanceLe = maintenant;
            }
        }
        // Elle démarre (lancée par nous, ou déjà en route) : on relit le fichier
        // à chaque tour, puisque c'est elle qui l'écrit en démarrant.
        while (System.currentTimeMillis() < echeance) {
            try {
                Thread.sleep(350);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            d = Decouverte.lire();
            s = sonder(d);
            if (s == Sonde.PRET) {
                return new Resultat(Etat.PRET, d);
            }
            if (s == Sonde.PROTOCOLE) {
                return new Resultat(Etat.PROTOCOLE, d);
            }
        }
        return new Resultat(s == Sonde.AUTRE_JETON ? Etat.INJOIGNABLE : Etat.DELAI, d);
    }
}
