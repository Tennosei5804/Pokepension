//! Le mod « PokéPension Bridge », posé dans l'instance PixelmonWorld — quand
//! le joueur le demande.
//!
//! POURQUOI L'APPLICATION S'EN CHARGE. Le mod n'a de sens qu'avec elle, et elle
//! est déjà installée et tenue à jour chez le joueur. Lui confier la pose du
//! mod, c'est n'avoir ni installeur de plus, ni fichier à copier à la main, ni
//! version à suivre : une nouvelle PokéPension apporte le mod qui lui répond.
//!
//! RIEN SANS UN CLIC. Installer un mod dans le Minecraft de quelqu'un est une
//! décision à lui : le bouton « Installer dans Minecraft » des Paramètres est
//! le seul chemin qui en ajoute un. Au lancement, l'application ne fait que
//! METTRE À JOUR un mod déjà posé — jamais en poser un là où il n'est pas.
//!
//! CE QU'ON TOUCHE, ET RIEN D'AUTRE. Un seul fichier, `pokepensionbridge-*.jar`,
//! dans le dossier `mods` des instances Minecraft 1.16.5 sous Forge 36 — celles
//! reconnues comme PixelmonWorld pour une pose, celles qui l'ont déjà pour une
//! mise à jour ou un retrait. Aucun autre mod n'est lu au-delà de son nom,
//! aucun n'est déplacé ni supprimé ; aucun monde, aucune configuration n'est
//! ouvert.
//!
//! DEUX DÉCISIONS DU JOUEUR SONT RESPECTÉES :
//!   · un mod qu'il a DÉSACTIVÉ dans Prism (renommé en `.jar.disabled`) le
//!     reste — on le dit, sans le réactiver ;
//!   · un mod EN COURS D'USAGE (Minecraft ouvert : Windows verrouille le
//!     fichier) n'est pas remplacé à moitié. On le dit, ou l'on réessaiera au
//!     prochain lancement, et il reste une seule version dans le dossier —
//!     deux feraient refuser le démarrage à Forge.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// Le mod, embarqué dans l'application. Il est construit par
/// `minecraft/construire.py`, qui écrit aussi sa version à côté.
const JAR: &[u8] = include_bytes!("../minecraft/pokepensionbridge.jar");
const VERSION: &str = include_str!("../minecraft/version.txt");

/// Le préfixe qui désigne NOTRE fichier, et seulement lui.
const PREFIXE: &str = "pokepensionbridge";

fn version() -> &'static str {
    VERSION.trim()
}

fn nom_fichier() -> String {
    format!("{PREFIXE}-{}.jar", version())
}

fn empreinte(octets: &[u8]) -> String {
    let brut = <sha2::Sha256 as sha2::Digest>::digest(octets);
    brut.iter().map(|b| format!("{b:02x}")).collect()
}

/// Une instance de lanceur qui fait tourner PixelmonWorld.
#[derive(Debug, Clone)]
pub struct Instance {
    pub nom: String,
    pub mods: PathBuf,
    pub forge: String,
    /// Le fichier de Pixelmon trouvé dans `mods`, pour le rapport : la version
    /// réellement installée se lit dans son nom.
    pub pixelmon: Option<String>,
    /// Nommée ou jouée « PixelmonWorld », et pas seulement une instance Pixelmon.
    pub pixelmonworld: bool,
}

// --- Trouver les lanceurs ---------------------------------------------------

fn env_chemin(nom: &str) -> Option<PathBuf> {
    std::env::var_os(nom).map(PathBuf::from).filter(|p| p.is_absolute())
}

