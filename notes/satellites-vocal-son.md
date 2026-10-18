# Satellites vocal/son : ESP32 S3 Box + Amazon Echo

**Objet.** Faire de Moli le seul « cerveau » vocal de la maison : deux familles de
satellites rendues pilotables depuis Moli — la **Box ESP32‑S3** (API native ESPHome,
écoute/répond via Piper+Whisper locaux) et les **Echo Amazon** (interface non
officielle de l'appli Alexa, pilotage play/say/announce/volume).

Ce document est le mode opératoire et la trace des patchs. Il ne modifie **pas** le
code Moli : il s'appuie sur les patchs du fork (`notes/patches/`) ré‑appliqués après
chaque montée de version amont (cf. `AGENTS.md` §5).

## 1. Matériel et identités

| Élément | Valeur |
|---|---|
| Box ESP32‑S3 | `esp32-s3-box-123560`, IP `192.168.1.152`, MAC `B4:3A:45:12:35:60` |
| Firmware box | ESPHome `2026.9.0`, builder HA `5c53de3b_esphome` (2026.9.1) |
| API native box | TCP `6053` (Noise), OTA TCP `3232` |
| Config box (HA) | `/config/esphome/nabu.yaml` (celle compilée sur la box) |
| Echo | pilotées via `kind="alexa"`, domaine `amazon.fr` |
| Voix locale | `moli-piper` TTS `127.0.0.1:10200`, `moli-whisper` STT `127.0.0.1:10300` |

## 2. Blocs `data/moli.toml`

```toml
# Satellite vocal ESP32 S3 Box 123560 (API native ESPHome, TCP 6053).
[[driver]]
id = "esphome-box"
kind = "esphome"

[driver.options]
host = "192.168.1.152"
mac = "b4:3a:45:12:35:60"
media_base = "http://192.168.1.125:8790"   # Moli sert les WAV de réponse à la box
wake_words = ["okay_nabu"]

# Enceintes Amazon Echo (interface non officielle de l'appli Alexa).
[[driver]]
id = "alexa"
kind = "alexa"

[driver.options]
domain = "amazon.fr"
music = ""
```

Après édition : `check-config` puis `docker compose restart moli-os`. Chaque édition
est précédée d'une sauvegarde `data/moli.toml.bak-*` (ici
`data/moli.toml.bak-satellites-20261017-181301`).

## 3. Patchs du fork utilisés

| Patch | Rôle |
|---|---|
| `esphome-full-entities.patch` | Expose le jeu d'entités complet du pilote ESPHome (binary_sensor, sensor, switch, light, number, select, button, camera + snapshots), au‑delà de la seule voix. Ajoute `LIST_BINARY_SENSOR=12`, `LIST_LIGHT=15`, `LIST_SWITCH=17`, `LIST_NUMBER=49`, etc. dans `crates/moli-esphome/src/api.rs`. |
| `compose.override.yaml.voice` | Sidecars Wyoming `moli-piper` (fr_FR-siwis-medium) + `moli-whisper` (tiny-int8, fr), `network_mode: host`, liés à `127.0.0.1`. |
| `accueil-*` / `tablette2025-parity.patch` | Carte Alexa de la page Système + cartes satellite du dashboard. Base courante : `tablette2025-parity.patch` (cumulatif depuis `d54c3de`). |

Application (dans le CT125) :

```sh
cat notes/patches/esphome-full-entities.patch | ssh moli-os 'cat > /tmp/e.patch'
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/e.patch && git apply /tmp/e.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate moli-os'
```

## 4. Condition firmware de la Box — clé API Noise

Le pilote ESPHome de Moli **provisionne sa propre clé** à l'appareil (`noise set key`,
message 124) **si et seulement si** le firmware a été compilé avec `USE_API_NOISE`
(champ 19 `api_encryption_supported` présent dans `DeviceInfoResponse`). Un `api:`
sans bloc `encryption:` compile en clair (`USE_API_PLAINTEXT` seul) : la sonde renvoie
alors *« l'appareil ne sait pas garder de clé de chiffrement : installe‑lui un
firmware avec « api: encryption: » »* et le pilote reste en `waiting`.

