# Parité tablette-2025 : portage du dashboard HA vers Moli

**Objet.** Reprendre *toute* l'information du dashboard Home Assistant
`tablette-2025` dans Moli, en composants **natifs Moli** (aucun portage Bubble
Card), et tout rendre fonctionnel : pages, cartes, pilotes, voix. La maquette
(`/config/.storage/lovelace.tablette_2025`) a trois vues — **Tab** (accueil),
**Wifi**, **Solaire** — plus les automatismes qui les alimentent.

Livrables du fork (dans `notes/patches/`) :

| Patch | Contenu |
|---|---|
| `tablette2025-parity.patch` | **Cumulatif** : UI + locales de toutes les cartes ajoutées (`BinsCard`, `PlanOverlay`, `PoolCard`, `Wifi`, `AccueilBadges`, `PlanPreview`, `HeatingBar`, `RoomStrip`, `WeekWeather`, `RoomCard`…). Part de `d54c3de`, **remplace toute la chaîne `accueil-*`**. |
| `linky-driver.patch` | Crate `moli-linky` (dont la lecture `period`), enregistrement dans `moli-os`, `integrations/linky/`. |
| `esphome-full-entities.patch` | Jeu d'entités complet du pilote ESPHome (satellite vocal). |
| `ha-moli-linky-bridge.json` | Automatisation HA (REST) : publie `moli/linky/*` en *retained*. |
| `compose.override.yaml.voice` | Sidecars Wyoming Piper + Whisper (voix locale). |

## 1. Vue Tab — parité carte par carte

| Carte HA | Équivalent Moli | État |
|---|---|---|
| Météo (`meteofrance`) + `weather-chart` | `SkyHero` + `WeekWeather` | natif |
| `mushroom-chips` (consignes chauffage confort 18,5 / réduit 16, position GPS) | `HeatingBar` (consignes `home.config.heating`), zones dans `people.json` | natif |
| Salon (mushroom room + tuiles) | `RoomCard` Salon pleine largeur | natif |
| VMC + SDB, Alicia, Parents, Appart, Cave à Vins | `RoomCard` × 2 en grille (`rooms-grid`) | natif |
| Piscine (prise) | `PoolCard` (`out.config.pool`) | natif |
| Couloir | inclus dans `rooms`/`roomList` | natif |
| Horloge | en-tête Moli (heure de la maison) | natif |
| Poubelles | `BinsCard` (voir §2) | natif |
| Caméra entrée (`picture-elements`/conditional) | `CameraTile` (`favorites.cameras`) + dernier passage | natif |
| Plan (températures `state-label`) | `PlanOverlay` sur `data/plan/88607f17a54edf6e.png` (voir §3) | natif |
| Badges | `AccueilBadges` | natif |
| Boutons mode maison | `mode_maison` (helper) | natif |

`Accueil.svelte` : deux colonnes (large à gauche, étroite à droite), une
colonne sous 760 px, seuil 1100 px — comme les *sections* HA.

> **Note kiosque (résolution cible).** La tablette kiosque (`tablette-lenovo-moli.md`,
> Lenovo A7600-F) affiche en **1280×800**. À cette résolution (> seuil 1100 px), les deux
> colonnes sont présentes et `rooms-grid` reste en 2 colonnes : pas de zone serrée. Le repli
> à 1 colonne n'intervient que **sous 760 px** ; la zone « serrée » théorique (~760–1100 px)
> n'est donc **pas** la résolution kiosque. Comportement documenté (hérité de
> `accueil-motion-colonnes.md`) ; à revérifier si la cible kiosque change.

## 2. Poubelles — récurrence 14 j, sans calendrier

`home.config.bins = { jaune: {anchor:"2026-10-28"}, noire: {anchor:"2026-10-21"} }`.
`BinsCard` calcule le prochain ramassage depuis l'ancre, **par pas de 14 jours**
(bac une semaine sur deux), à minuit heure de la maison.

**Preuve** au 2026-10-16 : jaune → 28/10 soit **J-12** ; noire → 21/10 soit **J-5**.
Aucun driver calendrier.

## 3. Plan — températures sur l'image

`home.config.plan_overlay.elements` : 7 `state-label` (Poêle hue, Thermostat
z2m `local_temperature`, Alicia, Parents, SDB, Dressing, Extérieur),
`digits:1, unit:"°", cold/hot`. Rendu par `PlanOverlay` posé sur l'image de la
maison (`/api/plan/images/88607f17a54edf6e.png`).

## 4. Vue Wifi — 2 images

`home.config.wifi = { bbox:"c4e3301cfc111cf4.png", mercusys:"8c51dc7eb3ed9566.png" }`,
recopiées dans `data/plan/`. Page `#/wifi` (`Wifi.svelte`) les affiche via
`/api/plan/images/<nom>`. Entrée de navigation ajoutée après « Dehors.

Preuve : `GET /api/plan/images/{c4e3301…,8c51dc7…}` → **200** (22 909 / 5 006 o).

## 5. Vue Solaire — sourcée Linky, zéro installation solaire

Décision : **ne pas** importer l'installation solaire (Deye/Solcast/batterie),
mais nourrir la vue depuis l'**addon Linky**. Chaîne :

1. **HA** publie `moli/linky/*` en *retained* (automatisation `moli_linky_mqtt_bridge`,
   `payload` — *pas* `payload_template`, retiré du service `mqtt.publish`).
