# Historique des relevés — le chiffre s'ouvre

Patch : `notes/patches/accueil-history.patch` (19 fichiers, 1684 lignes, format
`git diff` comme le reste de `notes/patches/`).
Posé sur le CT125 le 2026-10-21, par-dessus la chaîne Accueil n° 1 → n° 9.

## Ce qui n'allait pas

L'Atelier savait déjà montrer l'historique d'un point : `Point.svelte` écrit l'id
dans `hub.chart`, `Atelier.svelte` rend `HistoryPanel`. Côté **Maison**, rien :
un relevé était du texte mort. Sur l'Accueil il fallait quitter le dashboard,
ouvrir l'Atelier et retrouver l'appareil à la main pour savoir si la chambre avait
chauffé la nuit.

Symétriquement, on ne voulait pas d'un chiffre cliquable qui commanderait quelque
chose : le chiffre **se lit**, il n'agit pas. La consigne reste sur la page
Chauffage ; seule la **température mesurée** d'une vanne ouvre sa courbe.

## Ce que fait le patch

### 1. Une feuille d'historique aux jetons Maison

`web/src/maison/ui/HistorySheet.svelte` (nouveau, ~356 lignes) : backdrop + panneau
centré, fermeture par `×`, par `Échap` et par clic sur le fond. Source unique
`GET /api/history?point=<appareil>/<clé>&hours=<n>&points=300`, plages **6 h /
24 h / 7 j**, chargement à l'ouverture et à chaque changement de plage.

Contenu : appareil + libellé du point en en-tête, courbe (escalier pour un capteur
qui ne bouge que par paliers), bande de min/max par tranche, axe des heures, puis
synthèse `Maintenant / Min / Max` avec son unité, et le nombre de changements.
Les points binaires et textuels ne se dessinent pas en courbe : ils s'affichent en
**liste de changements**. États explicites : *chargement*, *historique
indisponible*, *aucun changement sur la plage* — jamais une courbe vide sans mot.

Le `HistoryPanel` de l'Atelier n'est **pas** touché : il garde la charte Atelier
(`--card`, `--stroke`, `--copper`), la nouvelle feuille la charte Maison
(`--surface`, `--r-lg`, `--shadow`, jour/nuit). Deux surfaces, deux composants —
plutôt qu'un composant à variantes qui finirait par ne plus convenir à aucune.

### 2. Un seul canal, celui qui existait déjà

`Maison.svelte` rend `<HistorySheet point={hub.chart} onclose={() => (hub.chart = null)} />`
dès que `hub.chart` est non nul — **le même état que l'Atelier**, rien de neuf dans
le hub, aucune nouvelle route, aucun store.

Trois helpers dans `lib/home.svelte.js` :

| Helper | Rôle |
|---|---|
| `historyOf(id, key)` | ouvre la feuille, **seulement si l'appareil et le point existent** |
| `readingPoint(id, candidates)` | résout un repli de clés (`temperature`/`temperature_value`, `humidity`/`humidity_value`) |
| `historyOfAny(id, candidates)` | `readingPoint` puis `historyOf` |
| `pinReadingPoint(d, { drawn })` | choisit le point d'un jeton de Plan déjà dessiné |

Le point qui n'a pas d'historique reste **inerte** : `historyOf` ne pose pas un
`href` mort, il n'ouvre rien. Aucun relevé inventé pour « faire joli ».

### 3. Périmètre Accueil

| Composant | Ce qui s'ouvre |
|---|---|
| `TabletteRow` | température, humidité, `fan_speed`, watts de la rangée Appart |
| `TabletteRows` | points posés sur ces mêmes grandeurs ; témoin de vanne → `local_temperature` **uniquement** |
| `WeatherNow` · `SkyHero` | température extérieure (SkyHero restructuré : plus de `button` imbriqué) |
| `PoolCard` | température d'eau (lien `.open` séparé du bouton) |
| `BatteryGauge` | `level`, si `badges.gauge` est déclaré |

Les **deux pastilles de puissance du bandeau restent des `<a href="#/energie">`**,
inchangées : elles mènent à la page Énergie, pas à une courbe.

### 4. Périmètre des autres pages

| Page | Relevés cliquables |
|---|---|
| Pièces | température de pièce, chips chiffrées (humidité, CO₂, puissance), ligne clim, chaque valeur de `SensorCard` |
| Dehors | température, **ressenti**, humidité, vent, **rafales**, pluie, AQI, UV, eau, pH, ORP |
| Chauffage | température de chaque vanne **seulement** (consigne non cliquable) |
| Plan / SkyDetail | relevés affichés par les jetons |
| Impression | buse, plateau, enceinte |

TRV : `ClimateCard` et `ValveCard` n'exposent au clic que
`temperature`/`local_temperature` ; le `setpoint` garde son geste de réglage.

### 5. Affordance

