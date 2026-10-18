# Page Dehors → Moli OS

**Date :** 2026-10-16 · **Portée :** mise en place de la page **Dehors** (météo, air, piscine,
jardin, caméra) dans Moli.
**Statut :** fait et vérifié (D1–D10).

> Le volet **fuseaux horaires** (LXC 125 / conteneur, T1–T5), mené dans la même session mais
> indépendant, est documenté séparément : voir `notes/fuseaux-horaires.md`.

## Contexte

- **Moli** : LXC **125 `moli-lab`** (SSH `moli-os`, web `http://192.168.1.125:8790`, code
  `/opt/moli-os`, conteneur `moli-os:latest`). Détail du container (identité, accès, réseau) :
  `notes/deploy-lxc125.md`. Config `data/moli.toml`, secrets `data/secrets.enc` + `data/master.key`.

---

## D — Page Dehors

### D1 — Position du foyer

`data/moli.toml` (backup `data/moli.toml.bak-predehors`) :

```toml
[automations]
latitude = 46.231
longitude = 1.922
timezone = "Europe/Paris"
```

`docker exec moli-os /moli-os check-config` → `configuration OK`.

**Position canonique.** Les `vars` des pilotes météo/air doivent reprendre **exactement** les mêmes
coordonnées (`46.231 / 1.922`), pas une version arrondie : deux sources divergentes feraient
calculer météo/air pour un point périmé. Toute évolution de position se fait aux **deux** endroits
(voir D2/D3).

### D2 / D3 — Pilotes météo et air

Profils **intégrés** (`profile list` : `open-meteo`, `open-meteo-air`), aucun rebuild nécessaire :

```toml
[[driver]]
id = "meteo"
kind = "profile"

[driver.options]
profile = "open-meteo"
vars = { lat = "46.231", lon = "1.922" }

[[driver]]
id = "air"
kind = "profile"

[driver.options]
profile = "open-meteo-air"
vars = { lat = "46.231", lon = "1.922" }
```

### D4 — IDs réels

- Météo : `meteo:api.open-meteo.com:443` — points `temperature, feels_like, humidity,
  precipitation, cloud_cover, wind_speed, wind_gusts, weather_code, daylight, today_max,
  today_min, today_rain, today_rain_chance, sunrise, sunset`.
- Air : `air:air-quality-api.open-meteo.com:443` — points `aqi, pm2_5, pm10, no2, ozone, uv_index`.

### D5 — `data/home.json`

Servi tel quel par `/api/home` (absent → `{}` → page vide). Contenu écrit :

```json
{
  "title": "Maison",
  "favorites": {
    "cameras": [{ "id": "frigate:atelier", "name": "Atelier", "refresh": 10 }]
  },
  "outdoor": {
    "weather": "meteo:api.open-meteo.com:443",
    "air": "air:air-quality-api.open-meteo.com:443",
    "pool": "z2m:0xa4c138062423ffff",
    "garden_lights": [{ "id": "z2m:0xe0798dfffec9ae8f", "name": "Spot extérieur" }]
  }
}
```

> **MàJ 2026-10-17 :** le champ `pool_pump` (`z2m:0xa4c138bb3c3e1f88`) a été **retiré** — cette
> prise est le lave-vaisselle, pas la pompe ; la tuile « Pompe » de `#/dehors` a disparu (cf.
> `notes/prise-lave-vaisselle.md`). Le bloc ci-dessus reflète l'état courant.

Appareils Moli câblés (réutilisés, pas venus de HA) :

