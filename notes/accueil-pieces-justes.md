# Accueil — les pastilles disent la vérité des pièces (2026-10-21)

Suite de `accueil-trv-witness` (n° 8) et `accueil-badges-rebuild` (n° 9), porté
après la chaîne n°1→10. Lot **web seul + 5 étiquettes** : aucun crate Rust
touché, aucune route ajoutée, **aucune rangée ajoutée ni supprimée** (7 avant,
7 après).

Patch : `notes/patches/accueil-pieces-justes.patch` (15 fichiers, généré par
`work/mkpatch-chaintail.sh`, base = `d54c3de` + les patchs n° 1→10 rejoués).
Étiquettes rejouables : `notes/patches/labels.toml.pieces`.

## Les trois défauts constatés

| # | Symptôme | Cause vérifiée sur le CT125 |
|---|---|---|
| D1 | La vanne d'Alicia est invisible partout | `z2m:0x286847fffe96a2cd` n'a **aucune étiquette** ; Z2M n'écrit jamais `native_room`, donc `roomOf()` rend `null` |
| D2 | Les lampes des parents s'affichent dans « Chambre » | le groupe Hue `hue:c22e618d` porte `native_room: "Chambre"` — un nom de **zone Hue**, pas la pièce de la maison |
| D3 | Les capteurs et la `local_temperature` disparaissent | `TabletteRows` prenait `pick(...)` → `hit[0]` (un seul capteur) et `readings()` ne cherchait que `temperature` / `temp_current` |

Les deux vannes sont vivantes : Alicia `system_mode=auto`, consigne 18.5,
`local_temperature=20` ; Salon `system_mode=heat`, consigne 16,
`local_temperature=22.6`.

## Ce que fait le lot

| Fichier | Changement |
|---|---|
| `web/src/maison/lib/layout.js` | **nouveau** module pur (aucune dépendance Svelte, aucun import du hub) : `deriveRows(config, devices, t)` rend les rangées de `tablette.rows`, dans l'ordre, avec leurs pastilles. La règle de pièce vient de `lib/rooms.js` (`import { roomKey, roomOf }`), il ne la réimplémente plus. Un `def.nkey` reste honoré (`label: def.nkey ? t(def.nkey) : …`) |
| `web/src/maison/lib/layout.test.js` | **nouveau**, 18 cas `node --test` — dont la résolution d'alias de pièce (« Cave » → « Cave à Vins », lue comme partout ailleurs) et un libellé de rangée tiré d'une clé i18n |
| `web/src/maison/lib/rooms.js` | **étendu** — `roomKey` y était déjà ; `roomNamed(raw, rooms)` et `roomOf(d, rooms)` y descendent depuis `home.svelte.js`. `home.svelte.js` les réexporte sous les mêmes noms (même signature pour les pages), `layout.js` les importe : **une** règle de pièce, un seul fichier |
| `web/src/maison/lib/kinds.js` | **nouveau** — la **seule** classification des appareils : `deviceKind` (réexporté par `home.svelte.js`), `powerKey`, `LIGHTISH` / `NOT_LIGHT` / `FAN_NAME`, `isFixture`, `isGroup`, `pointHas`, et `VALVE_KEYS` **réexporté** depuis `lib/trv.js` (son propriétaire, avec `isValve`) : un seul tableau, pas deux à garder en phase. `home.svelte.js` et `layout.js` la lisent ici, plus de copie (un appareil ne peut plus être `tv` pour une rangée et `sensor` pour le Plan) |
| `web/src/maison/lib/kinds.test.js` | **nouveau**, 4 cas : `key` en lecture seule → `sensor` des deux côtés, `key` inscriptible → `tv`, vanne ZCL → `climate`, `powerKey` exige un point inscriptible |
| `web/src/maison/ui/TabletteRows.svelte` | consomme `deriveRows(config, devices, t)` ; `sensor_room`, `def.match`→`hit[0]` et `def.room` ne décident plus des lectures |
| `web/src/maison/ui/TabletteRow.svelte` | la clé `{#each}` d'une pastille est son `point` (le libellé en dernier recours) : deux capteurs à la même valeur ne se marchaient plus sur les pieds |
| `web/src/maison/lib/home.svelte.js` | `loadHome()` extrait ; `/api/home` rechargé sur SSE `label_changed` et sur `snapshot`, rafales coalescées (50 ms) |
| `web/src/lib/hub.svelte.js` | `onHubEvent(listener)` : les abonnés voient `label_changed` et `snapshot` |
| `locales/{fr,en}/maison.json` | 64 clés `chauffage.*` → `maison.chauffage.*` ; `maison.accueil.presence` ajoutée |
| `data/labels.toml` (CT125) | 5 étiquettes `room`, posées par l'outil MCP `set_label` (`Origin::Mcp`) |

