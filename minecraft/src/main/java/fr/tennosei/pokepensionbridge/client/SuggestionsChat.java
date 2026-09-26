package fr.tennosei.pokepensionbridge.client;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.builder.RequiredArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.context.StringRange;
import com.mojang.brigadier.suggestion.Suggestion;
import com.mojang.brigadier.suggestion.Suggestions;
import com.mojang.brigadier.suggestion.SuggestionsBuilder;
import com.mojang.brigadier.tree.CommandNode;
import com.mojang.brigadier.tree.RootCommandNode;
import fr.tennosei.pokepensionbridge.Journal;
import fr.tennosei.pokepensionbridge.commande.Completeur;
import fr.tennosei.pokepensionbridge.donnees.Cache;

import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * L'autocomplétion de `/ps`, dans le chat de Minecraft tel qu'il est.
 *
 * <p>COMMENT, SANS TOUCHER AU CHAT. Le chat de 1.16.5 complète les commandes
 * à partir de l'arbre que le serveur lui a envoyé, gardé côté client dans un
 * répartiteur Brigadier. On y greffe une branche `ps` — une seule, la nôtre —
 * dont le fournisseur de suggestions répond depuis le catalogue en mémoire.
 * Rien n'est remplacé : ni l'écran, ni l'assistant de suggestions, ni les
 * autres commandes, dont les suggestions continuent de venir du serveur.
 *
 * <p>RIEN NE PART AU SERVEUR. Une branche qui fournit ses propres
 * suggestions ne demande rien au réseau (seules celles marquées « demander au
 * serveur » le font), et la commande elle-même est interceptée avant l'envoi.
 *
 * <p>LA GREFFE EST REFAITE quand le serveur renvoie son arbre (connexion,
 * changement de permissions) : le client jette alors l'ancien répartiteur et
 * en bâtit un neuf. On le remarque à chaque tick — une comparaison de
 * références, rien de plus.
 */
final class SuggestionsChat {

    private static CommandNode<Object> branche;
    private static WeakReference<Object> greffe = new WeakReference<Object>(null);
    private static Cache cache;
    private static Runnable rafraichir;
    private static boolean retraitImpossible;

    private SuggestionsChat() {
    }

    static void preparer(Cache c, Runnable rafraichirEnFond) {
        cache = c;
        rafraichir = rafraichirEnFond;
        LiteralArgumentBuilder<Object> ps = LiteralArgumentBuilder.<Object>literal("ps").executes(ctx -> 0);
        ps.then(RequiredArgumentBuilder.<Object, String>argument("requête", StringArgumentType.greedyString())
                .suggests(SuggestionsChat::fournir)
                .executes(ctx -> 0));
        branche = ps.build();
    }

    /** Greffe la branche `ps` si ce répartiteur ne l'a pas encore. FIL DU JEU. */
    @SuppressWarnings("unchecked")
    static void greffer(Object repartiteur) {
        if (branche == null || !(repartiteur instanceof CommandDispatcher)) {
            return;
        }
        RootCommandNode<Object> racine = ((CommandDispatcher<Object>) repartiteur).getRoot();
        if (racine == greffe.get()) {
            return;
        }
        CommandNode<Object> existant = racine.getChild("ps");
        if (existant != null && existant != branche) {
            // Le serveur a sa propre commande `ps` : elle ne peut de toute façon
            // plus rien recevoir, `/ps` étant consommé ici. On la retire de
            // l'arbre local pour que ses suggestions ne se mêlent pas aux nôtres.
            retirer(racine, "ps");
        }
        if (racine.getChild("ps") == null) {
            racine.addChild(branche);
        }
        greffe = new WeakReference<Object>(racine);
        Journal.detail("autocomplétion de /ps greffée");
    }

    /** Brigadier n'a pas de retrait public : ses tables, par leur nom (non obfusqué). */
    @SuppressWarnings("unchecked")
    private static void retirer(CommandNode<Object> racine, String nom) {
        if (retraitImpossible) {
            return;
        }
        try {
            for (String champ : new String[] {"children", "literals", "arguments"}) {
                Field f = CommandNode.class.getDeclaredField(champ);
                f.setAccessible(true);
                ((Map<String, ?>) f.get(racine)).remove(nom);
            }
        } catch (Throwable t) {
            retraitImpossible = true;
            Journal.detail("commande ps du serveur conservée : {}", t.toString());
        }
    }

    /** Le fournisseur de suggestions : instantané, depuis le catalogue en mémoire. */
    static CompletableFuture<Suggestions> fournir(CommandContext<Object> ctx, SuggestionsBuilder b) {
        try {
            if (rafraichir != null) {
                rafraichir.run();
            }
            Completeur.Proposition p = Completeur.suggerer(b.getRemaining(), cache == null ? null : cache.actuel());
            if (p.textes.isEmpty()) {
                return Suggestions.empty();
            }
            StringRange r = StringRange.between(b.getStart() + p.debut, b.getInput().length());
            List<Suggestion> l = new ArrayList<Suggestion>();
            for (String t : p.textes) {
                l.add(new Suggestion(r, t));
            }
            // Construites à la main, et non par SuggestionsBuilder : celui-ci
            // trie par ordre alphabétique, et l'on perdrait « ce qui s'ouvrirait
            // vient en premier ».
            return CompletableFuture.completedFuture(new Suggestions(r, l));
        } catch (Throwable t) {
            Journal.detail("suggestions : {}", t.toString());
            return Suggestions.empty();
        }
    }
}
