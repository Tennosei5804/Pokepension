//! PokéPension — cœur de l'application.
//!
//! L'application ne connaît **jamais** la base de données. Elle parle à l'API,
//! qui seule détient le mot de passe MySQL. Tout ce qu'elle garde en propre est
//! un jeton de session, valable pour un compte et révocable côté serveur.
//!
//! La connexion Discord suit le parcours prévu pour les applications de bureau
//! (RFC 8252) : on ouvre une écoute éphémère sur la machine, on envoie le
//! navigateur chez l'API, et celle-ci renvoie le jeton sur cette écoute une
//! fois Discord passé.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State};

mod overlay;
mod presence;

/// Adresse de l'API. Fixée à la compilation pour la version distribuée :
///   set POKEPENSION_API=https://api.exemple.fr && cargo tauri build
const API_DEFAUT: &str = "http://127.0.0.1:8787";

fn api() -> String {
    option_env!("POKEPENSION_API")
        .unwrap_or(API_DEFAUT)
        .trim_end_matches('/')
        .to_string()
}

/// Plage d'écoute pour le retour de connexion. L'API n'accepte que ces ports —
/// les deux listes doivent rester d'accord.
const PORT_MIN: u16 = 8730;
const PORT_MAX: u16 = 8749;

/// Au-delà, on suppose que la personne a renoncé devant Discord. Cinq minutes
/// et non trois : il faut le temps de basculer sur le navigateur, de s'y
/// connecter si ce n'est pas déjà fait, et de lire l'écran d'autorisation.
/// DIX MINUTES, ET NON CINQ. Le compte a rebours partait a l'ouverture du
/// navigateur, et cinq minutes suffisent tant qu'on est deja connecte a
/// Discord : on clique, on autorise, c'est fini. Elles ne suffisent pas quand
/// Discord demande de SE CONNECTER d'abord — mot de passe, double
/// authentification, parfois un changement de compte. L'ecoute abandonnait
/// pendant que la personne tapait son mot de passe, et le retour de Discord
/// arrivait sur un port que plus personne n'ecoutait : la fenetre du navigateur
/// affichait une erreur de connexion, l'application un delai depasse.
///
/// Dix minutes, c'est aussi la duree de vie de l'etat cote API : attendre plus
/// longtemps ne servirait a rien, le serveur aurait deja oublie la demande.
const ATTENTE_MAX: Duration = Duration::from_secs(600);

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Session {
    pub jeton: String,
    pub pseudo: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct EtatPublic {
    pub connecte: bool,
    pub pseudo: String,
    pub api: String,
}

pub struct Etat {
    session: Mutex<Option<Session>>,
    fichier: PathBuf,
}

impl Etat {
    /// Le jeton, sorti du verrou avant tout `await` — un garde de Mutex ne
    /// traverse pas une frontière asynchrone.
    fn jeton(&self) -> Result<String, String> {
        self.session
            .lock()
            .map_err(|_| "état interne corrompu".to_string())?
            .as_ref()
            .map(|s| s.jeton.clone())
            .ok_or_else(|| "Non connecté.".to_string())
    }

    fn poser(&self, session: Option<Session>) -> Result<(), String> {
        match &session {
            Some(s) => {
                if let Some(parent) = self.fichier.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                let brut = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
                std::fs::write(&self.fichier, brut).map_err(|e| e.to_string())?;
            }
            None => {
                let _ = std::fs::remove_file(&self.fichier);
            }
        }
        *self
            .session
            .lock()
            .map_err(|_| "état interne corrompu".to_string())? = session;
        Ok(())
    }
}

// --- Dialogue avec l'API ----------------------------------------------------
async fn appeler(
    methode: reqwest::Method,
    chemin: &str,
    jeton: &str,
    corps: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let mut requete = client
        .request(methode, format!("{}{}", api(), chemin))
        .bearer_auth(jeton);
    if let Some(c) = corps {
        requete = requete.json(&c);
    }

    let reponse = requete
        .send()
        .await
        .map_err(|_| "API injoignable. Vérifie ta connexion.".to_string())?;

    let statut = reponse.status();
    let texte = reponse.text().await.unwrap_or_default();

    if !statut.is_success() {
        // Un 401 est le seul cas où la session locale ne vaut plus rien. On le
        // signale par un marqueur explicite plutôt que par le texte du message :
        // reconnaître une déconnexion en cherchant une phrase dans une chaîne
        // casse à la première reformulation, et déconnecte alors les gens pour
        // une panne réseau.
        if statut == reqwest::StatusCode::UNAUTHORIZED {
            return Err("SESSION_INVALIDE".to_string());
        }
        // Sinon, on préfère le message de l'API : il est écrit pour être lu par
        // la personne, pas par le développeur.
        let message = serde_json::from_str::<serde_json::Value>(&texte)
            .ok()
            .and_then(|v| v.get("erreur").and_then(|e| e.as_str()).map(String::from))
            .unwrap_or_else(|| format!("Erreur {statut}"));
        return Err(message);
    }
    if texte.is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&texte).map_err(|e| e.to_string())
}

