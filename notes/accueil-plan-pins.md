# Carte Plan de l'Accueil — jetons réduits, sans relevés, filtrés

Patch : `notes/patches/accueil-plan-pins.patch` (3 fichiers).
Appliqué **après** `accueil-tablette2025-pixel` — état de départ : `main` (`d54c3de`) +
`tablette2025-parity` + `accueil-plan-scale` + `accueil-plan-hero` +
`accueil-tablette2025-pixel`. Ordre complet de la chaîne : `AGENTS.md` §5.

> **Correctif (2026-10-19, revue).** La première version de ce patch ne partait pas de cet
> état : elle attendait `const EDGE = 28` avec la garde `3 * EDGE`, la paire
> `rawW`/`rawH` → `frameW`/`frameH` et `'fan'` dans `lit()`, qui n'existaient que sur le
> CT125, dans aucun patch. Le patch a été **regénéré contre la vraie base** ; les hunks
> manquants (`rawW`/`rawH`, `EDGE`, `'fan'`, `FAN_NAME`, `fan_speed` → `fan`) font
> maintenant partie du patch. `git apply --check` passe sur un clone propre de `d54c3de`
> après les quatre patchs précédents.

## Le problème

Sur la capture de la tablette (1280×800), la carte Plan de l'Accueil — 415 × 208 px — portait
**16 jetons de 34 px**, dont 8 pastilles de relevé (`25,9°`, `20,1°`, `7,3°`, `60,1°`…) qui
mangeaient l'image : « ça encombre et n'apporte rien ». Et de toute façon **les actionneurs ne
sont pas utilisables depuis cette carte** — un tap ouvre l'onglet Plan. Deux jetons
affichaient même un `i` générique.

## Ce que le patch change

### 1. Plus aucun relevé

