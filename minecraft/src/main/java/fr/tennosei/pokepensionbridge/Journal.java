package fr.tennosei.pokepensionbridge;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Le journal du mod, dans `logs/latest.log`.
 *
 * <p>SILENCIEUX PAR DÉFAUT. Une utilisation normale n'y écrit rien ; le mode
 * debug (config/pokepensionbridge.properties, `debug=true`) y raconte chaque
 * commande, chaque appel au pont et sa durée. Les vraies anomalies — une API
 * de Minecraft introuvable, par exemple — s'écrivent toujours, une fois.
 */
public final class Journal {

    private static final Logger LOG = LogManager.getLogger("PokéPension Bridge");
    private static volatile boolean debug;

    private Journal() {
    }

    public static void debug(boolean actif) {
        debug = actif;
    }

    public static boolean enDebug() {
        return debug;
    }

    public static void detail(String message, Object... args) {
        if (debug) {
            LOG.info(message, args);
        }
    }

    public static void info(String message, Object... args) {
        LOG.info(message, args);
    }

    public static void anomalie(String message, Throwable t) {
        LOG.warn(message, t);
    }
}