// --- Preuve de possession (PKCE) --------------------------------------------
//
// L'application est distribuée : son code est public, et rien de secret ne peut
// y être écrit en dur. La sécurité ne repose donc pas sur un secret partagé,
// mais sur un secret **tiré au sort à chaque connexion**, qui ne quitte jamais
// la mémoire du processus.
//
//   · le « vérifieur » : 32 octets de hasard, gardés ici et nulle part ailleurs ;
//   · le « défi » : son empreinte SHA-256, seule chose transmise au départ ;
//   · le « nonce » : un second hasard que l'API réémettra vers l'écoute locale.
//
// Ce que ça ferme concrètement : le jeton ne circule plus dans une adresse. Qui
// lit l'historique du navigateur, les journaux du système, ou écoute la boucle
// locale, ne récolte qu'un code d'échange à usage unique — inutilisable sans le
// vérifieur, qui n'est jamais sorti d'ici.
struct Preuve {
    verifieur: String,
    defi: String,
    nonce: String,
}

/// Du hasard cryptographique, en base64url — l'alphabet des adresses.
fn hasard(octets: usize) -> Result<String, String> {
    let mut brut = vec![0u8; octets];
    getrandom::getrandom(&mut brut)
        .map_err(|e| format!("source d'aléa indisponible : {e}"))?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        brut,
    ))
}

impl Preuve {
    fn nouvelle() -> Result<Self, String> {
        let verifieur = hasard(32)?;
        let empreinte = <sha2::Sha256 as sha2::Digest>::digest(verifieur.as_bytes());
        let defi = base64::Engine::encode(
            &base64::engine::general_purpose::URL_SAFE_NO_PAD,
            empreinte,
        );
        Ok(Self {
            verifieur,
            defi,
            nonce: hasard(16)?,
        })
    }
}

/// Échange le code reçu sur la boucle locale contre le jeton de session.
///
/// C'est le seul moment où le jeton traverse le réseau, et il le fait dans le
/// corps d'une réponse HTTPS, jamais dans une adresse.
async fn echanger(code: &str, verifieur: &str) -> Result<Session, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let reponse = client
        .post(format!("{}/auth/echange", api()))
        .json(&serde_json::json!({ "code": code, "verifieur": verifieur }))
        .send()
        .await
        .map_err(|_| "API injoignable pendant l'échange.".to_string())?;

    let statut = reponse.status();
    let texte = reponse.text().await.unwrap_or_default();
    let corps: serde_json::Value = serde_json::from_str(&texte).unwrap_or_default();

    if !statut.is_success() {
        let message = corps
            .get("erreur")
            .and_then(|e| e.as_str())
            .unwrap_or("échange refusé");
        return Err(message.to_string());
    }

    let jeton = corps
        .get("jeton")
        .and_then(|j| j.as_str())
        .filter(|j| !j.is_empty())
        .ok_or_else(|| "L'API n'a pas renvoyé de jeton.".to_string())?;

    Ok(Session {
        jeton: jeton.to_string(),
        pseudo: corps
            .get("pseudo")
            .and_then(|p| p.as_str())
            .unwrap_or_default()
            .to_string(),
    })
}

// --- Connexion Discord ------------------------------------------------------
/// Ouvre une écoute sur le premier port libre de la plage.
fn ouvrir_ecoute() -> Result<(u16, tiny_http::Server), String> {
    for port in PORT_MIN..=PORT_MAX {
        if let Ok(serveur) = tiny_http::Server::http(("127.0.0.1", port)) {
            return Ok((port, serveur));
        }
    }
    Err(format!(
        "Aucun port libre entre {PORT_MIN} et {PORT_MAX}. Une autre instance tourne-t-elle ?"
    ))
}

