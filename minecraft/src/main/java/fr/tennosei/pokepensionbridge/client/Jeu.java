package fr.tennosei.pokepensionbridge.client;

import fr.tennosei.pokepensionbridge.Journal;
import net.minecraftforge.fml.common.ObfuscationReflectionHelper;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.concurrent.Executor;

/**
 * Tout ce que le mod touche dans Minecraft, et rien de plus.
 *
 * <p>PAR LEUR NOM D'EXÉCUTION. Minecraft 1.16.5 sous Forge 36 tourne avec les
 * noms « SRG » (`func_71410_x` pour `getInstance`). On les appelle par
 * {@link ObfuscationReflectionHelper}, qui les traduit dans l'environnement de
 * développement et les laisse tels quels en jeu. Chacun a été relevé dans
 * MCPConfig 1.16.5 et recoupé avec d'autres tables publiques — voir
 * outils/verifier-noms.py, qui refait la vérification.
 *
 * <p>UNE PANNE ICI N'EN EST PAS UNE POUR LE JEU. Si un nom manquait (une
 * version inattendue de Minecraft), le mod l'écrit une fois dans le journal et
 * se met en veille : le chat, les commandes du serveur et Pixelmon continuent
 * comme si de rien n'était.
 */
public final class Jeu {

    // Les classes, sous leur nom d'exécution (celui de MCPConfig).
    private static final String MINECRAFT = "net.minecraft.client.Minecraft";
    private static final String RESEAU = "net.minecraft.client.network.play.ClientPlayNetHandler";
    private static final String HUD = "net.minecraft.client.gui.IngameGui";
    private static final String CHAT = "net.minecraft.client.gui.NewChatGui";
    private static final String ECRAN_CHAT = "net.minecraft.client.gui.screen.ChatScreen";
    private static final String ECRAN_LIVRE = "net.minecraft.client.gui.screen.ReadBookScreen";
    private static final String CHAMP = "net.minecraft.client.gui.widget.TextFieldWidget";
    private static final String SUGGESTIONS = "net.minecraft.client.gui.CommandSuggestionHelper";
    private static final String TEXTE = "net.minecraft.util.text.ITextComponent";
    private static final String TEXTE_JSON = "net.minecraft.util.text.ITextComponent$Serializer";

    private static Method getInstance;      // Minecraft.getInstance()
    private static Method getConnection;    // Minecraft.getConnection()
    private static Field gui;               // Minecraft.gui
    private static Field screen;            // Minecraft.screen
    private static Method getCommands;      // ClientPlayNetHandler.getCommands()
    private static Method getChat;          // IngameGui.getChat()
    private static Method setOverlay;       // IngameGui.setOverlayMessage(ITextComponent, boolean)
    private static Method addMessage;       // NewChatGui.addMessage(ITextComponent)
    private static Method addRecentChat;    // NewChatGui.addRecentChat(String)
    private static Field input;             // ChatScreen.input
    private static Field commandSuggestions; // ChatScreen.commandSuggestions
    private static Method getValue;         // TextFieldWidget.getValue()
    private static Method updateCommandInfo; // CommandSuggestionHelper.updateCommandInfo()
    private static Method fromJson;         // ITextComponent.Serializer.fromJson(String)
    private static Class<?> ecranChat;
    private static Class<?> ecranLivre;

    private static volatile boolean pret;
    private static volatile boolean enVeille;

    private Jeu() {
    }

    /** Relève les membres une fois. Faux si Minecraft n'est pas celui qu'on attend. */
    static synchronized boolean preparer() {
        if (pret || enVeille) {
            return pret;
        }
        try {
            Class<?> mc = Class.forName(MINECRAFT);
            Class<?> hud = Class.forName(HUD);
            Class<?> chat = Class.forName(CHAT);
            Class<?> texte = Class.forName(TEXTE);
            getInstance = ObfuscationReflectionHelper.findMethod(mc, "func_71410_x");
            getConnection = ObfuscationReflectionHelper.findMethod(mc, "func_147114_u");
            gui = ObfuscationReflectionHelper.findField(mc, "field_71456_v");
            screen = ObfuscationReflectionHelper.findField(mc, "field_71462_r");
            getCommands = ObfuscationReflectionHelper.findMethod(Class.forName(RESEAU), "func_195515_i");
            getChat = ObfuscationReflectionHelper.findMethod(hud, "func_146158_b");
            setOverlay = ObfuscationReflectionHelper.findMethod(hud, "func_175188_a", texte, boolean.class);
            addMessage = ObfuscationReflectionHelper.findMethod(chat, "func_146227_a", texte);
            addRecentChat = ObfuscationReflectionHelper.findMethod(chat, "func_146239_a", String.class);
            ecranChat = Class.forName(ECRAN_CHAT);
            ecranLivre = Class.forName(ECRAN_LIVRE);
            input = ObfuscationReflectionHelper.findField(ecranChat, "field_146415_a");
            commandSuggestions = ObfuscationReflectionHelper.findField(ecranChat, "field_228174_e_");
            getValue = ObfuscationReflectionHelper.findMethod(Class.forName(CHAMP), "func_146179_b");
            updateCommandInfo = ObfuscationReflectionHelper.findMethod(Class.forName(SUGGESTIONS), "func_228111_a_");
            fromJson = ObfuscationReflectionHelper.findMethod(Class.forName(TEXTE_JSON), "func_240643_a_", String.class);
            pret = true;
        } catch (Throwable t) {
            enVeille = true;
            Journal.anomalie("Minecraft n'a pas la forme attendue (1.16.5, Forge 36) : PokéPension Bridge se met en veille", t);
        }
        return pret;
    }

