<script>
  // Le chauffage : les vannes thermostatiques de la maison, leur consigne,
  // et la table horaire de chacune — ou les automatisations qui les pilotent.
  import { home, heatingValves, act, pending } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from '../ui/Icon.svelte';
  import ValveCard from '../ui/ValveCard.svelte';

  const valves = $derived(heatingValves());

  // Presets existants (`home.config.heating`) : Confort / Réduit / Absent /
  // Vacances. Valeurs par défaut si la config n'en porte pas.
  const confort = $derived(Number(home.config?.heating?.confort ?? 18.5));
  const reduit = $derived(Number(home.config?.heating?.reduit ?? 16));
  const presets = $derived(
    home.config?.heating?.presets ?? {
      normal: { mode: 'heat', setpoint: confort },
      nuit: { mode: 'heat', setpoint: reduit },
      absent: { mode: 'off' },
      vacances: { mode: 'off' },
    },
  );
  const PRESET_ICON = { normal: 'home', nuit: 'moon', absent: 'lock', vacances: 'palm' };
  const presetName = (k) => {
    const key = `maison.accueil.mode.${k}`;
    const word = t(key);
    return word === key ? k : word;
  };
  const busy = $derived(valves.some((d) => pending(d.id, 'system_mode') || pending(d.id, 'occupied_heating_setpoint')));

  // The heating presets first, the ones that shut everything last: an `off`
  // preset is one mis-tap away from cooling the whole house on a battery
  // valve, so it sits at the end of the row and asks before writing.
  const order = $derived(
    Object.keys(presets).sort((a, b) => Number(presets[a].mode === 'off') - Number(presets[b].mode === 'off')),
  );

  let applied = $state(null);

  // Un preset s'applique en séquence, jamais en rafale : une valve sur pile.
  async function applyPreset(name) {
    const p = presets[name];
    if (!p) return;
    if (p.mode === 'off' && !confirm(t('maison.chauffage.preset_confirmer', { mode: presetName(name), n: valves.length }))) return;
    for (const d of valves) {
      await act(`${d.id}/system_mode`, p.mode, t('maison.chauffage.preset_action', { mode: presetName(name) }));
      if (p.setpoint != null) await act(`${d.id}/occupied_heating_setpoint`, p.setpoint, t('maison.chauffage.preset_action', { mode: presetName(name) }));
    }
    applied = t('maison.chauffage.preset_fait', { mode: presetName(name) });
    setTimeout(() => (applied = null), 6000);
  }
</script>

<div class="chauffage">
  <header>
    <h1 class="page-title">{t('maison.chauffage.titre')}</h1>
    <p class="page-sub">{t('maison.chauffage.sous_titre')}</p>
  </header>

  {#if valves.length}
    <section class="presets" aria-label={t('maison.accueil.mode_maison')}>
      <span class="lbl"><Icon name="fire" size={15} />{t('maison.chauffage.presets')}</span>
      <div class="row" role="group">
        {#each order as k (k)}
          <button onclick={() => applyPreset(k)} disabled={busy} title={t('maison.chauffage.preset_appliquer', { mode: presetName(k) })}>
            <Icon name={PRESET_ICON[k] ?? 'home'} size={15} />{presetName(k)}{#if presets[k].setpoint != null}<small class="num">{presets[k].setpoint}°</small>{/if}
          </button>
        {/each}
      </div>
      {#if applied}<span class="muted small">{applied}</span>{/if}
    </section>

    <div class="valves">
      {#each valves as d (d.id)}
        <ValveCard id={d.id} />
      {/each}
    </div>
  {:else}
    <section class="card empty">
      <Icon name="radiator" size={26} />
      <p>{t('maison.chauffage.aucune')}</p>
    </section>
  {/if}
</div>

<style>
  .chauffage {
    display: grid;
    gap: 22px;
  }

  .presets {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .presets .lbl {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink-3);
  }

  .presets .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .presets button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 999px;
    padding: 0 14px;
    height: 36px;
    background: var(--surface);
    color: var(--ink-2);
    box-shadow: var(--shadow);
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
  }

  .presets button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .presets small {
    opacity: 0.75;
  }

  .valves {
    display: grid;
    gap: 16px;
  }

  .empty {
    display: grid;
    place-items: center;
    gap: 10px;
    padding: 40px;
    color: var(--ink-3);
    text-align: center;
  }
</style>