const PAGE: &str = r#"<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>PokéPension</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0f14;color:#e8e9f0;
font-family:"Segoe UI",system-ui,sans-serif;text-align:center;padding:24px}
.r{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-size:27px;
margin:0 auto 18px;background:__FOND__}
h1{font-size:21px;margin:0 0 8px}p{color:#a0a4b4;margin:0;line-height:1.6}
</style></head><body><div><div class="r">__ICONE__</div><h1>__TITRE__</h1><p>__TEXTE__</p></div></body></html>"#;

fn page(fond: &str, icone: &str, titre: &str, texte: &str) -> String {
    PAGE.replace("__FOND__", fond)
        .replace("__ICONE__", icone)
        .replace("__TITRE__", titre)
        .replace("__TEXTE__", texte)
}

/// Attend le retour de l'API : une seule requête, puis on rend la main.
/// Attend le retour de l'API et en tire le code d'echange.
///
/// Le nonce est verifie avant tout : il n'a jamais transite que par HTTPS
/// vers l'API, puis vers cette ecoute. Un programme local qui tenterait de
/// nous faire adopter une session en appelant 127.0.0.1 ne peut pas le
/// deviner, et sa requete est rejetee sans etre lue plus avant.
fn attendre(serveur: tiny_http::Server, nonce: &str) -> Result<String, String> {
    let echeance = std::time::Instant::now() + ATTENTE_MAX;

    while std::time::Instant::now() < echeance {
        let restant = echeance.saturating_duration_since(std::time::Instant::now());
        let requete = match serveur.recv_timeout(restant.min(Duration::from_secs(2))) {
            Ok(Some(r)) => r,
            Ok(None) => continue, // délai écoulé sans requête : on repasse
            Err(e) => return Err(e.to_string()),
        };

        // On ne lit que la ligne de requête : l'API met tout dans l'adresse.
        let url = format!("http://127.0.0.1{}", requete.url());
        let parsee = url::form_urlencoded_lite(&url);

        let repondre = |req: tiny_http::Request, corps: String| {
            let entete = tiny_http::Header::from_bytes(
                &b"Content-Type"[..],
                &b"text/html; charset=utf-8"[..],
            )
            .expect("en-tête valide");
            let _ = req.respond(
                tiny_http::Response::from_string(corps).with_header(entete),
            );
        };

        if let Some(erreur) = parsee.get("erreur") {
            let texte = match erreur.as_str() {
                "refus" => "Tu as refusé l'autorisation Discord.",
                "etat" => "La connexion a expiré en route. Relance-la.",
                "discord" => "Discord n'a pas répondu correctement.",
                "obsolete" => "Cette version de PokéPension est trop ancienne pour \
la connexion sécurisée. Mets-la à jour.",
                _ => "La connexion n'a pas abouti.",
            };
            repondre(
                requete,
                page("#3f1010", "✕", "Connexion refusée", texte),
            );
            return Err(texte.to_string());
        }

        if let Some(code) = parsee.get("code") {
            // Le nonce d'abord : sans lui, cette requete ne vient pas de la
            // connexion que NOUS avons lancee.
            let annonce = parsee.get("nonce").map(String::as_str).unwrap_or("");
            if annonce != nonce {
                repondre(
                    requete,
                    page(
                        "#3f1010",
                        "✕",
                        "Retour inattendu",
                        "Cette réponse ne correspond à aucune connexion en cours.",
                    ),
                );
                continue; // on ne quitte pas : la vraie reponse peut encore venir
            }

            repondre(
                requete,
                page(
                    "#1d3b2b",
                    "✓",
                    "Presque fini",
                    "Tu peux fermer cet onglet et revenir à PokéPension.",
                ),
            );
            return Ok(code.clone());
        }

        // Requête sans rien d'utile (le navigateur demande /favicon.ico, par
        // exemple) : on répond poliment et on continue d'attendre.
        repondre(requete, page("#3f1010", "…", "En attente", "Rien à voir ici."));
    }
    Err("Connexion non terminée dans le temps imparti.".to_string())
}

/// Décodage minimal des paramètres d'une adresse — cela évite une dépendance
/// entière pour trois lignes.
mod url {
    use std::collections::HashMap;

    pub fn form_urlencoded_lite(url: &str) -> HashMap<String, String> {
        let mut out = HashMap::new();
        let Some((_, requete)) = url.split_once('?') else {
            return out;
        };
        for paire in requete.split('&') {
            if let Some((cle, valeur)) = paire.split_once('=') {
                out.insert(percent(cle), percent(valeur));
            }
        }
        out
    }

    fn percent(s: &str) -> String {
        let octets = s.replace('+', " ").into_bytes();
        let mut out = Vec::with_capacity(octets.len());
        let mut i = 0;
        while i < octets.len() {
            if octets[i] == b'%' && i + 2 < octets.len() {
                if let Ok(v) = u8::from_str_radix(
                    std::str::from_utf8(&octets[i + 1..i + 3]).unwrap_or("zz"),
                    16,
                ) {
                    out.push(v);
                    i += 3;
                    continue;
                }
            }
            out.push(octets[i]);
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }
}

// --- Commandes exposées à l'interface ---------------------------------------
#[tauri::command]
fn etat(etat: State<'_, Etat>) -> EtatPublic {
    let session = etat.session.lock().ok().and_then(|s| s.clone());
    EtatPublic {
        connecte: session.is_some(),
        pseudo: session.map(|s| s.pseudo).unwrap_or_default(),
        api: api(),
    }
}

#[tauri::command]
async fn connexion(etat: State<'_, Etat>) -> Result<Session, String> {
    let (port, serveur) = tauri::async_runtime::spawn_blocking(ouvrir_ecoute)
        .await
        .map_err(|e| e.to_string())??;

    // Le verifieur reste ici ; seule son empreinte part sur le reseau.
    let preuve = Preuve::nouvelle()?;

    let lien = format!(
        "{}/auth/discord?app={}&defi={}&nonce={}",
        api(),
        port,
        urlencode(&preuve.defi),
        urlencode(&preuve.nonce)
    );
    opener::open_browser(&lien)
        .map_err(|_| "Impossible d'ouvrir le navigateur.".to_string())?;

    let nonce = preuve.nonce.clone();
    let code = tauri::async_runtime::spawn_blocking(move || attendre(serveur, &nonce))
        .await
        .map_err(|e| e.to_string())??;

    // Le jeton n'arrive qu'ici, dans le corps d'une reponse, contre la preuve
    // que nous sommes bien a l'origine de la demande.
    let session = echanger(&code, &preuve.verifieur).await?;

    etat.poser(Some(session.clone()))?;
    Ok(session)
}

#[tauri::command]
fn deconnexion(etat: State<'_, Etat>) -> Result<(), String> {
    etat.poser(None)
}

#[tauri::command]
async fn moi(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/moi", &jeton, None).await
}

/// Le profil visé, en paramètre d'adresse. Absent, c'est l'aventure par défaut
/// du dresseur qui répond — l'API s'en charge, pas l'interface.
fn param_profil(profil: Option<i64>) -> String {
    match profil {
        Some(id) => format!("?profil={id}"),
        None => String::new(),
    }
}

#[tauri::command]
async fn lire_dex(
    etat: State<'_, Etat>,
    profil: Option<i64>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/dex{}", param_profil(profil));
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

#[tauri::command]
async fn ecrire_dex(
    etat: State<'_, Etat>,
    donnees: serde_json::Value,
    profil: Option<i64>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/dex{}", param_profil(profil));
    appeler(reqwest::Method::POST, &chemin, &jeton, Some(donnees)).await
}

// --- La carte de dresseur ----------------------------------------------------
//
// Elle ne prend PAS de profil, a la difference du dex. Le jeu prefere de
// quelqu'un est le sien, pas celui d'une de ses aventures : le passer ici
// aurait donne une carte differente selon l'aventure ouverte.

/// Ce qu'on aime, et les jeux qu'on a joues.
#[tauri::command]
async fn carte(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/carte", &jeton, None).await
}

/// Remplace la carte en entier. Le corps est `{ carte, parties }` tel que
/// l'application le range deja en local — voir parties.js.
#[tauri::command]
async fn carte_ecrire(
    etat: State<'_, Etat>,
    donnees: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::POST, "/api/carte", &jeton, Some(donnees)).await
}

// --- Les aventures ----------------------------------------------------------
#[tauri::command]
async fn profils(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/profils", &jeton, None).await
}

#[tauri::command]
async fn creer_profil(
    etat: State<'_, Etat>,
    nom: String,
    // Le mode dit ce que l'aventure compte : « capture », « vu » ou « living ».
    // L'API tranche elle-meme sur une valeur inconnue, on n'a rien a valider ici.
    mode: Option<String>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let corps = serde_json::json!({ "nom": nom, "mode": mode });
    appeler(reqwest::Method::POST, "/api/profils", &jeton, Some(corps)).await
}

/// Renommer, publier, ou désigner comme aventure par défaut. Les champs absents
/// ne sont pas touchés : on peut publier sans renommer.
#[tauri::command]
async fn modifier_profil(
    etat: State<'_, Etat>,
    id: i64,
    nom: Option<String>,
    public: Option<bool>,
    par_defaut: Option<bool>,
    mode: Option<String>,
    niveau_formes: Option<i64>,
    notes: Option<String>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let mut corps = serde_json::Map::new();
    if let Some(n) = nom {
        corps.insert("nom".into(), serde_json::Value::String(n));
    }
    // Une chaine vide est un effacement voulu, pas une absence : elle doit
    // donc passer, la ou None veut dire « ne touche pas au carnet ».
    if let Some(c) = notes {
        corps.insert("notes".into(), serde_json::Value::String(c));
    }
    if let Some(p) = public {
        corps.insert("public".into(), serde_json::Value::Bool(p));
    }
    if let Some(d) = par_defaut {
        corps.insert("parDefaut".into(), serde_json::Value::Bool(d));
    }
    if let Some(m) = mode {
        corps.insert("mode".into(), serde_json::Value::String(m));
    }
    // Le niveau de formes appartient a l'aventure : deux dresseurs qui se
    // comparent doivent compter sur le meme denominateur.
    if let Some(n) = niveau_formes {
        corps.insert("niveauFormes".into(), serde_json::Value::from(n));
    }
    let chemin = format!("/api/profils/{id}");
    appeler(
        reqwest::Method::PATCH,
        &chemin,
        &jeton,
        Some(serde_json::Value::Object(corps)),
    )
    .await
}

/// Le journal des captures d'une aventure. « avant » est l'identifiant de la
/// dernière ligne déjà affichée : c'est ainsi qu'on demande la page suivante
/// sans qu'une capture survenue entre-temps ne décale la lecture.
#[tauri::command]
async fn historique(
    etat: State<'_, Etat>,
    id: i64,
    avant: Option<i64>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = match avant {
        Some(a) => format!("/api/profils/{id}/historique?avant={a}"),
        None => format!("/api/profils/{id}/historique"),
    };
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

/// Tout ce que le dresseur possède, en un objet. Le service tourne sur un
/// hébergement gratuit : il ne doit pas retenir les collections en otage.
#[tauri::command]
async fn exporter(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/export", &jeton, None).await
}

/// La rareté de chaque entrée : combien de dresseurs la possèdent.
///
/// Le classement ne compte que le nombre ; celle-ci dit ce que ce nombre vaut.
/// Le calcul est fait et mis en cache côté API — il relit chaque collection
/// publique, ce qui n'a rien à faire dans une application de bureau.
#[tauri::command]
async fn rarete(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/rarete", &jeton, None).await
}

/// Relire une sauvegarde « pokearchive-1 ».
///
/// C'est la pièce qui manquait : le format était produit des deux côtés — par
/// l'application et par le site — et relu par aucun. Sans elle, on ne pouvait
/// ni venir d'ailleurs, ni passer du site à l'application, ni récupérer après
/// un vidage de navigateur.
///
/// La fusion se fait côté API : c'est elle qui tient le dex et le journal, et
/// une union calculée ici puis renvoyée écraserait tout ce qui aurait bougé
/// entre la lecture et l'écriture.
#[tauri::command]
async fn importer(
    etat: State<'_, Etat>,
    contenu: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::POST, "/api/import", &jeton, Some(contenu)).await
}

/// Les connexions ouvertes. Une session dure quatre-vingt-dix jours, et rien
/// ne les montrait — donc rien à faire après s'être connecté chez un ami.
#[tauri::command]
async fn sessions(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/sessions", &jeton, None).await
}

#[tauri::command]
async fn fermer_session(etat: State<'_, Etat>, id: i64) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/sessions/{id}");
    appeler(reqwest::Method::DELETE, &chemin, &jeton, None).await
}

/// Tout couper sauf celle d'où vient la demande : le geste qu'on cherche après
/// s'être connecté sur la machine de quelqu'un d'autre.
#[tauri::command]
async fn fermer_les_autres(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/sessions/fermer-les-autres",
        &jeton,
        Some(serde_json::json!({})),
    )
    .await
}

/// Le journal, toutes aventures confondues. Celui de la page Profil ne montre
/// que l'aventure ouverte ; celui-ci les réunit.
#[tauri::command]
async fn journal(etat: State<'_, Etat>, avant: Option<i64>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = match avant {
        Some(a) => format!("/api/journal?avant={a}"),
        None => "/api/journal".to_string(),
    };
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

/// Renommer quelqu'un. L'API répond 404 à qui n'est pas l'administrateur : la
/// vérification est là-bas, jamais ici — une application distribuée ne décide
/// pas de ses propres droits.
#[tauri::command]
async fn renommer_dresseur(
    etat: State<'_, Etat>,
    pseudo: String,
    nouveau: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/admin/renommer",
        &jeton,
        Some(serde_json::json!({ "pseudo": pseudo, "nouveau": nouveau })),
    )
    .await
}

