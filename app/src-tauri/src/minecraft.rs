//! Le pont Minecraft : ce que le mod « PokéPension Bridge » appelle depuis le jeu.
//!
//! POURQUOI. On tape `/ps pokemon Dracaufeu` dans le chat de PixelmonWorld, et
//! la fiche s'ouvre ici. Le mod ne sait rien des Pokémon : il demande à
//! l'application ce qui existe (pour l'autocomplétion), puis lui dit quoi
//! ouvrir. L'application reste la seule source — ses noms, ses formes, le
//! Pokédex du serveur qu'elle tient déjà.
//!
//! L'INFRASTRUCTURE ÉTAIT DÉJÀ LÀ, pour la troisième fois : `tiny_http`, qui
//! reçoit le retour de Discord et sert l'overlay de chasse. Aucune dépendance
//! de plus.
//!
//! CE QUI N'EST PAS ICI. Rust ne comprend ni un nom de Pokémon ni une zone :
//! il relaie la demande à l'interface, qui a les données en mémoire et les
//! fonctions pour les ouvrir (`pwAppliquerRequete`, `openPreview`). Recopier ce
//! savoir en Rust ferait deux vérités à tenir d'accord. Voir js/minecraft.js.
//!
//! QUATRE RÈGLES, et la première est la seule qui compte vraiment :
//!
//! 1. LA BOUCLE LOCALE, ET RIEN D'AUTRE. On n'écoute que sur 127.0.0.1 ;
//!    personne sur le réseau ne peut joindre ce port.
//!
//! 2. PAS UNE PORTE POUR LES PAGES WEB. Un site ouvert dans le navigateur peut
//!    viser 127.0.0.1. D'où trois verrous, chacun suffisant : un jeton tiré au
//!    sort à chaque lancement (dans un fichier que seul l'utilisateur peut
//!    lire), refus de toute requête qui porte un en-tête `Origin` (un
//!    navigateur en met toujours un sur un appel inter-sites), et un `Host`
//!    qui doit être la boucle locale (contre le « DNS rebinding »).
//!
//! 3. RIEN QUE TROIS GESTES. Dire si l'on est là, rendre le catalogue, ouvrir
//!    une page prévue. Aucun chemin n'exécute quoi que ce soit : le pire qu'une
//!    requête puisse obtenir est l'ouverture d'une fiche.
//!
//! 4. IL NE BLOQUE JAMAIS L'INTERFACE. Chaque requête a son fil, et attend la
//!    réponse de l'interface avec un délai borné.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// La plage d'écoute. Distincte de celles de la connexion Discord (8730-8749)
/// et de l'overlay (8760-8779), comme l'overlay l'est déjà de Discord.
///
/// LE PORT N'EST PAS UN RÉGLAGE. Le mod le lit dans le fichier de découverte ;
/// la plage ne sert qu'à éviter une collision avec un autre programme.
pub const PORT_MIN: u16 = 8790;
pub const PORT_MAX: u16 = 8799;

/// Le numéro du protocole. Le mod refuse un pont qu'il ne connaît pas plutôt
/// que de lui envoyer des demandes qu'il comprendrait de travers.
pub const PROTOCOLE: u32 = 1;

/// Le fichier de découverte, à côté de `session.json` :
/// `%APPDATA%\fr.tennosei.pokearchive\pont-minecraft.json` sous Windows.
pub const FICHIER: &str = "pont-minecraft.json";

/// Au-delà, une requête de plus reçoit un 503 plutôt qu'un fil de plus. Le mod
/// n'en envoie jamais plus de deux à la fois ; c'est une borne, pas un réglage.
const EN_COURS_MAX: usize = 8;

/// Le corps d'une demande d'ouverture tient en quelques centaines d'octets.
const CORPS_MAX: u64 = 8 * 1024;

pub struct Pont {
    jeton: String,
    port: Mutex<Option<u16>>,
    /// L'interface a posé son écouteur : on peut lui relayer des demandes.
    pret: AtomicBool,
    prochain: AtomicU64,
    attentes: Mutex<HashMap<u64, mpsc::Sender<Value>>>,
    en_cours: AtomicUsize,
}

