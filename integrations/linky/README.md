# linky

Driver `linky` : lit la consommation électrique Linky/Tempo publiée par Home
Assistant sous `moli/linky/#` et l'expose comme appareil Moli.

- Crate : `crates/moli-linky`.
- Transport : MQTT (même broker que `z2m`).
- Côté HA : automatisation `ha-moli-linky-bridge.json` (publie en retenu).

Voir `onboarding.md` pour la mise en service.