Chaque relevé cliquable est un vrai `<button>` (jamais un `div` à `on:click`) :
`cursor: pointer`, `aria-label` « Voir l'historique de {appareil} · {libellé} »,
`title` au survol, focus visible aux couleurs Maison. Aucun `button` imbriqué —
dans `TabletteRow` les pastilles restent **frères** de `.main`, dans `SkyHero` et
`PoolCard` le bouton d'ouverture de la carte et le chiffre sont deux boutons
distincts. Les commandes (`pad`, `switch`, `ring`, `setpoint`) gardent leur geste.

### 6. Locales

18 clés `maison.historique.*` en `fr` **et** `en` (aria, ouvrir, plage 6 h/24 h/7 j,
chargement, indisponible, vide, courbe, maintenant, min, max, niveau, oui, non,
changements_one/_other, moyenne). Aucune clé morte.

Deux libellés de Dehors se séparent en même temps pour que le chiffre devienne un
bouton : `maison.dehors.ressenti` ne dit plus que le mot (`Ressenti` / `Feels like`)
et `maison.dehors.ressenti_ecart` porte le reste (`max {max}° · min {min}°`) ;
`maison.dehors.rafales` perd son `{speed}` et devient `rafales` / `gusts`, le
kilométrage horaire vivant désormais dans son propre bouton.

## Fichiers

| Fichier | Rôle |
|---|---|
| `web/src/maison/ui/HistorySheet.svelte` | **nouveau** — la feuille (peau Maison) |
| `web/src/lib/history.js` | **nouveau** — la géométrie, partagée : `seriesData`, `scaleFor`, `stepPath`, `bandPath`, `ticksFor`, `xTicksFor`, `statsFor` |
| `web/src/lib/history.test.js` | **nouveau** — 12 tests de la géométrie |
| `web/src/maison/lib/home.svelte.js` | `historyOf`, `readingPoint`, `historyOfAny`, `pinReadingPoint`, `spokenNameOf`, `pointLabel` (table `POINT_WORDS`) |
| `web/src/maison/Maison.svelte` | rend la feuille sur `hub.chart` |
| `web/src/App.svelte` | `hub.chart = null` au `hashchange` : la feuille ne survit pas à un changement de page |
| `web/src/components/HistoryPanel.svelte` | peau Atelier conservée, géométrie déléguée à `lib/history.js` |
| `web/src/maison/ui/TabletteRow.svelte` | pastilles → `<button class="sub live">` |
| `web/src/maison/ui/TabletteRows.svelte` | `readings(sensor, extra, extraPoint)` |
| `web/src/maison/ui/WeatherNow.svelte`, `SkyHero.svelte` | température extérieure |
| `web/src/maison/ui/PoolCard.svelte` | température d'eau |
| `web/src/maison/ui/BatteryGauge.svelte` | niveau de batterie |
| `web/src/maison/ui/RoomCard.svelte` | en-tête + chips + ligne clim |
| `web/src/maison/ui/ClimateCard.svelte`, `ValveCard.svelte` | température seule |
| `web/src/maison/ui/SensorCard.svelte` | chaque valeur — un binaire y ouvre sa liste de bascules, pas une courbe |
| `web/src/maison/ui/PlanOverlay.svelte`, `pages/Plan.svelte` | jetons de température |
| `web/src/maison/ui/PrinterCard.svelte` | buse, plateau, enceinte |
| `web/src/maison/pages/Dehors.svelte` | météo, air, piscine |
| `locales/fr/maison.json`, `locales/en/maison.json` | 18 clés `maison.historique.*`, `ressenti`/`ressenti_ecart` scindés, `rafales` sans `{speed}` |

Rien dans `crates/` : c'est un patch de dashboard. Aucune route serveur ajoutée,
`/api/history` existe depuis le début.

## Preuves

En production (`http://192.168.1.125:8790`, après `docker compose build && up -d`) :

```
$ curl -s /api/health → drivers_running 14 · journal_failures 0
```

Preuve DOM Playwright (1280 × 900, `work/verify-history.mjs`) — chaque relevé est
rendu en `<button>` avec `cursor: pointer`, sans bouton imbriqué, et le clic ouvre
la feuille avec une courbe :

| Page | Relevé | `aria-label` | panneau | `<svg>` | fermé par Échap |
|---|---|---|---|---|---|
| `#/` | `20.3°` | `Voir l'historique de VMC · Température 20.3°` | oui | oui | oui |
| `#/` | `65 %` | `Voir l'historique de VMC · Humidité 65 %` | oui | oui | oui |
| `#/` | `78 W` | `Voir l'historique de Linky · Puissance 78 W` | oui | oui | oui |
| `#/` | `10,4°` | `Voir l'historique de Piscine · Eau` | oui | oui | oui |
| `#/pieces` | `20,4°` | `Voir l'historique de VMC + SDB · Température de la pièce` | oui | oui | oui |
| `#/dehors` | `8°` | `Voir l'historique de Dehors · Ressenti` | oui | oui | oui |
| `#/dehors` | `42 km/h` | `Voir l'historique de Dehors · rafales` | oui | oui | oui |

