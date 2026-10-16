# Migration Frigate → Moli OS

**Date :** 2026-10-16 · **Portée :** intégration du NVR Frigate dans Moli (lecture seule + images)
**Statut :** faite et vérifiée (F1–F9). **Purge des caméras fantômes effectuée** (P1–P7 ci-dessous) :
le broker ne porte plus que les 2 vraies caméras, Moli n'expose plus que 3 appareils `frigate:`.

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

## Purge des caméras fantômes (P1–P7) — faite et vérifiée

`frigate` exposait **14 appareils** : les 2 vraies caméras (`atelier`, `piscine`) + le serveur,
plus **11 caméras fantômes** issues de **topics MQTT retenus** d'anciennes configs Frigate :

`Atelier`, `ESP32`, `Entree`, `Entree_sub`, `Grange`, `Jardin`, `Porte_Entree`, `Webcam`,
`name_of_your_camera`, `reolink`, `rstp_test`.

Cause : ces `frigate/<nom>/...` étaient **retained** sur le broker ; le driver les découvrait comme
des caméras dès la redélivrance d'un `frigate/<nom>/detect/state` ou `/motion` (`names_a_camera`).

### P1 — Sauvegarde
`data/state.json` copié en `data/state.json.bak-prefrigate-purge-20261016-122230` (CT125).

### P2 — Écriture MQTT (accord humain obtenu)
Payload **vide + retained** publié sur les **153 topics** des 11 sous-arbres fantômes
(QoS 1). Garde-fou en script : refus catégorique de toucher `frigate/{atelier,piscine}/`,
`/available`, `/stats`, `/profile`. Aucune écriture sur les 2 vraies caméras.

### P3 — Preuve broker
Re-souscription `frigate/#` (retained only) → racines présentes :
`atelier`, `piscine`, `available`, `profile`. **Fantômes : 0.** `atelier` + `piscine` toujours là.

### P4 — Redémarrage
`docker compose restart` dans `/opt/moli-os` (config relue au démarrage) → `frigate` `running`.

### P5 — Preuve Moli
`GET /api/devices` → **3** appareils `frigate:` : `frigate:atelier`, `frigate:frigate-server`,
`frigate:piscine`. Les 11 fantômes ont disparu.

### P6 — Non-régression
Pilotes `running` : `air`, `bambu-a1`, `bambu-a1mini`, `energie`, `frigate`, `hue`, `meteo`,
`personnes`, `z2m` (**9/9**). HA `200`. Snapshots `frigate:atelier` (`45226` o) et
`frigate:piscine` (`36756` o) → `200 image/jpeg`.

### P7 — Documentation
La présente section.

### Alternative non retenue
Filtrer côté driver par liste blanche de caméras : **divergerait le code amont** `moli-frigate`
et masquerait d'éventuelles vraies caméras ajoutées plus tard. Préféré : l'hygiène du broker.

### Rollback (purge)
Les topics fantômes étaient des restes retenus : leur purge est sans effet fonctionnel sur les 2
caméras actives. Restauration éventuelle des états Moli : `data/state.json.bak-prefrigate-purge-*` → `state.json`.

## Rollback (intégration)

1. `crates/moli-frigate/src/lib.rs.bak-prefrigate` → `lib.rs`, retirer le test ajouté.
2. `data/moli.toml.bak-prefrigate` → `moli.toml`.
3. `docker compose up -d --build` dans `/opt/moli-os`.
