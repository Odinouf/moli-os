<script>
  // « Consigne chauffage » : one tap, three states, like the buttons on the
  // Home Assistant tablet. The valve (a SONOFF TRVZB) takes a mode and a
  // setpoint; the lit button is read back from the valve itself, so the bar
  // tells the truth even when the valve was changed by hand.
  import { home, value, act, pending } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  const heat = $derived(home.config?.heating ?? null);
  const id = $derived(heat?.valve ?? null);
  const confort = $derived(Number(heat?.confort ?? 18.5));
  const reduit = $derived(Number(heat?.reduit ?? 16));

  const mode = $derived(id ? value(id, 'system_mode') : null);
  const setpoint = $derived(id ? value(id, 'occupied_heating_setpoint') : null);
  const local = $derived(id ? value(id, 'local_temperature') : null);
  const busy = $derived(id ? (pending(id, 'system_mode') || pending(id, 'occupied_heating_setpoint')) : false);

  const near = (a, b) => a != null && Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) < 0.75;
  /** Which button is lit: read off the valve, never guessed. */
  const current = $derived(
    !id
      ? null
      : mode === 'off'
        ? 'arret'
        : near(setpoint, reduit)
          ? 'reduit'
          : near(setpoint, confort)
            ? 'confort'
            : null,
  );

  // Only « Arrêt » touches the mode. A setpoint written while the valve runs
  // its timetable (`auto`) is its native temporary override: it holds until
  // the next step, then the week takes over again.
  async function choose(choice) {
    if (!id) return;
    if (choice === 'arret') {
      act(`${id}/system_mode`, 'off', t('maison.accueil.chauffage_arret'));
      return;
    }
    const target = choice === 'confort' ? confort : reduit;
    // Two writes on a battery valve: the mode first, awaited, or the setpoint
    // can land while the valve is still shut and be ignored.
    if (mode === 'off') await act(`${id}/system_mode`, 'auto', t(`maison.accueil.chauffage_${choice}`));
    act(`${id}/occupied_heating_setpoint`, target, t(`maison.accueil.chauffage_${choice}`));
  }
</script>

{#if id}
  <section class="heating" aria-label={t('maison.accueil.chauffage')}>
    <span class="title">
      <Icon name="fire" size={15} />{t('maison.accueil.chauffage')}{#if local != null}<em class="num">{Math.round(Number(local))}°</em>{/if}
    </span>
    <div class="buttons" role="radiogroup" aria-label={t('maison.accueil.chauffage')}>
      <button role="radio" aria-checked={current === 'confort'} class:on={current === 'confort'} disabled={busy} onclick={() => choose('confort')}>
        {t('maison.accueil.chauffage_confort')}<small class="num">{confort}°</small>
      </button>
      <button role="radio" aria-checked={current === 'reduit'} class:on={current === 'reduit'} disabled={busy} onclick={() => choose('reduit')}>
        {t('maison.accueil.chauffage_reduit')}<small class="num">{reduit}°</small>
      </button>
      <button role="radio" aria-checked={current === 'arret'} class:on={current === 'arret'} disabled={busy} onclick={() => choose('arret')}>
        {t('maison.accueil.chauffage_arret')}
      </button>
    </div>
  </section>
{/if}

<style>
  .heating {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    min-width: 0;
  }

  .title {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink-3);
  }

  .title em {
    font-style: normal;
    color: var(--ink-2);
  }

  .buttons {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .buttons button {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    border-radius: 999px;
    padding: 0 12px;
    height: 36px;
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    background: var(--surface);
    color: var(--ink-3);
    box-shadow: var(--shadow);
    cursor: pointer;
    transition: background 0.2s var(--ease), color 0.2s var(--ease);
  }

  .buttons button small {
    font-weight: 600;
    opacity: 0.75;
  }

  .buttons button.on {
    background: var(--warm-soft);
    color: var(--warm-ink);
  }

  .buttons button:disabled {
    opacity: 0.55;
    cursor: default;
  }
</style>
