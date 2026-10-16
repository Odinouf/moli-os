# Accueil — nettoyage (accueil-tidy)

Date : 2026-10-16. Suite de `accueil-sections` (même branche, même logique
« sections »). Objectif : enlever les blocs redondants ou inutiles de l'Accueil
et condenser les lumières.

## Changements

| # | Action | Fichier |
|---|--------|---------|
| R1 | Carte `HomeClock` retirée (heure/date/bonjour déjà dans le header `SkyHero`) ; `ui/HomeClock.svelte` **supprimé** (plus aucune référence) | `pages/Accueil.svelte`, `ui/HomeClock.svelte` (supprimé) |
| R2 | Lumières condensées : toggle « look » (Aa / icône, `role=radiogroup`), **compact par défaut** — Ambiance en icônes seules + pads des cartes de pièce en icônes seules | `pages/Accueil.svelte`, `ui/AmbiancePicker.svelte` |
| R3 | Carte Plan : les appareils placés (`/api/plan` → `floors[].devices[]`, x/y) s'affichent en **pins** (icône + lecture courte) sur l'image ; résolution d'id insensible à la casse (helper partagé `lib/home.svelte.js`) | `ui/PlanPreview.svelte`, `pages/Plan.svelte`, `lib/home.svelte.js` |
| R4 | Carte Électricité (`EnergyCard`) masquée de l'Accueil (composant **conservé** : toujours utilisé par `moli/MoliCards.svelte`) | `pages/Accueil.svelte` |
| R5 | Carte `Dehors` retirée (dérivés `aqi`/`aqiWord` supprimés) | `pages/Accueil.svelte` |
| R6 | Carte `Télécommande` retirée (`salon: null` en config — non configurée) | `pages/Accueil.svelte` |
| R7 | 8 clés i18n devenues inutilisées retirées (horloge, dehors, air, humidite, telecommande, tele_allumee, tele_veille, son_joue) — fr et en | `locales/{fr,en}/maison.json` |

## Mécanisme de repli (R2)

Pas de composant « collapse » dédié dans le code. Le repli maison = le toggle
`.look` de la page Pièces (deux boutons radio `Aa` / icône, `role=radiogroup`,
`aria-checked`). Reproduit sur l'Accueil :
- `AmbiancePicker` reçoit une prop `compact` → masque `.name` sous chaque swatch ;
- les `RoomCard` de l'Accueil reçoivent `icons={compact}` → pads icône seule.

État mémorisé par appareil (`localStorage: moli.lights-look`), **défaut compact**.

## Non-régression

- `docker compose build` + `up -d --force-recreate` (web embarqué rust-embed).
- `/api/health` : drivers 9/9 running, `journal_failures` 0, `guard.dashboard` trusted.
- `moli-os check-config -c /data/moli.toml` → « configuration OK (7 driver(s)) ».
- Catalogues fr/en : 2772 clés chacun, parité OK (clés + paramètres).
- `git apply --check notes/patches/accueil-tidy.patch` → OK.

## Preuves visuelles

- Header unique : date/« Bonsoir »/heure une seule fois (haut de page).
- Carte Lumières : 12 swatches sans texte, radio « Icônes seules » cochée.
- Cartes de pièce : pads en pastilles (plus de noms), page nettement plus courte.
- Carte Plan : pins 25,9° / 51,0° visibles sur le rendu 3D.
- Absence : HomeClock, Électricité, Dehors, Télécommande.

## Correctif id de plan (R3)

`data/plan.json` portait `frigate:Atelier` (majuscule) alors que la clé canonique
du hub est `frigate:atelier` : le pin de la caméra était perdu (4/5). Corrigé au
niveau **code** :

- `lib/home.svelte.js` expose `canonicalId(id)` / `deviceOf(id)` (résolution
  insensible à la casse, helper partagé) et `pinIcon` / `pinReading`.
- `PlanPreview.svelte` utilise `deviceOf` ; `pages/Plan.svelte` ré-applique
  `canonicalId` par un `$effect` dès que le hub est peuplé (convergence = no-op).
- Prouvé en remettant l'id périmé en base : 5 pins et 5 tokens rendus
  (dont « Atelier »).

**Réécriture des données : hors patch (volontaire).** La correction
`frigate:Atelier` → `frigate:atelier` a été faite à la main dans `data/plan.json`
(un état **vivant**, édité depuis l'UI / la tablette — voir plus bas), avec
sauvegarde `data/plan.json.bak-tidy`. Elle n'est **pas** dans le patch, pour trois
raisons :

1. `data/` est **gitignoré** ; c'est du state utilisateur, pas du code.
2. Depuis, l'utilisateur a **ré-édité le plan** (appareils réarrangés/ajoutés,
   l'entrée `frigate` a disparu) : figer un hunk reproduirait un instantané
   périmé qui écraserait le travail en cours.
3. La tolérance au niveau code (`canonicalId`/`deviceOf`) **rend la réécriture
   inutile** : une dérive de casse est désormais absorbée au rendu, donc une
   resynchro/rebuild ne perd rien.

Repro si besoin (idempotent, à la main) :

```sh
sed -i 's/"frigate:Atelier"/"frigate:atelier"/' data/plan.json
```

## Revue de code (findings)

| # | Finding | Résolution |
|---|---------|-----------|
| 1 | `plan.json` cité mais absent du patch | **Documenté hors patch** (voir R3) + helper code qui rend la réécriture inutile |
| 2 | Code mort `HomeClock` / `EnergyCard` | `HomeClock.svelte` **supprimé** (orphelin confirmé, 0 référence) ; `EnergyCard` **conservé** (utilisé par `moli/MoliCards.svelte`) |
| 3 | Régression layout : plan plein-format, carte haute | `.shot` → wrapper `.frame` (inline-block, centré) avec `max-height:240px` sur l'image ; pins positionnés dans `.frame` (alignés). Vérifié live : hauteur image 198px, carte 290px |
| 4 | Logique id/icône/lecture dupliquée Plan/PlanPreview | Extraite dans `lib/home.svelte.js` (`canonicalId`, `deviceOf`, `pinIcon`, `pinReading`) ; les deux vues l'importent |
| 5 | Toggle compact peu découvrable (tactile) | `aria-label` ajouté aux deux boutons (en plus de `title`) ; le lien « toutes les pièces » voisin expose les noms complets — **mineur, accepté** |

## Ordre / supersession

Patch `accueil-tidy` : **après** `accueil-sections` (part de son état).
Il remplace la carte Lumières de `accueil-sections` (tuiles + Ambiance) par la
version condensée et retire les cartes citées ci-dessus.

## Non-régression (post-findings)

- Rebuild + `--force-recreate` ; `/api/health` drivers running ; `check-config` OK.
- DOM Accueil : `.plan .pin` = 5, `.plan .frame` présent, `max-height` 240px.
- DOM page Plan : `.token` = 5, noms + lectures (25,9° / 34,6°) intacts après
  passage aux helpers partagés.
- `git apply --check` du patch régénéré sur la base pré-tidy : **OK** ; application
  reproduit **à l'identique** les 7 fichiers live + supprime `HomeClock.svelte`.
- `/api/plan` reste du state vivant (non versionné).