`.reading` et son bloc CSS sont **supprimés**, `pinReading` **n'est plus importé** par
`PlanPreview`. La carte ne montre que des jetons (icône + couleur d'état + titre au survol).
Vérifié en prod : `.plan .reading` = **0**.

### 2. Jetons plus petits

| Élément | Avant | Après |
|---|---|---|
| `.dot` | 34 px | **22 px** |
| `<Icon>` | 16 px | **12 px** |
| halo `lit` | `0 0 0 5px` / `0 0 22px 5px` | **`0 0 0 3px` / `0 0 14px 3px`** |
| `pulse` alarme | `0 0 0 10px` | **`0 0 0 6px`** |
| `SEP` (anti-chevauchement) | 38 | **28** |
| `EDGE` (marge au bord) | 0 | **18** |

`SEP = 28` pour un `.dot` de 22 px : rayon 11 px + halo 3 px = 14 px par jeton, soit 28 px
entre deux centres pour que les halos se touchent sans se recouvrir. `EDGE = 18` retient le
centre à 18 px du bord — 22 / 2 + 3 px de halo + 4 px de marge ; sans relevé sous le jeton, la
garde `3 * EDGE` reste compatible avec la carte (≈ 208 px de haut).

### 3. Seuls les appareils utiles sont dessinés

`commands(d)` lit ce que l'appareil **accepte d'écrire** (`p.access.write`) :

- `on_off` **binaire** (`semantic`), ou
- une clé `on` / `state` / `switch_led` / `switch` / `switch_1`, ou
- `system_mode` / `occupied_heating_setpoint`, ou
- `brightness` / `color` / `color_temp`.

À ce filtre s'ajoutent les appareils dont l'état **se lit de loin** : porte ouverte
(`doorOpen`), mouvement (`motion`), alarme (`smoke` / fuite). Un thermomètre qui ne fait que
rapporter n'est **pas dessiné du tout** — il n'apparaît plus comme un jeton sans pastille qui
réservait quand même sa place dans la relaxation et poussait les autres.

Cas piège — la sonde de piscine n'expose en écriture que `temperature_calibration` et
`temperature_units` : **exclue**, alors qu'un test sur le nom l'aurait gardée.

Résultat sur le plan courant : **16 → 8 jetons**.

| Dessiné | Exclu |
|---|---|
| un projecteur extérieur (z2m, écrit `state`) | un capteur de température Zigbee (aucune écriture) |
| un bandeau Hue (écrit `on`/`brightness`/`color_temp`) | un capteur Hue dans une chambre (aucune écriture) |
| une prise VMC (écrit `state`) | un capteur Hue de couloir (aucune écriture) |
| une prise UV (écrit `state`) | un capteur de température de salle de bain |
| une lampe RGB Tuya (écrit `switch_led`) | une sonde de piscine (n'écrit que `*_calibration` / `*_units`) |
| une vanne thermostatique (écrit `occupied_heating_setpoint`) | un capteur de température dans une chambre |
| un ventilateur-lampe Tuya (écrit `fan_switch`) | un capteur Hue de dépendance |
| une lampe Tuya (écrit `switch_led`) | |

### 4. Vannes thermostatiques et ventilateurs reconnus

- **Vanne** : pas de `target_temperature` ; elle déclare son point de consigne à la manière
  ZCL (`system_mode` + `occupied_heating_setpoint`), donc `deviceKind()` la classait `sensor`
  et `pinIcon()` tombait sur `i`. Désormais `deviceKind()` → **`climate`**, et `pinIcon()` →
  **`radiator`** (un split porte `target_temperature`, il garde `air-conditioner`).
  `radiator` est ajouté à `lib/icons.js` depuis `mdiRadiator`.
- **Ventilateur** : `deviceKind()` classe `fan` un appareil qui porte `fan_speed`,
  `fan_control`, `fan_direction`, `fan_mode` ou `wind_speed` ; à défaut, un nom qui contient
  « fan » / « ventilateur » / « ventilo » (une prise ne dit pas ce qu'elle alimente).
  `PIN_ICON.fan` et `'fan'` dans `lit()` en découlent.

## Ce qui ne bouge pas

- `pages/Plan.svelte` : jetons **18 px** et relevés **conservés** (`pinReading` y est toujours
  utilisé) — là, les tuiles sont réellement actionnables.
- `maison.css` : **aucune** modification (thème Moli intact).
- Grille `.sections` de `Accueil.svelte`, `SkyHero.svelte`, `PlanOverlay.svelte` : intacts.
- La carte reste un lien `<a href="#/plan">` : c'est un aperçu, pas un pavé de commande.

## Édition

```sh
cat notes/patches/accueil-plan-pins.patch | ssh moli-os 'cat > /tmp/accueil-plan-pins.patch'
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/accueil-plan-pins.patch'
ssh moli-os 'cd /opt/moli-os && git apply /tmp/accueil-plan-pins.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'
```

## Preuves (prod, 1280×800, Playwright)

| Mesure | Attendu | Relevé |
|---|---|---|
| `.plan .pin` | 8 | **8** |
| `.plan .reading` | 0 | **0** |
| `.dot` | 22 px | **22 px** |
| `<Icon>` dans `.dot` | 12 px | **12 px** |
| recouvrements | 0 | **0** |
| carte | `<a href="#/plan">` | **`A` / `#/plan`** |
| débordement horizontal | 0 | **0** |
| icône de la vanne thermostatique | `radiator` | **`mdiRadiator`** |
| sonde de piscine | absent | **absent** |
| `/api/health` | 14/14, 0 échec | **14/14, `journal_failures: 0`** |

Chaîne complète rejouée sur un clone propre de `d54c3de` : `tablette2025-parity` →
`accueil-plan-scale` → `accueil-plan-hero` → `accueil-tablette2025-pixel` →
`accueil-plan-pins` → `chauffage-trv`, **les six `git apply` sans un seul rejet**.

## Rollback

```sh
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/accueil-plan-pins.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'
```

## Hors périmètre

- `PlanOverlay` (carte des températures) : intacte, les relevés y restent.
- La page Plan : non filtrée, non réduite.
