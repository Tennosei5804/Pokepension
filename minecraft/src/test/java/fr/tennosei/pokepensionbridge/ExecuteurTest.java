package fr.tennosei.pokepensionbridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import fr.tennosei.pokepensionbridge.commande.Executeur;
import fr.tennosei.pokepensionbridge.commande.Liens;
import fr.tennosei.pokepensionbridge.commande.Message;
import fr.tennosei.pokepensionbridge.donnees.Cache;
import fr.tennosei.pokepensionbridge.pont.Acces;
import fr.tennosei.pokepensionbridge.pont.ClientPont;
import fr.tennosei.pokepensionbridge.pont.Decouverte;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * De la ligne tapée à la requête reçue par PokéPension, contre un pont qui parle
 * le protocole de minecraft.rs — port, jeton, statut, catalogue, ouverture.
 */
class ExecuteurTest {

    /** Un pont de PokéPension, en miniature : le protocole de minecraft.rs. */
    static final class FauxPont {
        final HttpServer serveur;
        final String jeton;
        volatile boolean pret = true;
        volatile int protocole = 1;
        volatile JsonObject catalogue = Donnees.brut();
        final List<String> ouvertures = Collections.synchronizedList(new ArrayList<String>());
        final AtomicInteger catalogues = new AtomicInteger();
        final List<String> refusOuvrir = Collections.synchronizedList(new ArrayList<String>());

        FauxPont(String jeton) throws IOException {
            this.jeton = jeton;
            serveur = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            serveur.createContext("/", this::traiter);
            serveur.start();
        }

        int port() {
            return serveur.getAddress().getPort();
        }

        void arreter() {
            serveur.stop(0);
        }

        private void repondre(HttpExchange e, int statut, String corps) throws IOException {
            byte[] o = corps.getBytes(StandardCharsets.UTF_8);
            e.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            e.sendResponseHeaders(statut, o.length);
            OutputStream s = e.getResponseBody();
            s.write(o);
            s.close();
        }

        private void traiter(HttpExchange e) throws IOException {
            if (!jeton.equals(e.getRequestHeaders().getFirst("X-PokePension-Jeton"))) {
                repondre(e, 403, "{\"app\":\"pokepension\",\"erreur\":\"jeton\"}");
                return;
            }
            String chemin = e.getRequestURI().getPath();
            if (chemin.equals("/minecraft/statut")) {
                repondre(e, 200, "{\"app\":\"pokepension\",\"protocole\":" + protocole + ",\"pret\":" + pret + "}");
            } else if (chemin.equals("/minecraft/catalogue")) {
                catalogues.incrementAndGet();
                repondre(e, 200, catalogue.toString());
            } else if (chemin.equals("/minecraft/ouvrir") && "POST".equals(e.getRequestMethod())) {
                InputStream in = e.getRequestBody();
                String corps = new String(lire(in), StandardCharsets.UTF_8);
                ouvertures.add(corps);
                if (!refusOuvrir.isEmpty()) {
                    repondre(e, 200, refusOuvrir.remove(0));
                    return;
                }
                JsonObject d = new JsonParser().parse(corps).getAsJsonObject();
                String titre = d.has("cle") ? d.get("cle").getAsString() : d.get("cible").getAsString();
                repondre(e, 200, "{\"ok\":true,\"titre\":\"" + titre + "\"}");
            } else {
                repondre(e, 404, "{\"erreur\":\"inconnu\"}");
            }
        }
    }

    static byte[] lire(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
        byte[] t = new byte[4096];
        int n;
        while ((n = in.read(t)) > 0) {
            b.write(t, 0, n);
        }
        return b.toByteArray();
    }

    /** Ce que le mod écrirait dans le chat et au-dessus de la barre d'objets. */
    static final class Ecran implements Executeur.Sortie {
        final List<Message> chat = Collections.synchronizedList(new ArrayList<Message>());
        final List<String> barre = Collections.synchronizedList(new ArrayList<String>());

        @Override
        public void dire(Message m) {
            chat.add(m);
        }

        @Override
        public void barre(String texte) {
            barre.add(texte);
        }

