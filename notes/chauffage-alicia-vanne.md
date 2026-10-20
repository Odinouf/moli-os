# Chauffage Alicia — la vanne reprend la main

Date : 2026-10-20
Vanne : `z2m:0x286847fffe96a2cd` (SONOFF TRVZB, « TRV Zigbee 2025 »)
Capteur de recoupement : `z2m:0x00158d00044a53c2` (Aqara, « Alicia »)

## L'incident

Le 2026-10-06, le chauffage d'Alicia ne s'est pas déclenché. Cause : le capteur
Aqara s'est **figé à 25,87 °C pendant 14 h 30** alors que la pièce était à ~22,6 °C.
La vanne, réglée sur `temperature_sensor_select=remote_temperature`, recevait cette
valeur par `external_temperature_input` et **echoait** un chiffre plausible donc
indétectable par un simple seuil : au-dessus de la consigne, elle restait fermée.

Le défaut n'est pas le capteur : c'est d'avoir fait d'une mesure distante
**le contrôle** de la vanne au lieu d'un simple recoupement.

## Ce qui a changé

### La vanne régule sur son propre capteur

`temperature_sensor_select=local_temperature`. Moli n'écrit plus jamais
`external_temperature_input` ni `temperature_sensor_select` (hors installation
initiale, en `cli`). Si Moli tombe, la vanne reste autonome sur son programme natif.

`local_temperature_calibration` reste à `0` : la calibration mesurée est inutile.
Sur 48 h d'historique Moli (`/api/history?point=…&hours=48`) :

| État d'Alicia | n | TRV − Alicia moyen | écart-type | min | max |
|---|---|---|---|---|---|
| vivante | 7 | **−0,02 °C** | 0,00 | −0,02 | +0,02 |
| figée à 25,87 | 288 | −1,04 °C | 1,35 | −3,07 | +0,83 |

Les deux capteurs sont d'accord à 0,02 °C quand Alicia parle. Le « biais
+1,14 °C » observé plus tôt n'était que l'artefact du gel.

### Le planning vit dans la vanne

Les 7 `weekly_schedule_<jour>` sont écrits côté appareil (via l'API Moli, origine
`cli`), et `system_mode=auto` laisse la valve décider :

```
lun|mar|jeu|ven : 00:00/18.5  07:30/16.5  19:30/18.5
mer|sam|dim     : 00:00/18.5  07:30/16.5  19:00/18.5
```

La TRVZB padde à 6 blocs en répétant le dernier palier (`19:30/18.5` ×3) : c'est
son comportement natif, sans effet sur la régulation.

Conséquence utile : **écrire `system_mode=auto` restaure la consigne du planning**
sans que Moli ait à la recalculer. Testé — absence à 16 °C → `auto` → la valve
recalcule 16,5 °C seule.

### Trois automatismes Moli remplacent la régulation HA

| id | déclencheur | condition | action |
|---|---|---|---|
| `presence-alicia-absente` | toutes les 15 min | Poele muet 4 h **et** Couloir muet 4 h **et** 07:30–19:30 | `occupied_heating_setpoint = 16` |
| `presence-alicia-retour` | mouvement Poele **ou** Couloir | `system_mode ≠ auto` | `system_mode = auto` |
| `garde-fou-alicia-figee` | toutes les 15 min | Alicia muette > 2 h | notification maison |

Les deux automatismes de présence sont **bornés à la plage 07:30–19:30** : hors de
cette plage, le planning de la vanne est seul maître. `presence-alicia-retour`
n'écrit **que** `system_mode=auto` (idempotent, gardé par `system_mode ≠ auto`) —
il ne touche jamais la consigne, donc il ne peut pas combattre le planning.

> Piège corrigé en cours de route : la première version de `presence-alicia-retour`
> écrivait `occupied_heating_setpoint = 18.5` à chaque mouvement. Le capteur Poele
> oscille toutes les ~20 s : l'automatisme tirait en boucle et écrasait le palier
> 16,5 du planning. Remplacé par `system_mode=auto`.

