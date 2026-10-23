<script>
  import { onMount } from 'svelte';
  import { device, value, reachable, num, act, setpointKey as setpointKeyOf, historyOfAny } from '../lib/home.svelte.js';
  import { energy, useEnergy, watts, euros } from '../lib/energy-live.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  let { id, name } = $props();

  const d = $derived(device(id));
  // A split states its setpoint as `target_temperature`; a thermostatic valve
  // (a TRV) states it the ZCL way, as `occupied_heating_setpoint`. Whichever
  // the device carries is the one the card drives.
  const setpointKey = $derived(setpointKeyOf(d) ?? 'occupied_heating_setpoint');
  const heating = $derived(setpointKey === 'occupied_heating_setpoint');
  const temp = $derived(value(id, 'temperature') ?? (heating ? value(id, 'local_temperature') : null));
  const target = $derived(value(id, setpointKey));
  const mode = $derived(heating ? value(id, 'system_mode') : value(id, 'mode'));
  // A valve is « on » when its mode is not `off`; a split, when its `on` bit is.
  const on = $derived(heating ? mode != null && mode !== 'off' : value(id, 'on') === true);
  const outdoor = $derived(value(id, 'outdoor_temperature'));
  // The dial's scale follows the device's own spec, not a fixed guess.
  const spec = $derived(d?.points.find((p) => p.key === setpointKey)?.kind ?? {});
  const MIN = $derived(typeof spec.min === 'number' ? spec.min : heating ? 4 : 16);
  const MAX = $derived(typeof spec.max === 'number' ? spec.max : heating ? 35 : 30);

  // What it draws, when a measured circuit feeds it (Daikin units do not
  // measure themselves).
  onMount(useEnergy);
  const feeder = $derived(energy.summary?.meters.find((m) => m.feeds?.includes(id)));
  const draw = $derived.by(() => {
    if (!feeder?.power) return null;
    const i = feeder.power.indexOf('/');
    const v = value(feeder.power.slice(0, i), feeder.power.slice(i + 1));
    return typeof v === 'number' ? v : (feeder.power_w ?? null);
  });
  // What it cost, from its circuit's meter (today, this month).
  const costOf = (span) => (feeder ? (energy.summary?.[span]?.meters?.[feeder.id]?.cost ?? null) : null);
  const dayCost = $derived(costOf('today'));
  const monthCost = $derived(costOf('month'));
  // The circuit feeds something else too (« PAC salon + pompe piscine »).
  const shared = $derived(!!feeder && (feeder.feeds.length > 1 || feeder.name.includes('+')));
  const writable = $derived(d?.points.some((p) => p.key === setpointKey && p.access?.write));
  const STEP = $derived(typeof spec.step === 'number' ? spec.step : 0.5);

  // Taps on − / + and drags on the dial add up; one order leaves once the
  // finger rests (each order re-reads the unit and sends all its settings: no
  // machine-gunning it). Off, the unit keeps the new setpoint for later.
  let wanted = $state(null);
  let dragging = $state(false);
  let timer;
  const shownTarget = $derived(wanted ?? target);
  const clamp = (deg) => Math.min(MAX, Math.max(MIN, Math.round(deg / STEP) * STEP));

  function nudge(delta) {
    const base = wanted ?? (typeof target === 'number' ? target : 21);
    wanted = clamp(base + delta);
    send(900);
  }

  function send(after) {
    clearTimeout(timer);
    timer = setTimeout(flush, after);
  }

  async function flush() {
    clearTimeout(timer);
    const v = wanted;
    if (v == null || v === target) {
      wanted = null;
      return;
    }
    const done = await act(`${id}/${setpointKey}`, v, t('commun.clim.label_consigne', { name }));
    // Shown until the unit reports it (or gives up on it).
    if (done !== 'ok') wanted = null;
    else setTimeout(() => wanted === v && (wanted = null), 15_000);
  }

  $effect(() => {
    if (wanted != null && !dragging && target === wanted) wanted = null;
  });

  // The dial follows the finger: the angle on the 270° ring is the setpoint.
  function tempAt(e, box) {
    const x = e.clientX - (box.left + box.width / 2);
    const y = e.clientY - (box.top + box.height / 2);
    // Too near the middle, the angle means nothing.
    if (Math.hypot(x, y) < box.width * 0.15) return null;
    let a = (((Math.atan2(y, x) * 180) / Math.PI - 135) % 360 + 360) % 360;
    // In the gap at the bottom: the nearest end.
    if (a > 270) a = a > 315 ? 0 : 270;
    return clamp(MIN + (a / 270) * (MAX - MIN));
  }

  function grab(e) {
    if (!writable || !reachable(id)) return;
    dragging = true;
    clearTimeout(timer);
    e.currentTarget.setPointerCapture(e.pointerId);
    wanted = tempAt(e, e.currentTarget.getBoundingClientRect()) ?? shownTarget;
  }

  function drag(e) {
    if (!dragging) return;
    wanted = tempAt(e, e.currentTarget.getBoundingClientRect()) ?? wanted;
  }

  function release() {
    if (!dragging) return;
    dragging = false;
    send(250);
  }

  function key(e) {
    const delta = { ArrowUp: STEP, ArrowRight: STEP, ArrowDown: -STEP, ArrowLeft: -STEP }[e.key];
    if (!delta || !writable) return;
    e.preventDefault();
    nudge(delta);
  }

  async function power() {
    // A setpoint just dragged leaves first: the unit starts on it.
    if (!on && wanted != null) await flush();
    // A valve has no boolean `on`: it takes a `system_mode`, off or heat.
    if (heating) act(`${id}/system_mode`, on ? 'off' : 'heat', t(on ? 'commun.clim.label_arret' : 'commun.clim.label_marche', { name }));
    else act(`${id}/on`, !on, t(on ? 'commun.clim.label_arret' : 'commun.clim.label_marche', { name }));
  }
  // A split takes a mode (`froid`, `chaud`…); a valve takes `system_mode`.
  const setMode = (key) =>
    heating
      ? act(`${id}/system_mode`, key, t('commun.action', { label: name, action: modeLabel(key).toLowerCase() }))
      : act(`${id}/mode`, key, t('commun.action', { label: name, action: modeLabel(key).toLowerCase() }));

  // A split's modes (sent as they are); `label` is a catalogue key.
  const MODES = {
    froid: { label: 'commun.clim.mode.froid', icon: 'snowflake', tone: 'cool' },
    chaud: { label: 'commun.clim.mode.chaud', icon: 'fire', tone: 'warm' },
    auto: { label: 'commun.clim.mode.auto', icon: 'air-conditioner', tone: 'good' },
    déshumidification: { label: 'commun.clim.mode.deshumidification', icon: 'humidity', tone: 'cool' },
    ventilation: { label: 'commun.clim.mode.ventilation', icon: 'fan', tone: 'good' },
  };
  // A valve's own modes, as ZCL states them.
  const HEAT_MODES = {
    off: { label: 'commun.clim.mode.eteint', icon: 'power', tone: 'good' },
    heat: { label: 'commun.clim.mode.chaud', icon: 'fire', tone: 'warm' },
    auto: { label: 'commun.clim.mode.auto', icon: 'air-conditioner', tone: 'good' },
  };
  const table = $derived(heating ? HEAT_MODES : MODES);
  // A valve's modes come from its own `system_mode` enum; a split keeps the five.
  const modes = $derived(heating ? (d?.points.find((p) => p.key === 'system_mode')?.kind?.values ?? ['off', 'heat', 'auto']) : Object.keys(MODES));
  /** A mode said in the house's language (an unknown one: as the unit says it). */
  const modeLabel = (key) => (table[key] ? t(table[key].label) : (key ?? '—'));
  const m = $derived(table[mode] ? { ...table[mode], label: modeLabel(mode) } : { label: mode ?? '—', icon: 'air-conditioner', tone: 'good' });

  // A 270° ring: the target as a bead, the room temperature in the middle.
  const R = 62;
  const C = 2 * Math.PI * R;
  const ARC = 0.75;
  const frac = (deg) => Math.min(1, Math.max(0, ((deg ?? MIN) - MIN) / (MAX - MIN)));
  const at = (deg) => {
    const a = (135 + frac(deg) * 270) * (Math.PI / 180);
    return { x: 80 + R * Math.cos(a), y: 80 + R * Math.sin(a) };
  };
  const bead = $derived(at(shownTarget));
  const here = $derived(typeof temp === 'number' ? at(temp) : null);