/// Les dossiers de données de Prism Launcher (et de PolyMC, son prédécesseur,
/// dont Prism reprend le format tel quel), aux endroits où leurs installeurs
/// les posent.
///
/// AUCUN CHEMIN N'EST DEMANDÉ AU JOUEUR. Une installation portable ailleurs
/// sur le disque échappe à cette liste ; c'est le seul cas, et le mod peut
/// alors être posé à la main — il est dans le dossier de l'application.
pub fn racines_lanceurs() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "windows") {
        if let Some(a) = env_chemin("APPDATA") {
            out.push(a.join("PrismLauncher"));
            out.push(a.join("PolyMC"));
        }
        if let Some(l) = env_chemin("LOCALAPPDATA") {
            // L'installeur « portable » de Prism, et celui de winget.
            out.push(l.join("Programs").join("PrismLauncher"));
            out.push(l.join("PrismLauncher"));
        }
        if let Some(u) = env_chemin("USERPROFILE") {
            out.push(u.join("scoop").join("persist").join("prismlauncher"));
        }
    } else if cfg!(target_os = "macos") {
        if let Some(h) = env_chemin("HOME") {
            out.push(h.join("Library/Application Support/PrismLauncher"));
            out.push(h.join("Library/Application Support/PolyMC"));
        }
    } else if let Some(h) = env_chemin("HOME") {
        let donnees = env_chemin("XDG_DATA_HOME").unwrap_or_else(|| h.join(".local/share"));
        out.push(donnees.join("PrismLauncher"));
        out.push(donnees.join("PolyMC"));
        out.push(h.join(".var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher"));
    }
    let mut vus = std::collections::HashSet::new();
    out.into_iter()
        .filter(|p| p.is_dir())
        .filter(|p| vus.insert(p.canonicalize().unwrap_or_else(|_| p.clone())))
        .collect()
}

/// Une valeur d'un fichier `clé=valeur` à la Qt (`instance.cfg`,
/// `prismlauncher.cfg`). Les guillemets éventuels sont ôtés.
fn valeur_ini(texte: &str, cle: &str) -> Option<String> {
    texte.lines().find_map(|l| {
        let (k, v) = l.split_once('=')?;
        (k.trim() == cle).then(|| v.trim().trim_matches('"').to_string())
    })
}

/// Le dossier des instances : `instances`, sauf si le joueur l'a déplacé dans
/// les réglages du lanceur (clé `InstanceDir`, relative ou absolue).
fn dossier_instances(racine: &Path) -> PathBuf {
    for cfg in ["prismlauncher.cfg", "polymc.cfg"] {
        if let Ok(t) = std::fs::read_to_string(racine.join(cfg)) {
            if let Some(v) = valeur_ini(&t, "InstanceDir").filter(|v| !v.is_empty()) {
                let p = PathBuf::from(&v);
                return if p.is_absolute() { p } else { racine.join(p) };
            }
        }
    }
    racine.join("instances")
}

/// Le dossier du jeu d'une instance : la règle de Prism elle-même —
/// `.minecraft` s'il est seul, `minecraft` sinon.
fn dossier_jeu(instance: &Path) -> PathBuf {
    let mc = instance.join("minecraft");
    let point = instance.join(".minecraft");
    if point.is_dir() && !mc.is_dir() {
        point
    } else {
        mc
    }
}

/// Minecraft et Forge, lus dans `mmc-pack.json` — là où Prism les déclare.
fn composants(instance: &Path) -> Option<(String, String)> {
    let texte = std::fs::read_to_string(instance.join("mmc-pack.json")).ok()?;
    let v: Value = serde_json::from_str(&texte).ok()?;
    let mut mc = None;
    let mut forge = None;
    for c in v.get("components")?.as_array()? {
        let uid = c.get("uid").and_then(Value::as_str).unwrap_or("");
        let ver = c.get("version").and_then(Value::as_str).unwrap_or("").to_string();
        match uid {
            "net.minecraft" => mc = Some(ver),
            "net.minecraftforge" => forge = Some(ver),
            _ => {}
        }
    }
    Some((mc?, forge?))
}