Contenu lu dans le panneau (température VMC, 24 h) :

```
Temperature · VMC · 6 h | 24 h | 7 j
axe Y : 19,7 → 21,3 °C   axe X : 14:03 22:03 06:03 14:03
Maintenant 20,4 °C   Min 19,8 °C   Max 21,2 °C   75 changements
```

Puissance résiduelle (Linky), même plage :

```
Maintenant 123,8 W  Min -3 469 W  Max 3 495 W  5572 changements
· moyenne par tranche, bande min/max
```

Un point **binaire** ne se dessine pas : il s'affiche en liste datée. Preuve en
forçant `kind={type:'binary'}` sur `air/aqi` dans le flux `snapshot` (Playwright
réécrit l'événement, `work/bin-proof.mjs`) puis en ouvrant la pastille « Indice
européen » de Dehors :

```
$ node work/bin-proof.mjs
{ "label": "Voir l'historique de Dehors · Indice européen",
  "panel": true, "changes": true, "lis": 28, "chartSvg": false,
  "firstRows": ["21/10/2026 16:08oui", "21/10/2026 15:59oui", "21/10/2026 15:29oui"] }
```

28 lignes datées, aucun `<svg>` — la branche « liste de changements » prend bien
les binaires, comme les textuels.

Pastilles du bandeau — vérifié qu'elles n'ont pas bougé :

```
A href="#/energie"  auj.bleu dem.bleu
A href="#/energie"  298 W
A href="#/energie"  116 W
BUTTON              Spot extérieur
BUTTON              (icône prise 3D)
```

Zéro erreur console imputable au patch. La seule requête en erreur est
`404 /api/bench` — route absente du serveur, **déjà** 404 avant ce patch, sans
rapport avec l'historique.

```
$ cd work/repo/web && npm test   → 64 tests, 0 échec (dont 12 history.test.js)
$ cd work/repo/web && npx vite build → ✓ built in 11.22s
$ grep -cE "0x[0-9a-f]{16}" notes/patches/accueil-history.patch → 0
$ wc -l notes/patches/accueil-history.patch → 2154 lignes, 24 fichiers
```

### Correctifs de revue (vérifiés en production)

| Défaut | Preuve après correctif |
|---|---|
| `PoolCard` : `.open` (inset:0) interceptait le tap | `elementFromPoint` → `BUTTON.temp`, clic → feuille « Température », URL inchangée |
| Binaire bucketé : courbe de moyennes au lieu d'une liste | `points=5000` pour les non-numériques (plus de `buckets`), branche `listing` indépendante de `raw` |
| Pastille TRV : chiffre = consigne, courbe = mesuré | affiche `local_temperature` ; sans mesure, pas de bouton |
| `RoomCard` : bouton sur une moyenne | bouton seulement si **une** source de température dans la pièce |
| `hub.chart` fuit entre pages | Atelier → `#/` : `crossRoute: false` |
| Libellés bruts (clé, adresse Zigbee) | `spokenNameOf` + `pointLabel` : plus aucun `0x…` sur Accueil/Plan/Pièces |
| Duplication géométrie (~150 l) | `lib/history.js` + 12 tests, les deux peaux conservées |
| Axes rognés, `·` collé | `PAD = {l:52,r:18}`, ancrage ticks, `{' · '}` — `overflow: []` |
| Dialogue sans focus | focus initial sur « 24 h », 12 Tab restent dans `.panel` |
| Cible tactile 22 px | 63 × 38 px, hit sur le bouton |

## Poser / retirer

```sh
# poser (base courante : chaîne Accueil 1 → 9 déjà appliquée)
scp notes/patches/accueil-history.patch moli-os:/tmp/p.patch
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/p.patch && git apply /tmp/p.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d'

# retirer
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/p.patch && docker compose build && docker compose up -d'
```

Sauvegardes `.bak-history-<horodatage>` des fichiers avant application. Le patch
est au format `git diff` : ni `-p1`, ni `--directory`.

## Limites connues

- `historyOf` ne fabrique pas de point : un appareil dont le pilote n'expose aucune
  clé connue reste inerte. C'est voulu — mieux vaut un chiffre qui ne réagit pas
  qu'une feuille qui annonce « indisponible » sur la moitié de l'écran.
- La feuille ne pagine pas au-delà de 7 jours : au-delà, c'est l'Atelier (ou la
  page Énergie pour les watts, qui a ses agrégats).
- `power_appart` / `power_residuel` viennent de `linky:linky`, pas de
  `energie:maison` — les deux sont exposés, la pastille de rangée utilise celui que
  le pilote publie.
