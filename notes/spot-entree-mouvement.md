# Spot entrée sur mouvement — migration HA → Moli OS

Date : 2026-10-20
Automation Moli : `spot-entree-sur-mouvement` — live, approuvée (fingerprint `f82fb1fbc9f75d1903e2fe7abc194509082413e6b84f18cddc1fee47505a76e2`).

## Contexte

Remplace deux automations Home Assistant qui fonctionnaient mal :

- `automation.allumer_lampe_entree_quand_mvt_detecte` (diagnostiquée, désactivée)
- `automation.allumer_et_eteindre_lampe_entree_sur_mouvement` (déjà off, laissée off)

Les deux sont désormais `off` dans HA, ce qui évite un double pilotage du switch.

## Mapping des entités

| Home Assistant | Moli OS | Notes |
|---|---|---|
| `binary_sensor.capteur_exterieur_entree_hue_motion` | `hue:c2d9d2a6-35aa-45ed-b983-fddbd880d08c/motion` | Hue « Capteur grange », room Entree |
| `sensor.capteur_exterieur_entree_hue_illuminance` | `hue:c2d9d2a6-35aa-45ed-b983-fddbd880d08c/illuminance` | non utilisée (voir décision) |
| `switch.spot_exterieur` | `z2m:0xe0798dfffec9ae8f/state` | SONOFF ZBMINI, room Entree |

Correspondance établie par les `identifiers` de l'entité HA (device `f5af3369f74d13983ec16efc9103f512` → `["hue","c2d9d2a6-35aa-45ed-b983-fddbd880d08c"]`) et par le `unique_id` z2m IEEE `0xe0798dfffec9ae8f`.

## Graphe

```
when_state(motion → true) → if(sun is night)
      ├─ yes → set(spot.state → true) → wait(180 s) → set(spot.state → false)
      └─ no  → fin
mode: restart
```

Résumé généré par Moli : « Quand Capteur Extérieur détecte un mouvement, si il fait nuit : allumer Spot Exterieur, puis attendre 3 min, puis éteindre Spot Exterieur. »

## Décisions de conception

1. **Aucun seuil de luminosité.** L'automation HA utilisait `illuminance < 100` en OR avec `illuminance < 50`, et s'allumait en plein jour. Mesures réelles sur le capteur (sous auvent ombragé) : 08:32 → 30 lx, 08:58 → 48 lx (spot allumé, plein soleil), 09:46 → 236 lx, 11:18 → 505 lx ; nuit → 1–4 lx. Les plages se recouvrent, un seuil fixe est structurellement inutilisable à cet emplacement. `sun is night` est déterministe et suffisant.

2. **`wait(180)` + `mode: restart`** remplace le couple `wait_for_trigger` (motion off 8 min) + timeout 10 min de HA. En HA, chaque nouveau déclenchement annulait le wait et l'extinction ne tombait jamais à 8 min mais au timeout de 10 min (constaté : allumé 08:58:39 → éteint 09:08:56). En `restart`, chaque nouveau mouvement relance le graphe et donc les 3 minutes : l'extinction suit bien le dernier mouvement.

3. **Points, pas de `device_id`.** L'ancienne automation `allumer_et_eteindre_lampe_entree_sur_mouvement` ciblait la lampe par `device_id`, ce qui la rendait opaque et fragile. Ici tout est adressé par point.

## Avertissement : instabilité Zigbee2MQTT

`switch.spot_exterieur` (SONOFF ZBMINI, IEEE `0xe0798dfffec9ae8f`) a produit **plus de 60 transitions `unavailable` en 7 jours** (00:23, 06:00, 06:04, 15:04, 18:00, 18:58, 19:01, …), avec un LQI à 48.

Conséquence : cette automation Moli est vulnérable de la même façon. Un ordre d'allumage émis pendant une fenêtre `unavailable` est perdu sans reprise, et l'extinction à +3 min échouera de la même manière. **Le problème de fond n'est pas la logique d'automatisation mais la liaison radio du switch** — à traiter séparément (routeur Zigbee plus proche, remplacement du module, ou vérification de l'alimentation).

## Validation

- `POST /api/automations/check` → `problems: []`
- `POST /api/automations/{id}/test` → `dry: true`, `status: done`, arrêt sur `c1` (`sun is night` = false de jour), état du switch inchangé
- Approbation via session humaine (PIN), `live: true`, `approved: true`, `enabled: true`

## Sécurité

Le PIN Moli a été saisi en clair dans une conversation pendant l'opération. **Il doit être changé.**
