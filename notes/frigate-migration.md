# Migration Frigate → Moli OS

**Date :** 2026-10-16 · **Portée :** intégration du NVR Frigate dans Moli (lecture seule + images)
**Statut :** faite et vérifiée (F1–F9) **sauf la purge des caméras fantômes** (cf. « Constat à traiter »
en fin de document : 11 appareils retenus polluent encore la liste). L'intégration fonctionne ; l'hygiène
du broker reste à faire.

## Contexte

- **Frigate** = LXC **100** sur PVE HOME (`192.168.1.4`), IP `192.168.1.188`.
  - `config.yml` : v0.18-0, `auth.enabled: false`, détecteur OpenVINO CPU (YOLOv9-t 320), VAAPI iGPU AMD.
  - **2 caméras actives** : `atelier` (Reolink RLC-810A, `192.168.1.23`) et `piscine` (`192.168.1.47`).
    `entree` (`192.168.1.21`) désactivée (injoignable).
  - **API interne** : `http://192.168.1.188:5000` — non authentifiée (`/api/version` = `0.18.0-`).
  - **MQTT** : broker Mosquitto de HA `192.168.1.78:1883`, `topic_prefix: frigate`, user `mqtt-user`.
- **Moli** : LXC 125 `moli-lab`, code `/opt/moli-os` (branche `main`).

## Blocage rencontré et résolu

Le broker Mosquitto de HA **exige une authentification** (plugin `go-auth`, users
`homeassistant/addons/mqtt-user/moli`). Or le driver `moli-frigate` construisait `MqttOptions`
**sans `set_credentials`** (contrairement à `moli-z2m`) : sans identifiants, le `CONNACK` échoue
et aucune caméra n'apparaît.

**Décision :** réutiliser l'utilisateur MQTT **`moli`** déjà présent sur le broker (aucune
modification côté broker), mot de passe fourni par la variable d'env existante
`MOLI_Z2M_PASSWORD` (déjà dans `moli.env`).

## F1 — Patch `crates/moli-frigate/src/lib.rs` (minimal)

Sauvegarde : `crates/moli-frigate/src/lib.rs.bak-prefrigate`.

- `use anyhow::Context;` ajouté.
- `Config` : ajout de `username: Option<String>` et `password_env: Option<String>` (serde `default`).
- `run()` : après `set_max_packet_size`, bloc identique au motif `moli-z2m` :
  ```rust
  if let Some(username) = &config.username {
      let password = match &config.password_env {
          Some(var) => std::env::var(var).with_context(|| format!("env var {var} not set"))?,
          None => String::new(),
      };
      options.set_credentials(username, password);
  }
  ```
- Test ajouté `config_reads_mqtt_credentials` (désérialisation des deux champs + défauts).

**Preuve :** `cargo test -p moli-frigate` → `3 passed; 0 failed` (dont le nouveau test).

**Dette à traiter (amont) :** ce patch est un **fork local** du driver amont ; il **divergera**
au prochain `upstream` (conflit possible, et un `--build` depuis une source vierge le perdrait).
Le motif ajouté est **copié à l'identique** de `moli-z2m` : il devrait donc être **remonté en amont**
(PR vers `github.com/rudy-io/moli-os`) plutôt que maintenu localement. Tant qu'il ne l'est pas, ce
`lib.rs` doit être **ré-appliqué après chaque mise à jour** du dépôt (cf. rollback). Les fichiers
`*.bak-*` (dont `lib.rs.bak-prefrigate`) sont couverts par le `.gitignore` du dépôt
(`*.bak-*`) : aucun risque de commit accidentel, mais à **supprimer une fois la version amont
adoptée**.

## F2 — Rebuild du conteneur (CT125)

`docker compose up -d --build` dans `/opt/moli-os` → image `moli-os:latest` régénérée
(compilation release 6 m 51 s), conteneur recréé et démarré.

**Preuve :** `/api/health` → `drivers_running: 6/6`, `frigate` `running`.

## F3 — Configuration `data/moli.toml`

Sauvegarde : `data/moli.toml.bak-prefrigate`. Bloc ajouté :

```toml
[[driver]]
id = "frigate"
kind = "frigate"

[driver.options]
host = "192.168.1.78"
port = 1883
base_topic = "frigate"
api = "http://192.168.1.188:5000"
username = "moli"
password_env = "MOLI_Z2M_PASSWORD"
```

**Preuve :** `docker exec moli-os /moli-os check-config` → `configuration OK (4 driver(s))`.

## F4 — Droits broker (user `moli`)

Test client jetable (conteneur `eclipse-mosquitto`) :

- **Lecture** `frigate/available` → `online` (`read_exit=0`).
- **Écriture** `frigate/moli_probe/recordings/set` → `write_exit=0`.

Aucune modification d'ACL nécessaire.

## F5 — Appareils découverts

`GET /api/devices` (état dans le champ `state` de chaque `DeviceView`) :