**Correctif** : ajouter un bloc `encryption:` **vide** (sans `key:`) dans `api:`, ce
qui compile le support Noise et laisse la clé être posée au premier client :

```yaml
api:
  encryption:            # pas de key: → provisionnement à chaud par Moli
  on_client_connected:
    - script.execute: draw_display
```

Puis recompiler + flasher en OTA la box (`192.168.1.152:3232`). Après quoi Moli pose
la clé (journal « the device had no API key: Moli gave it its own ») et range
`esphome-box/api_key` au coffre.

> Piège rencontré : le build ESP‑IDF (image `esphome/esphome:2026.9.1`) est gourmand
> (~4–6 Go RAM, longue compilation). Le lancer **hors** de l'hôte PVE (ou sur une
> machine dédiée) — un build sur un CT co‑localisé avec HA a saturé l'hôte.

### 4bis. Recompiler + flasher sans charger le PVE (recette utilisée)

La Box n'est joignable que depuis le LAN (`192.168.1.152:3232`) ; le CT125 ne l'atteint
pas forcément et l'hôte PVE ne doit **pas** builder. Recette : builder sur une machine
dédiée (ici **ai-srv**, `foran@100.115.200.86`, Python 3.13), puis tunneler l'OTA.

```sh
# ai-srv : venv esphome + compile (config = nabu.yaml + secrets.yaml)
python3 -m venv ~/boxbuild/.venv && ~/boxbuild/.venv/bin/pip install esphome==2026.9.1
cd ~/boxbuild/config && ~/boxbuild/.venv/bin/esphome compile nabu.yaml   # → .esphome/build/*/build/firmware.ota.bin
```

La Box (LAN) n'est pas routable depuis ai-srv : on rabat l'OTA via la machine qui la
voit (ici ASSIST/CT115, qui voit `192.168.1.152`) avec deux tunnels empilés :

```sh
# sur la machine qui voit la Box : socat local:3232 → Box:3232
socat TCP-LISTEN:3232,fork,reuseaddr TCP:192.168.1.152:3232
# tunnel inverse : ai-srv:3232 → cette machine:3232
ssh -R 3232:127.0.0.1:3232 foran@100.115.200.86
# flash depuis ai-srv (--device = IP NUE, esphome ajoute :3232 lui-même)
~/boxbuild/.venv/bin/esphome upload nabu.yaml --device 127.0.0.1 \
  --file .esphome/build/esp32-s3-box-123560/build/firmware.ota.bin
```

Preuve : `OTA successful` puis box de retour sur `6053`/`3232` après reboot (~50 s).
`esphome upload` **refuse** `host:port` dans `--device` (erreur « resolving IP address »).

### 4ter. Codec de sortie : `format: NONE` (réponse vocale muette sinon)

Deux chemins de voix n'utilisent pas le même conteneur :

| Chemin | URL servie | Conteneur |
|---|---|---|
| `say` (dashboard, pilote ESPHome) | `announcement_url` | **FLAC** (`.flac`) |
| réponse d'un tour de parole (VA) | `voice_url` | **WAV** (`.wav`) |

