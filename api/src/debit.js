// Limitation de débit.
//
// Tant que l'API vivait sur 127.0.0.1, la question ne se posait pas : le seul
// client possible était sur la même machine. Publiée, elle est atteignable par
// n'importe qui, et rien n'empêchait de marteler /auth/discord ou de parcourir
// les Pokédex de tout le monde en boucle.
//
// Deux risques, et le second est le plus concret : une base qu'on épuise, et
// un hébergement gratuit dont les règles interdisent explicitement de « trop
// consommer de CPU ». Ce n'est pas le service qui tomberait en premier, c'est
// le compte qui serait suspendu.
//
// Sans dépendance, comme le reste : le service n'en a que trois, et une
// fenêtre glissante tient en trente lignes. Un express-rate-limit apporterait
// un magasin Redis et des en-têtes normalisés dont personne ici n'a l'usage.
//
// La mémoire est celle du processus : redémarrer remet les compteurs à zéro,
// et deux instances ne partageraient rien. C'est acceptable — on se protège
// d'un martèlement, pas d'une attaque distribuée, et le VPS n'en fait
// tourner qu'une.

const compteurs = new Map();

// Le ménage ne tourne pas sur une minuterie : une minuterie garde le processus
// éveillé pour rien. Il se fait au fil des requêtes, une fois sur deux cents.
let depuisLeMenage = 0;
const MENAGE_TOUS_LES = 200;

function menage(maintenant) {
  for (const [cle, seau] of compteurs) {
    if (seau.expire <= maintenant) compteurs.delete(cle);
  }
}

/**
 * Qui parle, vu depuis le proxy.
 *
 * `req.ip` ne vaut que si « trust proxy » est déclaré : sans lui, Express rend
 * l'adresse de Caddy, la même pour tout le monde — et la
 * limitation bloquerait tous les visiteurs à la fois plutôt que le seul qui
 * abuse. C'est déclaré dans serveur.js, et il faut que les deux restent
 * d'accord.
 */
function qui(req) {
  return req.ip || req.socket?.remoteAddress || 'inconnu';
}

/**
 * Une fenêtre glissante par adresse et par classe de route.
 *
 * options : nom (la classe), max (requêtes autorisées), fenetre (millisecondes)
 */
export function limiter({ nom, max, fenetre }) {
  return function (req, res, next) {
    const maintenant = Date.now();

    if (++depuisLeMenage >= MENAGE_TOUS_LES) {
      depuisLeMenage = 0;
      menage(maintenant);
    }

    const cle = `${nom}|${qui(req)}`;
    let seau = compteurs.get(cle);

    // Fenêtre échue : on repart de zéro plutôt que de décrémenter. Une fenêtre
    // fixe se contourne en tirant à cheval sur deux fenêtres, mais il faudrait
    // viser la seconde près pour doubler son quota — sans commune mesure avec
    // ce qu'on cherche à arrêter.
    if (!seau || seau.expire <= maintenant) {
      seau = { compte: 0, expire: maintenant + fenetre };
      compteurs.set(cle, seau);
    }

    seau.compte += 1;

    if (seau.compte > max) {
      const attente = Math.ceil((seau.expire - maintenant) / 1000);
      res.set('Retry-After', String(attente));
      return res.status(429).json({
        erreur: 'Trop de requêtes. Réessaie dans un instant.',
        reessayerDans: attente,
      });
    }

    next();
  };
}

// Ce que compte le service, pour le journal de démarrage.
export const adresses = () => compteurs.size;