#[tauri::command]
async fn supprimer_profil(etat: State<'_, Etat>, id: i64) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/profils/{id}");
    appeler(reqwest::Method::DELETE, &chemin, &jeton, None).await
}

/// Sans recherche, c'est le classement. Avec, les dresseurs dont le pseudo
/// contient le texte donné.
#[tauri::command]
async fn dresseurs(
    etat: State<'_, Etat>,
    recherche: Option<String>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = match recherche.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(q) => format!("/api/dresseurs?q={}", urlencode(q)),
        None => "/api/dresseurs".to_string(),
    };
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

/// Les aventures publiques d'un autre dresseur.
/// Partager le Pokedex d'un jeu : un lien qu'on donne, et qu'on reprend.
///
/// Trois commandes seulement, et aucune pour LIRE un partage : la lecture se
/// fait sans jeton, depuis le site, par quelqu'un qui n'a pas l'application.
/// L'application n'a donc rien a demander la.
#[tauri::command]
async fn partage_creer(
    etat: State<'_, Etat>,
    profil: i64,
    jeu: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let corps = serde_json::json!({ "profil": profil, "jeu": jeu });
    appeler(reqwest::Method::POST, "/api/partages", &jeton, Some(corps)).await
}

#[tauri::command]
async fn partages(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/partages", &jeton, None).await
}