Le `media_player` de la Box déclarait `announcement_pipeline: format: FLAC` → le firmware
ne compilait **que** `USE_AUDIO_FLAC_SUPPORT` (pas de `USE_AUDIO_WAV_SUPPORT`). Résultat :
le `say` (FLAC) se joue, mais la réponse du tour de parole (WAV) échoue côté boîtier —
journal Moli en boucle : `device: [E]... Media reader encountered an error: ESP_FAIL` +
`The announcement pipeline's file reader encountered an error`, et `voice spoken` répété
toutes les ~1,5 s (Moli resynthétise, la Box n'accuse jamais réception).

**Correctif** : déclarer le pipeline en `format: NONE`, ce qui compile **tous** les codecs
(WAV compris) :

```yaml
media_player:
  - platform: speaker
    announcement_pipeline:
      speaker: box_speaker
      format: NONE        # FLAC → WAV : accepte tous les codecs (cf. ESPHome audio)
      sample_rate: 48000
      num_channels: 1
```

Puis recompiler + reflasher en OTA (§4bis). Détail ESPHome : `AUDIO_FILE_TYPE_ENUM` accepte
`NONE|WAV|MP3|FLAC|OPUS` ; `format: NONE` déclenche `request_*_support()` pour tous les
codecs. Le fichier `nabu.yaml.bak-format-*` conserve l'état `FLAC` d'origine.

**Preuve (18 Oct. 2026).** Avant : `Media reader encountered an error: ESP_FAIL` répété +
`voice spoken` en boucle. Après reflash `format: NONE` (`firmware.ota.bin` 4 625 280 o,
`USE_AUDIO_WAV_SUPPORT` compilé) : un tour de parole complet sans erreur média —
`satellite listened` → `voice heard engine="local"` → `satellite turn` → **un seul**
`voice spoken chars=120` → `assistant-exchanges.jsonl` `surface=satellite spoken=true`
(question transcrite par Whisper local, réponse lue par la Box). 0 `ESP_FAIL` depuis.

## 5. Alexa — connexion du compte (humain)

Moli n'a pas les identifiants Amazon. La connexion se fait **par l'humain** depuis le
dashboard : page **Système → carte Alexa** → suivre la redirection Amazon, puis
**coller l'URL `maplanding`** renvoyée. Moli échange alors le `refresh_token` et le
range au coffre sous `alexa/refresh_token` — **jamais affiché**.

## 6. Secrets (noms seulement, valeurs au coffre)

| Secret | Contenu |
|---|---|
| `esphome-box/api_key` | clé Noise 32 octets base64, posée par Moli |
| `alexa/refresh_token` | jeton OAuth Amazon, obtenu par le collage `maplanding` |

Jamais en clair, jamais dans le chat, jamais dans un argv : passe par
`moli-os secrets set <instance> <nom>` (lit stdin).

## 7. Vérification / preuves attendues

- `docker exec moli-os /moli-os check-config` → `configuration OK (N driver(s))`.
- `GET /api/health` → `esphome-box` et `alexa` en `running`, `journal_failures: 0`.
- Box : `state` / `volume` / `muted` / `wake_word` / `say` exposés + entités publiées
  (écran/light, mute/switch, présence…).
- Voix : `say` ⇒ la box lit un WAV servi par `media_base` ; mot‑clé ⇒ Whisper local
  transcrit ⇒ Moli répond ⇒ la box lit la réponse.
- Echo : apparaissent côté Moli ; `play`/`say`/`announce`/`volume` ⇒
  `media_player.echo` change d'état.

## 8. Rollback

```sh
# 1. Config Moli : restaurer la sauvegarde d'avant édition
ssh moli-os 'cd /opt/moli-os && cp data/moli.toml.bak-satellites-20261017-181301 data/moli.toml'
# 2. Patch entités : annuler dans l'ordre inverse d'application
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/e.patch'
# 3. Secrets : oublier ce que Moli a posé
docker exec moli-os /moli-os secrets forget esphome-box api_key
docker exec moli-os /moli-os secrets forget alexa refresh_token
# 4. Voix locale
ssh moli-os 'cd /opt/moli-os && docker compose rm -sf moli-piper moli-whisper'
#    puis local_speech="" / local_listen="" dans [assistant], restart moli-os
# 5. Firmware box : restaurer /config/esphome/nabu.yaml.bak-satellite-* et reflasher
```

## 9. Ordre / supersession

`esphome-full-entities.patch` s'applique **par‑dessus** la base dashboard courante
(`tablette2025-parity.patch`) et **sous** la définition des blocs `[[driver]]`. Après
toute montée de version amont : re‑synchroniser puis ré‑appliquer dans l'ordre
`tablette2025-parity` → `linky-driver` → `esphome-full-entities`.