impl Pont {
    pub fn new() -> Self {
        Pont {
            // Sans aléa, pas de pont : un jeton prévisible ne protégerait rien.
            // Le pont restera fermé (voir demarrer), l'application non.
            jeton: super::hasard(24).unwrap_or_default(),
            port: Mutex::new(None),
            pret: AtomicBool::new(false),
            prochain: AtomicU64::new(1),
            attentes: Mutex::new(HashMap::new()),
            en_cours: AtomicUsize::new(0),
        }
    }
}

// --- Le démarrage -----------------------------------------------------------

/// Ouvre l'écoute et écrit le fichier de découverte.
///
/// IL DÉMARRE TOUT SEUL, à la différence de l'overlay : c'est tout l'intérêt.
/// Minecraft peut être lancé avant ou après PokéPension, et `/ps` doit marcher
/// dans les deux cas sans qu'on ait rien cliqué ici.
///
/// UN ÉCHEC NE FAIT PAS TOMBER L'APPLICATION. Pas de port libre, pas de
/// dossier de configuration : on le note et l'on continue — le mod dira dans
/// le chat qu'il ne joint pas PokéPension.
pub fn demarrer(app: &AppHandle) {
    let pont = app.state::<Pont>();
    if pont.jeton.is_empty() {
        eprintln!("pont Minecraft : pas d'aléa pour le jeton, pont fermé");
        return;
    }

    let mut choisi = None;
    for p in PORT_MIN..=PORT_MAX {
        if let Ok(s) = tiny_http::Server::http(("127.0.0.1", p)) {
            choisi = Some((p, s));
            break;
        }
    }
    let Some((port, serveur)) = choisi else {
        eprintln!("pont Minecraft : aucun port libre entre {PORT_MIN} et {PORT_MAX}");
        return;
    };
    if let Ok(mut g) = pont.port.lock() {
        *g = Some(port);
    }
    if let Err(e) = ecrire_decouverte(app, port, &pont.jeton) {
        eprintln!("pont Minecraft : fichier de découverte non écrit : {e}");
    }

    let app = app.clone();
    let lance = std::thread::Builder::new()
        .name("pont-minecraft".into())
        .spawn(move || {
            for requete in serveur.incoming_requests() {
                let pont = app.state::<Pont>();
                if pont.en_cours.fetch_add(1, Ordering::SeqCst) >= EN_COURS_MAX {
                    pont.en_cours.fetch_sub(1, Ordering::SeqCst);
                    repondre(requete, 503, &json!({ "erreur": "occupe" }));
                    continue;
                }
                let app = app.clone();
                let fil = std::thread::Builder::new()
                    .name("pont-minecraft-requete".into())
                    .spawn(move || {
                        traiter(&app, requete);
                        app.state::<Pont>().en_cours.fetch_sub(1, Ordering::SeqCst);
                    });
                if fil.is_err() {
                    pont.en_cours.fetch_sub(1, Ordering::SeqCst);
                }
            }
        });
    if let Err(e) = lance {
        eprintln!("pont Minecraft : fil d'écoute non lancé : {e}");
    }
}

