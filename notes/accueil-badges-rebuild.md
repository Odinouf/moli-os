# Bandeau de l'Accueil — reconstruit depuis la version d'origine

Patch : `notes/patches/accueil-badges-rebuild.patch` (3 fichiers, 259 lignes,
format `git diff` comme le reste de `notes/patches/`).
Posé sur le CT125 le 2026-10-21, par-dessus la chaîne Accueil n° 1 → n° 8.

## Ce qui n'allait pas

Le bandeau de pastilles (`AccueilBadges.svelte`) avait grossi au fil des patchs :
**11 pastilles** sur une ligne, dont six muettes ou illisibles de loin, quatre tons
simultanés, et une largeur de 1132 px quand les cartes en dessous sont centrées sur
960 px — le bandeau débordait à gauche et à droite des colonnes.

| Pastille | État | Verdict |
|---|---|---|
| `shield —` ×2 | alarmes maison/grange, aucun pilote Moli | supprimées |
| 4 contacts | icône seule, sans nom, rouge/vert | supprimés (pas gérés correctement) |
| `bleu` | Tempo du jour seul, sans repère | refaite (une pastille, jour + demain) |
| `437 W` / `88 W` | appart + reste, vert « tout va bien » | gardées, neutres, tonales en anomalie |
| `Spot extérieur` + icône prise 3D | prises commandables | gardées |

## Ce que fait le patch

### 1. Contenu : cinq pastilles au plus

1. **Tempo** — une seule pastille : point du jour + `auj.` + couleur, puis point de
   demain + `dem.` + couleur **quand RTE publie la couleur de demain**. Le format est
   celui de `tablette2025-parity` (`dot` + `tl` + nom), pas les deux pastilles
   séparées que `accueil-tablette2025-pixel` avait introduites.
   ⚠️ La couleur de demain n'est pas toujours publiée : la pastille n'affiche alors
   que `auj. bleu` — c'est l'état normal, pas une panne.
2. **Puissance de l'appartement** (`flash`, `power_appart`).
3. **Puissance du reste de la maison** (`bolt`, `power_residuel`).
4. **Les prises** de `badges.switches` (nom + icône, ou icône seule si `icon_only`).

Plus aucune pastille d'alarme, plus aucun contact, plus de pastille « portes » :
ces états ne sont pas exploitables aujourd'hui (pas de pilote alarme, contacts
muets), ils ne sont donc pas dessinés du tout plutôt que dessinés vides.

### 2. Couleur : neutre par défaut, tonale seulement en anomalie

| Cas | Rendu |
|---|---|
| valeur normale (< 1000 W) | `--surface` / `--ink-3`, aucun vert |
| ≥ 1000 W | `.warm` (`--warm-soft` / `--warm-ink`) |
| ≥ 3000 W | `.alert` (`--alert-soft` / `--alert`) |
| prise allumée | `.on` (`--warm`, texte blanc) — état actif, pas une alerte |
| valeur absente | `—`, neutre |

Les deux pastilles de puissance partagent les **mêmes seuils** ; auparavant seule
celle de l'appartement était tonale, et le vert `good` disait « tout va bien » sur
une ligne qui doit rester calme.

### 3. Position : alignée sur les colonnes

`.badges` prend `width: 100%; margin-inline: auto` et **les mêmes bornes que
`.sections`** : `max-width: 464px` (une colonne) puis `max-width: 960px` au-delà de
`1100px` (2 × 464 + 32). Le bandeau ne déborde plus de la page et reste aligné sur
les cartes aux deux régimes — une seule borne à 960 px le laissait plus large que
la colonne unique en dessous de 1100 px. Hauteur 36 px conservée, `overflow-x: auto`
conservé : quand les pastilles ne tiennent pas dans la colonne, le bandeau défile,
il ne passe jamais à la ligne.

### 4. Locales

