# Témoin de vanne sur l'Accueil + puissance de l'Appart

Patch : `notes/patches/accueil-trv-witness.patch` (10 fichiers, 442 lignes,
format `git diff`).
Posé sur le CT125 le 2026-10-20, par-dessus la chaîne Accueil n° 1 → n° 7
(dont `tablette2025-parity` et `accueil-tablette2025-pixel`, qui créent
`TabletteRow(s).svelte`).

## Ce que ça change

### 1. Un témoin de vanne sur la rangée « Chambre »

La rangée de la tablette affiche, devant la température et l'humidité, une
pastille `radiator` avec la **consigne en cours** et un **point de couleur**
qui dit ce que fait la vanne :

| État de la vanne | Point | Texte de la pastille |
|---|---|---|
| `running_state = heat` | orange | `18.5°` (il chauffe) |
| ni chauffage ni arrêt | bleu | `18.5°` (au repos) |
| `system_mode = off` | gris | « éteinte » |
| vanne muette (`online = false`) | rouge | « hors ligne » |

Le point ne suffit pas à lui seul : une couleur ne se lit pas de loin, et un
point gris se confond avec l'absence de point. Éteinte ou hors ligne, la
pastille **écrit donc le mot** à la place de la consigne ; la couleur reste en
renfort. Les deux états sont aussi nommés pour les lecteurs d'écran
(`role="img"` + `aria-label`).

⚠️ Un TRVZB écrit `running_state` à la mode ZCL : **`heat`/`idle`**, jamais
`heating` (vérifié sur `/api/devices/z2m:0x286847fffe96a2cd` :
`{"type":"enum","values":["idle","heat"]}`). `witnessOf` accepte donc les deux
orthographes (`heat`, et `heating` pour un appareil qui parlerait comme Home
Assistant) : tester `heating` seul rendait l'état « chauffe » inatteignable.

L'infobulle dit la phrase entière : « Vanne : au repos · consigne 18.5° ».
Le témoin est **purement visuel** : aucun lien, aucune commande. On commande
la vanne sur `#/chauffage`, où tout se règle.

Quelle vanne ? La maison la nomme (`tablette.rows[].valve`), sinon Moli prend
la vanne de la pièce de la rangée (`valveIn` sur `occupied_heating_setpoint`,
comparaison de pièce sans accents ni casse). Aucun identifiant d'appareil dans
le code.

État mesuré le 2026-10-20 à 22:52, vanne `z2m:0x286847fffe96a2cd` :
`system_mode=auto`, `occupied_heating_setpoint=18.5`, `running_state=idle`,
`local_temperature=19.8` → témoin `18.5°` avec point bleu, infobulle
« Vanne : au repos · consigne 18.5° ».

Les quatre états, vérifiés en forçant `hub.devices` dans la page (vite sur le
code courant) — la vanne réelle est au repos depuis 720 h, on ne peut pas
l'ouvrir en journée :

| `running_state` / `system_mode` / `online` | point | texte de la pastille | infobulle |
|---|---|---|---|
| `heat` / `auto` / — | `rgb(255, 212, 154)` | `18.5°` | « Vanne : chauffe · consigne 18.5° » |
| `idle` / `auto` / — | `rgb(126, 157, 255)` | `18.5°` | « Vanne : au repos · consigne 18.5° » |
| `idle` / `off` / — | `rgb(120, 129, 149)` | « éteinte » | « Vanne : éteinte · consigne 18.5° » |
| — / `auto` / `false` | `rgb(255, 123, 98)` | « hors ligne » | « Vanne : hors ligne · consigne 18.5° » |

Capture de l'état chauffant : `work/trv-row-heating.png`.

### 2. La rangée « Appart » montre la puissance résiduelle

`tablette.rows[Appart].power` passe de `power_appart` à `power_residuel` :
la vignette ne répète plus la première pastille du bandeau d'en-tête, elle
montre **l'autre** — le reste de la maison.

La pastille écrit **juste les watts** (`107 W`), sans préfixe : « reste » ou
« maison » devant le nombre allongeait la pastille au point de tronquer le nom
de la pièce, et le bandeau d'en-tête nomme déjà cette grandeur (« Puissance du
reste de la maison »). Une pastille de rangée reste une valeur, pas une phrase.

Mesuré le 2026-10-20 à 23:20 puis à 00:35 : bandeau `power_appart = 518 W`,
`power_residuel = 107 W` ; la rangée Appart affichait `107 W`. Le bandeau et
les autres rangées sont inchangés.

## Fichiers