</script>

<div class="clim" class:on data-tone={m.tone} class:unreachable={!reachable(id)}>
  <div
    class="dial"
    class:live={writable}
    class:dragging
    onpointerdown={grab}
    onpointermove={drag}
    onpointerup={release}
    onpointercancel={release}
    onkeydown={key}
    role={writable ? 'slider' : undefined}
    tabindex={writable ? 0 : undefined}
    aria-label={writable ? t('commun.clim.consigne_nom', { name }) : undefined}
    aria-valuemin={writable ? MIN : undefined}
    aria-valuemax={writable ? MAX : undefined}
    aria-valuenow={writable ? shownTarget : undefined}>
    <svg viewBox="0 0 160 160" aria-hidden="true">
      <circle class="track" cx="80" cy="80" r={R} stroke-dasharray="{C * ARC} {C}" transform="rotate(135 80 80)" />
      {#if on && shownTarget != null}
        <circle class="fill" cx="80" cy="80" r={R} stroke-dasharray="{C * ARC * frac(shownTarget)} {C}" transform="rotate(135 80 80)" />
      {/if}
      {#if here}
        <circle class="here" cx={here.x} cy={here.y} r="4.5"><title>{t('commun.clim.temp_piece')}</title></circle>
      {/if}
      {#if shownTarget != null}
        <circle class="bead" cx={bead.x} cy={bead.y} r={dragging ? 10 : 8} />
      {/if}
    </svg>
    <div class="reading">
      {#if dragging}
        <strong class="num">{num(wanted, wanted % 1 ? 1 : 0)}<small>°</small></strong>
        <span>{t('commun.clim.consigne')}</span>
      {:else}
        <button
          class="temp live"
          onclick={() => historyOfAny(id, ['temperature', 'local_temperature'])}
          onpointerdown={(e) => e.stopPropagation()}
          title={t('maison.historique.ouvrir', { name: `${name} · ${t('commun.clim.temp_piece')}` })}
          aria-label={t('maison.historique.ouvrir', { name: `${name} · ${t('commun.clim.temp_piece')}` })}
        ><strong class="num">{num(temp, 0)}<small>°</small></strong></button>
        {#if shownTarget != null}<span>{t('commun.clim.consigne_val', { temp: num(shownTarget, shownTarget % 1 ? 1 : 0) })}</span>{/if}
      {/if}
    </div>
  </div>
  <div class="facts">
    <h3>{name}</h3>
    {#if writable}
      <button class="chip power {on ? m.tone : ''}" onclick={power} aria-pressed={on}>
        <Icon name="power" size={16} />{on ? m.label : t('commun.clim.eteinte')}
      </button>
      {#if on}
        <div class="setpoint" role="group" aria-label={t('commun.clim.consigne')}>
          <button onclick={() => nudge(-STEP)} aria-label={t('commun.clim.moins_chaud')} disabled={shownTarget <= MIN}>−</button>
          <b class="num">{num(shownTarget, shownTarget % 1 ? 1 : 0)}°</b>
          <button onclick={() => nudge(STEP)} aria-label={t('commun.clim.plus_chaud')} disabled={shownTarget >= MAX}>+</button>
        </div>
        <div class="modes" role="group" aria-label={t('commun.clim.mode')}>
          {#each modes as key (key)}
            {@const it = table[key] ?? { label: key, icon: 'radiator' }}
            <button class:active={mode === key} onclick={() => setMode(key)} title={t(it.label)} aria-label={t(it.label)} aria-pressed={mode === key}>
              <Icon name={it.icon} size={16} />
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <span class="chip {on ? m.tone : ''}"><Icon name={on ? m.icon : 'power'} size={16} />{on ? m.label : t('commun.clim.eteinte')}</span>
    {/if}
    <p class="muted">
      {t('commun.clim.dehors', { temp: num(outdoor, 0) })}
      {#if draw != null && draw >= 5}
        <span class="draw num" title={t('commun.clim.mesure_tableau', { name: feeder.name })}>
          · {watts(draw)}{#if shared}<small> {t('commun.clim.circuit_partage_paren')}</small>{/if}
        </span>
      {/if}
    </p>
    {#if energy.summary}
      <p class="costs">
        {#if feeder}
          <span>{t('commun.clim.aujourdhui')} <b class="num">{euros(dayCost, energy.summary.currency)}</b></span>
          <span>{t('commun.clim.ce_mois')} <b class="num">{euros(monthCost, energy.summary.currency)}</b></span>
          {#if shared}<small>{t('commun.clim.circuit_partage')}</small>{/if}
        {:else}
          <small>{t('commun.clim.cout_non_mesure')}</small>
        {/if}
      </p>
    {/if}
  </div>
</div>

<style>
  .costs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    font-size: 12.5px;
    color: var(--ink-2);
  }

  .costs b {
    font-weight: 650;
    color: var(--ink);
  }

  .costs small {
    color: var(--ink-3);
  }

  .draw {
    color: var(--warm-ink);
    font-weight: 650;
  }

  .draw small {
    font-weight: 500;
    color: var(--ink-3);
  }

  .clim {
    display: grid;
    grid-template-columns: 148px 1fr;
    align-items: center;
    gap: 14px;
    padding: 6px 4px;
  }

  .dial {
    position: relative;
    width: 148px;
    height: 148px;
  }

  svg {
    width: 100%;
    height: 100%;
  }

  .track,
  .fill {
    fill: none;
    stroke-width: 12;
    stroke-linecap: round;
  }

  .track {
    stroke: var(--surface-3);
  }

  .fill {
    stroke: var(--tone);
    transition: stroke-dasharray 0.6s var(--ease);
  }

  .bead {
    fill: var(--surface);
    stroke: var(--ink-3);
    stroke-width: 4;
    transition: r 0.15s var(--ease);
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 25%));
  }

  .on .bead {
    stroke: var(--tone);
  }

  /* The room's temperature: a grey dot on the ring. */
  .here {
    fill: var(--ink-3);
    stroke: var(--surface);
    stroke-width: 2;
  }

  .dial.live {
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    border-radius: 50%;
  }

  .dial.dragging {
    cursor: grabbing;
  }

  .dial.live:focus-visible {
    outline: 3px solid var(--cool);
    outline-offset: 2px;
  }

  .dial.dragging .reading strong {
    color: var(--tone);
  }

  .clim {
    --tone: var(--good);
  }

  .clim[data-tone='cool'] {
    --tone: var(--cool);
  }

  .clim[data-tone='warm'] {
    --tone: var(--warm);
  }

  .reading {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
  }

  .reading strong {
    font-size: 40px;
    font-weight: 300;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .reading small {
    font-size: 22px;
    vertical-align: top;
  }

  .reading span {
    font-size: 12px;
    color: var(--ink-3);
    font-weight: 600;
    margin-top: 4px;
  }

  /* La température lue (pas la consigne) ouvre son historique. Le cercle
     reste la commande : seul le chiffre change de geste. */
  .reading .temp.live {
    border: 0;
    padding: 0 6px;
    margin: 0 -6px;
    border-radius: var(--r-sm);
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  @media (hover: hover) {
    .reading .temp.live:hover {
      background: color-mix(in srgb, var(--ink) 8%, transparent);
    }
  }

  .reading .temp.live:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }

  .facts {
    display: grid;
    gap: 8px;
    justify-items: start;
  }

  h3 {
    font-size: 18px;
    font-weight: 700;
  }

  button.chip {
    border: none;
    font: inherit;
    cursor: pointer;
  }

  .setpoint {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .setpoint button,
  .modes button {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .setpoint button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .setpoint b {
    min-width: 44px;
    text-align: center;
    font-size: 18px;
  }

  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .modes button {
    width: 32px;
    height: 32px;
    color: var(--ink-3);
  }

  .modes button.active {
    background: var(--tone);
    color: #fff;
  }

  .unreachable {
    opacity: 0.5;
  }
</style>