#[tauri::command]
async fn partage_revoquer(
    etat: State<'_, Etat>,
    code: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/partages/{}", urlencode(&code));
    appeler(reqwest::Method::DELETE, &chemin, &jeton, None).await
}

#[tauri::command]
async fn profils_de(etat: State<'_, Etat>, pseudo: String) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/dresseurs/{}/profils", urlencode(&pseudo));
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

#[tauri::command]
async fn dex_de(
    etat: State<'_, Etat>,
    pseudo: String,
    profil: Option<i64>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/dex/{}{}", urlencode(&pseudo), param_profil(profil));
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

#[tauri::command]
async fn changer_pseudo(
    etat: State<'_, Etat>,
    pseudo: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let corps = serde_json::json!({ "pseudo": pseudo });
    appeler(reqwest::Method::POST, "/api/pseudo", &jeton, Some(corps)).await
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Les succès d'un autre dresseur : l'agrégat de son journal et son dex.
#[tauri::command]
async fn succes_de(etat: State<'_, Etat>, pseudo: String) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/dresseurs/{}/succes", urlencode(&pseudo));
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

/// Ce que le journal raconte une fois compté.
#[tauri::command]
async fn retrospective(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/retrospective", &jeton, None).await
}

/// Figurer ou non dans la liste des dresseurs.
#[tauri::command]
async fn changer_visibilite(etat: State<'_, Etat>, visible: bool) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/visibilite",
        &jeton,
        Some(serde_json::json!({ "visible": visible })),
    )
    .await
}

/// Ouvrir ou fermer sa porte aux propositions d'echange.
#[tauri::command]
async fn changer_echanges_ouverts(
    etat: State<'_, Etat>,
    ouverts: bool,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/echanges-ouverts",
        &jeton,
        Some(serde_json::json!({ "ouverts": ouverts })),
    )
    .await
}

// --- La messagerie ----------------------------------------------------------
// Ecrire a quelqu'un sans passer par un echange. Le pseudo voyage dans le
// chemin : il est encode, parce qu'un pseudo accepte les espaces et les
// accents et qu'un chemin ne les accepte pas tels quels.

/// Qui peut m'ecrire : « tous », « amis » ou « personne ».
#[tauri::command]
async fn changer_messages_de(
    etat: State<'_, Etat>,
    valeur: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/messages-de",
        &jeton,
        Some(serde_json::json!({ "valeur": valeur })),
    )
    .await
}

/// Avec qui j'ai une conversation, et ou elle en est.
#[tauri::command]
async fn messages_liste(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/messages", &jeton, None).await
}

/// Chercher dans tout ce qu'on s'est dit.
#[tauri::command]
async fn messages_chercher(
    etat: State<'_, Etat>,
    q: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/messages-recherche?q={}", urlencode(&q));
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

/// Une conversation. La lire la marque lue, cote serveur.
#[tauri::command]
async fn messages_avec(
    etat: State<'_, Etat>,
    pseudo: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/messages/{}", urlencode(&pseudo));
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

/// Ecrire a quelqu'un.
#[tauri::command]
async fn messages_ecrire(
    etat: State<'_, Etat>,
    pseudo: String,
    texte: String,
    // Un Pokemon joint au message. Facultatif : la plupart n'en portent pas.
    espece: Option<String>,
    // Une photo de chasse. L'API refuse celles d'une aventure privee : le
    // destinataire n'y aurait pas acces, et recevrait un cadre vide.
    image: Option<i64>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/messages/{}", urlencode(&pseudo));
    appeler(
        reqwest::Method::POST,
        &chemin,
        &jeton,
        Some(serde_json::json!({ "texte": texte, "espece": espece, "image": image })),
    )
    .await
}

// --- Les amis ---------------------------------------------------------------
//
// Abonnement à sens unique : pas de demande, pas d'acceptation. Ce que l'API
// en pense est dans api/src/amis.js ; ici il n'y a que le passage du jeton.

/// Mes amis, avec où ils en sont.
#[tauri::command]
async fn amis(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/amis", &jeton, None).await
}

#[tauri::command]
async fn suivre(etat: State<'_, Etat>, pseudo: String) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/amis",
        &jeton,
        Some(serde_json::json!({ "pseudo": pseudo })),
    )
    .await
}

#[tauri::command]
async fn ne_plus_suivre(etat: State<'_, Etat>, pseudo: String) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/amis/{}", urlencode(&pseudo));
    appeler(reqwest::Method::DELETE, &chemin, &jeton, None).await
}

/// Le fil, du plus récent au plus ancien.
#[tauri::command]
async fn amis_fil(etat: State<'_, Etat>, avant: Option<i64>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = match avant {
        Some(a) => format!("/api/amis/fil?avant={a}"),
        None => "/api/amis/fil".to_string(),
    };
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

/// La veille : les nouveautés des amis et les notifications, en un aller-retour.
#[tauri::command]
async fn veille(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/veille", &jeton, None).await
}

/// Ce qui n'a pas encore été annoncé, déjà groupé par l'API.
#[tauri::command]
async fn amis_nouveautes(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/amis/nouveautes", &jeton, None).await
}

/// Dit jusqu'où on a annoncé. Appelé APRÈS l'affichage des notifications, pas
/// avant : si l'application se ferme entre les deux, on les reverra plutôt que
/// de les perdre.
#[tauri::command]
async fn amis_vu(etat: State<'_, Etat>, jusqua: i64) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/amis/vu",
        &jeton,
        Some(serde_json::json!({ "jusqua": jusqua })),
    )
    .await
}

// ---- Les échanges et les notifications -------------------------------------
// Même rôle que pour les amis : le passage du jeton, et rien d'autre. Toute la
// règle est dans api/src/echanges.js et api/src/notifications.js.

/// Mes échanges, dans les deux sens.
#[tauri::command]
async fn echanges(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/echanges", &jeton, None).await
}

/// « Je te donne celui-ci contre celui-là, sur ce jeu. »
#[tauri::command]
async fn echange_proposer(
    etat: State<'_, Etat>,
    pseudo: String,
    dex: String,
    offert: String,
    demande: String,
    mot: Option<String>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/echanges",
        &jeton,
        Some(serde_json::json!({
            "pseudo": pseudo, "dex": dex,
            "offert": offert, "demande": demande, "mot": mot,
        })),
    )
    .await
}

