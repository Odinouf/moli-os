# Accueil — Plan actif, caméras, header, Tuya (2026-10-16)

Patch `notes/patches/accueil-plan-frigate.patch` (à appliquer **après**
`accueil-heure-salon-sections`, état déployé sur le CT125).

## Ce que le patch change (web)

| Critère | Fichier | Changement |
|---|---|---|
| C1 | `ui/PlanPreview.svelte` | Pins de l'Accueil avec états `lit` / `open` / `alarm` / `off` (= page Plan) |
| C2 | `lib/home.svelte.js` | `motion(id)` reconnaît la clé `motion` (capteurs Hue) |
| C3 | `ui/AccueilBadges.svelte` | Badge puissance : `Math.abs` (plus de « -891 W ») |
| C4/C5 | `pages/Accueil.svelte` | `PoolCard` retirée ; carte Frigate **au-dessus** de `PlanPreview` |
| C6 | `ui/SkyHero.svelte` | « Bonsoir » plus petit (40→22 px), l'heure plus grande (22→40 px) |
| C7 | `lib/home.svelte.js` + data | Caméras renommées Entrée / Grange |
| C8 | `ui/CameraTile.svelte`, `pages/Cameras.svelte`, `lib/icons.js` | Vraies clés Frigate (`person`/`car`/`dog`/`cat`/`bird`+`motion`), icônes `cat`/`bird` |
| F5 | `locales/fr|en/salon.json` | Clés mortes retirées : `salon.evenement.{personne,vehicule,animal,colis}` (remplacées par `pilotes.frigate.*`) |
| F6 | `ui/PlanPreview.svelte`, `ui/WeekWeather.svelte`, `ui/PoolCard.svelte`, `ui/RoomStrip.svelte` | CSS orphelin `.card-head h2` purgé (plus aucun `<h2>` dans ces cartes) |

## Données (hors patch — `data/`, non versionnées)

- `data/labels.toml` : `z2m:0xa4c138062423ffff` → `room = "Piscine"` ; `frigate:atelier`
  → `name = "Entrée"` ; `frigate:piscine` → `name = "Grange"`.
- `data/home.json` : pièce `Piscine` ajoutée ; `favorites.cameras[0].name = "Entrée"`.
- `data/tuya.json` + `data/moli.toml` : voir §Tuya (C9).

## Tuya (C9)

Import réel (clés → coffre, jamais affichées) :

```sh
# dans la VM HAOS (PVE 192.168.1.4) :
qm guest exec 222 -- /bin/sh -c 'docker exec -i homeassistant python3 - < /tmp/tuya-export.py' \
  | ssh moli-os 'docker exec -i moli-os /moli-os tuya import'
# → 7 devices filed in /data/tuya.json, 7 local keys stored (encrypted)
```

`tuya.json` retravaillé à la main : **3 caméras `sp` retirées** (reportées, cf.
`tuya-migration-assessment.md`), pièces posées :

| Appareil (Tuya) | Cat. | Pièce |
|---|---|---|
| Guirlande | `cz` | Atelier |
| Star Alicia | `dj` | Alicia |
| Ceiling Lamp RGB | `dj` | Couloir |
| ceiling fan/Light v2 | `fsd` | Chambre |

`moli.toml` : nouveau bloc `[[driver]] id = "tuya" kind = "tuya"`
(`devices_file = "/data/tuya.json"`).

## Vérification

- `check-config` → **8 driver(s)** ; `catalogue check` OK (27 paquets, 6 avertissements
  préexistants) ; parité fr/en `pilotes.json` sans écart.
- `docker compose build` OK (web vite + rust) puis `up -d --force-recreate`.
- `GET /api/health` : `drivers_running` **10/10**, `journal_failures: 0`, 76 appareils.
- Bundle servi frais : `.pin.lit/.open/.alarm/.off` présents dans le CSS ;
  `pilotes.frigate.voitures/chats/oiseaux` présents dans le JS.
- `GET /api/devices` : `frigate:atelier → "Entrée"`, `frigate:piscine → "Grange"`,
  sonde piscine `room = Piscine`, 4 appareils Tuya avec `native_room` Atelier/Alicia/
  Couloir/Chambre.

## Hors périmètre (reporté)

Caméras Tuya (Chat, Grenier) : `get_device_stream_allocate` renvoie une URL RSTPS cloud
éphémère (rotative) ; Moli (`FROM scratch`) n'a pas ffmpeg → voie à décider
(driver Tuya + ffmpeg, ou injection dans Frigate). Voir discussion de plan.
