# Accueil : opti graphique de la tablette (`accueil-perf-lite`)

**Date :** 2026-10-22 · **Portée :** uniquement l'allègement du rendu de l'Accueil
sur un appareil lent. Aucun changement de fonction, aucun fichier `crates/` touché —
sauf `crates/moli-api/src/plan.rs`, qui gagne un champ de lecture `thumb` (aucun
comportement nouveau, voir §3).

Matériel visé : **Lenovo A7600-F** (Android 7.1.2, WebView 119, 1280×800, ≈ 1 Go de
RAM), voir `tablette-lenovo-moli.md`. La navigation est fluide ; c'est le **rendu
continu** de l'Accueil qui coûtait la majorité des frames.

## Ce qui coûtait les frames (mesuré, pas supposé)

Protocole : Playwright sur `http://192.168.1.125:8790/#/` (thème nuit, 1280×800),
**throttle CPU CDP 20×** pour approcher le MediaTek, FPS `requestAnimationFrame`
sur 3 passes de 3 s, médiane.

| État | FPS médian |
|---|---|
| Avant | **21** |
| Avant, keyframe `breathe` sans `filter` animé | 33 |
| Avant, + ciel météo figé | 45 |
| Avant, tout figé (plafond) | 60 |

Trois causes, dans cet ordre :

1. **L'orbe Moli respirait en animant `filter`.** `@keyframes breathe` portait
   `filter: saturate(1.2)` ; animer un filtre force un repaint de la couche entière
   à chaque frame, et il y a **trois orbes** sur l'Accueil (22 px dans la barre
   latérale, 38 px dans le bouton flottant, et un halo de 204 px en conic-gradient).
2. **Le ciel météo** (`windmap.js`) repeint deux canvas 60 fois par seconde
   (50–600 particules) sous un double `mask-image`.
3. **L'image du Plan** était servie en pleine résolution : **1980×990, 2,79 Mo**,
   affichée en **414×207** ; 1,7 s avant `img.complete` en throttle 4×.

Ce qui **n'apporte rien** (testé, aucun gain) : `content-visibility: auto`,
`will-change: transform`, retirer les ombres portées, retirer le `mask-image`,
réduire les `backdrop-filter` (8 au total, tous sur des feuilles modales). Le DOM
est déjà calme : **12 mutations en 20 s**, 0 message SSE au repos.

## Ce qui a changé

### 1. `web/src/maison/moli/Orb.svelte`

`@keyframes breathe` ne porte plus que `transform` ; le `saturate(1.2)` devient une
propriété statique de `.core` (rendu identique au repos). Gain seul : **21 → 33 fps**.

### 2. `web/src/maison/lib/lean.js` (+ `lean.test.js`) et `ui/WeatherMap.svelte`

Un module pur `isLean({deviceMemory, hardwareConcurrency, reducedMotion})` : vrai si
mouvement réduit demandé, **ou** `deviceMemory ≤ 1`, **ou** (`hardwareConcurrency ≤ 4`
**et** `deviceMemory ≤ 2`). Les deux signaux faibles doivent se confirmer : un portable
4 cœurs avec 8 Go de RAM **garde** le ciel animé (c'est une machine saine), seule la
tablette (1 Go) et ses pareilles se figent. Dans ce cas `WindMap` démarre en `still` (le
mode existait déjà : `drawStill()`, une passe, pas de `requestAnimationFrame`). Ce que
le navigateur ne renseigne pas n'est pas retenu contre lui — et un `deviceMemory ≤ 1`
suffit seul, c'est déjà le bas du panier.

### 3. `web/src/maison/ui/PlanPreview.svelte` + `crates/moli-api/src/plan.rs` (+ donnée hors patch)

La carte de l'Accueil ne devine **pas** le nom de la vignette : `GET /api/plan` ajoute à
chaque étage un champ `thumb` — le nom du `.webp` **quand le fichier existe à côté de
l'image** (`thumb_name()`, testé), `null` sinon. `PlanPreview` prend
`floor?.thumb ?? floor?.image`, donc **aucune requête perdue** sur une maison qui ne
garde pas de vignette. `PUT /api/plan` efface `thumb` avant d'écrire : `plan.json` reste
ce qu'un humain a écrit, et le champ est `skip_serializing_if` côté type `Floor`.
La page `#/plan` **garde l'originale**.

```sh
# vignette de l'étage 1 (1980×990 → 1000×500, WebP q78) :
python3 - <<'EOF'
from PIL import Image
im = Image.open('88607f17a54edf6e.png').convert('RGB')
im.resize((1000, 500), Image.LANCZOS).save('88607f17a54edf6e.webp', 'WEBP', quality=78, method=6)
EOF
# puis dans /opt/moli-os/data/plan/ (le nom suit celui du plan.json, extension en .webp)
```

## Preuves

Le seuil, mesuré sur le tableau qui tourne (`work/lean-proof.mjs` : `deviceMemory` et
`hardwareConcurrency` forcés par `addInitScript`, puis comptage des appels de dessin
canvas sur 1,5 s — le ciel animé en fait 90, le ciel figé 0) :

| Profil émulé | `isLean` | Ciel |
|---|---|---|
| tablette 1 Go / 4 cœurs | vrai | **figé** (0 dessin) |
| tablette 1 Go / 8 cœurs | vrai | **figé** (0) |
| portable 2 Go / 4 cœurs | vrai | **figé** (0) |
| portable 8 Go / 4 cœurs | faux | **animé** (90) |
| desktop 8 Go / 8 cœurs | faux | **animé** (90) |
| desktop 4 Go / 16 cœurs | faux | **animé** (90) |

Un portable 4 cœurs avec de la RAM garde donc son ciel : le premier jet
(`hardwareConcurrency ≤ 4` seul) le figeait, ce qui était une régression pour une
machine saine.

FPS après, même protocole que le tableau « avant », médiane sur 3 passes de 3 s
(`work/fps-lean.mjs`). Les trois premières passes d'un profil sont froides (montage
des composants, images, polices) : c'est la médiane qui compte, pas la première.