/// Accepter ou refuser. C'est le receveur qui tranche, l'API le vérifie.
#[tauri::command]
async fn echange_reponse(
    etat: State<'_, Etat>,
    id: i64,
    reponse: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/echanges/{id}/reponse");
    appeler(
        reqwest::Method::POST,
        &chemin,
        &jeton,
        Some(serde_json::json!({ "reponse": reponse })),
    )
    .await
}

/// Retirer sa proposition, tant que l'autre n'a pas répondu.
#[tauri::command]
async fn echange_annuler(etat: State<'_, Etat>, id: i64) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/echanges/{id}/annuler");
    appeler(reqwest::Method::POST, &chemin, &jeton, None).await
}

/// « C'est fait. » Posé à la main : le service ne voit pas les consoles.
#[tauri::command]
async fn echange_fait(etat: State<'_, Etat>, id: i64) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/echanges/{id}/fait");
    appeler(reqwest::Method::POST, &chemin, &jeton, None).await
}

/// La discussion d'un échange accepté.
#[tauri::command]
async fn echange_messages(etat: State<'_, Etat>, id: i64) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/echanges/{id}/messages");
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

#[tauri::command]
async fn echange_ecrire(
    etat: State<'_, Etat>,
    id: i64,
    texte: String,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/echanges/{id}/messages");
    appeler(
        reqwest::Method::POST,
        &chemin,
        &jeton,
        Some(serde_json::json!({ "texte": texte })),
    )
    .await
}

/// Ce qui est arrivé pour moi, et ce qui reste non lu.
#[tauri::command]
async fn notifications(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/notifications", &jeton, None).await
}

/// Dit jusqu'où on a affiché. Appelé APRÈS l'affichage, comme amis_vu.
#[tauri::command]
async fn notifications_lues(
    etat: State<'_, Etat>,
    jusqua: Option<i64>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/notifications/lues",
        &jeton,
        Some(serde_json::json!({ "jusqua": jusqua })),
    )
    .await
}

