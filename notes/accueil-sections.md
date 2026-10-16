# Accueil Moli — disposition « sections » (calquée sur le dashboard HA)

Relevé et réalisation : 2026-10-16. LXC 125 `moli-lab` (`/opt/moli-os`).

## Ordre d'application des patches

Ce chantier est la **suite** de `notes/accueil-ha-inspire.md` : les patches
s'appliquent **dans cet ordre** (chacun part de l'état laissé par le
précédent) :

1. `notes/patches/accueil-ha-inspire.patch` — pièces, consigne chauffage,
   météo semaine.
2. `notes/patches/accueil-clim-conditional.patch` — carte clim conditionnelle.
3. `notes/patches/accueil-sections.patch` — **ce chantier** : disposition
   2 colonnes + 4 nouvelles cartes + badges.

Pour la **disposition de l'Accueil**, `accueil-sections.md` fait foi
(`accueil-ha-inspire.md` reste valable pour les pièces / chauffage / météo,
mais sa description du placement des cartes sur l'Accueil est **remplacée**
par ce document).

## Objectif

Donner à la page Accueil (`#/`) la **même disposition** que le dashboard
HA `tablette-2025` (vue « Tab ») : en-tête, barre de badges, puis grille
**2 colonnes** (gauche large / droite), en n'utilisant que des équivalents
Moli. Périmètre validé : **structure** identique ; aucun bloc HA sans
équivalent Moli n'est inventé ou simulé.

## Disposition retenue

```
┌─ en-tête (salut / météo hero) ─────────────────────────────┐
├─ barre de badges (AccueilBadges) ─ défilable en largeur ───┤
├─ pastilles pièces (RoomStrip) ─────────────────────────────┤
│                                                            │
│  ┌─ colonne gauche (large) ─────────┐ ┌─ colonne droite ─┐ │
│  │ La semaine (WeekWeather)          │ │ Horloge (HomeClock)│ │
│  │ Consigne chauffage (HeatingBar)   │ │ Plan (PlanPreview) │ │
│  │ Carte par pièce (RoomCard ×N)     │ │ Piscine (PoolCard) │ │
│  │ Lumières + ambiances              │ │ Électricité (Energy)│ │
│  │ Climat (si présent)               │ │ Routines           │ │
│  └───────────────────────────────────┘ │ Caméra (sonnerie)  │ │
│                                        │ Télécommande       │ │
│                                        │ Dehors             │ │
│                                        └────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

Grille `.sections` : une seule colonne en dessous de 1100 px, sinon
`minmax(0, 1.55fr) minmax(0, 1fr)`. L'ancienne grille 12 colonnes a été
retirée.

## Critères (AC-L1 … AC-L6)

| # | Critère | État |
|---|---------|------|
| AC-L1 | Grille 2 colonnes (gauche large / droite) | fait, vérifié |
| AC-L2 | Colonne gauche = météo + consigne chauffage + une carte par pièce configurée | fait, vérifié |
| AC-L3 | Colonne droite = horloge + plan Moli + piscine + énergie, chaque bloc cliquable | fait, vérifié |
| AC-L4 | Barre de badges : portes + conso maison + toggles rapides, défilable | fait, vérifié |
| AC-L5 | Non-régression (toutes les cartes présentes, santé 9/9, HA intact) | fait, vérifié |
| AC-L6 | Blocs HA sans équivalent Moli hors périmètre, documentés, aucune donnée simulée | ce document |

## AC-L6 — blocs HA volontairement hors périmètre

Ces blocs existent dans `tablette-2025` mais **n'ont pas d'équivalent
Moli** ; ils ne sont pas repris et **aucune donnée simulée** n'est
affichée à la place :

- **Alarme** (`alarm_control_panel`) : HA a une entité d'alarme câblée +
  l'intégration Alarme. Moli n'a pas de driver alarme : le bloc est laissé
  de côté (l'état portes/intrusion est couvert par les badges et
  `SecurityPanel`).
- **Calendrier poubelles** : dépend d'un calendrier HA dédié. Driver
  calendrier reporté (cf. `notes/accueil-ha-inspire.md`, section
  « Autre reste à faire »). Pas de bloc.
- **Tondeuse LUBA2** : entité `lawn_mower` propre à HA. Aucun équivalent
  Moli. Pas de bloc.
- **Image `/local/home11.png`** : image statique servie par HA
  (`config/www/home11.png`) représentant le plan/photo maison. Moli a sa
  **propre image de plan** (`/api/plan` → `floors[0].image`), utilisée par
  `PlanPreview` ; `home11.png` n'est **pas** repris.

## Fichiers

### Nouveaux
| Fichier | Rôle |
|---------|------|
| `web/src/maison/ui/AccueilBadges.svelte` | barre de badges (portes, conso, toggles rapides) |
| `web/src/maison/ui/HomeClock.svelte` | carte horloge / salut |
| `web/src/maison/ui/PlanPreview.svelte` | aperçu du plan de la maison |
| `web/src/maison/ui/PoolCard.svelte` | carte piscine (T° eau + pompe) |

### Modifiés
| Fichier | Nature |
|---------|--------|
| `web/src/maison/pages/Accueil.svelte` | disposition `.sections` 2 colonnes ; import des 4 cartes ; cartes-pièces filtrées sur `home.config.rooms` ; tuile « Piscine » retirée de la carte Dehors (dédoublonnée avec PoolCard) |
| `data/home.json` | bloc `badges` (compteur + 2 interrupteurs) |
| `locales/fr/maison.json` | 19 clés `maison.accueil.*` |
| `locales/en/maison.json` | mêmes 19 clés (fr↔en alignés, `maison.meteo.jours` = « 8 days » côté en) |

Backups `.bak-sections` posés à côté de chaque fichier modifié.
Les backups `.bak-hainspire` / `.bak-preclim` / `.bak-prepool` de la
session précédente restent en place.

## Rebuild

```
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d'
```
~4 min (release, 100 % Rust). Pas de node/npm sur le CT.