| Profil émulé | FPS médian | Ciel mobile ? |
|---|---|---|
| tablette 1 Go / 4 cœurs @20× | **39,9** (jusqu'à 59,9 en régime) | non (figé) |
| tablette 1 Go / 8 cœurs @20× | 57,2 | non (figé) |
| desktop 8 Go / 8 cœurs @20× | 33,2 | **oui** |
| desktop 8 Go / 8 cœurs, sans throttle | 60,1 | oui |

Plan, mesuré sur le réseau de l'Accueil :

```sh
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' \
  http://127.0.0.1:8790/api/plan/images/88607f17a54edf6e.webp   # 200 37772
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' \
  http://127.0.0.1:8790/api/plan/images/88607f17a54edf6e.png    # 200 2856959
```

- Accueil : une seule requête d'image de plan, `88607f17a54edf6e.webp`, **37 Ko**,
  `naturalWidth` 1000 (affiché 414).
- `#/plan` : une seule requête, `88607f17a54edf6e.png`, `naturalWidth` **1980**
  — l'originale est intacte.
- `prefers-reduced-motion: reduce` : seule animation restante
  `svelte-1uuaoaa-ping` à `0.01 ms` (la règle globale de `maison.css`), soit figée.
- `node --test "src/**/*.test.js"` : **93 tests, 0 échec** (dont les 7 de `lean.test.js`).
- Diff des captures Accueil avant/après (`work/accueil-perf-lite-2026-10-22.png`) :
  écarts cantonnés à (a) la carte Plan (ré-échantillonnage de la vignette, moyenne
  **3,6/255** sur la zone), (b) le ciel météo (heure écoulée entre les deux prises),
  (c) la phase de l'orbe (**0,5/255** sur la zone du bouton flottant). Aucun
  déplacement, aucune taille, aucune couleur de surface changée.

## Application / rollback

```sh
ssh moli-os 'cat > /tmp/perf-lite.patch' < notes/patches/accueil-perf-lite.patch
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/perf-lite.patch'   # vérifie d'abord
ssh moli-os 'cd /opt/moli-os && git apply /tmp/perf-lite.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'
ssh moli-os 'cd /opt/moli-os && curl -s http://127.0.0.1:8790/api/health'
```

Le patch se pose sur `d54c3de` + n° 1→12 ; la chaîne entière se rejoue sans conflit
(`patch -p1`) et reproduit l'arbre en production fichier par fichier. Régénération :
`work/mkpatch-chaintail.sh` (les anciens `mkpatch-pieces.sh` / `mkpatch-perflite.sh`
n'en sont plus que des renvois).

Rollback : `git apply -R /tmp/perf-lite.patch`, supprimer
`data/plan/88607f17a54edf6e.webp` (le serveur n'annonce plus de `thumb`, la carte
retombe sur l'originale — pas besoin de toucher au code pour annuler le seul point 3),
puis rebuild + `up -d --force-recreate`.

Le patch ne contient **pas** la vignette : c'est une donnée, comme
`notes/patches/labels.toml.pieces`.

Le patch touche `crates/moli-api/src/plan.rs` : le rebuild doit compiler le crate
(plus lent qu'un patch purement web), et `GET /api/plan` répond le champ `thumb`
seulement une fois l'image reconstruite.