fn compacte(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// L'instance est-elle celle de PixelmonWorld ? Son nom le dit, ou sa liste de
/// serveurs le contient. `servers.dat` est du NBT non compressé : l'adresse y
/// est écrite en clair, une recherche d'octets suffit.
fn est_pixelmonworld(nom: &str, jeu: &Path) -> bool {
    if compacte(nom).contains("pixelmonworld") {
        return true;
    }
    std::fs::read(jeu.join("servers.dat"))
        .map(|o| {
            let bas: Vec<u8> = o.iter().map(u8::to_ascii_lowercase).collect();
            bas.windows(13).any(|w| w == b"pixelmonworld")
        })
        .unwrap_or(false)
}

fn fichier_pixelmon(mods: &Path) -> Option<String> {
    std::fs::read_dir(mods)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .find(|n| {
            let b = n.to_lowercase();
            b.contains("pixelmon") && b.ends_with(".jar") && !b.starts_with(PREFIXE)
        })
}

/// Toutes les instances Minecraft 1.16.5 sous Forge 36 des lanceurs trouvés,
/// avec ce qu'on sait d'elles.
pub fn instances(racines: &[PathBuf]) -> Vec<Instance> {
    let mut out = Vec::new();
    for racine in racines {
        let Ok(entrees) = std::fs::read_dir(dossier_instances(racine)) else {
            continue;
        };
        for e in entrees.filter_map(|e| e.ok()) {
            let dossier = e.path();
            let Some((mc, forge)) = composants(&dossier) else {
                continue;
            };
            if mc != "1.16.5" || !forge.starts_with("36.") {
                continue;
            }
            let nom = std::fs::read_to_string(dossier.join("instance.cfg"))
                .ok()
                .and_then(|t| valeur_ini(&t, "name"))
                .unwrap_or_else(|| e.file_name().to_string_lossy().into_owned());
            let jeu = dossier_jeu(&dossier);
            let mods = jeu.join("mods");
            out.push(Instance {
                pixelmonworld: est_pixelmonworld(&nom, &jeu),
                pixelmon: fichier_pixelmon(&mods),
                nom,
                mods,
                forge,
            });
        }
    }
    out
}

/// Les instances qui recevront le mod.
///
/// D'ABORD CELLES QUI SONT SÛREMENT LA BONNE : PixelmonWorld, avec Pixelmon
/// dans ses mods. À défaut, celles qui s'appellent ou se connectent à
/// PixelmonWorld même si Pixelmon n'y est pas reconnu par son nom de fichier.
/// Jamais une instance Pixelmon d'un autre serveur.
pub fn cibles(toutes: Vec<Instance>) -> Vec<Instance> {
    let pw: Vec<Instance> = toutes.into_iter().filter(|i| i.pixelmonworld).collect();
    let sures: Vec<Instance> = pw.iter().filter(|i| i.pixelmon.is_some()).cloned().collect();
    if sures.is_empty() {
        pw
    } else {
        sures
    }
}

// --- Poser, mettre à jour, retirer ------------------------------------------

/// Ce que le joueur demande, ou ce que le lancement fait de lui-même.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Geste {
    /// Regarder, sans rien toucher : pour afficher l'état dans les Paramètres.
    Etat,
    /// Le bouton : poser le mod, ou le mettre à jour.
    Installer,
    /// Le lancement : mettre à jour un mod déjà posé, et rien d'autre.
    MettreAJour,
    /// Le bouton : retirer le mod.
    Retirer,
}

impl Geste {
    fn depuis(code: &str) -> Option<Self> {
        match code {
            "etat" => Some(Geste::Etat),
            "installer" => Some(Geste::Installer),
            "mettre-a-jour" => Some(Geste::MettreAJour),
            "retirer" => Some(Geste::Retirer),
            _ => None,
        }
    }
}

/// Ce qui est arrivé à une instance, en un mot que l'interface traduit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Le mod n'y est pas (et on n'y a rien mis).
    Absent,
    /// Il y est, à la version embarquée.
    AJour,
    /// Il y est, dans une autre version.
    Different,
    Installe,
    MisAJour,
    Retire,
    Desactive,
    Occupe,
    Erreur,
}

impl Action {
    pub fn code(self) -> &'static str {
        match self {
            Action::Absent => "absent",
            Action::AJour => "a-jour",
            Action::Different => "different",
            Action::Installe => "installe",
            Action::MisAJour => "mis-a-jour",
            Action::Retire => "retire",
            Action::Desactive => "desactive",
            Action::Occupe => "occupe",
            Action::Erreur => "erreur",
        }
    }
}

/// Nos fichiers dans un dossier `mods` : les actifs, et les désactivés.
fn nos_fichiers(mods: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut actifs = Vec::new();
    let mut desactives = Vec::new();
    if let Ok(entrees) = std::fs::read_dir(mods) {
        for e in entrees.filter_map(|e| e.ok()) {
            let n = e.file_name().to_string_lossy().to_lowercase();
            if !n.starts_with(PREFIXE) {
                continue;
            }
            if n.ends_with(".jar") {
                actifs.push(e.path());
            } else if n.ends_with(".jar.disabled") {
                desactives.push(e.path());
            }
        }
    }
    (actifs, desactives)
}

/// « pokepensionbridge-1.0.0.jar » → « 1.0.0 ».
fn version_du_fichier(chemin: &Path) -> String {
    let nom = chemin.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    nom.strip_prefix(&format!("{PREFIXE}-"))
        .and_then(|r| r.strip_suffix(".jar").or_else(|| r.strip_suffix(".jar.disabled")))
        .unwrap_or("")
        .to_string()
}