### La pièce d'une rangée = la pièce de son appareil

`sensor_room` sort du rendu : la rangée lit **la pièce de l'appareil résolu**
(`Label.room`, à défaut `native_room`, normalisé par `roomKey`). Le groupe Hue
« Chambre » étiqueté `Parents` bascule donc ses deux lampes du bon côté, et
`label.room` prime sur `native_room` (`roomOf`).

La règle vit une seule fois, dans `lib/rooms.js`, et elle **résout les alias** :
`home.json` peut déclarer `rooms: [{ name: "Cave à Vins", aliases: ["Cave"] }]`
et une rangée dont l'appareil dit « Cave » lit alors la pièce « Cave à Vins » —
la même que le Plan, les Pièces et les Caméras. Sans ça, `same(room)` comparait
des noms bruts et une rangée se croyait vide.

Exception mesurée, pas spéculée : la rangée **VMC + SDB** commande une **prise**
(`z2m:0xa4c13828ef638d36`, pièce « Grenier ») qui ne mesure rien. Sans repli, la
rangée perdait température et humidité. Le repli ne devine rien : si l'appareil
commandé n'a **aucun** capteur dans sa pièce, la rangée lit la pièce qu'elle
**nomme** (`def.room ?? def.name`) — celle du thermomètre VMC.

### La pièce parle par ses capteurs

Une pièce rassemble ses capteurs : la température (la **première** trouvée parmi
`temperature` / `temp_current` / `local_temperature`), l'humidité, la présence
(pastille `motion`, chauffée quand quelqu'un est là). Une seule pastille par
grandeur, donc : deux thermomètres non-vannes dans une même pièce n'en montrent
qu'un (le premier dans l'ordre d'itération) — pour les distinguer il faut une
pastille par appareil, non fait ici. La vanne ajoute son témoin, les appareils
d'état (Star Alicia, `switch_led`) une pastille de nom.

### `local_temperature` reconnu

Sans ce candidat, les deux vannes n'affichaient aucun chiffre : elles ne
rapportent que `local_temperature`. La pastille ouvre l'historique **de ce
point** (`<id>/local_temperature`), pas celui d'une autre grandeur.

## Étiquettes posées (les 5)

```
z2m:0x286847fffe96a2cd            room = "Alicia"    (TRVZB, la vanne d'Alicia)
hue:c22e618d-8750-43cf-85e5-…     room = "Parents"   (groupe des 2 lampes)
hue:9a78c910-52b7-4d1a-a8d4-…     room = "Parents"   (bandeau chambre)
hue:99863121-9c39-4b64-a1f7-…     room = "Parents"   (chambre parents)
z2m:0x00158d00022cbf63            room = "Parents"   (Aqara WSDCGQ11LM)
```

Les quatre premières sont la condition du correctif ; la cinquième est le
capteur Aqara qui n'avait aucune pièce, tranché « Parents » par l'utilisateur.

Seul `room` est touché, jamais `name` : la garde (`label_verdict`) refuse qu'un
agent renomme un appareil déjà nommé. Pour les reposer après un reset :
`notes/patches/labels.toml.pieces` (les 5 lignes + les deux voies, outil ou
fichier).

## Preuves

```
$ cd web && node --test src/maison/lib/layout.test.js
ℹ tests 16 · pass 16 · fail 0

$ cd web && npm test
ℹ tests 84 · pass 84 · fail 0        (64 existants + 16 nouveaux + 4 kinds)

$ node scripts/i18n-check.mjs
i18n-check : 2889 clés, langues en, fr ; 0 ligne(s) de texte en dur dans 0 fichier(s).
# (64 clés « chauffage.* » mal préfixées renommées « maison.chauffage.* » — critère 42)

$ curl -s -X POST http://127.0.0.1:8790/mcp … set_label
{"device":"z2m:0x286847fffe96a2cd","label":{"room":"Alicia"},"ok":true}

$ curl -s 'http://127.0.0.1:8790/api/journal?limit=4'
mcp {'kind': 'label', 'device': 'z2m:0x286847fffe96a2cd', 'label': {'room': 'Alicia'}}
mcp {'kind': 'label', 'device': 'hue:c22e618d-…', 'label': {'room': 'Parents'}}

$ ssh moli-os 'curl -s http://127.0.0.1:8790/api/health'
journal_failures 0 · devices 87 · drivers_running 14/14
```

Accueil réel (`http://192.168.1.125:8790`, 1280×800) — **7 rangées**, même
ordre, même paire :

```
Salon      22.6°(vanne)  27.7°(Poêle)  présence
VMC + SDB  20.4°  64 %
Chambre    20.0°(vanne Alicia)  20.2°  66 %  Star Alicia
Parents    19.6°  61 %  présence
Appart     23.4°  52 %  384 W
Cave       —
Couloir    21.1°  64 %  présence
```

Rafraîchissement sans rechargement (preuve du critère 69) : étiqueter le capteur
Poêle `Salon → Cave à Vins` déplace sa pastille de la rangée Salon vers Cave en
~3 s, puis `→ Salon` la ramène — **page jamais rechargée**.

## Barrières

- `web/src/maison/pages/Accueil.svelte` : aucune ligne ajoutée par ce lot.
- `crates/` : aucun fichier touché.
- Aucune route HTTP ajoutée ; les étiquettes passent par `set_label` (existant).
- Aucune image versionnée : les captures vivent dans `work/` (gitignoré),
  comme `work/trv-row.png` pour le n°8.

## Point tranché

- `z2m:0x00158d00022cbf63` (WSDCGQ11LM, 20.8 °C / 60.75 %, sans pièce) :
  étiqueté `room = "Parents"` par `set_label` (`Origin::Mcp`, journal id 624).
  Vérifié dans `data/labels.toml` et `/api/devices`.

## Correctif complémentaire (revue de code)

Cinq défauts relevés après la livraison, tous corrigés :

1. **Témoin de vanne régressé vs n°8** — `valveChip` réimplémentait la logique
   et ne lisait jamais `running_state` : une vanne qui chauffe et une au repos
   rendaient le même point bleu. Il appelle maintenant `witnessOf()` de
   `trv.js` (les 4 états), et reporte `title`/`label`
   (`maison.accueil.vanne_titre`), avec le **mot** pour « éteinte » /
   « hors ligne » — une tablette n'a pas de souris.
2. **Pastilles sans identité** — deux thermomètres sur la rangée Salon
   (vanne 22.6°, poêle 27.7°) étaient indiscernables. Chaque pastille porte
   maintenant un `title` « Appareil · grandeur valeur » et un `aria-label` de
   la grandeur ; la pastille de mouvement dit « Présence » (clé
   `maison.accueil.presence`), plus le nom du capteur.
3. **Duplication de logique** — `powerKey`, `deviceKind`, `LIGHTISH` /
   `NOT_LIGHT` / `FAN_NAME`, `isFixture`, `isGroup`, `VALVE_KEYS`,
   `pointHas` étaient recopiés entre `home.svelte.js` et `layout.js`.
   `web/src/maison/lib/kinds.js` porte désormais la **seule** classification ;
   `home.svelte.js` et `layout.js` ne font que la réexporter. `kinds.test.js`
   verrouille l'égalité rangée/Plan (`key` en lecture seule → `sensor` des deux
   côtés, `key` inscriptible → `tv`).
