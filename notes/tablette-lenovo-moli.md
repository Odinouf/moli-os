# Tablette Lenovo A7600-F → affichage Moli OS

**Date :** 2026-10-16 · **Statut :** **fait** (start URL Fully Kiosk repointée vers Moli).
**Portée :** afficher le dashboard Moli sur la vieille tablette du salon, à la place de HA.

## Appareil (relevé via HA / Fully Kiosk)

| Élément | Valeur |
|---|---|
| Modèle | Lenovo **A7600-F** (Lenovo), build `NJH47F` |
| Android | **7.1.2** (SDK 25) |
| Appli kiosque | **Fully Kiosk** `de.ozerov.fully` 1.61.4-play |
| **WebView** | **Google WebView 119.0.6045.194** |
| Écran | 1280×800 px |
| RAM | 977 Mo (≈ 264 Mo libres) |
| Stockage interne | ≈ 9,9 Go libres |
| Host Fully Kiosk | `192.168.1.43` |

> Note : l'entité Fully Kiosk HA est titrée « Micromax A102 » (héritage de nom) mais l'appareil
> réel derrière est bien le **Lenovo A7600-F** (donné par l'info FK : `deviceModel`).

## Faisabilité — ✅ oui

Le point décisif est **WebView 119** (Chromium nov. 2023, mis à jour via le Play Store), et **non**
le WebView d'origine 2014. Le dashboard Moli est compilé en `es2022` (`web/vite.config.js`) sans
polyfill ; toutes les features utilisées tiennent dans Chrome 92–111, donc dans la 119 :

| Feature | Chrome min | Moli |
|---|---|---|
| `?.` / `??` | 80 | oui |
| `Array.prototype.at` | 92 | oui |
| `Object.hasOwn` | 93 | oui |
| `structuredClone` | 98 | oui |
| CSS `color-mix()` | 111 | oui |
| `<script type="module">`, `EventSource`/SSE | 61 | oui |

**Aucun polyfill nécessaire.** La limite n'est pas la compatibilité mais la **performance**
(MediaTek ancien, bundle ≈ 760 Ko JS / 216 Ko CSS, 1 Go de RAM) : rendu **lent mais utilisable** —
c'est le plancher matériel, on ne fera pas mieux avec cette tablette.

## Action réalisée

Start URL de Fully Kiosk repointée : HA → **`http://192.168.1.125:8790`** (Moli).
Port `8790` reste **LAN uniquement** (jamais exposé hors du réseau). Aucun développement.

## Rollback

Repointer la start URL de Fully Kiosk vers HA : `http://192.168.1.78:8123/tablette-2025/0`.

## Piste perf optionnelle (non engagée)

Si la lenteur gêne : alléger le dashboard (lazy-load des pages lourdes — Solaire/map, PDF —,
découpage CSS). Chantier à part, pas un prérequis.

## Hygiène

Aucun secret consigné : le mot de passe Fully Kiosk n'est **jamais** recopié ici.