/// Où en est une instance, sans rien toucher.
pub fn constater(mods: &Path, nom: &str, octets: &[u8]) -> Action {
    let (actifs, desactives) = nos_fichiers(mods);
    if !desactives.is_empty() && actifs.is_empty() {
        return Action::Desactive;
    }
    let voulu = empreinte(octets);
    match actifs.as_slice() {
        [] => Action::Absent,
        [seul] if seul.file_name().map(|n| n == nom).unwrap_or(false)
            && std::fs::read(seul).map(|o| empreinte(&o) == voulu).unwrap_or(false) =>
        {
            Action::AJour
        }
        _ => Action::Different,
    }
}

/// Pose `octets` sous `nom` dans `mods`, en remplaçant nos versions précédentes.
///
/// `seulement_si_present` : la mise à jour du lancement, qui ne pose jamais un
/// mod là où il n'était pas.
pub fn poser(mods: &Path, nom: &str, octets: &[u8], seulement_si_present: bool) -> Action {
    match constater(mods, nom, octets) {
        Action::Desactive => return Action::Desactive,
        Action::AJour => return Action::AJour,
        Action::Absent if seulement_si_present => return Action::Absent,
        _ => {}
    }
    if !mods.is_dir() && std::fs::create_dir_all(mods).is_err() {
        // Une instance jamais lancée n'a pas encore de dossier `mods` : le
        // créer est sans risque, c'est celui que Forge lira.
        return Action::Erreur;
    }
    let (anciens, _) = nos_fichiers(mods);
    let cible = mods.join(nom);

    // Le nouveau d'abord, sous un nom que Forge ne lit pas (il ne prend que
    // les « .jar ») : s'il reste là après une panne, il ne gêne rien.
    let partiel = mods.join(format!("{nom}.partiel"));
    if std::fs::write(&partiel, octets).is_err() {
        let _ = std::fs::remove_file(&partiel);
        return Action::Erreur;
    }
    // Les anciens ensuite. Un seul refus (fichier verrouillé par un Minecraft
    // ouvert) et l'on renonce : mieux vaut l'ancienne version seule que deux.
    for ancien in &anciens {
        if std::fs::remove_file(ancien).is_err() {
            let _ = std::fs::remove_file(&partiel);
            return Action::Occupe;
        }
    }
    if std::fs::rename(&partiel, &cible).is_err() {
        let _ = std::fs::remove_file(&partiel);
        return Action::Erreur;
    }
    if anciens.is_empty() {
        Action::Installe
    } else {
        Action::MisAJour
    }
}

/// Retire nos fichiers, actifs ou désactivés — et seulement eux.
pub fn retirer(mods: &Path) -> Action {
    let (actifs, desactives) = nos_fichiers(mods);
    if actifs.is_empty() && desactives.is_empty() {
        return Action::Absent;
    }
    for f in actifs.iter().chain(desactives.iter()) {
        if std::fs::remove_file(f).is_err() {
            return Action::Occupe;
        }
    }
    Action::Retire
}

/// Tout le parcours d'un geste : trouver les instances, agir, rendre compte.
///
/// Une pose vise les instances reconnues comme PixelmonWorld ; l'état, la mise
/// à jour et le retrait visent aussi toute instance 1.16.5 qui porte déjà le
/// mod — un mod posé à la main ailleurs se retire comme les autres.
pub fn executer(geste: Geste, racines: &[PathBuf]) -> Value {
    let toutes = instances(racines);
    let mut visees = cibles(toutes.clone());
    if geste != Geste::Installer {
        for i in toutes {
            let (a, d) = nos_fichiers(&i.mods);
            if (!a.is_empty() || !d.is_empty()) && !visees.iter().any(|v| v.mods == i.mods) {
                visees.push(i);
            }
        }
    }
    let nom = nom_fichier();
    let rapport: Vec<Value> = visees
        .iter()
        .map(|inst| {
            let action = match geste {
                Geste::Etat => constater(&inst.mods, &nom, JAR),
                Geste::Installer => poser(&inst.mods, &nom, JAR, false),
                Geste::MettreAJour => poser(&inst.mods, &nom, JAR, true),
                Geste::Retirer => retirer(&inst.mods),
            };
            let (actifs, desactives) = nos_fichiers(&inst.mods);
            let installee = actifs.first().or(desactives.first()).map(|f| version_du_fichier(f));
            json!({
                "instance": inst.nom,
                "mods": inst.mods.to_string_lossy(),
                "forge": inst.forge,
                "pixelmon": inst.pixelmon,
                "action": action.code(),
                "versionInstallee": installee,
            })
        })
        .collect();

    json!({
        "version": version(),
        "prism": !racines.is_empty(),
        "instances": rapport,
    })
}

