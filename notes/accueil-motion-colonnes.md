# Accueil — capteurs de mouvement en rouge, plan, pièces en 2 colonnes (accueil-motion-colonnes)

Date : 2026-10-16. Suite de `accueil-arrows-heat` (même branche Accueil, part
de son état déployé sur le CT125). Deux demandes utilisateur :

1. les **icônes des capteurs de mouvement** sur le plan n'étaient pas assez
   visibles → fond **rouge** au lieu de bleu ;
2. **réalignement des cartes de pièce** de l'Accueil : **Salon** inchangé
   (pleine largeur), puis les autres pièces **2 par ligne**.

## Changements

| # | Action | Fichier |
|---|--------|---------|
| M1 | État « mouvement » **séparé** de l'état « ouverture » : `opening(d)` ne teste plus que `doorOpen` (bleu) ; nouveau `triggered(d) = motion(d)` | `ui/PlanPreview.svelte`, `pages/Plan.svelte` |
| M2 | Nouvelle classe `motion` sur les pins du plan de l'Accueil, fond **`--alert`** (rouge), **sans** halo ni pulsation — distinct de l'alarme | `ui/PlanPreview.svelte` |
| M3 | Idem sur les jetons de la page Plan (image 2D + étage dessiné) : classe `motion` sur `.token` | `pages/Plan.svelte` |
| M4 | Les contacts **porte/fenêtre** ouverts restent **bleus** (`--cool-soft`) : la classe `open` garde son style inchangé | `ui/PlanPreview.svelte`, `pages/Plan.svelte` |
| M5 | Lisibilité sans confusion : l'**alarme** (fumée/fuite) garde son halo pulsant `--alert-soft` ; le **mouvement** est rouge **fixe**, donc un passage ne ressemble jamais à une alarme | `ui/PlanPreview.svelte`, `pages/Plan.svelte` |
| L1 | Salon garde la **pleine largeur** ; les 6 autres pièces passent dans une grille `1fr 1fr` (2 par ligne), dans l'ordre de `rooms` | `pages/Accueil.svelte` |
| L2 | Responsive : la grille retombe à **1 colonne** sous 760 px | `pages/Accueil.svelte` |

## Mécanisme M1–M4 — pourquoi séparer « mouvement » et « ouverture »

Avant, `opening(d) = doorOpen(d.id) === true || motion(d.id)` : un mouvement et
une porte ouverte partageaient la **même** classe `open`, donc le même bleu.
La demande « fond rouge » ne concerne que les **mouvements** ; les contacts
porte/fenêtre restent bleus (distinction utile : une porte ouverte n'est pas un
mouvement).

- `opening(d)` → `doorOpen(d.id) === true` (bleu `--cool-soft`, inchangé).
- `triggered(d)` → `motion(d.id)` (rouge `--alert` **fixe**, nouvelle classe `motion`).

**Distinction mouvement / alarme (M5).** Le fond rouge est demandé pour les mouvements ;
pour ne pas confondre un simple passage avec une **alarme** (fumée/fuite, également rouge
`--alert`), l'alarme conserve son **halo pulsant** `--alert-soft` et le mouvement est rendu
en rouge **fixe** (ni halo, ni `animation`). La sévérité reste lisible d'un coup d'œil :
rouge qui pulse = danger, rouge fixe = présence.

`motion()` reconnaît `occupancy` (Hue), `motion` (Frigate) et `pir` (Tuya) —
cf. `lib/home.svelte.js` (patch `accueil-plan-frigate`). Rien à changer côté
détection : seul le **rendu** change.

La 3D (`plan/markers3d.js`) peignait déjà l'état « open » (mouvement/ouverture)
en orange `#ffa52e` ; **hors périmètre** de cette demande (l'utilisateur parle
du plan, rendu 2D).

## Vérification (live `http://192.168.1.125:8790`)

Build : `DOCKER_BUILDKIT=1 docker compose build` (web vite + rust, bundle
embarqué rust-embed, ~4 min) puis `docker compose up -d --force-recreate`.

- `GET /api/health` : `drivers_running` **11/11**, `journal_failures: 0`,
  77 appareils / 519 points.
- CSS servi (`.pin.motion.svelte-14v78yf .dot` → `background:var(--alert)`;
  `.token.motion.svelte-1ha3u8l` → `background:var(--alert)`) ;
  `.pin.open`/`.token.open` toujours `var(--cool-soft)`.
