package fr.tennosei.pokepensionbridge.donnees;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import fr.tennosei.pokepensionbridge.pont.ClientPont;
import fr.tennosei.pokepensionbridge.pont.Decouverte;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/**
 * Le catalogue de PokéPension, gardé sous la main pour que Tab réponde
 * instantanément.
 *
 * <p>POKÉPENSION RESTE LA SOURCE. Le cache vit quelques minutes en mémoire
 * (réglable), puis se redemande tout seul — à la connexion à un serveur, à
 * l'ouverture du chat, à chaque `/ps`. Ce qu'on ouvre est toujours revérifié
 * par l'application : un cache en retard peut proposer un nom de trop, jamais
 * ouvrir une page fausse.
 *
 * <p>UNE COPIE SUR LE DISQUE, PETITE ET BORNÉE : les noms seuls (quelque 80
 * Ko), pour que la complétion marche aussi quand PokéPension est fermée — on
 * tape `/ps pokemon dra`, Tab propose, et c'est l'Entrée qui la lance. Plus
 * vieille d'une semaine, elle est ignorée.
 */
public final class Cache {

    /** Au-delà, la copie disque ne sert plus du tout. */
    private static final long DISQUE_MAX_MS = 7L * 24 * 3600 * 1000;

    private final ClientPont client;
    private final long dureeMs;
    private final File disque;

    private volatile Catalogue catalogue;
    private volatile long recuLe;
    private volatile Runnable surNouveau;

    public Cache(ClientPont client, long dureeMs, File disque) {
        this.client = client;
        this.dureeMs = dureeMs;
        this.disque = disque;
    }

    /** Ce qu'on a, frais ou non ; null si l'on n'a jamais rien eu. */
    public Catalogue actuel() {
        return catalogue;
    }

    public boolean frais() {
        return catalogue != null && System.currentTimeMillis() - recuLe < dureeMs;
    }

    /** Prévenu à chaque nouveau catalogue — pour rafraîchir les suggestions affichées. */
    public void surNouveau(Runnable r) {
        this.surNouveau = r;
    }

    /**
     * Le catalogue, redemandé s'il est périmé (ou si `forcer`). BLOQUANT : sur
     * le fil du pont seulement.
     */
    public synchronized Catalogue obtenir(Decouverte d, boolean forcer) throws IOException {
        if (!forcer && frais()) {
            return catalogue;
        }
        ClientPont.Reponse r = client.get(d, "/minecraft/catalogue", Math.max(client.delaiLecture(), 30000));
        if (!r.ok()) {
            throw new IOException("catalogue : HTTP " + r.statut + " " + r.erreur());
        }
        Catalogue c = Catalogue.lire(r.corps);
        catalogue = c;
        recuLe = System.currentTimeMillis();
        ecrireDisque(r.corps);
        Runnable n = surNouveau;
        if (n != null) {
            n.run();
        }
        return c;
    }

    /** Relit la copie disque, si elle est assez récente. */
    public void chargerDisque() {
        if (disque == null || !disque.isFile()) {
            return;
        }
        try {
            if (System.currentTimeMillis() - disque.lastModified() > DISQUE_MAX_MS) {
                return;
            }
            String texte = new String(Files.readAllBytes(disque.toPath()), StandardCharsets.UTF_8);
            JsonElement e = new JsonParser().parse(texte);
            if (e.isJsonObject() && catalogue == null) {
                catalogue = Catalogue.lire(e.getAsJsonObject());
                // Aussitôt périmé : c'est une réserve, pas une réponse.
                recuLe = 0;
            }
        } catch (Exception e) {
            // Une copie illisible ne vaut rien : on attend la vraie.
        }
    }

    private void ecrireDisque(JsonObject corps) {
        if (disque == null) {
            return;
        }
        try {
            File dossier = disque.getParentFile();
            if (dossier != null && !dossier.isDirectory() && !dossier.mkdirs()) {
                return;
            }
            // Les noms seuls : ni sessions, ni jetons, ni rien du Pokédex au-delà.
            JsonObject copie = new JsonObject();
            for (String cle : new String[] {"connecte", "pixelmonworld", "pokemon", "zones", "raretes", "types",
                "generations"}) {
                if (corps.has(cle)) {
                    copie.add(cle, corps.get(cle));
                }
            }
            File provisoire = new File(disque.getPath() + ".tmp");
            Files.write(provisoire.toPath(), copie.toString().getBytes(StandardCharsets.UTF_8));
            Files.move(provisoire.toPath(), disque.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            // Sans copie, la complétion attendra PokéPension : rien de grave.
        }
    }
}