// ---- Les photos de chasse ---------------------------------------------------
//
// Deux allers-retours que `appeler` ne sait pas faire : envoyer des octets
// bruts, et en recevoir. Tout le reste de l'API parle JSON ; une image, non.

/// Envoie une image telle quelle, avec son type.
async fn envoyer_octets(
    chemin: &str,
    jeton: &str,
    mime: &str,
    octets: Vec<u8>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let reponse = client
        .post(format!("{}{}", api(), chemin))
        .bearer_auth(jeton)
        .header(reqwest::header::CONTENT_TYPE, mime)
        .body(octets)
        .send()
        .await
        .map_err(|_| "API injoignable. Vérifie ta connexion.".to_string())?;

    let statut = reponse.status();
    let texte = reponse.text().await.unwrap_or_default();
    if !statut.is_success() {
        if statut == reqwest::StatusCode::UNAUTHORIZED {
            return Err("SESSION_INVALIDE".to_string());
        }
        let message = serde_json::from_str::<serde_json::Value>(&texte)
            .ok()
            .and_then(|v| v.get("erreur").and_then(|e| e.as_str()).map(String::from))
            .unwrap_or_else(|| format!("Erreur {statut}"));
        return Err(message);
    }
    serde_json::from_str(&texte).map_err(|e| e.to_string())
}

/// Dépose une photo sur une aventure. Rend son identifiant.
///
/// L'APPLICATION A DÉJÀ REDESSINÉ L'IMAGE avant d'arriver ici : redimensionnée
/// dans un canvas, réencodée en JPEG, donc sans métadonnées. Le serveur ne s'y
/// fie pas pour autant et revérifie tout — voir api/src/images.js.
#[tauri::command]
async fn image_envoyer(
    etat: State<'_, Etat>,
    profil: i64,
    sujet: String,
    mime: String,
    octets: Vec<u8>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!(
        "/api/images?profil={profil}&sujet={}",
        urlencode(&sujet)
    );
    envoyer_octets(&chemin, &jeton, &mime, octets).await
}

/// Une photo, rendue en adresse `data:` prête à poser dans un <img>.
///
/// POURQUOI DU BASE64 ET NON UN LIEN. La fenêtre ne peut pas aller chercher
/// l'image elle-même : l'adresse exige le jeton de session, qui vit ici et ne
/// descend jamais dans la page. Le passage par le pont coûte un tiers de
/// volume en plus — c'est le prix d'un jeton qui reste où il est.
#[tauri::command]
async fn image_charger(etat: State<'_, Etat>, id: i64) -> Result<String, String> {
    let jeton = etat.jeton()?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let reponse = client
        .get(format!("{}/api/images/{id}", api()))
        .bearer_auth(&jeton)
        .send()
        .await
        .map_err(|_| "API injoignable. Vérifie ta connexion.".to_string())?;

    let statut = reponse.status();
    if !statut.is_success() {
        if statut == reqwest::StatusCode::UNAUTHORIZED {
            return Err("SESSION_INVALIDE".to_string());
        }
        return Err(format!("Erreur {statut}"));
    }

    let mime = reponse
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let octets = reponse.bytes().await.map_err(|e| e.to_string())?;

    Ok(format!(
        "data:{mime};base64,{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &octets)
    ))
}

#[tauri::command]
async fn image_supprimer(etat: State<'_, Etat>, id: i64) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/images/{id}");
    appeler(reqwest::Method::DELETE, &chemin, &jeton, None).await
}

/// Ce que les photos occupent, pour le dire dans les Paramètres.
#[tauri::command]
async fn images_place(etat: State<'_, Etat>) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(reqwest::Method::GET, "/api/images", &jeton, None).await
}

