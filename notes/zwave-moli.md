# Z-Wave → Moli OS — étude / report

**Date :** 2026-10-16 · **Statut :** **postponed** (jugé trop complexe pour la fenêtre courante).
**Déclencheur :** la vraie pompe de filtration est un appareil **Z-Wave** (`switch.prise_piscine_2`),
que Moli ne sait pas piloter (cf. `notes/dehors.md`, D5).

## Constat de départ

- `switch.prise_piscine_2` (« Prise Piscine ») = device **Z-Wave JS** :
  identifiers `[['zwave_js', '4116689769-11']]`. C'est ce switch que pilote l'automation HA
  `Piscine - Gestion Pompe Intelligente v6` (actions `switch.turn_on` / `switch.turn_off`).
- Le device Moli `z2m:0xa4c138bb3c3e1f88` (« Prise Piscine Zigbee ») correspond côté HA à
  `switch.prise_pompe_piscine` (MQTT / Zigbee2MQTT), dont le **nom convivial HA est trompeur**
  (« Prise Lave Vaisselle »). **Ce n'est pas** la pompe Z-Wave.
- Moli n'a **aucune** intégration Z-Wave : `integrations/` = z2m, hue, frigate, tuya, bambu,
  esphome, tapo, etc. Pas de `zwave`.

## Infra Z-Wave existante

- **Addon HA** `core_zwave_js`, state `started`, contrôleur sur USB `/dev/serial/by-id/usb-0658_0200-if00`.
- Websocket **interne** `ws://core-zwave-js:3000`. Config addon : `network: {"3000/tcp": null}` →
  **non mappé sur l'hôte**. Depuis Moli (`192.168.1.78:3000`) : **port fermé**.
- **Décision utilisateur** : ne pas déporter la clé Z-Wave (HA reste maître), et viser **écriture**
  (pas seulement lecture). → exclut la migration USB directe vers Moli.

## Réseau (8 nodes)

| Node | Nom | Type | Entities clés |
|------|-----|------|---------------|
| 1 | Z-Stick Gen5 | contrôleur | status, stats |
| 2 | Devolo Salon | climat | `climate.devolo_alicia` |
| 6 | Thermo PC | thermostat | `sensor.thermo_pc_*` |
| 8 | Pop Salon | climat | `climate.pop_salon_2` |
| 9 | Prise PC | prise | `switch.prise_pc`, conso |
| 10 | Pop SDB | climat | `climate.pop_sdb*` |
| 11 | **Prise Piscine** | prise | `switch.prise_piscine_2`, conso |
| 12 | Room Thermostat | thermostat | `climate.room_thermostat` |

## Ampleur d'un pilote Moli (`crates/moli-zwave`)

1. **Protocole Z-Wave JS Server (websocket)** : `version`/`set_api_schema`, `start_listening`,
   inventaire des nodes, events d'exécution, `node.set_value`. Aucune dépendance WS dans le
   workspace (`Cargo.toml` racine) → à ajouter (`tokio-tungstenite`).
2. **Mapping Command Classes** par appareil : Binary Switch (0x25), Meter (0x32), Multilevel
   Sensor (0x31), Thermostat Setpoint/Mode (0x43/0x40), Battery (0x80), Notification (0x71)…
   → comparable à `moli-tuya` / `moli-hue` en volume, sinon plus (multi-types).
3. **Plomberie** : crate + entrée `KINDS` (`crates/moli-os/src/main.rs`) + membre workspace +
   paquet `integrations/zwave/` (manifeste, onboarding, fixtures) + `check-config`.
4. **Fork local** à maintenir (README : pas d'édition amont) ; remontée en PR.

## Prérequis bloquants

- **Exposer le websocket** : mapper `3000/tcp` de l'addon sur l'hôte (config addon + restart) ;
  HA garde le contrôle du contrôleur (pas de double maître).
- **Périmètre** : au-delà de la pompe, 5 clim/thermostats sont concernés — un driver partiel
  « juste la prise » serait bancal.

## Décision

**Postponed.** Coût élevé (WS + multi-CC + plomberie) pour une valeur limitée (les clim sont déjà
gérées côté HA). Reprise possible si : (a) l'addon expose son port, (b) le périmètre est cadré
(ex. prises + conso d'abord, clim ensuite).

## En attendant

La page `#/dehors` reste câblée sur `pool_pump = z2m:0xa4c138bb3c3e1f88` (prise **Zigbee**) —
**décision utilisateur du 2026-10-16 : garder la tuile telle quelle** en sachant que ce n'est pas
le switch Z-Wave de la pompe. La tuile reflète l'état de la prise Zigbee ; le pilotage réel de la
pompe (Z-Wave) reste assuré par l'automation HA.