/// Le dossier de configuration, calculé SANS Tauri.
///
/// La garde d'instance unique (voir `instance_deja_ouverte`) tourne avant que
/// l'application existe : elle ne peut pas demander `app_config_dir()`. On
/// refait donc le même calcul que Tauri — le dossier de configuration du
/// système, suivi de l'identifiant de l'application.
fn dossier_config(identifiant: &str) -> Option<PathBuf> {
    let base = if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join("Library").join("Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    }?;
    Some(base.join(identifiant))
}

/// Ce que le mod lit pour nous trouver : le port, le jeton, et l'exécutable.
///
/// L'EXÉCUTABLE, POUR LANCER POKÉPENSION QUAND ELLE EST FERMÉE. C'est ce que
/// l'application sait d'elle-même le plus sûrement : l'endroit d'où elle
/// tourne. Aucun chemin d'installation n'est deviné ; aucune clé de registre
/// n'est posée.
///
/// ÉCRIT PUIS RENOMMÉ : le mod ne lit jamais un fichier à moitié écrit.
fn ecrire_decouverte(app: &AppHandle, port: u16, jeton: &str) -> Result<(), String> {
    let dossier = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dossier).map_err(|e| e.to_string())?;
    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let contenu = json!({
        "protocole": PROTOCOLE,
        "port": port,
        "jeton": jeton,
        "exe": exe,
        "pid": std::process::id(),
        "version": env!("CARGO_PKG_VERSION"),
    });
    let brut = serde_json::to_string_pretty(&contenu).map_err(|e| e.to_string())?;
    let provisoire = dossier.join(format!("{FICHIER}.tmp"));
    std::fs::write(&provisoire, brut).map_err(|e| e.to_string())?;
    std::fs::rename(&provisoire, dossier.join(FICHIER)).map_err(|e| e.to_string())
}

// --- Une instance, pas deux -------------------------------------------------

/// Une PokéPension tourne-t-elle déjà ? Si oui, on la ramène devant et l'on
/// s'arrête là.
///
/// POURQUOI MAINTENANT. Deux fenêtres ouvertes, c'était déjà possible, et sans
/// conséquence. Avec le pont, c'en a une : la seconde réécrirait le fichier de
/// découverte, et le mod parlerait à celle qu'on ne regarde pas. Double-cliquer
/// sur l'icône d'une application déjà ouverte doit la montrer, pas la doubler.
///
/// ON NE CROIT QUE CE QUI RÉPOND. Le fichier peut être périmé (PokéPension
/// fermée, port repris par un autre programme) : seule une réponse de
/// PokéPension avec le bon jeton compte. Le moindre doute, et l'on démarre
/// normalement.
///
/// PAS EN DÉVELOPPEMENT : `cargo tauri dev` doit pouvoir tourner à côté de la
/// version installée.
pub fn instance_deja_ouverte(identifiant: &str) -> bool {
    if cfg!(debug_assertions) {
        return false;
    }
    let Some(dossier) = dossier_config(identifiant) else {
        return false;
    };
    let Ok(texte) = std::fs::read_to_string(dossier.join(FICHIER)) else {
        return false;
    };
    let Ok(v) = serde_json::from_str::<Value>(&texte) else {
        return false;
    };
    let port = v.get("port").and_then(Value::as_u64).unwrap_or(0);
    let jeton = v.get("jeton").and_then(Value::as_str).unwrap_or("");
    let pid = v.get("pid").and_then(Value::as_u64).unwrap_or(0);
    if !(PORT_MIN as u64..=PORT_MAX as u64).contains(&port)
        || jeton.is_empty()
        || pid == std::process::id() as u64
    {
        return false;
    }
    appel_local(port as u16, jeton, "/minecraft/premier-plan") == Some(200)
}

/// Un POST minimal vers la boucle locale, sans client HTTP : trois lignes
/// d'en-tête suffisent, et `reqwest` est asynchrone là où rien ne l'est encore.
fn appel_local(port: u16, jeton: &str, chemin: &str) -> Option<u16> {
    let adresse = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let mut flux =
        std::net::TcpStream::connect_timeout(&adresse, Duration::from_millis(400)).ok()?;
    flux.set_read_timeout(Some(Duration::from_millis(1500))).ok()?;
    flux.set_write_timeout(Some(Duration::from_millis(400))).ok()?;
    let requete = format!(
        "POST {chemin} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-PokePension-Jeton: {jeton}\r\n\
Content-Length: 0\r\nConnection: close\r\n\r\n"
    );
    flux.write_all(requete.as_bytes()).ok()?;
    let mut tete = [0u8; 32];
    let n = flux.read(&mut tete).ok()?;
    // « HTTP/1.1 200 OK » : le code est le deuxième mot.
    std::str::from_utf8(&tete[..n])
        .ok()?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()
}