/// Le geste demandé par l'interface — voir js/minecraft.js. Il touche au
/// disque : il tourne hors du fil de l'interface.
#[tauri::command]
pub async fn pont_minecraft_mod(action: String) -> Result<Value, String> {
    let geste = Geste::depuis(&action).ok_or_else(|| "geste inconnu".to_string())?;
    tauri::async_runtime::spawn_blocking(move || executer(geste, &racines_lanceurs()))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dossier_test(nom: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("pp-mc-{}-{nom}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn instance(racine: &Path, nom: &str, mc: &str, forge: &str, dossier_jeu: &str) -> PathBuf {
        let d = racine.join("instances").join(nom);
        std::fs::create_dir_all(d.join(dossier_jeu).join("mods")).unwrap();
        std::fs::write(d.join("instance.cfg"), format!("[General]\nname={nom}\n")).unwrap();
        std::fs::write(
            d.join("mmc-pack.json"),
            format!(
                r#"{{"components":[{{"uid":"net.minecraft","version":"{mc}"}},
                {{"uid":"net.minecraftforge","version":"{forge}"}}],"formatVersion":1}}"#
            ),
        )
        .unwrap();
        d.join(dossier_jeu).join("mods")
    }

    #[test]
    fn trouve_la_bonne_instance_et_seulement_elle() {
        let racine = dossier_test("instances");
        let pw = instance(&racine, "PixelmonWorld", "1.16.5", "36.2.42", "minecraft");
        std::fs::write(pw.join("Pixelmon-1.16.5-9.1.12-universal.jar"), b"x").unwrap();
        // Une autre instance Pixelmon, d'un autre serveur : on n'y touche pas.
        let autre = instance(&racine, "Pixelmon Autre", "1.16.5", "36.2.42", ".minecraft");
        std::fs::write(autre.join("Pixelmon-1.16.5-9.1.12-universal.jar"), b"x").unwrap();
        // Une 1.20 nommée PixelmonWorld : mauvaise version, on n'y touche pas.
        instance(&racine, "PixelmonWorld 1.20", "1.20.1", "47.2.0", "minecraft");
        // Une instance renommée mais qui se connecte au serveur.
        let joue = instance(&racine, "Mon pack", "1.16.5", "36.2.42", ".minecraft");
        std::fs::write(joue.join("../servers.dat"), b"\x0a\x00\x00ip\x00play.PixelmonWorld.fr").unwrap();

        let toutes = instances(&[racine.clone()]);
        assert_eq!(toutes.len(), 3);
        let c = cibles(toutes);
        assert_eq!(c.len(), 1, "{c:?}");
        assert_eq!(c[0].nom, "PixelmonWorld");
        assert_eq!(c[0].pixelmon.as_deref(), Some("Pixelmon-1.16.5-9.1.12-universal.jar"));

        // Sans Pixelmon reconnaissable, les deux instances PixelmonWorld restent.
        std::fs::remove_file(pw.join("Pixelmon-1.16.5-9.1.12-universal.jar")).unwrap();
        let c = cibles(instances(&[racine.clone()]));
        let mut noms: Vec<_> = c.iter().map(|i| i.nom.clone()).collect();
        noms.sort();
        assert_eq!(noms, vec!["Mon pack", "PixelmonWorld"]);
        let _ = std::fs::remove_dir_all(&racine);
    }

    #[test]
    fn instance_dir_personnalise() {
        let racine = dossier_test("cfg");
        let ailleurs = racine.join("ailleurs");
        std::fs::write(racine.join("prismlauncher.cfg"), "[General]\nInstanceDir=ailleurs\n").unwrap();
        std::fs::create_dir_all(&ailleurs).unwrap();
        assert_eq!(dossier_instances(&racine), ailleurs);
        let _ = std::fs::remove_dir_all(&racine);
    }

    #[test]
    fn pose_remplace_et_respecte() {
        let mods = dossier_test("pose");
        std::fs::write(mods.join("pixelmon.jar"), b"pixelmon").unwrap();
        std::fs::write(mods.join("jei.jar"), b"jei").unwrap();
        let v1 = "pokepensionbridge-1.0.0.jar";
        let v2 = "pokepensionbridge-1.1.0.jar";

        // Le lancement ne pose rien là où le joueur n'a rien demandé.
        assert_eq!(poser(&mods, v1, b"v1", true), Action::Absent);
        assert_eq!(constater(&mods, v1, b"v1"), Action::Absent);
        // Le bouton pose ; le lancement met à jour ce qui est posé.
        assert_eq!(poser(&mods, v1, b"v1", false), Action::Installe);
        assert_eq!(constater(&mods, v1, b"v1"), Action::AJour);
        assert_eq!(constater(&mods, v2, b"v2"), Action::Different);
        assert_eq!(poser(&mods, v2, b"v2", true), Action::MisAJour);
        assert_eq!(poser(&mods, v2, b"v2", true), Action::AJour);
        let noms = |d: &Path| {
            let mut n: Vec<_> = std::fs::read_dir(d)
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect();
            n.sort();
            n
        };
        // Une seule version, et les autres mods intacts.
        assert_eq!(noms(&mods), vec!["jei.jar", "pixelmon.jar", v2]);
        assert_eq!(std::fs::read(mods.join("jei.jar")).unwrap(), b"jei");

        // Retirer n'enlève que le nôtre, et un second retrait ne trouve rien.
        assert_eq!(retirer(&mods), Action::Retire);
        assert_eq!(noms(&mods), vec!["jei.jar", "pixelmon.jar"]);
        assert_eq!(retirer(&mods), Action::Absent);

        // Désactivé dans Prism : ni réactivé, ni doublé — mais retirable.
        std::fs::write(mods.join(format!("{v2}.disabled")), b"v2").unwrap();
        assert_eq!(poser(&mods, v2, b"v2", false), Action::Desactive);
        assert_eq!(poser(&mods, v2, b"v2", true), Action::Desactive);
        assert_eq!(retirer(&mods), Action::Retire);
        assert_eq!(noms(&mods), vec!["jei.jar", "pixelmon.jar"]);
        let _ = std::fs::remove_dir_all(&mods);
    }

    #[test]
    fn les_gestes_par_instance() {
        let racine = dossier_test("gestes");
        let pw = instance(&racine, "PixelmonWorld", "1.16.5", "36.2.42", "minecraft");
        std::fs::write(pw.join("Pixelmon-1.16.5-9.1.12-universal.jar"), b"x").unwrap();
        let autre = instance(&racine, "Autre", "1.16.5", "36.2.42", "minecraft");
        let racines = vec![racine.clone()];
        let actions = |v: &Value| -> Vec<(String, String)> {
            v["instances"]
                .as_array()
                .unwrap()
                .iter()
                .map(|i| (i["instance"].as_str().unwrap().to_string(), i["action"].as_str().unwrap().to_string()))
                .collect()
        };

        assert_eq!(actions(&executer(Geste::Etat, &racines)), vec![("PixelmonWorld".into(), "absent".into())]);
        assert_eq!(actions(&executer(Geste::MettreAJour, &racines)), vec![("PixelmonWorld".into(), "absent".into())]);
        assert!(!pw.join(nom_fichier()).exists(), "le lancement n'installe rien");
        assert_eq!(actions(&executer(Geste::Installer, &racines)), vec![("PixelmonWorld".into(), "installe".into())]);
        let etat = executer(Geste::Etat, &racines);
        assert_eq!(etat["instances"][0]["versionInstallee"], version());
        // Un mod posé à la main dans une autre instance se voit, et se retire.
        std::fs::write(autre.join("pokepensionbridge-0.9.0.jar"), b"vieux").unwrap();
        let apres = actions(&executer(Geste::Retirer, &racines));
        assert_eq!(apres, vec![("PixelmonWorld".into(), "retire".into()), ("Autre".into(), "retire".into())]);
        assert!(!autre.join("pokepensionbridge-0.9.0.jar").exists());
        assert!(Geste::depuis("n-importe-quoi").is_none());
        let _ = std::fs::remove_dir_all(&racine);
    }

    #[test]
    fn le_jar_embarque_est_un_zip() {
        assert!(JAR.starts_with(b"PK\x03\x04"));
        assert!(!version().is_empty());
        assert!(nom_fichier().starts_with("pokepensionbridge-"));
    }
}