2. **Moli** : crate `moli-linky` (MQTT) lit 19 grandeurs : `index`, `conso_jour`,
   `cout_jour`, `cout_hier`, `power_principale/appart/residuel`, `residuel_jour/cumul`,
   `prix`, 6 `prix_*`, `tempo_couleur`, `tempo_hc`, **`period`**.
3. `[energy]` : compteur `linky` (role **grid**, point `linky:linky/index`),
   compteur `appart` (role circuit), `[energy.tariff]` (period + 6 prix),
   `live = { power = "linky:linky/power_principale", max = 9000, warn = 3000 }`.

Preuve : `GET /api/energy` → `period:"bleu_hp"`, `price_now:0.1654`, compteurs
`linky` (grid) et `appart` (circuit) présents ; `linky:linky` porte les 19
lectures ; graphe `GET /api/energy/series?step=day&count=7` → 7 jours.
(Zéro import solaire.)

Page `Solaire.svelte` reste la **démo** locale (`#/energie/solaire`), alimentée
par la conso réelle Moli — aucune donnée solaire importée.

## 6. Présence + carte

`data/people.json` : personnes **Fabienne**, **Pat** (rôle member) ;
zones importées de HA : `sdec` (SDEC, r455, `mdi:account-edit-outline`),
`sallon` (Salon, r224, `mdi:hair-dryer`), `ecole` (Ecole, r271, `mdi:school`).
Position via l'appli Moli appairée (`POST /api/phones/<id>/report`, crate
`moli-phones`), rendue sur `Carte.svelte` (Leaflet + zones). Prérequis humains :
installer/appairer l'appli sur les téléphones et joindre le rapport hors LAN.

Preuve : `GET /api/people` → zones ci-dessus, personnes Fabienne/Pat.

## 7. Voix (gestion vocale hébergée côté Moli)

Décision : **voix hébergée près de Moli** (pas dans `moli-os`, limité à 128 Mo).
Deux sidecars Wyoming sur la boucle locale :

- `moli-piper` (TTS) : `rhasspy/wyoming-piper`, `fr_FR-siwis-medium`, `127.0.0.1:10200`.
- `moli-whisper` (STT) : `rhasspy/wyoming-whisper`, `tiny-int8`, `--language fr`, `127.0.0.1:10300`.

`[assistant] : local_speech="127.0.0.1:10200"`, `local_listen="127.0.0.1:10300"`,
`local_voice="fr_FR-siwis-medium"`. Le client Wyoming (`moli-net::wyoming`) et la
voix satellite (`moli-assistant/src/satellite.rs`) existent déjà ; rien à écrire
côté Rust.

Preuves :
- `GET /api/assistant` → `{"listen":true,"speak":true,"voices":{"local":true}}`.
- `POST /api/assistant/speak {"text":"…"}` → **HTTP 200**, WAV PCM 16 bits mono 22050 Hz.
- `POST /api/assistant/listen` (WAV sur stdin) → `{"engine":"local","text":"Bonjour, la maison est prête !"}`.
- Cible ESP32 S3 Box 123560 (satellite) : `select.esp32_s3_box_123560_assistant`
  et `assist_satellite.…` présents côté HA ; le boîtier parlera dès qu'il sera
  déclaré en `[[driver]] kind="esphome"` (cf. `integrations/esphome/onboarding.md`).

## 8. Appliquer / vérifier

```sh
# UI + locales (cumulatif, part de d54c3de) :
cat notes/patches/tablette2025-parity.patch | ssh moli-os 'cat > /tmp/p.patch'
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/p.patch && git apply /tmp/p.patch'
# pilote Linky :
cat notes/patches/linky-driver.patch | ssh moli-os 'cat > /tmp/l.patch'
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/l.patch && git apply /tmp/l.patch'
# voix :
cat notes/patches/compose.override.yaml.voice | ssh moli-os 'cat > /tmp/v.yaml'
# fusionner le bloc services dans /opt/moli-os/compose.override.yaml, puis :
ssh moli-os 'cd /opt/moli-os && docker compose up -d --build && curl -s http://127.0.0.1:8790/api/health'
```

Non-régression : `check-config` → **configuration OK (10 driver(s))** ;
`/api/health` → 12 pilotes `running`, `journal_failures: 0` ;
`npm run build` → OK ; `git apply --check` OK pour chaque patch.

## Rollback

1. UI : `git apply -R notes/patches/tablette2025-parity.patch
   (ou `git checkout -- web/ locales/` puis re-déployer la chaîne `accueil-*`).
2. Linky : `git apply -R notes/patches/linky-driver.patch`, retirer le bloc
   `[[driver]] id="linky"` + `[energy]` linky de `moli.toml` (backups `.bak-*`).
3. Voix : `docker compose rm -sf moli-piper moli-whisper`, remettre
   `local_speech=""` / `local_listen=""`, restaurer `compose.override.yaml.bak-*`.

## Ordre / supersession

`tablette2025-parity.patch` est **cumulatif depuis `d54c3de`** : il **remplace**
toute la chaîne `accueil-ha-inspire → … → accueil-room-icons` (ne pas les
enchaîner par-dessus). Sur une base déjà patchée, re-synchroniser sur `d54c3de`
avant application. Hors périmètre confirmé : **LUBA2**, style **Bubble Card**,
**installation solaire** (Deye/Solcast/batterie).