        String tout() {
            StringBuilder b = new StringBuilder();
            for (Message m : chat) {
                b.append(m.brut()).append('\n');
            }
            return b.toString();
        }
    }

    private File dossier;
    private File decouverte;
    private final List<FauxPont> ponts = new ArrayList<FauxPont>();
    private Ecran ecran;
    private Liens liens;
    private Executeur executeur;

    @BeforeEach
    void preparer() throws IOException {
        dossier = Files.createTempDirectory("pp-pont").toFile();
        decouverte = new File(dossier, "pont-minecraft.json");
        System.setProperty("pokepension.decouverte", decouverte.getPath());
        ClientPont client = new ClientPont(500, 3000);
        ecran = new Ecran();
        liens = new Liens();
        executeur = new Executeur(new Acces(client, 8000), new Cache(client, 60000, null), client, liens, ecran,
                Runnable::run);
    }

    @AfterEach
    void ranger() {
        for (FauxPont p : ponts) {
            p.arreter();
        }
        System.clearProperty("pokepension.decouverte");
    }

    private void ecrireDecouverte(int port, String jeton, String exe) throws IOException {
        JsonObject o = new JsonObject();
        o.addProperty("protocole", 1);
        o.addProperty("port", port);
        o.addProperty("jeton", jeton);
        o.addProperty("exe", exe);
        Files.write(decouverte.toPath(), o.toString().getBytes(StandardCharsets.UTF_8));
    }

    private FauxPont ouverte() throws IOException {
        FauxPont p = new FauxPont("jeton-essai");
        ponts.add(p);
        ecrireDecouverte(p.port(), p.jeton, "");
        return p;
    }

    private static int portLibre() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    // --- PokéPension déjà ouverte ------------------------------------------------

    @Test
    void pokemonOuvertToutDeSuite() throws IOException {
        FauxPont p = ouverte();
        executeur.executerMaintenant("/ps pokemon Dracaufeu");
        assertEquals(Collections.singletonList("{\"cible\":\"pokemon\",\"cle\":\"charizard\"}"), p.ouvertures);
        assertEquals(Collections.singletonList("PokéPension · charizard"), ecran.barre);
        assertEquals("", ecran.tout(), "une ouverture réussie n'écrit rien dans le chat");
    }

    @Test
    void zoneEtFiltresCombines() throws IOException {
        FauxPont p = ouverte();
        executeur.executerMaintenant("/ps zone Zone01 rare Rare Epique type Feu generation 1 2");
        assertEquals("{\"cible\":\"filtres\",\"lieux\":[\"zone-1\"],\"raretes\":[\"rare\",\"epique\"],"
                + "\"types\":[\"Feu\"],\"generations\":[1,2]}", p.ouvertures.get(0));
        executeur.executerMaintenant("/ps");
        assertEquals("{\"cible\":\"accueil\"}", p.ouvertures.get(1));
        // Le catalogue n'a été demandé qu'une fois : il est frais.
        assertEquals(1, p.catalogues.get());
    }

    @Test
    void plusieursCorrespondancesPuisClic() throws IOException {
        FauxPont p = ouverte();
        executeur.executerMaintenant("/ps pokemon drac");
        assertTrue(p.ouvertures.isEmpty(), "rien d'ouvert au hasard");
        Message m = ecran.chat.get(0);
        assertTrue(m.brut().startsWith("[PokéPension] Plusieurs Pokémon pour « drac » : Dracaufeu"), m.brut());
        Message.Morceau premier = null;
        for (Message.Morceau x : m.morceaux()) {
            if (x.clic != null) {
                premier = x;
                break;
            }
        }
        // Le clic renvoie un jeton que seul le mod connaît.
        String commande = liens.enregistrer(premier.clic);
        assertTrue(liens.connu(commande));
        assertTrue(!liens.connu("/ps #000000000000"));
        executeur.executerMaintenant(commande);
        assertEquals("{\"cible\":\"pokemon\",\"cle\":\"charizard\"}", p.ouvertures.get(0));
        // Et le JSON du chat est bien celui d'un composant texte cliquable.
        JsonObject json = new JsonParser().parse(m.json(liens)).getAsJsonObject();
        JsonObject lien = null;
        for (com.google.gson.JsonElement e : json.getAsJsonArray("extra")) {
            if (lien == null && e.getAsJsonObject().has("clickEvent")) {
                lien = e.getAsJsonObject();
            }
        }
        assertEquals("Dracaufeu", lien.get("text").getAsString());
        assertEquals("run_command", lien.getAsJsonObject("clickEvent").get("action").getAsString());
        assertTrue(lien.getAsJsonObject("clickEvent").get("value").getAsString().startsWith("/ps #"));
        assertEquals("show_text", lien.getAsJsonObject("hoverEvent").get("action").getAsString());
    }