### Home Assistant ne pilote plus rien

Tout est `off`, et le « Better Thermostat » d'Alicia est **désactivé au niveau du
config entry** (`disabled_by=user`, `state=not_loaded`) :

- `automation.planning_chauffage_alicia`, `regulation_chauffage_alicia`,
  `calibration_trv_alicia`, `basculer_consigne_alicia_reduit_si_pas_de_presence_depuis_2h`,
  `changement_consigne_chauffage_globale`
- `automation.desactiver_planning_interne_trv_alicia` — **était `on`** et forçait
  `system_mode=heat`, annulant le programme natif de la valve
- `switch.schedule_consigne_alicia_ouvre`, `switch.schedule_consigne_alicia_presence`
- `climate.thermostat_alicia`
- config entry Better Thermostat Alicia `01KARREVEVKNY75SD7S8P5NJC6`

« Better Salon » (`01KARRNV63BNCD2BSFTGYCQGBZ`) est **laissé actif** : autre pièce,
hors périmètre.

#### Le writer fantôme

Après extinction des entités, la vanne revenait deux fois à
`temperature_sensor_select=remote_temperature` puis `system_mode=heat`. Moli
n'avait rien écrit (journal sans entrée correspondante) : le coupable était
**Better Thermostat**, qui relaie la température du capteur externe vers la vanne.

Identifié sans SSH sur HA (la clé publique n'y est pas déposée) via l'API REST :
les deux entités `climate.better_alicia` et `climate.trv_zigbee_2025` portaient le
**même `context_id`** (`01M5D2X3S0VHKJ49SW4FTKB8XY`) au même instant. Neutralisé
par WebSocket (`config_entries/disable`), l'API REST n'exposant pas les config
entries.

Depuis 17:02:32, le logbook HA ne contient plus aucune écriture vers la vanne :
seules des entrées `auto` sans `context_domain`, c'est-à-dire des états restaurés
par l'appareil, pas des commandes.

## Preuves

| Critère | Preuve |
|---|---|
| Vanne autonome | `temperature_sensor_select=local_temperature`, `local_temperature_calibration=0`, `system_mode=auto` |
| Moli n'écrit que 4 points | journal 113,6 h : 53 entrées d'origine `automation`, **0 échec**, points = `occupied_heating_setpoint`, `system_mode` |
| Garde-fou réel | runs 18:45 et 19:00 (`dry=False`), condition vraie, message délivré — Alicia muette depuis 209 min, pile à 100 % |
| `running_state` suit | repos (`auto`/16,5, pièce 20,3) → `idle` ; consigne 25 → `heat` ; retour `auto` → 16,5 → `idle` |
| HA muet | 6 automations + 2 switchs + 1 thermostat `off`, BT Alicia `not_loaded`, logbook vide d'écritures depuis 17:02:32 |

## Points ouverts

1. **Capteur Parents** `hue:6a3105f8-7d47-43d7-a6e8-63ec6f26012c` : pile à 0 %,
   `online: False`, `motion` figée depuis 70 h. Volontairement **exclu** de
   `presence-alicia-absente` — l'inclure rendrait « personne à la maison »
   perpétuellement vrai et bloquerait la consigne à 16 °C. **À remplacer.**
2. **Alicia muette depuis 3 h 30** avec la pile à 100 % : incident Zigbee
   (portée, routeur, ou rejoin), pas une panne de pile. À investiguer.
3. **PR amont** : le moteur Moli ne savait pas exprimer « ce capteur ne dit plus
   rien ». Ajouté en amont sous `Rule::Stale { point, for_s }` — voir
   `notes/patches/moteur-stale-rule.patch` et la PR
   [rudy-io/moli-os#9](https://github.com/rudy-io/moli-os/pull/9). La règle est
   déjà compilée et déployée sur le CT125 (build local du patch).
