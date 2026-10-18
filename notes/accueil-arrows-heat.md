# Accueil — flèches retirées, « Bonsoir » retiré, consigne chauffage en bas (accueil-arrows-heat)

Date : 2026-10-16. Suite de `accueil-plan-frigate` (même branche Accueil, part
de son état déployé sur le CT125). Gains de place en hauteur demandés par
l'utilisateur.

## Changements

| # | Action | Fichier |
|---|--------|---------|
| A1 | Flèche « Toutes les pièces » retirée au-dessus de la barre pièces : bloc `.card-head` (lien `.more`) supprimé **et** sa règle CSS orpheline `.card-head` purgée | `ui/RoomStrip.svelte` |
| A2 | Flèche « Toutes les caméras » retirée au-dessus de la vidéo Entrée : bloc `.card-head` supprimé (section *Devant la porte*) | `pages/Accueil.svelte` |
| A3 | Flèche « Toutes les pièces » retirée au-dessus de la section Lumières : lien `.more` seul retiré ; le toggle Affichage (Aa/icône) est **conservé** | `pages/Accueil.svelte` |
| A4 | « Bonsoir / Bonjour » retiré du header : `<h1>{greeting}</h1>`, l'import `greeting` (mort) et les 2 règles CSS `h1` (orphelines) supprimés ; date + heure conservées. `greeting()` reste exposée (Moli, MoliSheet) | `ui/SkyHero.svelte` |
| A5 | Carte Consigne chauffage déplacée **tout en bas de la colonne gauche** (après la section Clim conditionnelle). Ordre gauche : La semaine → cartes pièces → Lumières → Clim (si présente) → Consigne chauffage | `pages/Accueil.svelte` |
| A6 | Clés i18n mortes retirées : `maison.accueil.toutes_pieces`, `maison.accueil.toutes_cameras` | `locales/{fr,en}/maison.json` |

## Vérification

- `docker compose build` OK (web vite + rust, bundle embarqué rust-embed) puis
  `up -d --force-recreate`.
- `GET /api/health` : `drivers_running` **10/10**, `journal_failures: 0`, 76 appareils,
  517 points.
- DOM Accueil (`http://192.168.1.125:8790/`) :
  - `0` occurrence de « Bonsoir » / « Bonjour » ; header = date + heure seules.
  - `0` lien « Toutes les pièces » / « Toutes les caméras ».
  - Ordre des régions : La semaine (≈L178) → Lumières (≈L367) →
    Consigne chauffage (≈L411) → Devant la porte (≈L426) : la consigne est bien
    **après** Lumières, en bas de la colonne gauche.
  - Vidéo Entrée affichée sans en-tête de carte.
- Parité fr/en : **216 / 216** clés, aucun écart. Grep live `web/src` : **0**
  référence à `toutes_pieces`/`toutes_cameras` (hors backups `.bak`).
- Page Caméras toujours joignable : entrée dans la barre latérale globale
  (`Maison.svelte:48` → `{ path: 'cameras', label: 'commun.nav.cameras' }`), pas
  seulement via l'ancien raccourci retiré.
- `git apply --check notes/patches/accueil-arrows-heat.patch` sur la base
  pré-édition → **OK** ; application reproduit **à l'identique** les 5 fichiers
  live (`diff -q`).

## Ordre / supersession

Patch `accueil-arrows-heat` : **après** `accueil-plan-frigate` (part de son état).
Il ne remplace aucune décision antérieure ; il retire trois flèches, le salut du
header, et déplace la consigne chauffage.

## Notes

- `1 console error` observée au chargement (`GET /api/bench` → 404) : **préexistante**
  (endpoint absent du binaire), sans rapport avec ce patch.
- `data/` inchangé (state vivant).