4. **Clés de pastilles dupliquées (bug de rendu)** — `{#each subs as s
   (s.icon + s.text)}` produisait deux clés identiques dès que deux capteurs
   d'une pièce tombaient sur la même valeur, et `deriveRows` retombait sur les
   entrées de `tablette.rows` brutes (sans `key`) tant que le hub n'avait
   aucun appareil : Svelte levait `each_key_duplicate` et la page perdait son
   rendu. Chaque pastille porte maintenant son propre `key` (le point, la
   présence, l'état) et le repli rend des rangées **de même forme**. Test :
   `kinds.test.js` + « every chip has its own key » + « an empty hub still
   draws the configured rows ».
5. **Livraison** — patch `notes/patches/accueil-pieces-justes.patch` (15
   fichiers), bloc d'étiquettes `notes/patches/labels.toml.pieces`, captures
   déplacées sous `work/`.

### Correctifs de revue (2ᵉ passe)

- **Règle de pièce unique** — `roomOf`/`roomNamed` existaient en double
  (`home.svelte.js` avec alias, `layout.js` sans), donc une rangée comparait des
  noms bruts là où le Plan résolvait les alias : « Cave » et « Cave à Vins »
  étaient deux pièces pour l'une, une seule pour l'autre. Les deux fonctions
  vivent maintenant dans `lib/rooms.js` (à côté de `roomKey`) ; `home.svelte.js`
  les réexporte, `layout.js` les importe. Test : `layout.test.js`, « a room
  alias names the same room as the layout does ».
- **`VALVE_KEYS` à un seul propriétaire** — le tableau était déclaré deux fois
  (`kinds.js` et `trv.js`) ; `kinds.js` l'importe désormais de `trv.js` (là où
  vit `isValve`) et le réexporte. Le commentaire périmé de `trv.js` (qui
  renvoyait à `home.svelte.js`) est corrigé.