/// Le mur d'un dresseur : ses photos, celles qu'on a le droit de voir.
#[tauri::command]
async fn photos_de(etat: State<'_, Etat>, pseudo: String) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    let chemin = format!("/api/dresseurs/{}/photos", urlencode(&pseudo));
    appeler(reqwest::Method::GET, &chemin, &jeton, None).await
}

/// « Je cherche » : chez qui, parmi mes amis, trouver ce que je veux.
#[tauri::command]
async fn qui_a(
    etat: State<'_, Etat>,
    noms: Vec<String>,
) -> Result<serde_json::Value, String> {
    let jeton = etat.jeton()?;
    appeler(
        reqwest::Method::POST,
        "/api/amis/qui-a",
        &jeton,
        Some(serde_json::json!({ "noms": noms })),
    )
    .await
}

/// Les raccourcis globaux du compteur de chasse.
///
/// POURQUOI GLOBAUX, ET PAS SEULEMENT DANS LA FENÊTRE. Un compteur se frappe
/// cent fois par heure, et la fenêtre de PokéPension n'est PAS au premier plan
/// pendant ce temps-là : le jeu l'est. Un raccourci qui ne marche que fenêtre
/// active ne sert que pendant les pauses, c'est-à-dire jamais.
///
/// CTRL+ALT+FLÈCHES, et non des lettres. Un code de touche est physique : une
/// lettre ne tombe pas au même endroit sur un clavier AZERTY, QWERTY ou QWERTZ,
/// une flèche si. C'est aussi une combinaison qu'aucun jeu ne réclame.
///
/// UN ÉCHEC NE FAIT PAS TOMBER L'APPLICATION. Une autre application peut déjà
/// tenir la combinaison ; on le note dans la console et on continue. Les
/// raccourcis de la page Chasse, eux, marchent de toute façon.
#[cfg(desktop)]
fn poser_raccourcis(app: &tauri::AppHandle) {
    use tauri::Emitter;
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    let plus = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::ArrowUp);
    let moins = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::ArrowDown);

    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, raccourci, evenement| {
            // Seulement à l'enfoncement : sans ce test, chaque frappe compterait
            // deux fois — une à la descente, une à la remontée.
            if evenement.state() != ShortcutState::Pressed {
                return;
            }
            let pas = if raccourci == &plus {
                1
            } else if raccourci == &moins {
                -1
            } else {
                return;
            };
            // L'interface décide ce que « +1 » veut dire : quelle chasse, et
            // quoi enregistrer. Ici, on ne fait que dire qu'on a appuyé.
            let _ = app.emit("chasse-pas", pas);
        })
        .build();

    if let Err(e) = app.plugin(plugin) {
        eprintln!("raccourcis globaux indisponibles : {e}");
        return;
    }
    for (r, nom) in [(plus, "Ctrl+Alt+Haut"), (moins, "Ctrl+Alt+Bas")] {
        if let Err(e) = app.global_shortcut().register(r) {
            eprintln!("raccourci {nom} deja pris : {e}");
        }
    }
}

/// Sur une cible sans raccourcis globaux, il n'y a rien a poser.
#[cfg(not(desktop))]
fn poser_raccourcis(_app: &tauri::AppHandle) {}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let fichier = app
                .path()
                .app_config_dir()
                .map(|d| d.join("session.json"))
                .unwrap_or_else(|_| PathBuf::from("session.json"));

            // Une session déjà présente évite de redemander Discord à chaque
            // lancement.
            let session = std::fs::read_to_string(&fichier)
                .ok()
                .and_then(|t| serde_json::from_str::<Session>(&t).ok())
                .filter(|s| !s.jeton.is_empty());

            app.manage(presence::Presence::new());
            app.manage(overlay::Overlay::new());

            app.manage(Etat {
                session: Mutex::new(session),
                fichier,
            });

            poser_raccourcis(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            etat,
            connexion,
            deconnexion,
            moi,
            lire_dex,
            ecrire_dex,
            carte,
            carte_ecrire,
            profils,
            creer_profil,
            modifier_profil,
            supprimer_profil,
            historique,
            dresseurs,
            partage_creer,
            partages,
            partage_revoquer,
            profils_de,
            dex_de,
            changer_pseudo,
            exporter,
            importer,
            rarete,
            sessions,
            fermer_session,
            fermer_les_autres,
            journal,
            renommer_dresseur,
            succes_de,
            retrospective,
            changer_visibilite,
            changer_echanges_ouverts,
            changer_messages_de,
            messages_liste,
            messages_chercher,
            messages_avec,
            messages_ecrire,
            amis,
            suivre,
            ne_plus_suivre,
            amis_fil,
            amis_nouveautes,
            veille,
            amis_vu,
            echanges,
            echange_proposer,
            echange_reponse,
            echange_annuler,
            echange_fait,
            echange_messages,
            echange_ecrire,
            notifications,
            notifications_lues,
            image_envoyer,
            image_charger,
            image_supprimer,
            images_place,
            photos_de,
            qui_a,
            presence::presence_maj,
            presence::presence_effacer,
            overlay::overlay_demarrer,
            overlay::overlay_arreter,
            overlay::overlay_etat,
            overlay::overlay_adresse
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de PokéPension");
}
