# Chauffage — gestion des TRV (vannes thermostatiques)

Page **Chauffage** dans le dashboard Moli : consigne, table horaire hebdomadaire et
choix de qui pilote la vanne. Patch `notes/patches/chauffage-trv.patch`, appliqué
sur la base `tablette2025-parity` + `accueil-plan-scale` + `accueil-plan-hero` +
`accueil-plan-pins`.

## État relevé (CT125, 2026-10-19)

Une seule TRV dans la maison, sur le driver `z2m` :

| Élément | Valeur |
|---|---|
| Appareil | `z2m:0x286847fffe96a2cd` — SONOFF **TRVZB** |
| Points | 29 (dont 7 × `weekly_schedule_<jour>` en text) |
| `system_mode` | enum `off` / `auto` / `heat`, **écrivable** |
| `occupied_heating_setpoint` | numeric 4–35, pas 0.5, **écrivable** |
| `local_temperature` | 22.8 °C (lecture) |
| `battery` | **12 %** (lecture) |
| `running_state` | `idle` |

`home.config.heating` porte `valve`, `confort=18.5`, `reduit=16`. Les presets de la
page ont été ajoutés dans `data/home.json` (sauvegarde `home.json.bak-chauffage-presets`) :

```json
"presets": {
  "normal":   { "mode": "heat", "setpoint": 18.5 },
  "nuit":     { "mode": "heat", "setpoint": 16 },
  "absent":   { "mode": "off" },
  "vacances": { "mode": "off" }
}
```

Le code retombe sur `confort`/`reduit` si `presets` est absent, donc rien ne casse
en cas de restauration d'un `home.json` plus ancien.

Format de la table horaire, tel que la valve l'échange :
`00:00/16 07:00/19 10:00/16 10:00/16 17:00/19 23:00/16` — jusqu'à 6 paliers,
granularité 15 min, degrés par pas de 0.5 (doublons tolérés en lecture).

## Ce que fait le patch

**Serveur : rien.** Aucun fichier `crates/` n'est touché : le driver z2m transporte
déjà `Value::Text` vers `weekly_schedule_*` (spike ci-dessous).

**Dashboard :**

- `web/src/maison/lib/schedule.js` — module pur (aucune dépendance Svelte) :
  `parseSchedule`, `normalize`, `formatSchedule`, `neutralize`, `isFlat`,
  `blockAt`, `nextTransition`, `insertBlock`, `moveBlock`, `removeBlock`,
  `setDegree`, `validate`, `bounds`, `hhmm`, `minutesOf`.
- `web/src/maison/lib/schedule.test.js` — 17 tests (`npm test`).
- `web/src/maison/pages/Chauffage.svelte` — page `#/chauffage`, découverte auto
  des vannes, presets maison appliqués **en séquence** (jamais en rafale).
- `web/src/maison/ui/ValveCard.svelte` — une vanne : température de pièce,
  alerte pile < 20 %, sélecteur **Programme ⇄ Automatisations**, stepper de
  consigne, Confort/Réduit, bouton « Neutraliser le programme ».
- `web/src/maison/ui/ScheduleEditor.svelte` — éditeur hebdomadaire : 7 pistes
  24 h, poignées déplaçables, insertion au clic, stepper ±0.5°, aplatir / copier
  au jour suivant / appliquer à toute la semaine, enregistrement explicite.
- `web/src/maison/ui/ClimateCard.svelte` — **correction** : une TRV n'expose pas
  `target_temperature` mais `occupied_heating_setpoint` ; la carte était donc
  en lecture seule et proposait les modes d'un split.
- `web/src/maison/ui/HeatingBar.svelte` — **aligné** sur la variante B (voir §).
- `web/src/maison/lib/home.svelte.js` — `heatingValves()`, `setpointKey()`.
- `Maison.svelte` (nav + route), `icons.js` (`copy`, `undo`), locales fr/en.

## Variante B — qui écrit quoi

| Geste | Écriture |
|---|---|
| Tableau horaire (Programme) | `weekly_schedule_<jour>` ; `system_mode` reste `auto` |
| Confort / Réduit (carte et bandeau Accueil) | `occupied_heating_setpoint` **seul** → override temporaire natif, jusqu'au palier suivant |
| Arrêt | `system_mode=off` |
| Passer en Automatisations | `system_mode=heat` (la table reste visible, gelée) |
| Neutraliser | un palier unique par jour à la consigne courante |