    @Test
    void introuvableEtValeurInconnue() throws IOException {
        FauxPont p = ouverte();
        executeur.executerMaintenant("/ps pokemon Dracofeu");
        executeur.executerMaintenant("/ps zone Zone99");
        executeur.executerMaintenant("/ps zone Zone01 rare Epiqeu");
        assertTrue(p.ouvertures.isEmpty());
        String chat = ecran.tout();
        assertTrue(chat.contains("Pokémon introuvable : Dracofeu — tu voulais dire Dracaufeu"), chat);
        assertTrue(chat.contains("Zone introuvable : Zone99"), chat);
        assertTrue(chat.contains("Rareté inconnue : Epiqeu. Possibles : Commun, Peu commun, Rare, Épique, Légendaire"),
                chat);
    }

    @Test
    void aideSansReseau() {
        executeur.executerMaintenant("/ps aide");
        assertEquals(4, ecran.chat.size());
        assertTrue(ecran.tout().contains("/ps pokemon <nom>"));
    }

    @Test
    void pokedexDuServeurFerme() throws IOException {
        FauxPont p = ouverte();
        JsonObject sans = new JsonParser().parse(Donnees.brut().toString()).getAsJsonObject();
        sans.addProperty("pixelmonworld", false);
        p.catalogue = sans;
        executeur.executerMaintenant("/ps zone Zone 1");
        executeur.executerMaintenant("/ps pokemon Pikachu");
        assertTrue(ecran.tout().contains("n'est pas ouvert à ton compte PokéPension"), ecran.tout());
        assertEquals(Collections.singletonList("{\"cible\":\"pokemon\",\"cle\":\"pikachu\"}"), p.ouvertures);
    }

    @Test
    void pokedexDuServeurHorsLigneOuSansCompte() throws IOException {
        FauxPont p = ouverte();
        JsonObject hors = new JsonParser().parse(Donnees.brut().toString()).getAsJsonObject();
        hors.addProperty("pixelmonworld", false);
        hors.addProperty("etatPixelmonworld", "hors-ligne");
        p.catalogue = hors;
        executeur.executerMaintenant("/ps zone Zone 1");
        assertTrue(ecran.tout().contains("n'arrive pas à joindre son serveur"), ecran.tout());
    }

    @Test
    void catalogueRedemandeQuandLApplicationAChange() throws IOException {
        FauxPont p = ouverte();
        p.refusOuvrir.add("{\"ok\":false,\"erreur\":\"inconnu\",\"valeurs\":[\"zone-1\"]}");
        executeur.executerMaintenant("/ps zone Zone 1");
        assertEquals(2, p.ouvertures.size());
        assertEquals(2, p.catalogues.get());
        assertEquals("", ecran.tout());
    }

    // --- PokéPension fermée, lente, ou d'une autre version ---------------------------

