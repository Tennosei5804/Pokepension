package fr.tennosei.pokepensionbridge;

import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.ExtensionPoint;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLEnvironment;
import net.minecraftforge.fml.network.FMLNetworkConstants;
import org.apache.commons.lang3.tuple.Pair;

import java.util.function.BiPredicate;
import java.util.function.Supplier;

/**
 * PokéPension Bridge : `/ps` dans le chat de Minecraft ouvre PokéPension.
 *
 * <p>100 % CÔTÉ CLIENT. Le serveur ne le voit pas, les autres joueurs n'en
 * ont pas besoin, et PixelmonWorld n'a rien à installer. Le mod n'utilise
 * aucune API de Pixelmon et n'en dépend pas.
 */
@Mod(PokepensionBridge.MODID)
public final class PokepensionBridge {

    public static final String MODID = "pokepensionbridge";

    public PokepensionBridge() {
        // « Le serveur n'a pas besoin de moi » : sans cette déclaration, la
        // liste des serveurs marquerait PixelmonWorld comme incompatible.
        ModLoadingContext.get().registerExtensionPoint(ExtensionPoint.DISPLAYTEST,
                () -> Pair.of((Supplier<String>) () -> FMLNetworkConstants.IGNORESERVERONLY,
                        (BiPredicate<String, Boolean>) (version, reseau) -> true));

        // Sur un serveur dédié, le mod ne fait rien — et ne charge pas une
        // seule classe du client.
        if (FMLEnvironment.dist == Dist.CLIENT) {
            fr.tennosei.pokepensionbridge.client.Client.demarrer();
        }
    }
}
