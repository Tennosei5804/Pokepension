package fr.tennosei.pokepensionbridge.client;

import com.google.gson.JsonObject;
import fr.tennosei.pokepensionbridge.Config;
import fr.tennosei.pokepensionbridge.Journal;
import fr.tennosei.pokepensionbridge.commande.Analyse;
import fr.tennosei.pokepensionbridge.commande.Executeur;
import fr.tennosei.pokepensionbridge.commande.Liens;
import fr.tennosei.pokepensionbridge.commande.Message;
import fr.tennosei.pokepensionbridge.donnees.Cache;
import fr.tennosei.pokepensionbridge.pont.Acces;
import fr.tennosei.pokepensionbridge.pont.ClientPont;
import net.minecraftforge.client.event.ClientChatEvent;
import net.minecraftforge.client.event.ClientPlayerNetworkEvent;
import net.minecraftforge.client.event.GuiOpenEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.fml.loading.FMLPaths;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Le mod côté client : quatre écoutes, et c'est tout.
 *
 * <ul>
 * <li>le CHAT — `/ps …` est lu ici et consommé : il ne part jamais au serveur ;</li>
 * <li>le TICK — pour greffer l'autocomplétion quand le serveur renvoie son arbre ;</li>
 * <li>la CONNEXION et l'OUVERTURE DU CHAT — pour rafraîchir le catalogue avant
 *     qu'on en ait besoin, sans jamais lancer PokéPension pour ça.</li>
 * </ul>
 *
 * <p>POURQUOI PAS UNE COMMANDE CLIENT DE FORGE. Forge 36 (Minecraft 1.16.5)
 * n'en a pas : `RegisterClientCommandsEvent` n'existe qu'à partir de 1.18.
 * L'événement {@link ClientChatEvent}, lui, est levé par
 * `Screen.sendMessage` avant l'envoi — l'annuler, c'est que le serveur ne
 * reçoive rien.
 */
public final class Client {

    private static Cache cache;
    private static Acces acces;
    private static Liens liens;
    private static Executeur executeur;
    private static ExecutorService fil;
    private static final AtomicBoolean rafraichissement = new AtomicBoolean();

    private Client() {
    }

    private static File dossierConfig() {
        try {
            return FMLPaths.CONFIGDIR.get().toFile();
        } catch (Throwable t) {
            return new File("config");
        }
    }

    public static void demarrer() {
        File config = dossierConfig();
        Config c = Config.charger(new File(config, "pokepensionbridge.properties"));
        Journal.debug(c.debug);

        // UN SEUL FIL, À PART DU JEU, pour tout ce qui attend : le réseau local,
        // le lancement de PokéPension. Démon : il ne retient pas la fermeture.
        fil = Executors.newSingleThreadExecutor(new ThreadFactory() {
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "PokéPension Bridge");
                t.setDaemon(true);
                return t;
            }
        });
        ClientPont client = new ClientPont(800, c.delaiReseauMs);
        acces = new Acces(client, 45000);
        cache = new Cache(client, c.dureeCacheMinutes * 60000L, new File(config, "pokepensionbridge-catalogue.json"));
        cache.chargerDisque();
        liens = new Liens();
        executeur = new Executeur(acces, cache, client, liens, new SortieJeu(), fil);
        cache.surNouveau(new Runnable() {
            @Override
            public void run() {
                Jeu.surFilJeu(new Runnable() {
                    @Override
                    public void run() {
                        Jeu.rafraichirSuggestions();
                    }
                });
            }
        });
        SuggestionsChat.preparer(cache, new Runnable() {
            @Override
            public void run() {
                rafraichirEnFond();
            }
        });

        IEventBus bus = MinecraftForge.EVENT_BUS;
        bus.addListener(EventPriority.HIGHEST, false, ClientChatEvent.class, Client::surChat);
        bus.addListener(EventPriority.NORMAL, false, TickEvent.ClientTickEvent.class, Client::surTick);
        bus.addListener(EventPriority.NORMAL, false, ClientPlayerNetworkEvent.LoggedInEvent.class,
                e -> rafraichirEnFond());
        bus.addListener(EventPriority.NORMAL, false, GuiOpenEvent.class, Client::surEcran);
        Journal.detail("PokéPension Bridge prêt");
    }

    /**
     * Le catalogue redemandé en arrière-plan, s'il est périmé et si
     * PokéPension est déjà ouverte. On ne la lance jamais pour une suggestion.
     */
    static void rafraichirEnFond() {
        if (cache == null || cache.frais() || !rafraichissement.compareAndSet(false, true)) {
            return;
        }
        fil.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Acces.Resultat r = acces.sansLancer();
                    if (r.pret()) {
                        cache.obtenir(r.decouverte, false);
                    }
                } catch (Throwable t) {
                    Journal.detail("catalogue non rafraîchi : {}", t.toString());
                } finally {
                    rafraichissement.set(false);
                }
            }
        });
    }

    static void surChat(ClientChatEvent e) {
        String ligne = e.getOriginalMessage();
        if (!Analyse.estPourNous(ligne)) {
            return;
        }
        // D'ABORD : quoi qu'il arrive ensuite, le serveur ne reçoit rien.
        e.setCanceled(true);
        try {
            ligne = ligne.trim();
            Boolean clavier = Jeu.duClavier(ligne);
            if (Boolean.FALSE.equals(clavier) && !liens.connu(ligne)) {
                // Un texte cliquable venu d'ailleurs (serveur, joueur, livre).
                Journal.info("/ps ignoré, il ne vient pas du clavier : {}", ligne);
                new SortieJeu().dire(Message.pp().texte("Commande ignorée : elle ne vient pas de ton clavier."));
                return;
            }
            if (!Boolean.FALSE.equals(clavier)) {
                Jeu.ajouterHistorique(ligne);
            }
            executeur.executer(ligne);
        } catch (Throwable t) {
            Journal.anomalie("/ps : erreur à la lecture de la commande", t);
        }
    }

    static void surTick(TickEvent.ClientTickEvent e) {
        if (e.phase != TickEvent.Phase.END) {
            return;
        }
        try {
            Object repartiteur = Jeu.commandes();
            if (repartiteur != null) {
                SuggestionsChat.greffer(repartiteur);
            }
        } catch (Throwable t) {
            Journal.detail("greffe : {}", t.toString());
        }
    }

    static void surEcran(GuiOpenEvent e) {
        try {
            if (Jeu.estChat(e.getGui())) {
                rafraichirEnFond();
            }
        } catch (Throwable t) {
            Journal.detail("écran : {}", t.toString());
        }
    }

    /** Le chat et la barre d'objets, sur le fil du jeu. */
    private static final class SortieJeu implements Executeur.Sortie {
        @Override
        public void dire(Message m) {
            final String json = m.json(liens);
            Jeu.surFilJeu(new Runnable() {
                @Override
                public void run() {
                    Jeu.afficher(json);
                }
            });
        }

        @Override
        public void barre(String texte) {
            JsonObject o = new JsonObject();
            o.addProperty("text", texte);
            o.addProperty("color", "gold");
            final String json = o.toString();
            Jeu.surFilJeu(new Runnable() {
                @Override
                public void run() {
                    Jeu.barre(json);
                }
            });
        }
    }
}