- **`frigate:frigate-server`** (« Serveur Frigate ») : `running=true`, `version=0.18.0-`,
  `uptime=456.2 h`, `inference_speed=16.1 ms`, `detection_fps=5.0`, `gpu_load=1.7 %`,
  `cpu_load=14.2 %`.
- **`frigate:atelier`** : `detection=true`, `all=2`, `status=online`.
- **`frigate:piscine`** : `detection=false`, `status=online`.

## F6 — Images (snapshots)

`GET /api/devices/frigate:atelier/snapshot` → `200 image/jpeg` (29 749 o, magic `FFD8FF`).
`GET /api/devices/frigate:piscine/snapshot` → `200 image/jpeg` (28 361 o, magic `FFD8FF`).

## F7 — Lecture seule

Preuves : `health` + dump `/api/devices` + un snapshot par caméra. Les **états** des switches
Frigate (`detection`, `recording`, `snapshots`) sont **reflétés** (points `write:true`) mais
**aucun basculement** n'a été effectué.

## F8 — Non-régression

- Pilotes : `bambu-a1`, `bambu-a1mini`, `energie`, `frigate`, `personnes`, `z2m` → tous `running`.
- Appareils : `z2m` 31, `bambu-a1` 3, `bambu-a1mini` 2, `energie` 1, `personnes` 1, `frigate` 14.
- `journal_failures: 0`. HA **non modifié** (lectures seules).

## F9 — Documentation

Le présent document (`notes/frigate-migration.md`).

## Zones de vigilance

- **API Frigate non authentifiée** : `http://192.168.1.188:5000` tourne avec `auth.enabled: false`
  (confirmé : `/api/version` répond sans identifiants). N'importe quel hôte du LAN peut lire les
  images (`/api/<cam>/latest.jpg`) et certaines routes. Acceptable en posture **LAN uniquement**,
  mais à ne **jamais exposer** hors du réseau local ; à revoir si un jour l'accès distant est ouvert.
- **Topics MQTT Frigate accessibles en écriture** : F4 prouve que l'utilisateur `moli` peut
  publier sur `frigate/+/+/set` (donc couper une détection, un enregistrement ou les instantanés).
  Fait partie du fonctionnement voulu (Moli pilote Frigate), mais tout détenteur de ce secret MQTT
  peut agir : le secret `MOLI_Z2M_PASSWORD` doit rester dans le coffre/fichier `0600`, jamais en clair.
- **Secret MQTT partagé** : cf. F1 — le même identifiant (`moli`) / mot de passe
  (`MOLI_Z2M_PASSWORD`) sert à `z2m` **et** à `frigate`. Un changement de ce secret casse l'auth des
  deux pilotes à la fois. Nommer la variable pour le broker (pas pour z2m) éviterait cette
  confusion ; à faire si un troisième consommateur MQTT apparaît.

## Constat à traiter (hors critères) — caméras fantômes

`frigate` expose **14 appareils** : les 2 vraies caméras (`atelier`, `piscine`) + le serveur,
mais aussi **11 caméras fantômes** issues de **topics MQTT retenus** d'anciennes configs Frigate :

`Atelier`, `ESP32`, `Entree`, `Entree_sub`, `Grange`, `Jardin`, `Porte_Entree`, `Webcam`,
`name_of_your_camera`, `reolink`, `rstp_test`.

Cause : ces `frigate/<nom>/...` sont **retained** sur le broker ; le driver les découvre comme des
caméras (élément `motion`/`detect`). Vérifié par souscription `frigate/#`.

**Nettoyage proposé (à valider, non fait) :** publier un payload vide retenu sur les topics
`frigate/<fantôme>/#` pour les purger, puis redémarrer le driver frigate. Action **modifiant
l'état du broker** → à faire sur accord explicite.

- **Propriétaire :** opérateur Moli (accord humain requis avant toute écriture MQTT).
- **Échéance suggérée :** à planifier — prochaine passe de nettoyage (avant de considérer
  l'intégration Frigate « propre »). Tant que ce n'est pas fait, la liste des appareils Moli reste
  polluée.
- **Contournement en attendant (côté utilisateur) :** les fantômes n'ont ni image (les topics
  `latest.jpg` n'existent plus → `502`) ni état vivant ; ils sont donc ignorables au quotidien. Pour
  les masquer, ne pas les importer/assigner dans le dashboard (aucun libellé ni pièce). À défaut,
  la purge (ci-dessus) est la seule correction durable.
- **Alternative non retenue :** filtrer côté driver par liste blanche de caméras — cela
  **divergerait le code amont** `moli-frigate` et masquerait d'éventuelles vraies caméras ajoutées
  plus tard. Préférer l'hygiène du broker.

## Rollback

1. `crates/moli-frigate/src/lib.rs.bak-prefrigate` → `lib.rs`, retirer le test ajouté.
2. `data/moli.toml.bak-prefrigate` → `moli.toml`.
3. `docker compose up -d --build` dans `/opt/moli-os`.