    @Test
    void fermeeElleEstLancee() throws Exception {
        // Le fichier de découverte d'un lancement précédent : le port ne répond plus.
        final File marque = new File(dossier, "lancee");
        File exe = new File(dossier, "pokepension-essai");
        Files.write(exe.toPath(), ("#!/bin/sh\ntouch '" + marque.getPath() + "'\n").getBytes(StandardCharsets.UTF_8));
        assertTrue(exe.setExecutable(true));
        ecrireDecouverte(portLibre(), "ancien-jeton", exe.getPath());

        // « PokéPension » démarre quand l'exécutable a été lancé, et réécrit le fichier.
        Thread demarrage = new Thread(() -> {
            try {
                for (int i = 0; i < 100 && !marque.exists(); i++) {
                    Thread.sleep(50);
                }
                Thread.sleep(600);
                FauxPont p = new FauxPont("nouveau-jeton");
                ponts.add(p);
                ecrireDecouverte(p.port(), p.jeton, exe.getPath());
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });
        demarrage.start();
        executeur.executerMaintenant("/ps pokemon Pikachu");
        demarrage.join();
        assertTrue(marque.exists(), "l'exécutable du fichier de découverte a été lancé");
        assertEquals("[PokéPension] Lancement de PokéPension…\n", ecran.tout());
        assertEquals(Collections.singletonList("{\"cible\":\"pokemon\",\"cle\":\"pikachu\"}"), ponts.get(0).ouvertures);
    }

    @Test
    void fermeeEtIntrouvable() throws IOException {
        executeur.executerMaintenant("/ps pokemon Pikachu");
        assertEquals("[PokéPension] Impossible de joindre PokéPension.\n", ecran.tout());
        ecrireDecouverte(portLibre(), "x", "/bin/sh");
        executeur.executerMaintenant("/ps pokemon Pikachu");
        assertTrue(ecran.tout().endsWith("[PokéPension] Impossible de joindre PokéPension.\n"),
                "on ne lance jamais un exécutable qui n'est pas PokéPension");
    }

    @Test
    void pasEncorePretePuisPrete() throws Exception {
        FauxPont p = ouverte();
        p.pret = false;
        new Thread(() -> {
            try {
                Thread.sleep(1200);
            } catch (InterruptedException e) {
                return;
            }
            p.pret = true;
        }).start();
        executeur.executerMaintenant("/ps pokemon Pikachu");
        assertEquals(1, p.ouvertures.size());
        assertEquals("", ecran.tout(), "déjà en route : rien n'est relancé ni annoncé");
    }

    @Test
    void autreProtocole() throws IOException {
        FauxPont p = ouverte();
        p.protocole = 2;
        executeur.executerMaintenant("/ps pokemon Pikachu");
        assertTrue(ecran.tout().contains("ne se comprennent plus"), ecran.tout());
        assertTrue(p.ouvertures.isEmpty());
    }

    @Test
    void jetonPerimeSansRelancer() throws IOException {
        FauxPont p = new FauxPont("le-vrai");
        ponts.add(p);
        ecrireDecouverte(p.port(), "un-autre", "");
        long debut = System.currentTimeMillis();
        executeur.executerMaintenant("/ps pokemon Pikachu");
        assertTrue(System.currentTimeMillis() - debut < 7000);
        assertEquals("[PokéPension] Impossible de joindre PokéPension.\n", ecran.tout());
        assertTrue(p.ouvertures.isEmpty());
    }

    @Test
    void delaiDepasse() throws IOException {
        HttpServer lent = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        lent.createContext("/", e -> {
            try {
                Thread.sleep(2000);
            } catch (InterruptedException ex) {
                return;
            }
            e.sendResponseHeaders(200, 0);
            e.close();
        });
        lent.start();
        try {
            ecrireDecouverte(lent.getAddress().getPort(), "j", "");
            ClientPont rapide = new ClientPont(300, 400);
            assertThrows(SocketTimeoutException.class,
                    () -> rapide.get(Decouverte.lire(), "/minecraft/statut", 400));
        } finally {
            lent.stop(0);
        }
    }

    @Test
    void reponseTropTardiveDuPont() throws IOException {
        FauxPont p = ouverte();
        p.refusOuvrir.add("{\"erreur\":\"delai\"}");
        // Le pont répond 200 ici ; un 504 réel passe par le même message.
        executeur.executerMaintenant("/ps pokemon Pikachu");
        assertTrue(ecran.tout().contains("PokéPension n'a pas pu ouvrir Pikachu"), ecran.tout());
    }
}
