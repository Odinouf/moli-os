# Accueil — parité pixel du dashboard HA `tablette-2025` (2026-10-18)

Patch : `notes/patches/accueil-tablette2025-pixel.patch` (à appliquer **après**
`tablette2025-parity.patch`, `accueil-plan-scale.patch`, `accueil-plan-hero.patch`).

## Demande

Reproduire **exactement** l'Accueil du dashboard Home Assistant `tablette-2025`
(vue 0, `title: "Tab"`), au pixel près, sur la route `#/` de Moli — mais avec la
**capacité Moli maximale** (vrais appareils, vrais pilotes) et le **thème Moli**
(Figtree, `--surface #161a22`, `--warm #f5ae4c`), pas le thème HA « noctis ».

## Périmètre

- **Vue HA 0 uniquement**, rendue sur `#/` (route Accueil existante). Aucune route
  ajoutée ; `Solaire`, `Wifi`, `Energie`, `Dehors` **non touchées**.
- Le **Plan** garde le rendu Moli (`PlanPreview`, pins 3D) et reste **dans l'en-tête**
  (`SkyHero`), choix explicite : la carte HA `clock` et la carte `picture-elements` ne
  sont donc **pas** recréées comme cartes séparées — elles sont absorbées par `SkyHero`.
- La parité est **structurelle + géométrique** (colonnes, gouttière, hauteurs de cartes),
  pas chromatique : le thème Moli est conservé.

## Correspondance carte par carte

| Carte HA (vue 0) | Rendu Moli | Fichier |
|---|---|---|
| badges `mushroom-chips` (12 chips) | rangée `.badges` 11–12 pastilles | `ui/AccueilBadges.svelte` |
| `meteofrance-weather-card` (38 px) | `WeatherNow` (conditions) | `ui/WeatherNow.svelte` |
| `weather-chart-card` (212 px) | `WeekWeather` (semaine Open-Meteo) | `ui/WeekWeather.svelte` |
| `mushroom-chips` consigne (36 px) | `HeatingBar` (Confort / Réduit / Arrêt) | `ui/HeatingBar.svelte` |
| `bubble-card` × 7 (56 px) | `TabletteRows` + `TabletteRow` | `ui/TabletteRows.svelte`, `ui/TabletteRow.svelte` |
| `horizontal-stack` poubelles (56 px) + caméra | `BinsCard` (empilé) + `CameraCard` | `ui/BinsCard.svelte`, `ui/CameraCard.svelte` |
| `picture-entity camera.rlc_810a_fluent` (120 px) | `CameraCard` (snapshot Frigate live) | `ui/CameraCard.svelte` |
| `conditional` LUBA2 | *dégrade* (absent) | — |
| `bubble-card` Piscine (62 px) | `PoolCard` | `ui/PoolCard.svelte` |
| `linear-gauge` deye_16kwh | `BatteryGauge` (dégradé) | `ui/BatteryGauge.svelte` |

## Géométrie (1280×800, kiosque Lenovo A7600-F)

Mesure DOM live (`getBoundingClientRect`) via `vite dev` (`MOLI_URL` → CT125),
aperçu 1280×800, et re-mesure sur le CT125 après build.

| Élément | Cible HA | Moli | Δ |
|---|---|---|---|
| Rangée badges | h 36 | **36** | 0 |
| Colonne gauche | w 464 | **464** | 0 |
| Colonne droite | w 464 | **464** | 0 |
| Gouttière | 32 | **32** | 0 |
| Conditions météo | h 38 | **38** | 0 |
| Semaine | h 212 | **212** | 0 |
| Consigne chauffage | h 36 | **36** | 0 |
| Rangées Salon…Couloir | h 56 | **56** × 7 | 0 |
| Appart / Cave (paire) | 228/228 | **226/226** (56 px) | −2 |
| Poubelles (empilées) | h 56 × 2 | **120** (56+8+56) | — |
| Caméra (`picture-entity`) | h 120 | **120** | 0 |
| Piscine | h 62 | **62** | 0 |
| Jauge | h 56 | **56** | — |
| Pastilles | 12 | **11–12** (Tempo demain conditionnelle) | — |

`Salon`, `VMC + SDB`, `Chambre`, `Parents`, `Appart`/`Cave`, `Couloir` : 7 rangées
rendues, chacune 56 px, avec pastilles de lecture (température, humidité, vitesse,
puissance) selon les capteurs présents dans la pièce.