`maison.accueil.badges_tempo_jour` réapparaît (`auj.` / `today`) : la clé avait été
retirée par `accueil-tablette2025-pixel` quand la pastille Tempo était devenue un
simple mot. En anglais, `badges_tempo_demain` passe de « tom. » à « tmrw » pour
tenir la même paire abrégée que le français (`auj.` / `dem.`).

Les huit clés que le bandeau n'utilise plus partent avec lui —
`badge_alarme_indisponible`, `alarme_maison`, `alarme_grange`, `badge_baie`,
`badge_atelier`, `badge_grange`, `badge_boite`, `badge_contact_inconnu` (fr + en).
Git les retrouve si un pilote alarme arrive ; les laisser ferait mentir le
catalogue sur ce que le dashboard sait dire.

## Fichiers

| Fichier | Rôle |
|---|---|
| `web/src/maison/ui/AccueilBadges.svelte` | reconstruit (contenu, tons, alignement) |
| `locales/fr/maison.json`, `locales/en/maison.json` | `badges_tempo_jour` rétablie, `badges_tempo_demain` en « tmrw », 8 clés mortes retirées |

Rien d'autre : ni `Accueil.svelte`, ni `home.json`. La couleur des watts vient de
`lib/power.js` (`powerTone`, créé par le patch n° 8) : le bandeau et la pastille
watts d'une rangée ne peuvent plus diverger.

## Preuves

Mesures en production (`http://192.168.1.125:8790`, après rebuild) :

```
viewport 1280 : nav.badges x=198 w=960  |  .sections x=198 w=960   ← aligné
viewport 1180 : nav.badges x=148 w=960  |  .sections x=148 w=960
viewport 1024 : nav.badges x=318 w=464  |  .sections x=318 w=464   ← une colonne
viewport 760  : nav.badges x=148 w=464  |  .sections x=148 w=464   h=36, overflow-x auto
viewport 420  : nav.badges x=55  w=464  |  .sections x=55  w=464   h=36, overflow-x auto
pastilles : auj. bleu | 288 W | 116 W | Spot extérieur | (icône prise 3D)
fond rgb(22,26,34) = --surface, texte rgb(120,129,149) = --ink-3
prise allumée : rgb(245,174,76) = --warm, texte blanc
```

Les deux largeurs de `.sections` (464 px / 960 px à partir de 1100 px) sont
reproduites à l'identique : le bandeau et les cartes partagent le même bord gauche
et la même largeur à **tous** les viewports testés, y compris en colonne unique.

Seuils vérifiés en injectant des états Linky dans le flux SSE de la page (vite sur
le code du patch) :

| valeur injectée | classe | fond | texte |
|---|---|---|---|
| 4200 W | `badge alert` | `rgb(58,28,22)` | `rgb(255,123,98)` |
| 1500 W | `badge warm` | `rgb(51,39,15)` | `rgb(255,212,154)` |
| 459 W | `badge` | `rgb(22,26,34)` | `rgb(120,129,149)` |

Tempo : `auj. bleu` seule — RTE ne publie pas la couleur de demain, la pastille
n'affiche que le jour connu (état normal, pas une panne).

```
$ curl -s /api/health → drivers_running 14 · devices 85 · points 569 · journal_failures 0
```

```
$ cd web && npm test          → 52 tests, 0 échec (dont les 5 de power.test.js)
$ cd web && npm run build     → ✓ built
$ grep -cE "0x[0-9a-f]{16}" notes/patches/accueil-badges-rebuild.patch → 0
```

## Poser / retirer

```sh
# poser (base courante : chaîne Accueil 1 → 8 déjà appliquée)
scp notes/patches/accueil-badges-rebuild.patch moli-os:/tmp/p.patch
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/p.patch && git apply /tmp/p.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d'

# retirer
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/p.patch && docker compose build && docker compose up -d'
```

Sauvegardes `.bak-badges-<horodatage>` / `.bak-review-<horodatage>` des fichiers
avant application. Le patch est au format `git diff` : ni `-p1`, ni `--directory`.
