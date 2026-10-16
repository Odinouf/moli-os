# Accueil Moli inspiré du dashboard HA `tablette-2025`

> **Superseded partiellement par `accueil-sections.md`** (2026-10-16) :
> pour la **disposition de l'Accueil** (grille 2 colonnes, badges, cartes
> nouvelles), c'est `accueil-sections.md` qui fait foi. Ce document reste la
> référence pour les pièces (`RoomStrip`), la consigne chauffage
> (`HeatingBar`) et la météo semaine (`WeekWeather`). Ordre des patches :
> `accueil-ha-inspire` → `accueil-clim-conditional` → `accueil-sections`.

Relevé et réalisation : 2026-10-16. LXC 125 `moli-lab` (`/opt/moli-os`).

## Objectif

Reprendre la structure du dashboard HA `tablette-2025` (vue « Tab ») sur
l'accueil Moli, et récupérer les capteurs manquants. Périmètre validé :
structure + capteurs (**sauf poubelles**), refonte UI + **commandes
chauffage**. Fabienne/Pat séparés ⇒ prérequis appairage 2 téléphones
(reporté).

## Ce qui a été fait

### 1. Pièces (AC-S1) — `RoomStrip.svelte`

Nouvelle carte « Pièces » sous le hero : une pastille par pièce, la
température (moyenne des capteurs en ligne) teintée froid→chaud, et
l'humidité quand un capteur la donne. Ordre et noms pilotés par
`home.json` `rooms` (avec alias). Cave à Vins → « pas de mesure » (pas de
capteur T°).

### 2. Consigne chauffage (AC-S2) — `HeatingBar.svelte`

Bandeau « Consigne chauffage » : Confort (18,5°) / Réduit (16°) / Arrêt.
Le bouton allumé est **lu sur la valve** (`system_mode` +
`occupied_heating_setpoint`), jamais deviné : une valve changée à la main
s'affiche correctement. Température de la pièce affichée à côté.

### 3. Graphe météo de la semaine (AC-S3) — `WeekWeather.svelte`

Carte « La semaine » (colonne de droite) : 8 jours, span T° max/min en
barre glissante (bleu→orange, comme `SkyDetail`), icône météo, % de pluie.
Backend `moli-weather` élargi `forecast_days=7` → `8`. `maison.meteo.jours`
= « 8 jours ».

### 4. Chauffage piloté (AC-D1)

`home.json` `heating` :
```json
"heating": { "valve": "z2m:0x286847fffe96a2cd", "confort": 18.5, "reduit": 16 }
```
- Confort → `system_mode=heat` + `occupied_heating_setpoint=18.5`
- Réduit → `heat` + `16`
- Arrêt → `system_mode=off`

**Vérifié par lecture d'état** (aucun test physique) :

| Action   | `system_mode` | setpoint |
|----------|---------------|----------|
| avant    | heat          | 16.5     |
| Confort  | heat          | 18.5     |
| Arrêt    | off           | 18.5     |
| Réduit   | heat          | 16       |
| restauré | heat          | 16.5     |

État final remis à l'identique (heat / 16,5°).

### 5. Capteurs assignés (AC-D2) — `data/labels.toml`

Ajoutés sans doublon (décisions utilisateur) :

| Device | Pièce |
|--------|-------|
| `hue:27cc7345…` Capteur Poele | Salon |
| `hue:6a3105f8…` Parents | Parents |
| `z2m:0x00158d0002775db9` | Dressing |
| `z2m:0x00158d000449d3f1` (offline) | Piscine |
| `z2m:0x00158d0002779ad7` Zig-T-SDB | VMC + SDB |
| `hue:8fc554e0…` Cave (groupe) | Cave à Vins |

`z2m:0x00158d00022cbf63` **non assigné** (l'utilisateur ne sait plus où
il est : « on le bougera plus tard »).

`home.json` `rooms` avec alias : `VMC + SDB` ← `SDB`,`VMC` ;
`Appartement` ← `Apartement` (orthographe device) ; `Cave à Vins` ← `Cave`.

### 6. Non-régression (AC-D4)

- `check-config` : `configuration OK (7 driver(s))`
- `/api/health` : 9/9 drivers running, `journal_failures: 0`
- Rendu Puppeteer : toutes les cartes présentes (Lumières, Électricité,
  Routines, Caméra, Télécommande, Dehors), aucun chevauchement.