**La liste des rangées vit dans `data/home.json`** (`tablette.rows`) : le code ne
nomme aucun appareil. Une entrée porte un `match` (expression régulière sur le nom),
ou un `id` explicite ; `kind` filtre le genre (`plug`, `light`…), `sensor_room` dit
d'où viennent les lectures, `level` affiche un pourcentage, `power` ajoute une pince
du Linky, `pair: true` met deux rangées côte à côte, `toggles: false` les rend
lecture seule. Une entrée qui ne résout rien est **sautée** : pas de rangée fantôme.

```json
"tablette": { "rows": [
  { "name": "Salon", "match": "^salon$", "icon": "light-group", "level": "brightness" },
  { "name": "VMC + SDB", "match": "vmc", "kind": "plug", "icon": "fan", "sensor_room": "VMC + SDB" },
  { "name": "Chambre", "match": "^bandeau <chambre>$", "icon": "sun", "sensor_room": "<chambre>" },
  { "name": "Parents", "match": "^bandeau <parents>$", "icon": "bed-king-outline", "sensor_room": "<parents>" },
  { "name": "Appart", "match": "appart", "icon": "home-city", "toggles": false, "power": "power_appart", "pair": true },
  { "name": "Cave", "match": "^cave$", "icon": "bottle-wine", "level": "brightness", "pair": true },
  { "name": "Couloir", "match": "couloir", "icon": "light", "level": "brightness" }
] }
```