| Rôle | Device Moli | Nature |
|------|-------------|--------|
| Piscine (eau) | `z2m:0xa4c138062423ffff` | sonde température (14,7 °C) |
| ~~Pompe piscine~~ | ~~`z2m:0xa4c138bb3c3e1f88`~~ | retirée 2026-10-17 (c'est le lave-vaisselle, cf. `prise-lave-vaisselle.md`) |
| Jardin | `z2m:0xe0798dfffec9ae8f` | Spot extérieur |
| Caméra | `frigate:atelier` | caméra Frigate |

> **Caveat pompe (historique) :** la tuile « Pompe piscine » pointait volontairement sur la
> prise Zigbee `z2m:0xa4c138bb3c3e1f88`. Cette prise s'est avérée être le **lave-vaisselle** ;
> la tuile a été retirée (cf. `notes/prise-lave-vaisselle.md`). La vraie pompe de filtration
> est Z-Wave (`switch.prise_piscine_2`, automation HA), absente de Moli (cf. `zwave-moli.md`).

### D6 — Restart

`docker compose restart` → `drivers=9`, `meteo` + `air` `running`, `journal_failures: 0`.

### D7 — Rendu de `#/dehors`

Rendu vérifié (snapshot navigateur) : **Météo** (16°, « Quelques nuages », ressenti/max/min,
humidité/vent/pluie/soleil), **Air** (AQI 19 « Très bon », UV 1, PM2.5, ozone), **Piscine**
(eau 14,7 °C + pompe), **Jardin** (Spot extérieur), **Caméra Atelier**.

**Patch local requis (upstream à remonter).** `web/src/maison/pages/Dehors.svelte` gatait la pompe
sur le point codé en dur **`switch_1`** :

```js
const pumpKnown = $derived(pumpId && reachable(pumpId) && v(pumpId, 'switch_1') != null);
```

Or la Prise Piscine (`z2m`, kind prise) expose **`state`**, pas `switch_1` → la carte affichait
« Pompe : état inconnu ». Corrigé pour utiliser `powerKey(device(...))` (le point d'allumage réel,
résolu par kind) :

```js
import { home, value, num, isOn, reachable, device, powerKey } from '../lib/home.svelte.js';
const pumpKnown = $derived(pumpId && reachable(pumpId) && powerKey(device(pumpId)) != null);
```

Backup : `web/src/maison/pages/Dehors.svelte.bak-prepool`. Le bundle web est **embarqué** dans le
binaire (`Dockerfile` : build vite puis `COPY web/dist`) → **rebuild image** nécessaire
(`docker compose build` puis `up -d`).

**Patch tracé** (pour survivre à un rebuild/`git pull` depuis l'amont) :
`notes/patches/dehors-pump-powerkey.patch` — à appliquer sur `web/src/maison/pages/Dehors.svelte`
après chaque resynchronisation du dépôt, en attendant une remontée amont (PR sur
`github.com/rudy-io/moli-os`). Sans lui, la carte pompe régresse en « Pompe : état inconnu ».

### D8 — Test neutre pompe

Depuis la page : bascule ON → **OFF** (device `state=false`, reflété) puis **ON** (restauré).
Aucun autre circuit touché. Preuve : `/api/devices` pour `z2m:0xa4c138bb3c3e1f88` et bouton page.
**Rappel :** ce test porte sur la **prise Zigbee**, pas sur la vraie pompe Z-Wave (cf. caveat D5 et
`notes/zwave-moli.md`).

### D9 — Non-régression

9/9 pilotes `running` : `air, bambu-a1, bambu-a1mini, energie, frigate, hue, meteo, personnes, z2m`.
HA `192.168.1.78:8123` → `200`, **non modifié** (lecture seule).

### D10 — Documentation

Le présent document.

---

## Rollback

1. Fuseau : `ssh moli-os 'timedatectl set-timezone Etc/UTC'`, retirer `TZ=…` de `moli.env`, `docker compose up -d`.
2. Config : `cp data/moli.toml.bak-predehors data/moli.toml` puis restart.
3. Page Dehors : supprimer `data/home.json` (la page redevient vide), restaurer
   `Dehors.svelte.bak-prepool` → `Dehors.svelte` et rebuilder si l'on veut revenir au gate `switch_1`.

## Hors périmètre (assumé)

- Chimie piscine (pH / ORP) — non câblée, affichée « — ».
- Autres lumières/caméras du jardin et de l'extérieur.
- Purge des 11 caméras fantômes Frigate : **faite depuis** (cf. `notes/frigate-migration.md`,
  P1–P7 ; accord humain obtenu). Plus hors périmètre.
