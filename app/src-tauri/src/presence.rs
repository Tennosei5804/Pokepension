//! La présence Discord — ce que vos amis voient sous votre nom.
//!
//! Discord expose un tuyau local : `\\.\pipe\discord-ipc-0` sous Windows, une
//! socket dans /tmp ailleurs. On s'y connecte, on annonce l'identifiant de
//! l'application, et on lui pousse deux lignes de texte. Discord les affiche
//! sous le pseudo, dans la liste des amis.
//!
//! TROIS RÈGLES, et elles tiennent toutes à la même idée : ceci est un
//! ornement, il ne doit jamais gêner.
//!
//! 1. SI DISCORD N'EST PAS LÀ, ON SE TAIT. Pas d'erreur remontée à l'interface,
//!    pas de message. Beaucoup de gens jouent sans Discord ouvert, et
//!    l'application doit leur être parfaitement indifférente.
//!
//! 2. ON NE BLOQUE JAMAIS. Le tuyau peut se fermer quand Discord redémarre. On
//!    tente une reconnexion à la prochaine mise à jour, et on laisse tomber
//!    entre-temps — l'écran n'a pas à attendre après une décoration.
//!
//! 3. RIEN DE PRIVÉ. Le pseudo et le nom d'aventure sont déjà publics dans
//!    l'application ; le reste — le jeton de session, l'identifiant Discord,
//!    l'avancement chiffré — ne sort pas d'ici. Une présence se lit par
//!    n'importe qui dans la liste d'amis.

use discord_rich_presence::{
    activity::{Activity, Assets, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// L'identifiant de l'application Discord — le même que celui de la connexion.
/// Un identifiant client est public par nature : il voyage dans chaque adresse
/// d'autorisation OAuth. Il se remplace à la compilation, comme l'adresse de
/// l'API, pour qui reprendrait le projet avec sa propre application.
const APPLICATION: &str = match option_env!("POKEPENSION_DISCORD_ID") {
    Some(v) => v,
    None => "1538934470646694030",
};

pub struct Presence {
    client: Mutex<Option<DiscordIpcClient>>,
    /// L'heure d'ouverture, pour que Discord affiche « depuis 42 minutes ».
    /// Fixée une fois : elle compte le temps passé dans l'application, pas
    /// celui passé sur l'écran courant.
    depuis: i64,
}

impl Presence {
    pub fn new() -> Self {
        Self {
            client: Mutex::new(None),
            depuis: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0),
        }
    }
}

/// Ce que l'interface envoie. Deux lignes, rien de plus — Discord n'en affiche
/// pas davantage, et tout ce qu'on ajouterait serait tronqué sans prévenir.
#[derive(serde::Deserialize)]
pub struct Etat {
    /// Ce qu'on fait : « Pokédex de Rouge / Bleu », « Chasse aux chromatiques ».
    pub quoi: String,
    /// Qui : « Tennosei — Aventure 1 ».
    pub qui: String,
}

/// Pousse l'état, en silence si Discord n'est pas joignable.
///
/// Rend `true` quand l'annonce est passée, sans que l'appelant ait à en faire
/// quoi que ce soit : c'est pour le journal, pas pour l'interface.
#[tauri::command]
pub fn presence_maj(etat: Etat, presence: tauri::State<'_, Presence>) -> bool {
    // Discord tronque en silence au-delà de 128 octets. On coupe nous-mêmes, sur
    // une frontière de caractère : couper un « é » en deux produirait un octet
    // orphelin que Discord refuserait.
    let quoi = tronquer(&etat.quoi, 120);
    let qui = tronquer(&etat.qui, 120);

    let mut garde = match presence.client.lock() {
        Ok(g) => g,
        // Un verrou empoisonné veut dire qu'un fil a paniqué en le tenant. Ce
        // n'est pas une raison pour faire tomber l'application à cause d'une
        // décoration.
        Err(_) => return false,
    };

    if garde.is_none() {
        // `new` ne peut pas échouer dans cette version du crate : il ne fait
        // que retenir l'identifiant. C'est `connect` qui va chercher le tuyau,
        // et c'est lui qui échoue quand Discord n'est pas ouvert.
        let mut c = DiscordIpcClient::new(APPLICATION);
        if c.connect().is_err() {
            return false; // Discord fermé : c'est le cas ordinaire, pas une erreur.
        }
        *garde = Some(c);
    }

    let client = match garde.as_mut() {
        Some(c) => c,
        None => return false,
    };

    // La seconde ligne est FACULTATIVE, et c'est ce qui rend la presence
    // discrete possible. `qui` porte le pseudo et le nom d'aventure — la seule
    // partie qui identifie. En mode discret, l'interface l'envoie vide, et une
    // chaine vide posee en `state` laisserait un trou sous le titre : c'est
    // justement ce que presence.js evite en ecrivant « Pas encore connecte »
    // plutot que rien. On omet donc la ligne au lieu de l'annoncer creuse.
    let mut activite = Activity::new()
        .details(&quoi)
        .assets(
            Assets::new()
                // La clé de l'image se déclare dans le portail Discord, onglet
                // Rich Presence > Art Assets. Absente, Discord n'affiche
                // simplement pas d'image — rien ne casse.
                .large_image("pokepension")
                .large_text("PokéPension"),
        )
        .timestamps(Timestamps::new().start(presence.depuis));

    if !qui.is_empty() {
        activite = activite.state(&qui);
    }

    if client.set_activity(activite).is_err() {
        // Le tuyau s'est fermé — Discord a redémarré, ou s'est fermé pendant
        // qu'on écrivait. On oublie le client : la prochaine mise à jour
        // rouvrira. Retenter ici ferait attendre l'interface pour rien.
        *garde = None;
        return false;
    }
    true
}

/// Efface la présence. Appelée quand on se déconnecte : laisser « Tennosei —
/// Aventure 1 » affiché après une déconnexion serait au mieux étrange.
#[tauri::command]
pub fn presence_effacer(presence: tauri::State<'_, Presence>) {
    if let Ok(mut garde) = presence.client.lock() {
        if let Some(c) = garde.as_mut() {
            let _ = c.clear_activity();
        }
    }
}

fn tronquer(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut fin = max;
    while fin > 0 && !s.is_char_boundary(fin) {
        fin -= 1;
    }
    s[..fin].trim_end().to_string()
}