Conséquence : plus personne n'écrit `system_mode=heat` pour « chauffer un peu » —
c'était le comportement du bandeau avant ce patch (variante A), il sortait la vanne
de son programme. Les boutons Confort/Réduit se **grisent** quand un palier tombe
dans les 15 minutes (l'override serait écrasé aussitôt) et, à l'intérieur d'un
horaire, l'éditeur passe en lecture seule.

Aucun automatisme n'est fourni : c'est l'utilisateur qui en écrit si la vanne
n'est pas sur son programme.

## Spike — le driver transporte-t-il bien le texte ?

Avant d'écrire l'éditeur, la question était : le pont z2m de Moli accepte-t-il
d'écrire un point `text` comme `weekly_schedule_monday` ?

Écriture de `00:00/16.5 07:00/19.5 10:00/16.5 17:00/19.5 23:00/16.5` sur
`weekly_schedule_monday` : HTTP 200, `{"ok":true}`, relecture **identique**.
`system_mode` passé à `auto` : HTTP 200. Puis le jour restauré à son texte
d'origine et vérifié relu à l'identique. Conclusion : aucun correctif serveur
n'était nécessaire.

## Vérifications de bout en bout (navigateur, contre la prod)

Playwright sur `http://192.168.1.125:8790/#/chauffage` :

| Ce qui est vérifié | Résultat |
|---|---|
| Page, rail, 7 pistes, 35 paliers | 1 carte, 7 pistes, en-tête « Chauffage » |
| Sélecteur Programme ⇄ Automatisations | bascule réelle `system_mode` (`auto` ⇄ `heat`), libellé d'état qui suit |
| En Automatisations | piste en lecture seule, 0 poignée active, « Neutraliser le programme » visible, lien `#/automatismes` |
| En Programme | 28 poignées actives, barre Enregistrer/Annuler, 14 boutons de masse |
| Clic sur piste vide (62 %) | insère un palier, badge passe à « Modifié » |
| Annuler | revient au texte de la valve, badge « À jour » |
| Enregistrer | POST 200 sur `weekly_schedule_<jour>`, une écriture ; relu identique côté valve |
| Aucune erreur JS | 0 `pageerror` après correction des effets |

### Trois bugs trouvés par ces tests (et corrigés)

1. **`effect_update_depth_exceeded`** — deux `$effect` réassignaient l'état qu'ils
   lisaient. `reload()` ne part plus que si la clé des jours change ; la
   réconciliation ne réassigne que si un jour a réellement changé d'état.
2. **`removeEventListener` sur `null`** — `dragStart` gardait `e.currentTarget`,
   nul au `pointerup` : le clic sur une poignée plantait au lieu de la sélectionner.
   La poignée est désormais capturée avant l'écoute.
3. **Micro-déplacement au clic** — sans seuil, le tremblement d'un doigt déplaçait
   un palier d'un quart d'heure et fusionnait son voisin. Seuil de 4 px avant de
   traiter la pression comme un glissement.

Le marqueur d'attente ne peut pas s'appuyer sur l'horodatage du point : le driver
rejoue tout son cache au reconnect avec le même `ts`. Un jour se règle donc sur
« le texte a bougé » **ou** au bout de 5 minutes, jamais instantanément.

⚠️ **Les tests d'écriture doivent viser la prod** (`192.168.1.125:8790`), pas le
serveur de dev : le proxy Vite présente une autre `Origin` et Moli répond
`403 cross-site request refused`.

## Preuves de déploiement (2026-10-19)

```sh
ssh moli-os 'cd /opt/moli-os && git apply --check /tmp/chauffage-trv.patch'   # APPLY_OK
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'
ssh moli-os 'curl -s http://127.0.0.1:8790/api/health'                        # drivers_running 14, journal_failures 0
```

Bundle servi (`index-BvEmRSS2.js`) : contient `Neutraliser le programme`,
`Qui pilote`, `chauffage.palier_proche`, `chauffage.neutraliser_aide`,
`weekly_schedule_${…}` et les 3 écritures `auto`/`heat`/`off`.

État de la vanne relu en SSE (`/api/events`) après redéploiement :
`system_mode=off`, `occupied_heating_setpoint=13`, `local_temperature=22.8`,
`battery=12`, `running_state=idle`, `weekly_schedule_monday` inchangé.

**Correctifs de revue (2026-10-19), redéployés et re-mesurés :**

- `off` a son propre onglet (Programme / Automatisations / **Éteinte**) : `managed` ne
  vaut plus que `mode === 'heat'`, plus de « vos automatisations décident » sur une vanne
  fermée, et « Remettre en route » ramène à `auto`. Vérifié : `aria-checked` = Éteinte.
- « Neutraliser le programme » demande confirmation (« Écrire une consigne unique de
  12.5° sur 7 jour(s) ? ») et affiche `chauffage.neutraliser_fait` ensuite.
- Les presets sont rangés chauffage d'abord, `off` en dernier, avec confirmation sur
  « Absent » / « Vacances » et le retour « Appliqué : … ».
- Le repère « maintenant » est dessiné **toujours** : 7 marqueurs `.now` mesurés en prod
  (il ne sortait qu'après le dernier palier de la journée).
- La piste de la table horaire répond à Entrée/Espace (`addByKey`), plus seulement au
  pointeur.
- `HeatingBar.choose()` est `async` et attend l'écriture de `system_mode` avant celle de
  la consigne : plus deux écritures non séquencées sur une valve à 12 %.
- L'attente « la valve répond » est bornée par un `setTimeout` par jour envoyé, nettoyé
  au règlement : plus de « … » éternel.
- Code mort retiré (`value`/`nameOf` dans `Chauffage`, `normalize`/`isFlat` dans
  `ScheduleEditor`, clé `chauffage.titre_page`) ; `validate()` est branché sur
  l'enregistrement (jours invalides bloqués et signalés) ; `setpointKey` est réutilisé
  par `ClimateCard`.

## Vérifications locales

```sh
cd web && npm test     # 33/33 (17 schedule + 16 voice)
cd web && npm run build   # OK
```

`npm run check` n'existe pas dans ce dépôt (scripts : `dev`, `build`, `test`) —
la validation svelte est portée par `npm run build`.

## Rollback

```sh
ssh moli-os 'cd /opt/moli-os && git apply -R /tmp/chauffage-trv.patch'
ssh moli-os 'cd /opt/moli-os && docker compose build && docker compose up -d --force-recreate'
```

Le patch est purement dashboard (`web/`, `locales/`) : aucun état serveur, aucune
migration de données. Les tables horaires écrites sur la valve, elles, restent en
place — c'est la valve qui les porte.

## Pièges

- **Une valve sur pile écrit cher.** L'éditeur n'envoie que les jours réellement
  modifiés, et la page attend l'accusé entre deux écritures.
- **Écritures async sans `await`.** `act()` n'est pas bloquant : deux écritures
  rapprochées peuvent arriver dans le désordre. Tout est séquencé (`await`).
- **Les tests du module** tournent sans Svelte (`node --test`), donc
  `schedule.js` ne doit jamais importer d'état réactif.