> Les deux entrées `<chambre>` / `<parents>` sont volontairement génériques ici :
> la vraie valeur (nom d'appareil Hue portant un prénom) ne vit que dans
> `data/home.json`, jamais dans le dépôt.

> Grille `.sections` : une colonne bornée à **464 px et centrée** (`width: 100%`,
> `max-width: 464px`, `margin-inline: auto`) tant que la fenêtre fait moins de
> 1100 px ; **deux colonnes** (`repeat(2, minmax(0, 1fr))`, `max-width: 960px`)
> au-delà, gouttière 32 px. Aucune modification de `maison.css`.
>
> ⚠️ Piège corrigé : un élément de grille avec `margin-inline: auto` mais **sans**
> `width` se réduit à son contenu (mesuré 439 px au lieu de 960) — d'où `width: 100%`.

## Dégradations assumées (jamais simulées)

Aucune valeur inventée : ce qui n'a pas de pilote Moli s'affiche `—` ou est masqué,
avec une infobulle / justification.

| Référence HA | Raison | Rendu |
|---|---|---|
| `alarm_control_panel.home_alarm` | pas de pilote alarme Moli | pastille `shield` « Alarme maison » + `—` |
| `alarm_control_panel.grange` | idem | pastille `shield` « Alarme grange » + `—` |
| LUBA2 (tondeuse) | absent | carte non rendue |
| `sensor.deye_16kwh` | aucun onduleur suivi | `BatteryGauge` : `—` + « Aucune batterie suivie par Moli » |
| `input_select.pool_pump_mode` | pas d'entité | `PoolCard` : état pompe masqué |
| `input_boolean.piscine_safeguard_only` | pas d'entité | masqué |
| `sensor.piscine_today` | pas d'entité | masqué |
| `sensor.vmc_today` | pas d'entité | masqué |

- **Caméra** : `frigate:atelier` (l'« Entrée », Reolink `192.168.1.23`) via
  `GET /api/devices/frigate:atelier/snapshot` — image 640×360 rafraîchie toutes les
  10 s, vignette 120 px, point vert = en ligne, orange = mouvement/personne détecté.
  L'entité HA `camera.rlc_810a_fluent` est bien cette caméra (vérifié via
  `go2rtc.streams.atelier → 192.168.1.23:554`).

Valeurs **réelles** (vérifiées sur le CT125) :

- **Alarme** : pas de pilote → `—` sur les deux pastilles (maison, grange), chacune
  nommée ; dès qu'un pilote existe, `badges.alarms` dans `home.json` donne les deux
  identifiants et la pastille lit son état (`alarm`).
- **Contacts** (4) : quatre appareils `z2m` à point `contact`/`doorcontact_state`
  (baie vitrée, atelier, grange, boîte aux lettres), résolus **par nom** via `doors`
  puis par correspondance sur les appareils qui exposent un contact. Aucun
  identifiant n'est écrit dans le dépôt : il vit dans `data/home.json`.
- **Tempo** : `tempo:www.api-couleur-tempo.fr:443` → `bleu` aujourd'hui, `bleu` demain.
- **Puissance** : `linky:linky` → `power_appart` / `power_residuel` (couleur d'alerte
  selon seuils <1000 bonne, <3000 tiède, sinon alerte).
- **Prises** : `badges.switches` dans `home.json` — « Spot extérieur » et « Prise
  Imprimante 3D » (seconde en icône seule, `icon_only: true`).
- **Poubelles** : calculées **en direct** depuis `home.config.bins` (jaune 2026-10-28,
  noire 2026-10-21) + période 14 j — jamais figées.

> Règle de dépôt : la note et le patch ne contiennent **aucun** identifiant
> d'appareil ni nom de personne. Vérifié : `grep -cE "0x[0-9a-f]{16}"` = 0 sur le
> patch, `grep -ci "<prénom>"` = 0 sur les deux fichiers.

## Preuves

```
$ grep -cE "0x[0-9a-f]{16}" notes/patches/accueil-tablette2025-pixel.patch
0                                     # aucun identifiant d'appareil dans le patch

$ git apply --check (sur clone vierge de d54c3de)
Checking patch web/src/maison/pages/Accueil.svelte ... (13/13 fichiers OK)

$ ssh moli-os 'docker exec moli-os /moli-os check-config'
configuration OK (12 driver(s))

$ curl -s http://127.0.0.1:8790/api/health
drivers_running 14 · devices 86 · points 576 · journal_failures 0
```

Mesure DOM en production (`http://192.168.1.125:8790`, viewport 1280×800) :

```
badges   x=112 y=335 w=1132 h=36
sections x=198        w=960  (2 × 464 + 32)
colonne 0 x=198 w=464 · colonne 1 x=694 w=464
now h=38   week h=212   heating h=36   row h=56   pair h=56
bins h=56  cam h=120    pool h=62      gauge h=56
overflowX false
```

Contenu de la rangée de pastilles (11 pastilles à 02:18 ; la 12e — Tempo
« demain » — n'apparaît qu'une fois la couleur de demain publiée par RTE) :

```
—  —  Baie vitrée  Atelier  Grange  Boîte aux lettres
bleu  474 W  185 W  Spot extérieur  Prise Imprimante 3D
```

Responsive (même page, largeurs successives) :

```
1440 → sec w960 2×464   | 1280 → w960 2×464  | 1100 → w952 2×460
 960 → w464  1 col centrée | 900 → w464 1 col | 760 → w464 1 col
 520 → w464  1 col, poubelles empilées | 390 → w358 1 col
aucun débordement horizontal à aucune largeur
```

Les valeurs de puissance (`474 W`, `185 W`) viennent du Linky en direct : HA
publie `0` quand la pince est au repos, Moli affiche ce que la source dit —
jamais une valeur inventée.

## Rollback

```sh
# 1. pousser le patch sur le CT puis l'inverser
cat notes/patches/accueil-tablette2025-pixel.patch | ssh moli-os 'cat > /tmp/accueil-tablette2025-pixel.patch'
ssh moli-os 'cd /opt/moli-os && git apply -R --check /tmp/accueil-tablette2025-pixel.patch'   # vérifie d'abord
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/accueil-tablette2025-pixel.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'
```

Sauvegardes `.bak-tablette2025-<horodatage>` de chaque fichier touché avant application
(dans `/opt/moli-os`), `data/home.json.bak-tablette2025-<horodatage>` pour la config
`badges.switches`, et `data/home.json.bak-rows-<horodatage>` pour `tablette.rows`.
Les cinq fichiers créés (`BatteryGauge`, `CameraCard`, `TabletteRow`, `TabletteRows`,
`WeatherNow`) sont retirés par `git apply -R` (mode `new file`).

## Configuration côté maison (`data/home.json`, non versionné)

Ce patch ne nomme **aucun** appareil : tout ce qui est propre à la maison vit dans
`data/home.json`, comme `doors`, `bins` et `badges.switches` avant lui.

| Clé | Rôle |
|---|---|
| `tablette.rows` | les 7 rangées de la colonne de gauche (voir plus haut) |
| `badges.linky` | l'appareil Linky par défaut (`linky:linky`) |
| `badges.switches` | les prises commandées d'un tap (`icon`, `icon_only`) |
| `badges.alarms` | *(optionnel)* les deux alarmes, quand un pilote existera |
| `badges.gauge` | *(optionnel)* la source de la jauge batterie |

## Hors périmètre

Thème noctis HA (rejeté), vues Wifi/Solaire/Energie/Dehors, route séparée pour la
tablette, ouverture des cartes HACS HA (bloquée par `X-Frame-Options`).
