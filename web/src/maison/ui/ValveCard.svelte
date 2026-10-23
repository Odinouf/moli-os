<script>
  // One thermostatic valve: what it reads, what it does, and who runs it —
  // the built-in timetable or the household's automations.
  import { value, reachable, pending, act, nameOf, home, historyOf } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';
  import ScheduleEditor from './ScheduleEditor.svelte';
  import { parseSchedule, nextTransition, hhmm, neutralize, formatSchedule, isFlat, DAYS } from '../lib/schedule.js';

  let { id } = $props();

  const setpoint = $derived(value(id, 'occupied_heating_setpoint'));
  const local = $derived(value(id, 'local_temperature'));
  const mode = $derived(value(id, 'system_mode'));
  const running = $derived(value(id, 'running_state'));
  const battery = $derived(value(id, 'battery'));
  const open = $derived(value(id, 'valve_opening_degree'));
  const quality = $derived(value(id, 'linkquality'));
  const busy = $derived(pending(id, 'system_mode') || pending(id, 'occupied_heating_setpoint'));
  const online = $derived(reachable(id));

  // Three states, said as three states: `auto` runs the valve's own weekly
  // timetable, `heat` hands the setpoint to the household's automations,
  // and `off` heats nothing at all — folding `off` under « Automatisations »
  // told the household its automations decide while the valve was shut.
  const autoRun = $derived(mode === 'auto');
  const managed = $derived(mode === 'heat');
  const shut = $derived(mode === 'off');
  const low = $derived(typeof battery === 'number' && battery < 20);

  const days = $derived(
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => ({ day, text: value(id, `weekly_schedule_${day}`) })),
  );
  const hasSchedule = $derived(days.some((d) => typeof d.text === 'string' && d.text.trim()));

  // The household's two quick temperatures, straight from the config the
  // heating bar already uses — one source of truth for both surfaces.
  const confort = $derived(Number(home.config?.heating?.confort ?? 18.5));
  const reduit = $derived(Number(home.config?.heating?.reduit ?? 16));

  // Today's timetable, so a quick setpoint knows when it would be overrun.
  const today = $derived(value(id, `weekly_schedule_${DAYS[(new Date().getDay() + 6) % 7]}`));
  const soon = $derived(
    (() => {
      if (!autoRun || typeof today !== 'string') return null;
      const blocks = parseSchedule(today);
      if (blocks.length < 2) return null;
      const now = new Date().getHours() * 60 + new Date().getMinutes();
      const next = nextTransition(blocks, now);
      if (!next || next.min - now > 15 || next.min - now <= 0) return null;
      return next;
    })(),
  );

  const near = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 0.25;

  let neutralizing = $state(false);
  let done = $state(null);

  const stepDeg = (dir) => act(`${id}/occupied_heating_setpoint`, Math.round(((setpoint ?? 16) + dir * 0.5) * 2) / 2, t('maison.chauffage.consigne_action', { name: nameOf(id) }));
  const setMode = (m) => act(`${id}/system_mode`, m, t('maison.chauffage.mode_action', { name: nameOf(id) }));

  // A quick setpoint only writes the setpoint: `system_mode` stays `auto`, so
  // the valve's own « override until the next step » rule applies.
  const hold = (deg) => act(`${id}/occupied_heating_setpoint`, deg, t('maison.chauffage.consigne_action', { name: nameOf(id) }));

  async function saveDays(list) {
    for (const d of list) await act(`${id}/weekly_schedule_${d.day}`, d.text, t('maison.chauffage.table.envoi_jour', { jour: t(`maison.chauffage.jour.${d.day}`) }));
  }

  /** Flattens every day to one constant step: what stops an old timetable
   *  from waking up if the valve is put back on « Programme » later. */
  async function neutralizeAll() {
    const deg = Number(setpoint) || 16;
    const text = formatSchedule(neutralize(deg));
    const daysToWrite = days.filter((d) => !isFlat(parseSchedule(d.text ?? '')) || d.text !== text);
    if (!daysToWrite.length) return;
    // Up to seven writes on a battery valve: ask once, then say what happened.
    if (!confirm(t('maison.chauffage.neutraliser_confirmer', { n: daysToWrite.length, deg }))) return;
    neutralizing = true;
    try {
      await saveDays(daysToWrite.map((d) => ({ day: d.day, text })));
      done = t('maison.chauffage.neutraliser_fait');
    } finally {
      neutralizing = false;
      setTimeout(() => (done = null), 6000);
    }
  }