- HA non modifié (lecture seule).

## Fichiers modifiés (CT125 `/opt/moli-os`)

| Fichier | Nature |
|---------|--------|
| `data/home.json` | `rooms` + `heating` |
| `data/labels.toml` | 6 pièces ajoutées |
| `web/src/maison/pages/Accueil.svelte` | import + placement des 3 cartes |
| `web/src/maison/ui/RoomStrip.svelte` | **nouveau** |
| `web/src/maison/ui/HeatingBar.svelte` | **nouveau** |
| `web/src/maison/ui/WeekWeather.svelte` | **nouveau** |
| `locales/fr/maison.json` | clés `maison.accueil.*` + `jours` |
| `crates/moli-weather/src/lib.rs` | `forecast_days=8` |

Backups `.bak-hainspire` posés à côté de chaque fichier modifié.
Patch : `notes/patches/accueil-ha-inspire.patch` (+ `.home.json`,
`.labels.toml`).

## AC-D3 — Fabienne et Pat suivis séparément

**Fait (identité)** : les deux personnes existent côté Moli et sont
distinctes. `POST /api/people` exige une session de propriétaire (le code
de la maison) — indisponible en session headless — la création a donc été
écrite dans `data/people.json` (même enregistrement que l'API persiste,
relu au démarrage par `People::open`). Redémarrage du conteneur, vérifié
en direct :

```
GET /api/people
→ {"people":[{"id":"fabienne","name":"Fabienne","role":"member"},
             {"id":"pat","name":"Pat","role":"member"}], ...}
```

- `fabienne` et `pat` : rôles `member`, ids stables (jamais renommés).
- Driver `personnes` (`kind = "people"`) : *running*.
- Fichier `data/people.json` en `0600`, uid 1000.

**Reste (suivi de position)** : l'appairage de deux téléphones (appli
Moli + Cloudflare Access + Wi-Fi maison) reste à faire — matériel absent
en session. Marche à suivre (skill `installer-moli`) :

1. **Inviter** chacune (`POST /api/people/<id>/invite` par le
   propriétaire) → code à 8 caractères, valable 7 jours.
2. **Driver téléphones** — décommenter dans `data/moli.toml` :
   ```toml
   [[driver]]
   kind = "phones"
   [driver.options]
   home_wifi = ["<SSID de la maison>"]
   radius = 150
   ```
   `moli-os check-config`, redémarrer.
3. **Cloudflare Access** : application « bypass » sur `<hôte>/api/phones`
   (les rapports portent leur propre jeton, Moli vérifie le SHA-256).
4. **Sur chaque téléphone** : installer l'appli (`mobile/`, Expo), se
   connecter (Access), saisir le code d'invitation de la personne, accepter
   la localisation « Toujours ». L'appli s'appaire seule
   (`POST /api/mobile/register`) et envoie un premier rapport.
5. **Vérifier** : page Système → un appareil par téléphone ; `GET
   /api/people` → `people.length === 2` ; la maison (zone) s'apprend au
   premier rapport sur le Wi-Fi de la maison.
6. **Activer la présence** (option) : driver `presence`
   (`kind = "presence"`, `network`, un `[[driver.options.person]]` par
   personne avec ses MAC Wi-Fi) pour un `personnes:<id>` indépendant des
   téléphones.

Une fois les deux appareils appairés, l'accueil peut les montrer côte à
côte (Fabienne / Pat) — un ajout UI d'une dizaine de lignes dans
`RoomStrip`/une carte Présence, à faire à ce moment-là.

## Autre reste à faire / reporté

- **Poubelles** (calendrier HA) : driver calendrier coûteux, reporté.
- **VMC durée** : reporté.
- `z2m:0x00158d00022cbf63` : à placer plus tard.
- Cohérence « Cave à Vins » (groupe Hue) vs label « Entree » de son membre
  `hue:e9cef3e4` : à trancher si besoin (le groupe porte désormais la
  pièce).

## Rebuild

Tout édit web/data exige un rebuild (bundle embarqué rust-embed) :
```
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d'
```
~4 min (release, 100 % Rust). Pas de node/npm sur le CT.
