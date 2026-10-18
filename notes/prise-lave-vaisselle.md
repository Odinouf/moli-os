# Renommage « Prise Lave-Vaisselle »

**Date :** 2026-10-16 · **Portée :** corriger le nom de la prise `z2m:0xa4c138bb3c3e1f88`
**Statut :** fait et vérifié (P1–P3).

## Constat

La prise Zigbee `0xa4c138bb3c3e1f88` est enregistrée côté Zigbee2MQTT sous le nom
**« Prise Piscine Zigbee »**, mais c'est **physiquement la prise du lave-vaisselle** :
- HA : `switch.prise_pompe_piscine` porte le `name_by_user` **« Prise Lave Vaisselle »**,
  appareil Tuya « Smart plug (with power monitoring) » (`model = TS011F_plug_1`).
- Moli publiait l'appareil sous son nom z2m brut + était compté comme « Pompe Piscine »
  (compteur énergie) et câblé comme `outdoor.pool_pump` (alimentant la tuile « Pompe » de
  la page Dehors).

La **vraie pompe de filtration** est Z-Wave (`switch.prise_piscine_2`, Fibaro FGWP-102),
pilotée par une automation HA — **absente de Moli** (pas de driver Z-Wave, cf. `zwave-moli.md`).
Aucune référence `pool_pump` n'était donc correcte.

## P1 — Label de l'appareil

`PUT /api/labels/z2m:0xa4c138bb3c3e1f88 {"name": "Lave-Vaisselle"}` (borné, `labels.toml`).

**Preuve :** `GET /api/devices/z2m:0xa4c138bb3c3e1f88` → `label = {name: "Lave-Vaisselle",
room: "Cuisine"}` (pièce conservée).

## P2 — Compteur énergie

`data/moli.toml` (backup `data/moli.toml.bak-prelavevaisselle`) :

```toml
[[energy.meter]]
id = "pompe_piscine"       # clé de stockage : NE PAS renommer (historique energy.db)
name = "Lave-Vaisselle"    # était « Pompe Piscine »
point = "z2m:0xa4c138bb3c3e1f88/energy"
power = "z2m:0xa4c138bb3c3e1f88/power"
role = "appliance"
```

**Preuve :** `GET /api/energy` → compteur `{id: "pompe_piscine", name: "Lave-Vaisselle"}` ;
plus aucune occurrence « Pompe Piscine ».

> ⚠️ `id` laissé inchangé : c'est la clé de l'historique dans `data/energy.db`. Seul le
> libellé change.

## P3 — `home.json` : retrait de `outdoor.pool_pump`

`data/home.json` (backup `data/home.json.bak-prelavevaisselle`) : suppression de
`outdoor.pool_pump = "z2m:0xa4c138bb3c3e1f88"` (référence fausse : la prise est le
lave-vaisselle, et aucune pompe n'est dans Moli). Ajout au passage de `outdoor.tempo`
(cf. `tempo-plugin.md`).

> **Backups home.json distincts :** ce pas a écrit `home.json.bak-prelavevaisselle` ; le pas
> Tempo a écrit `home.json.bak-pretempo` (fichier différent). Les deux changements touchent le
> **même** `home.json` : le rollback d'un seul pas se fait avec **son** backup, sans écraser
> l'autre.

**Preuve :** `GET /api/home` → `outdoor.pool_pump = None` ; page `#/dehors` (snapshot DOM) :
la carte Piscine n'affiche **plus** de tuile « Pompe ». Le reste (Eau 15,3°,
Filtration, Jardin, Caméra) est inchangé.

## Rollback

1. Appareil : `PUT /api/labels/z2m:0xa4c138bb3c3e1f88 {"name": ""}` (revient au nom natif)
   ou reposer « Prise Piscine Zigbee ».
2. Compteur : `cp data/moli.toml.bak-prelavevaisselle data/moli.toml`, `restart`.
3. `home.json` : `cp data/home.json.bak-prelavevaisselle data/home.json` (retire
   `pool_pump` ; laisse `outdoor.tempo` intact — celui-ci relève du pas Tempo).

## Reste à trancher (hors périmètre ici)

- Le nom natif z2m côté Zigbee2MQTT reste « Prise Piscine Zigbee » ; on peut l'aligner
  dans Zigbee2MQTT (`friendly_name`) pour cohérence, côté HA/z2m.
- La vraie pompe piscine (Z-Wave) n'est pas dans Moli ; l'intégrer demanderait un driver
  Z-Wave (cf. `zwave-moli.md`, postponed).