- **`nkey` conservé** — un `tablette.rows` qui portait une clé i18n pour son
  libellé (`def.nkey`) la retrouve : `label: def.nkey ? t(def.nkey) : …` dans
  les deux branches de `deriveRows`. Test : « a row label made of an i18n key is
  translated ».
- **Plus de copie morte** — `TabletteRows.svelte` passait `layoutRows` dans un
  `map` qui réallouait chaque rangée pour un `subs ?? []` inutile
  (`deriveRows` le garantit déjà) : la dérivation est passée telle quelle.
- **Patch régénéré** — le `.patch` avait dérivé de l'arbre qui tourne (`roomOf`
  sans alias, clé `{#each}` différente). Il est maintenant produit depuis le
  CT125 par `work/mkpatch-chaintail.sh` et rejoué sur un clone propre : la
  chaîne n° 1→12 reproduit l'arbre en production **fichier par fichier**.

> **Le renommage i18n est volontairement groupé.** Le patch porte aussi le
> renommage de 64 clés `chauffage.*` → `maison.chauffage.*` (`locales/fr|en/maison.json`
> et ses 3 consommateurs `Chauffage.svelte`, `ValveCard.svelte`,
> `ScheduleEditor.svelte`) — critère 42 du même lot, appliqué au même moment que
> les pastilles. Splitter demanderait de régénérer deux patches depuis deux bases
> distinctes ; groupés, ils se réconcilient d'un coup à chaque resync des
> `chauffage-trv*`. Le détail est dans la ligne « 64 clés » des preuves.

## Correctif du groupe Hue (ex-échec de vérification)

Défaut : la rangée Parents (définition `match: "^bandeau chambre$"`) résolvait
la **lampe** `hue:9a78c910` (« Bandeau chambre »), pas le groupe Hue
`hue:c22e618d` (« Chambre », 2 membres). Un tap n'allumait donc qu'une lampe.
Cause : le nom du groupe (« Chambre ») ne matche jamais le motif ; `resolve()`
ne remontait au groupe que si `def.group` était vrai, ce que `home.json` ne
porte pas.

Correctif (`web/src/maison/lib/layout.js`) : `resolve()` remonte, pour une
lampe, au **groupe Hue de sa pièce** via `roomGroupOf()` — retenu seulement si
le groupe a **plusieurs membres et qu'ils sont tous des lampes**. Un groupe qui
mélange une lampe et un capteur (le « Dressing ») n'est pas un groupe de
lampes : la rangée Couloir garde donc sa lampe et ne bascule pas sur un groupe
qui éteindrait un capteur.

Preuves (CT125 réel, après rebuild) :
- dérivation live : rangée Parents → `hue:c22e618d-…` (2 membres) ;
  les 6 autres rangées inchangées ;
- clic sur la rangée Parents → `POST /api/command {"point":"hue:c22e618d-…/on"}` ;
- groupe ON/OFF → les 2 lampes (`hue:9a78c910`, `hue:99863121`) basculent
  ensemble, puis état restauré ;
- `layout.test.js` 18/18, `kinds.test.js` 4/4, `npm test` 93/93, `npm run build` ✓,
  `/api/health` → `journal_failures: 0`, 7 rangées / 1 paire / `overflowX:false`.

## Dernière capture

`work/accueil-pieces-justes-2026-10-22-finale.png` (après correctifs de revue),
`work/accueil-pieces-justes-2026-10-21-c60.png` (correctif du groupe Hue) et
`work/accueil-pieces-justes-2026-10-21-final.png` (lot initial) — 7 rangées
(`Salon`, `VMC + SDB`, `Chambre`, `Parents`, `Appart`, `Cave`, `Couloir`),
1 paire, `overflowX: false`, inventaire DOM relevé par `playwright` sur
`http://192.168.1.125:8790`.

Contrôle final (2026-10-22, sur le CT125 après rebuild) : `pageerror` vide,
6 chargements consécutifs sans `each_key_duplicate`, aucune pastille sans
`title`. Titres relevés :

```
Salon     22.5° « Vanne : au repos · consigne 16.0° » | 36.5° « Capteur Poele · Température 36.5° » | « Présence »
Chambre   « éteinte » « Vanne : éteinte · consigne 7.0° » | 20.2° | 66 % | « Star Alicia »
Parents   19.6° « Parents · Température 19.6° » | 61 % | « Présence »
```