- Probe navigateur (computed style, sur élément réel dans l'app) :
  - `.pin.motion` → **`rgb(255,123,98)`** (= `--alert` `#ff7b62`), **`animation: none`** ;
  - `.pin.open` → **`rgb(26,34,56)`** (bleu `--cool-soft`), pas d'animation ;
  - `.token.motion` → **`rgb(255,123,98)`**, **pas d'animation** ;
  - `.token.open` → **`rgb(26,34,56)`**.
- Contraste alarme/mouvement vérifié en CSS servi : `.pin.alarm .dot`/`.token.alarm` gardent
  `box-shadow: …var(--alert-soft)` + `animation: …pulse` ; `.pin.motion`/`.token.motion` = fond
  rouge **seul** (sans halo, sans pulsation).
- Pin réel du plan Accueil, classe `motion` ajoutée : fond passe de
  `rgb(22,26,34)` (neutre) à **`rgb(255,123,98)`** (rouge) → AC1/AC2.
- Grille pièces : `.rooms-grid` = `327.953px 327.953px` (2 colonnes de largeur
  égale). Géométrie (y en px) : Salon pleine largeur (w=676) ; VMC+SDB et
  Alicia **y=1014** ; Parents et Appartement **y=1239** ; Cave à Vins et
  Piscine **y=1380** → 3 paires alignées, Salon au-dessus seul → AC4/AC5.
- Parité i18n maison fr/en : **223 / 223** clés, aucun écart (aucune clé
  ajoutée : le patch ne touche pas les catalogues) → AC6.
- `check-config` → « configuration OK (9 driver(s)) » (les drivers `kind=profile`
  ne comptent pas comme blocs, cf. AGENTS.md §1).

## Ordre / supersession

Patch `accueil-motion-colonnes` : **après** `accueil-arrows-heat` (part de son
état). Il ne remplace aucune décision antérieure : il change la couleur de
l'état « mouvement » des pins/jetons et la disposition des cartes de pièce.

Ordre complet des patchs Accueil (AGENTS.md §5) :
`accueil-ha-inspire` → `accueil-clim-conditional` → `accueil-sections` →
`accueil-tidy` → `accueil-heure-salon-sections` → `accueil-plan-frigate` →
`accueil-arrows-heat` → **`accueil-motion-colonnes`**.

## Non-régression

- Salon reste **exactement** la carte pleine largeur d'avant (même `RoomCard`,
  mêmes contrôles) ; seule la position (grille) des 6 autres cartes change.
- Les icônes/lectures des pins (lumière, température, puissance) sont
  inchangées ; seul l'état « mouvement » a une nouvelle couleur.
- `data/` inchangé (state vivant). Backups `.bak-motioncol` posés à côté des
  3 fichiers modifiés.
- `git apply --check notes/patches/accueil-motion-colonnes.patch` sur la base
  pré-édition → **OK** ; application reproduit **à l'identique** les 3 fichiers
  live (`md5sum` égaux).

## Revue de code (auto-checklist)

| # | Point | Résolution |
|---|-------|-----------|
| 1 | Un mouvement ET une porte ensemble ? | Impossible de cumuler : un appareil est soit contact, soit capteur de mouvement (les deux classes peuvent coexister mais un même pin n'est pas les deux dans la pratique) — `open` prime visuellement si les deux, cas non observé. |
| 2 | `triggered` inutilisé ailleurs ? | Défini et utilisé dans le même fichier (`class:motion`). Pas d'export. |
| 3 | CSS `pulse` réutilisé | La keyframe `pulse` existait déjà (alarme) dans les deux composants ; elle n'est **pas** touchée. `.motion` n'ajoute **aucune** animation (fond rouge fixe), donc la règle `prefers-reduced-motion` — qui ne désactive que `.alarm` — reste inchangée. |
| 4 | Salon filtré par `name === 'Salon'` en dur ? | Oui : la pièce « Salon » est un pivot explicite du layout maison (`data/home.json`), cohérent avec les autres patchs Accueil. Si Salon disparaît, la grille prend toutes les pièces. |
| 5 | `rooms-grid` casse la colonne droite ? | Non : la grille est interne à `.col` (colonne gauche) ; la colonne droite (plan, caméra, routines) est inchangée. |

> **Revue (2026-10-17) :** la grille 2 colonnes retombe à 1 colonne sous 760 px ; entre
> ~760 et 1100 px (colonne droite encore présente), les cartes peuvent être serrées sur
> tablette kiosque. Signalé en revue, non corrigé (hors périmètre du pas icônes) — à
> réévaluer lors d'un futur pas Accueil avec test à la résolution kiosque cible.

