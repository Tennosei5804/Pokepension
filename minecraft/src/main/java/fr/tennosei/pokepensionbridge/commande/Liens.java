package fr.tennosei.pokepensionbridge.commande;

import java.security.SecureRandom;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Les propositions cliquables que le mod écrit dans le chat.
 *
 * <p>POURQUOI UN JETON ET PAS LA COMMANDE EN CLAIR. Un clic sur un texte du
 * chat envoie une commande — et n'importe quel serveur, n'importe quel joueur
 * peut écrire dans le chat un texte cliquable. Le mod n'exécute donc un `/ps`
 * qui ne vient pas du clavier que s'il porte un jeton qu'il a lui-même tiré au
 * sort, pour un message qu'il a lui-même écrit. Personne d'autre ne le connaît.
 */
public final class Liens {

    private static final long DUREE_MS = 15 * 60 * 1000;
    private static final int MAX = 256;

    private static final class Entree {
        final Demande demande;
        final long cree;

        Entree(Demande demande, long cree) {
            this.demande = demande;
            this.cree = cree;
        }
    }

    private final SecureRandom hasard = new SecureRandom();
    private final Map<String, Entree> liens = new LinkedHashMap<String, Entree>();

    /** La commande à mettre derrière le clic : « /ps #3f9a0c1b2d ». */
    public synchronized String enregistrer(Demande d) {
        byte[] octets = new byte[6];
        hasard.nextBytes(octets);
        StringBuilder b = new StringBuilder();
        for (byte o : octets) {
            b.append(String.format("%02x", o & 0xff));
        }
        String jeton = b.toString();
        liens.put(jeton, new Entree(d, System.currentTimeMillis()));
        while (liens.size() > MAX) {
            Iterator<String> it = liens.keySet().iterator();
            it.next();
            it.remove();
        }
        return "/ps #" + jeton;
    }

    /** La demande derrière un jeton, s'il vient de nous et n'a pas expiré. */
    public synchronized Demande prendre(String jeton) {
        Entree e = liens.get(jeton);
        if (e == null || System.currentTimeMillis() - e.cree > DUREE_MS) {
            return null;
        }
        return e.demande;
    }

    /** Ce texte est-il un de nos liens encore valables ? */
    public synchronized boolean connu(String ligne) {
        Analyse a = Analyse.estPourNous(ligne) ? Analyse.analyser(ligne) : null;
        return a != null && a.genre == Analyse.Genre.LIEN && prendre(a.texte) != null;
    }
}