</script>

<section class="valve" class:off={mode === 'off'} class:stale={!online}>
  <header>
    <h3><Icon name="radiator" size={18} />{nameOf(id)}</h3>
    {#if local != null}
      <button class="room num live" title={t('maison.historique.ouvrir', { name: `${nameOf(id)} · ${t('maison.chauffage.piece')}` })} aria-label={t('maison.historique.ouvrir', { name: `${nameOf(id)} · ${t('maison.chauffage.piece')}` })} onclick={() => historyOf(id, 'local_temperature')}>{Math.round(Number(local))}°</button>
    {:else}
      <span class="room num" title={t('maison.chauffage.piece')}>—</span>
    {/if}
    {#if low}
      <span class="warn" title={t('maison.chauffage.pile_basse', { pct: battery })}><Icon name="alert" size={15} />{battery} %</span>
    {/if}
    {#if !online}<span class="muted small">{t('maison.chauffage.hors_ligne')}</span>{/if}
  </header>

  <div class="who" role="radiogroup" aria-label={t('maison.chauffage.qui_pilote')}>
    <button role="radio" aria-checked={autoRun} class:on={autoRun} disabled={busy} onclick={() => setMode('auto')}>
      <Icon name="clock" size={15} />{t('maison.chauffage.table_titre')}
    </button>
    <button role="radio" aria-checked={managed} class:on={managed} disabled={busy} onclick={() => setMode('heat')}>
      <Icon name="robot" size={15} />{t('maison.chauffage.automatisations')}
    </button>
    <button role="radio" aria-checked={shut} class:on={shut} class:shut disabled={busy} onclick={() => setMode('off')}>
      <Icon name="power" size={15} />{t('maison.chauffage.mode_off_titre')}
    </button>
  </div>
  <p class="hint">
    {autoRun ? t('maison.chauffage.hint_auto') : managed ? t('maison.chauffage.hint_auto_off') : t('maison.chauffage.hint_off')}
    {#if managed}<a href="#/automatismes">{t('maison.chauffage.vers_automatismes')}</a>{:else if shut}<button class="relight" onclick={() => setMode('auto')}>{t('maison.chauffage.rallumer')}</button>{/if}
  </p>

  <div class="setpoint" role="group" aria-label={t('maison.chauffage.consigne')}>
    <button onclick={() => stepDeg(-1)} disabled={busy || setpoint <= 4} aria-label={t('commun.clim.moins_chaud')}>−</button>
    <b class="num">{setpoint != null ? `${setpoint}°` : '—'}</b>
    <button onclick={() => stepDeg(1)} disabled={busy || setpoint >= 35} aria-label={t('commun.clim.plus_chaud')}>+</button>
    <span class="state">{t('maison.chauffage.mode_' + (mode ?? 'inconnu'))}</span>
    {#if running === 'heat'}<span class="chip warm">{t('maison.chauffage.chauffe')}</span>{:else}<span class="chip">{t('maison.chauffage.repos')}</span>{/if}
    {#if open != null}<span class="muted small">{t('maison.chauffage.ouverture', { pct: open })}</span>{/if}
    {#if quality != null}<span class="muted small">{t('maison.chauffage.signal', { lqi: quality })}</span>{/if}
  </div>

  <div class="quick" role="group" aria-label={t('maison.chauffage.consignes_rapides')}>
    <button class:on={near(setpoint, confort)} disabled={busy || !!soon} onclick={() => hold(confort)} title={soon ? t('maison.chauffage.palier_proche', { heure: hhmm(soon.min) }) : t('maison.chauffage.consigne_action', { name: nameOf(id) })}>
      {t('maison.accueil.chauffage_confort')}<small class="num">{confort}°</small>
    </button>
    <button class:on={near(setpoint, reduit)} disabled={busy || !!soon} onclick={() => hold(reduit)} title={soon ? t('maison.chauffage.palier_proche', { heure: hhmm(soon.min) }) : t('maison.chauffage.consigne_action', { name: nameOf(id) })}>
      {t('maison.accueil.chauffage_reduit')}<small class="num">{reduit}°</small>
    </button>
    {#if soon}<span class="muted small">{t('maison.chauffage.palier_proche', { heure: hhmm(soon.min) })}</span>{/if}
  </div>

  {#if managed && hasSchedule}
    <div class="neutral">
      <button onclick={neutralizeAll} disabled={busy || neutralizing} title={t('maison.chauffage.neutraliser_aide')}>
        <Icon name="undo" size={15} />{neutralizing ? t('maison.chauffage.table.envoi') : t('maison.chauffage.neutraliser')}
      </button>
      {#if done}<span class="muted small">{done}</span>{/if}
    </div>
  {/if}

  {#if hasSchedule}
    <ScheduleEditor
      {days}
      readOnly={!autoRun}
      onsave={saveDays}
      neutralDeg={Number(value(id, 'occupied_heating_setpoint')) || 16}
      {confort}
      {reduit}
    />
  {:else}
    <p class="muted small">{t('maison.chauffage.table_absente')}</p>
  {/if}
</section>

<style>
  .valve {
    display: grid;
    gap: 12px;
    padding: 16px 18px;
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .valve.stale {
    opacity: 0.6;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h3 {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }

  .room {
    margin-left: auto;
    font-size: 22px;
    font-weight: 300;
  }

  /* La température lue par la vanne ouvre son historique ; la consigne,
     elle, se règle plus bas. */
  .room.live {
    border: 0;
    padding: 2px 8px;
    margin-right: -8px;
    border-radius: var(--r-sm);
    background: none;
    color: inherit;
    font: inherit;
    font-size: 22px;
    font-weight: 300;
    cursor: pointer;
  }

  @media (hover: hover) {
    .room.live:hover {
      background: var(--surface-2);
    }
  }

  .room.live:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }

  .warn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--alert-soft);
    color: var(--alert);
    font-size: 12.5px;
    font-weight: 700;
  }

  .who {
    display: inline-flex;
    align-self: start;
    padding: 3px;
    border-radius: 999px;
    background: var(--surface-2);
  }

  .who button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 999px;
    padding: 0 14px;
    height: 30px;
    background: transparent;
    color: var(--ink-3);
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
  }

  .who button.on {
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1px 3px rgb(0 0 0 / 15%);
  }

  .hint {
    margin: -4px 0 0;
    font-size: 12.5px;
    color: var(--ink-3);
  }

  .hint a {
    color: var(--ink-2);
    font-weight: 650;
  }

  .setpoint {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .setpoint button {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--ink);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .setpoint b {
    min-width: 52px;
    text-align: center;
    font-size: 20px;
  }

  .setpoint button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .state {
    font-size: 13.5px;
    font-weight: 650;
    color: var(--ink-2);
  }

  .chip {
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--ink-3);
    font-size: 12px;
    font-weight: 650;
  }

  .quick {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .quick button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 999px;
    padding: 0 14px;
    height: 34px;
    background: var(--surface-2);
    color: var(--ink-3);
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
  }

  .quick button.on {
    background: var(--warm-soft);
    color: var(--warm-ink);
  }

  .quick button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .chip.warm {
    background: var(--warm-soft);
    color: var(--warm-ink);
  }

  .neutral button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 999px;
    padding: 0 14px;
    height: 32px;
    background: var(--surface-2);
    color: var(--ink-3);
    font: inherit;
    font-size: 12.5px;
    font-weight: 650;
    cursor: pointer;
  }

  .neutral button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .small {
    font-size: 12px;
  }

  .who button.shut.on {
    background: var(--surface);
    color: var(--alert);
    box-shadow: 0 1px 3px rgb(0 0 0 / 15%);
  }

  .relight {
    border: 0;
    padding: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: 12.5px;
    font-weight: 650;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