    private static Object minecraft() throws Exception {
        return getInstance.invoke(null);
    }

    /** Exécute sur le fil du jeu — le seul d'où l'on touche à l'écran. */
    public static void surFilJeu(Runnable r) {
        if (!preparer()) {
            return;
        }
        try {
            ((Executor) minecraft()).execute(r);
        } catch (Throwable t) {
            Journal.anomalie("fil du jeu injoignable", t);
        }
    }

    private static Object composant(String json) throws Exception {
        return fromJson.invoke(null, json);
    }

    /** Une ligne dans le chat, pour soi seul. FIL DU JEU. */
    public static void afficher(String json) {
        if (!preparer()) {
            return;
        }
        try {
            Object chat = getChat.invoke(gui.get(minecraft()));
            addMessage.invoke(chat, composant(json));
        } catch (Throwable t) {
            Journal.anomalie("message non affiché", t);
        }
    }

    /** Une ligne au-dessus de la barre d'objets, qui s'efface d'elle-même. FIL DU JEU. */
    public static void barre(String json) {
        if (!preparer()) {
            return;
        }
        try {
            setOverlay.invoke(gui.get(minecraft()), composant(json), Boolean.FALSE);
        } catch (Throwable t) {
            Journal.anomalie("barre non affichée", t);
        }
    }

    /**
     * Garder `/ps …` dans l'historique du chat (flèche du haut). Annulé avant
     * d'être envoyé, le message n'y entre pas tout seul.
     */
    public static void ajouterHistorique(String ligne) {
        if (!preparer()) {
            return;
        }
        try {
            addRecentChat.invoke(getChat.invoke(gui.get(minecraft())), ligne);
        } catch (Throwable t) {
            Journal.detail("historique : {}", t.toString());
        }
    }

    /**
     * La ligne vient-elle du clavier ?
     *
     * <p>Entrée dans le chat : le champ de saisie contient encore exactement la
     * ligne. Un clic sur un texte du chat, lui, envoie une commande qui n'est
     * pas dans le champ ; une page de livre aussi. On rend FAUX dans ces deux
     * cas, VRAI quand le champ correspond, et null quand on ne sait pas dire
     * (un écran de chat remplacé par un autre mod) — on laisse alors passer :
     * le pire qu'un `/ps` puisse faire est d'ouvrir une page de PokéPension.
     */
    public static Boolean duClavier(String ligne) {
        if (!preparer()) {
            return null;
        }
        try {
            Object ecran = screen.get(minecraft());
            if (ecranChat.isInstance(ecran)) {
                Object champ = input.get(ecran);
                Object valeur = champ == null ? null : getValue.invoke(champ);
                return valeur != null && ligne.trim().equals(String.valueOf(valeur).trim());
            }
            if (ecranLivre.isInstance(ecran)) {
                return Boolean.FALSE;
            }
            return null;
        } catch (Throwable t) {
            return null;
        }
    }

    /** Le répartiteur de commandes du client, ou null hors d'un monde. FIL DU JEU. */
    public static Object commandes() {
        if (!preparer()) {
            return null;
        }
        try {
            Object reseau = getConnection.invoke(minecraft());
            return reseau == null ? null : getCommands.invoke(reseau);
        } catch (Throwable t) {
            return null;
        }
    }

    public static boolean estChat(Object ecran) {
        return preparer() && ecranChat.isInstance(ecran);
    }

    /**
     * Le chat ouvert sur `/ps` redemande ses suggestions : le catalogue vient
     * d'arriver, et Tab doit le voir sans qu'on retape une lettre. FIL DU JEU.
     */
    public static void rafraichirSuggestions() {
        if (!preparer()) {
            return;
        }
        try {
            Object ecran = screen.get(minecraft());
            if (!ecranChat.isInstance(ecran)) {
                return;
            }
            Object champ = input.get(ecran);
            Object valeur = champ == null ? null : getValue.invoke(champ);
            if (valeur == null || !String.valueOf(valeur).trim().toLowerCase(java.util.Locale.ROOT).startsWith("/ps")) {
                return;
            }
            Object aide = commandSuggestions.get(ecran);
            if (aide != null) {
                updateCommandInfo.invoke(aide);
            }
        } catch (Throwable t) {
            Journal.detail("suggestions non rafraîchies : {}", t.toString());
        }
    }
}