| Fichier | Rôle |
|---|---|
| `web/src/maison/lib/rooms.js` | **nouveau** — `roomKey` (nom de pièce normalisé : sans accents, sans casse), partagé |
| `web/src/maison/lib/trv.js` | **nouveau** — `isValve`, `valveIn`, `witnessOf` (les 4 états ; `running_state` en `heat` ou `heating`) |
| `web/src/maison/lib/trv.test.js` | **nouveau** — 9 tests (vanne reconnue, pièce, états, les deux orthographes, silences) |
| `web/src/maison/lib/power.js` | **nouveau** — `powerTone(watts)` : `''` / `warm` ≥ 1000 W / `alert` ≥ 3000 W |
| `web/src/maison/lib/power.test.js` | **nouveau** — 5 tests (neutre, seuils, valeurs négatives, non-nombre) |
| `web/src/maison/lib/home.svelte.js` | `roomKey` vient de `rooms.js` (plus de normaliseur en double), `deviceKind` réutilise `VALVE_KEYS` |
| `web/src/maison/ui/TabletteRows.svelte` | résout la vanne d'une rangée, construit le témoin ; `roomKey` remplace le `norm` local ; la pastille watts prend `powerTone` (même règle que le bandeau) |
| `web/src/maison/ui/TabletteRow.svelte` | rend le point de couleur dans une pastille (`sub.dot`), et son `aria-label` |
| `locales/fr/maison.json`, `locales/en/maison.json` | 6 clés `maison.accueil.vanne_*` |
| `data/home.json` (côté CT, hors patch) | `valve` sur Chambre, `power: power_residuel` sur Appart |

## Preuves

- `cd web && npm test` → 52 tests, 0 échec (dont les 9 de `trv.test.js` et les
  5 de `power.test.js`).
- `cd web && npm run build` → OK.
- `docker compose build && docker compose up -d` → image reconstruite (14 min).
- `GET /api/health` → `drivers_running: 14`, `journal_failures: 0`.
- DOM de `http://192.168.1.125:8790/#/` :
  `Chambre | 18.5° | 20.2° | 66 %`, pastille 1 `dot cool` (`rgb(126, 157, 255)`,
  opacité 1), `role="img"`, `aria-label` « Vanne : au repos · consigne
  18.5° » ; `Appart | 107 W` = bandeau « Puissance du reste de la maison »
  (107 W) et non « Puissance de l'appartement » (518 W).
- Lisibilité : 56 px de haut, les 3 pastilles de Chambre entièrement visibles,
  **aucun nom tronqué de 700 à 1400 px de large** (balayage tous les 20 px ;
  largeur du texte au `Range` comparée à `clientWidth`).
- Captures : `work/trv-row.png` (Chambre, point bleu), `work/trv-row-heating.png`
  (état chauffant forcé), `work/appart-row.png` (Appart, watts seuls),
  `work/accueil-trv-witness.png` (page entière).

## Poser / retirer

```sh
# poser (sur la base courante : chaîne Accueil déjà appliquée)
scp notes/patches/accueil-trv-witness.patch moli-os:/tmp/p.patch
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/p.patch && git apply /tmp/p.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d'

# retirer
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/p.patch && docker compose build && docker compose up -d'
```

`data/home.json` n'est pas dans le patch (données de la maison, pas du code) :
il porte les deux réglages et une copie `data/home.json.bak-trv-witness` a été
faite avant l'édition. **Sur un clone propre, le patch seul ne suffit donc pas** :
sans `tablette.rows[Chambre].valve` le témoin retombe sur la vanne de la pièce
(résultat identique ici, mais implicite), et sans `power: power_residuel` la
rangée Appart affiche `power_appart`. AGENTS.md le signale dans la ligne du
patch.

Le patch est au format `git diff` (comme le reste de `notes/patches/`) : il
s'applique et se retire **sans** `-p1`.

## Revue — corrections apportées

- **Un seul normaliseur de pièce** : `TabletteRows.svelte` gardait un `norm`
  local (sans `trim` ni compactage des espaces) pour `pick`/`sensorOf`, alors
  que `valveIn` comparait avec `roomKey` — sur « VMC  +  SDB » la vanne se
  résolvait et le capteur non. `roomKey` est maintenant importé de
  `lib/rooms.js` et utilisé partout ; le normaliseur en double a disparu.
- **Une seule règle de couleur pour la puissance** : `lib/power.js`
  (`powerTone`) sert le bandeau d'en-tête **et** la pastille watts d'une
  rangée. Sur le même écran, 4200 W n'est plus rouge en haut et bleu en bas.
- **Scories retirées** : `.sub .dot.off` dupliquait la règle de base,
  `VANNE_DOT[w.state] ?? ''` était inatteignable, et `trv.js` ne ré-exporte
  plus `roomKey` (le test l'importe de `rooms.js`).
- **Nom de la rangée Appart** : conservé tel quel (`power_residuel`), c'est un
  choix de la maison documenté ci-dessus — le bandeau nomme déjà les deux
  grandeurs, et une tablette n'a pas de survol pour lire une infobulle.