// --- Les requêtes -----------------------------------------------------------

fn entete<'a>(requete: &'a tiny_http::Request, nom: &'static str) -> Option<&'a str> {
    requete
        .headers()
        .iter()
        .find(|h| h.field.equiv(nom))
        .map(|h| h.value.as_str())
}

fn repondre(requete: tiny_http::Request, statut: u16, corps: &Value) {
    let texte = corps.to_string();
    let reponse = tiny_http::Response::from_string(texte)
        .with_status_code(statut)
        .with_header(
            tiny_http::Header::from_bytes(
                &b"Content-Type"[..],
                &b"application/json; charset=utf-8"[..],
            )
            .expect("en-tête valide"),
        )
        .with_header(
            tiny_http::Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..])
                .expect("en-tête valide"),
        );
    let _ = requete.respond(reponse);
}

/// Comparer un jeton sans dire, par le temps mis à répondre, combien de ses
/// premiers caractères étaient justes.
fn egal_temps_constant(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Les trois verrous de l'en-tête de ce fichier, dans l'ordre.
fn refus(requete: &tiny_http::Request, pont: &Pont) -> Option<(u16, Value)> {
    let locale = requete
        .remote_addr()
        .map(|a| a.ip().is_loopback())
        .unwrap_or(false);
    if !locale {
        return Some((403, json!({ "erreur": "interdit" })));
    }

    let port = pont.port.lock().ok().and_then(|g| *g).unwrap_or(0);
    let hote_ok = entete(requete, "Host")
        .map(|h| {
            h.eq_ignore_ascii_case(&format!("127.0.0.1:{port}"))
                || h.eq_ignore_ascii_case(&format!("localhost:{port}"))
        })
        .unwrap_or(false);
    if !hote_ok || entete(requete, "Origin").is_some() {
        return Some((403, json!({ "erreur": "interdit" })));
    }

    let jeton_ok = entete(requete, "X-PokePension-Jeton")
        .map(|j| egal_temps_constant(j, &pont.jeton))
        .unwrap_or(false);
    if !jeton_ok {
        // « app » est là pour que le mod sache qu'il parle bien à PokéPension,
        // mais avec un jeton d'un lancement précédent : il relit le fichier.
        return Some((403, json!({ "app": "pokepension", "erreur": "jeton" })));
    }
    None
}

fn traiter(app: &AppHandle, mut requete: tiny_http::Request) {
    let pont = app.state::<Pont>();
    if let Some((statut, corps)) = refus(&requete, &pont) {
        return repondre(requete, statut, &corps);
    }

    let chemin = requete.url().split('?').next().unwrap_or("").to_string();
    let methode = requete.method().clone();

    let (statut, corps) = match (&methode, chemin.as_str()) {
        (tiny_http::Method::Get, "/minecraft/statut") => (
            200,
            json!({
                "app": "pokepension",
                "protocole": PROTOCOLE,
                "version": env!("CARGO_PKG_VERSION"),
                "pret": pont.pret.load(Ordering::SeqCst),
            }),
        ),
        (tiny_http::Method::Get, "/minecraft/catalogue") => {
            relayer(app, "catalogue", json!({}), Duration::from_secs(30))
        }
        (tiny_http::Method::Post, "/minecraft/ouvrir") => {
            match lire_corps(&mut requete).and_then(|v| valider_ouverture(&v)) {
                Ok(demande) => {
                    premier_plan(app);
                    relayer(app, "ouvrir", demande, Duration::from_secs(15))
                }
                Err(e) => (400, json!({ "erreur": e })),
            }
        }
        (tiny_http::Method::Post, "/minecraft/premier-plan") => {
            premier_plan(app);
            (200, json!({ "ok": true }))
        }
        _ => (404, json!({ "erreur": "inconnu" })),
    };
    repondre(requete, statut, &corps);
}

fn lire_corps(requete: &mut tiny_http::Request) -> Result<Value, String> {
    let mut brut = String::new();
    requete
        .as_reader()
        .take(CORPS_MAX + 1)
        .read_to_string(&mut brut)
        .map_err(|_| "corps illisible".to_string())?;
    if brut.len() as u64 > CORPS_MAX {
        return Err("corps trop long".into());
    }
    serde_json::from_str(&brut).map_err(|_| "JSON invalide".to_string())
}

/// Une liste de textes courts, ou rien. Tout le reste est refusé.
fn textes(v: &Value, cle: &str, max_len: usize) -> Result<Vec<Value>, String> {
    let Some(liste) = v.get(cle) else {
        return Ok(vec![]);
    };
    let liste = liste.as_array().ok_or(format!("{cle} : liste attendue"))?;
    if liste.len() > 24 {
        return Err(format!("{cle} : trop de valeurs"));
    }
    liste
        .iter()
        .map(|x| match x.as_str() {
            Some(s) if !s.trim().is_empty() && s.chars().count() <= max_len => {
                Ok(Value::String(s.trim().to_string()))
            }
            _ => Err(format!("{cle} : valeur invalide")),
        })
        .collect()
}

/// La demande, reconstruite champ par champ.
///
/// ON NE RELAIE QUE CE QU'ON A LU. Un champ inconnu ne passe pas à
/// l'interface, et chaque valeur est bornée — type, longueur, nombre. C'est
/// l'interface qui décide si « zone-7 » existe ; ici on vérifie seulement que
/// la demande a la forme d'une demande.
fn valider_ouverture(v: &Value) -> Result<Value, String> {
    let cible = v.get("cible").and_then(Value::as_str).unwrap_or("");
    match cible {
        "accueil" => Ok(json!({ "cible": "accueil" })),
        "pokemon" => {
            let cle = v.get("cle").and_then(Value::as_str).unwrap_or("");
            // Les clés de forme de PokeAPI : « charizard-mega-x », « mr-mime ».
            let valide = !cle.is_empty()
                && cle.len() <= 80
                && cle
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
            if !valide {
                return Err("clé de Pokémon invalide".into());
            }
            Ok(json!({ "cible": "pokemon", "cle": cle }))
        }
        "filtres" => {
            let generations = match v.get("generations") {
                None => vec![],
                Some(g) => {
                    let liste = g.as_array().ok_or("generations : liste attendue")?;
                    if liste.len() > 24 {
                        return Err("generations : trop de valeurs".into());
                    }
                    liste
                        .iter()
                        .map(|x| match x.as_u64() {
                            Some(n) if (1..=20).contains(&n) => Ok(Value::from(n)),
                            _ => Err("generations : valeur invalide".to_string()),
                        })
                        .collect::<Result<Vec<_>, _>>()?
                }
            };
            Ok(json!({
                "cible": "filtres",
                "lieux": textes(v, "lieux", 80)?,
                "raretes": textes(v, "raretes", 40)?,
                "types": textes(v, "types", 40)?,
                "generations": generations,
            }))
        }
        _ => Err("cible inconnue".into()),
    }
}

/// Montrer la fenêtre, au premier plan.
///
/// Réduite, cachée ou derrière le jeu : on la veut devant, puisque c'est pour
/// la lire qu'on a tapé la commande.
fn premier_plan(app: &AppHandle) {
    if let Some(fenetre) = app.get_webview_window("main") {
        let _ = fenetre.unminimize();
        let _ = fenetre.show();
        let _ = fenetre.set_focus();
    }
}

/// Passe la demande à l'interface et attend sa réponse.
///
/// L'ÉVÉNEMENT PART, LA RÉPONSE REVIENT PAR UNE COMMANDE. Tauri n'a pas
/// d'appel de Rust vers la page qui rende une valeur ; on numérote donc la
/// demande, et `pont_minecraft_reponse` réveille le fil qui l'attend.
fn relayer(app: &AppHandle, action: &str, donnees: Value, delai: Duration) -> (u16, Value) {
    let pont = app.state::<Pont>();
    if !pont.pret.load(Ordering::SeqCst) {
        return (503, json!({ "erreur": "demarrage" }));
    }
    let id = pont.prochain.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = mpsc::channel();
    match pont.attentes.lock() {
        Ok(mut g) => {
            g.insert(id, tx);
        }
        Err(_) => return (500, json!({ "erreur": "interne" })),
    }

    let envoye = app.emit(
        "pont-minecraft",
        json!({ "id": id, "action": action, "donnees": donnees }),
    );
    let resultat = if envoye.is_ok() {
        rx.recv_timeout(delai).ok()
    } else {
        None
    };
    if let Ok(mut g) = pont.attentes.lock() {
        g.remove(&id);
    }
    match resultat {
        Some(v) => (200, v),
        None => (504, json!({ "erreur": "delai" })),
    }
}

// --- Les commandes de l'interface --------------------------------------------

/// L'interface a posé son écouteur : les demandes peuvent passer.
#[tauri::command]
pub fn pont_minecraft_pret(pont: tauri::State<'_, Pont>) -> bool {
    pont.pret.store(true, Ordering::SeqCst);
    true
}

/// La réponse à une demande relayée. Une réponse arrivée après le délai ne
/// trouve plus personne, et se perd sans bruit.
#[tauri::command]
pub fn pont_minecraft_reponse(pont: tauri::State<'_, Pont>, id: u64, reponse: Value) -> bool {
    let attente = pont.attentes.lock().ok().and_then(|mut g| g.remove(&id));
    match attente {
        Some(tx) => tx.send(reponse).is_ok(),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jeton_compare_en_temps_constant() {
        assert!(egal_temps_constant("abc", "abc"));
        assert!(!egal_temps_constant("abc", "abd"));
        assert!(!egal_temps_constant("abc", "abcd"));
        assert!(!egal_temps_constant("", "a"));
    }

    #[test]
    fn ouverture_de_pokemon() {
        let ok = valider_ouverture(&json!({ "cible": "pokemon", "cle": "charizard-mega-x" }));
        assert_eq!(ok.unwrap(), json!({ "cible": "pokemon", "cle": "charizard-mega-x" }));
        for cle in ["", "Charizard", "../etc", "a b", "pikachu;rm", &"a".repeat(81)] {
            assert!(valider_ouverture(&json!({ "cible": "pokemon", "cle": cle })).is_err(), "{cle}");
        }
    }

    #[test]
    fn ouverture_de_filtres_nettoyee() {
        let v = valider_ouverture(&json!({
            "cible": "filtres",
            "lieux": ["zone-1"],
            "raretes": [" Rare ", "Épique"],
            "types": ["Feu"],
            "generations": [1, 3],
            "commande": "calc.exe",
        }))
        .unwrap();
        assert_eq!(
            v,
            json!({
                "cible": "filtres", "lieux": ["zone-1"], "raretes": ["Rare", "Épique"],
                "types": ["Feu"], "generations": [1, 3],
            })
        );
    }

    #[test]
    fn ouverture_refusee() {
        assert!(valider_ouverture(&json!({ "cible": "shell" })).is_err());
        assert!(valider_ouverture(&json!({ "cible": "filtres", "generations": [0] })).is_err());
        assert!(valider_ouverture(&json!({ "cible": "filtres", "generations": ["1"] })).is_err());
        assert!(valider_ouverture(&json!({ "cible": "filtres", "types": "Feu" })).is_err());
        assert!(valider_ouverture(&json!({ "cible": "filtres", "types": [""] })).is_err());
        let trop: Vec<Value> = (0..30).map(|_| json!("Feu")).collect();
        assert!(valider_ouverture(&json!({ "cible": "filtres", "types": trop })).is_err());
    }

    #[test]
    fn dossier_de_config_suit_l_identifiant() {
        if let Some(d) = dossier_config("fr.tennosei.pokearchive") {
            assert!(d.ends_with("fr.tennosei.pokearchive"));
        }
    }
}
