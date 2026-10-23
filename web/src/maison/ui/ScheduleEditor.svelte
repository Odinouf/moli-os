<script>
  // The weekly timetable of one valve: seven 24-hour tracks, one per day.
  // Every edit is local until « Enregistrer » — the valve keeps the truth,
  // and a day is only ever written when it actually changed (a valve on a
  // battery hears enough commands as it is).
  import { t } from '../../lib/i18n.svelte.js';
  import { DAYS, MAX_BLOCKS, GRID, MIN_DEG, MAX_DEG, STEP, parseSchedule, formatSchedule, neutralize, nextTransition, insertBlock, moveBlock, removeBlock, setDegree, bounds, hhmm, validate, levelOf, roomForNewBlock } from '../lib/schedule.js';
  import Icon from './Icon.svelte';

  /** `days`: [{ day, text }] read off the valve. `readOnly` freezes it (the
   *  valve is run by automations). `onsave(days)` receives [{day, text}].
   *  `confort` / `reduit`: the household's own two temperatures, so a step can
   *  be named — the valve itself only ever holds `HH:MM/<deg>`. */
  let { days = [], readOnly = false, onsave = () => {} , neutralDeg = 16, confort = 18.5, reduit = 16 } = $props();

  // The whole week lives in state so an edition is atomic and cancellable.
  let draft = $state(DAYS.map(() => null));
  let server = $state(DAYS.map(() => ''));
  let saving = $state(false);
  /** Days sent but not yet read back on the valve. A valve on a battery can
   *  take minutes: the row says « en attente » until its own text agrees. */
  let awaiting = $state({});
  /** Days the valve normalised away from what we sent (never fatal). */
  let rewritten = $state({});

  function reload() {
    server = DAYS.map((d) => days.find((x) => x.day === d)?.text ?? '');
    draft = server.map((text) => parseSchedule(text));
    rewritten = {};
  }
  // Reload only when the valve's own text actually changed: `days` is rebuilt
  // by the parent on every derivation, and reloading unconditionally is an
  // effect that writes the state it reads (effect_update_depth_exceeded).
  let seen = null;
  $effect(() => {
    const key = days.map((d) => `${d.day}=${d.text ?? ''}`).join('|');
    if (key === seen) return;
    seen = key;
    reload();
  });

  const sameDay = (a, b) => formatSchedule(a) === formatSchedule(b);
  const dirty = $derived(draft.some((blocks, i) => !sameDay(blocks, parseSchedule(server[i]))));

  const low = $derived(bounds(draft).min);
  const high = $derived(bounds(draft).max);

  // Cold blue to warm orange, like the week's weather span.
  function tone(deg) {
    const span = Math.max(1, high - low);
    const f = Math.min(1, Math.max(0, (deg - low) / span));
    const hue = 210 - f * 190; // 210 (cool) → 20 (warm)
    return `hsl(${hue} 72% 55%)`;
  }

  /** How long the editor waits for a valve to speak before settling a day. */
  const WAIT_MS = 5 * 60_000;
  /** Horizontal travel, in pixels, before a press on a handle becomes a drag. */
  const DRAG_PX = 4;

  let selected = $state(null); // { day, index }
  // Actions (aplatir, copier, suppression) can shorten a day under the
  // selection: only a step that still exists is editable.
  const sel = $derived(selected && draft[selected.day]?.[selected.index] ? selected : null);
  const nowMin = $derived(new Date().getHours() * 60 + new Date().getMinutes());

  /** Adds a step in the widest stretch of the day, then selects it so its
   *  setpoint can be set straight away. `roomForNewBlock` decides where: the
   *  old "an hour after the last step" fell back to the beginning of the day
   *  on a day ending at 23:00, with no cue about where the step had gone. A
   *  day already holding MAX_BLOCKS steps gets nothing — that ceiling is the
   *  valve's. */
  function addZone(day) {
    if (readOnly) return;
    const at = roomForNewBlock(draft[day]);
    if (at == null) return;
    const grown = insertBlock(draft[day], at);
    if (grown.length === draft[day].length) return;
    draft[day] = grown;
    draft = [...draft];
    const index = grown.findIndex((b) => b.min === at);
    if (index > 0) selected = { day, index };
  }

  /** A keyboard user gets the same « add a step » — but only when the track
   *  itself holds the focus: Enter reaches it from a step inside too, and
   *  swallowing that would stop a step from being selected by keyboard. */
  function addByKey(day, e) {
    if (readOnly) return;
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    addZone(day);
  }

  /** Picks a step up by its body: the whole segment is the target, not the
   *  thin handle a finger has to find. */
  function pick(day, index, e) {
    if (readOnly) return;
    e.stopPropagation();
    selected = { day, index };
  }

  const level = (deg) => levelOf(deg, confort, reduit);
  /** The household's own word for a level. « Confort » and « Réduit » already
   *  exist as `maison.accueil.chauffage_*` — reused here so the tooltip and
   *  the preset buttons can never name the same level differently. Only
   *  « custom » is new. */
  const levelName = (deg) => {
    const l = level(deg);
    return l === 'custom' ? t('maison.chauffage.niveau.custom') : t(`maison.accueil.chauffage_${l}`);
  };
  /** Keyboard selection: a focused step answers Enter/Space like a click, so
   *  a step can be chosen without a pointer. */
  function selectByKey(day, index) {
    if (readOnly) return;
    selected = { day, index };
  }
  // A step shows its start time only when the pill can actually hold it: a
  // minute threshold cannot know the row's width, so measure it. The label is
  // "00:00 · 16°" (~62 px) plus its padding; below that the hour stays in the
  // tooltip rather than being clipped mid-glyph. One measurement, taken on the
  // week itself: every row shares its column widths, so measuring them
  // separately would only be a way to disagree.
  // Measured, not guessed: "06:00 · 18.5°" is 91 px at this font size, and
  // "18.5°" alone 42 px. A pill narrower than the label loses the hour to
  // the tooltip rather than being clipped mid-glyph.
  const LABEL_PX = 94;
  const DEG_PX = 44;
  let weekEl = $state(null);
  let rowPx = $state(0);
  $effect(() => {
    const el = weekEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const track = el.querySelector('.track');
      rowPx = track ? track.getBoundingClientRect().width : 0;
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  });
  /** What a step can print: the time and the setpoint, the setpoint alone
   *  when the pill is narrow, nothing at all when it is a sliver. */
  const fit = (b, end) => {
    const px = rowPx ? ((end - b.min) / 1440) * rowPx : Infinity;
    if (px >= LABEL_PX) return 'time';
    if (px >= DEG_PX) return 'deg';
    return 'none';
  };
  // `draft` starts as nulls until the first reload lands: the markup must
  // read it without tripping over a day that has not been parsed yet.
  const blocksOf = (i) => draft[i] ?? [];
  const full = (i) => blocksOf(i).length >= MAX_BLOCKS;

  function dragStart(day, index, e) {
    if (readOnly || index === 0) return;
    e.stopPropagation();
    // Keep the handle: by the time `up` runs, the event's currentTarget is
    // gone (null), so listening on it would throw and lose the click.
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const track = handle.closest('.track');
    const startX = e.clientX;
    let moved = false;
    const move = (ev) => {
      // A tap must stay a tap: without a threshold, the tremor of a finger
      // drags the step a quarter of an hour and swallows its neighbour.
      if (!moved && Math.abs(ev.clientX - startX) < DRAG_PX) return;
      const box = track.getBoundingClientRect();
      const min = Math.round(((ev.clientX - box.left) / box.width) * 1440 / GRID) * GRID;
      draft[day] = moveBlock(draft[day], index, min);
      draft = [...draft];
      moved = true;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      if (!moved) selected = { day, index };
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }

  const step = (day, index, dir) => {
    draft[day] = setDegree(draft[day], index, draft[day][index].deg + dir * STEP);
    draft = [...draft];
  };
  const setDeg = (day, index, deg) => {
    draft[day] = setDegree(draft[day], index, deg);
    draft = [...draft];
  };
  const drop = (day, index) => {
    draft[day] = removeBlock(draft[day], index);
    draft = [...draft];
    if (selected?.day === day) selected = null;
  };
  const copyTo = (from, target) => {
    draft[target] = draft[from].map((b) => ({ ...b }));
    draft = [...draft];
  };
  const applyAll = (from) => {
    draft = draft.map(() => draft[from].map((b) => ({ ...b })));
  };
  const flat = (day) => {
    draft[day] = neutralize(draft[day][0]?.deg ?? neutralDeg);
    draft = [...draft];
    // The day is down to one step: a selection further right no longer exists.
    if (selected?.day === day) selected = { day, index: 0 };
  };

  // What a day would write, against what it holds: only the changed ones.
  const outgoing = $derived(draft.map((blocks, i) => ({ day: DAYS[i], text: formatSchedule(blocks), was: server[i] })).filter((d) => d.text !== d.was));

  // Last line of defence: every gesture above goes through the same helpers,
  // but a day that fails the rules is never written to the valve.
  const broken = $derived(draft.map((blocks, i) => (validate(blocks) ? DAYS[i] : null)).filter(Boolean));

  async function save() {
    if (readOnly || !outgoing.length || saving) return;
    saving = true;
    // Remember what the valve held before: a day still showing its old text
    // has not answered yet, and must not be mistaken for a rewrite.
    // A valve on a battery can take minutes to answer, and the point's
    // timestamp is not usable (the driver replays its cache on reconnect).
    // So: the day settles when its text moves at all, or when we give up
    // waiting — never instantly, which would hide a slow answer.
    for (const d of outgoing) awaiting[d.day] = { sent: d.text, was: d.was, until: Date.now() + WAIT_MS };
    awaiting = { ...awaiting };
    await onsave(outgoing);
    saving = false;
  }

  // A sent day is settled once the valve's own text comes back: same text,
  // done; another text, the valve normalised it (said, not hidden).
  // Never reassign when nothing settled: an effect that writes on every pass
  // would re-run itself forever (effect_update_depth_exceeded).
  // The deadline is a plain number, so nothing would ever re-run the settle
  // pass on its own: a day would keep its « … » until some unrelated device
  // reported. A timer per sent day makes « we waited long enough » an event.
  $effect(() => {
    const timers = Object.entries(awaiting).map(([day, { until }]) =>
      setTimeout(() => {
        if (awaiting[day]) {
          const { [day]: _gone, ...rest } = awaiting;
          awaiting = rest;
        }
      }, Math.max(0, until - Date.now())),
    );
    return () => timers.forEach(clearTimeout);
  });

  $effect(() => {
    let settled = false;
    const nextAwaiting = { ...awaiting };
    const nextRewritten = { ...rewritten };
    for (const [day, { sent, was, until }] of Object.entries(nextAwaiting)) {
      const now = days.find((d) => d.day === day)?.text ?? '';
      const answered = !!now && now !== was;
      const gaveUp = Date.now() > until;
      if (!answered && !gaveUp) continue;
      delete nextAwaiting[day];
      if (formatSchedule(parseSchedule(now)) !== sent) nextRewritten[day] = now || t('maison.chauffage.table.vide');
      settled = true;
    }
    if (!settled) return;
    awaiting = nextAwaiting;
    rewritten = nextRewritten;
  });
</script>

{#if !days.length}
  <p class="muted">{t('maison.chauffage.table.vide')}</p>
{:else}
  <div class="week" class:ro={readOnly} bind:this={weekEl}>
    <div class="scale" class:ro={readOnly} aria-hidden="true">
      <span></span>
      <div class="ticks">
        {#each [0, 6, 12, 18, 24] as h}
          <span style:left="{(h / 24) * 100}%">{String(h).padStart(2, '0')}h</span>
        {/each}
      </div>
      <span class="gap"></span>
    </div>
    {#each DAYS as day, di (day)}
      <div class="day">
        <div class="row" class:ro={readOnly}>
          <span class="name" class:wait={awaiting[day]}>
            {t(`maison.chauffage.jour.${day}`)}
            {#if awaiting[day]}<small title={t('maison.chauffage.en_attente')}>…</small>{/if}
          </span>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="track"
            onkeydown={(e) => addByKey(di, e)}
            role={readOnly ? undefined : 'button'}
            tabindex={readOnly ? undefined : 0}
            aria-label={t('maison.chauffage.table.piste')}>
            {#each blocksOf(di) as b, bi (b.min)}
              {@const end = blocksOf(di)[bi + 1]?.min ?? 1440}
              <button
                class="seg"
                class:sel={selected?.day === di && selected?.index === bi}
                class:ro={readOnly}
                style:left="{(b.min / 1440) * 100}%"
                style:width="{((end - b.min) / 1440) * 100}%"
                style:background={tone(b.deg)}
                onpointerdown={(e) => pick(di, bi, e)}
                onclick={() => selectByKey(di, bi)}
                aria-pressed={readOnly ? undefined : selected?.day === di && selected?.index === bi}
                aria-disabled={readOnly || undefined}
                title="{hhmm(b.min)} · {b.deg}° · {levelName(b.deg)}"
                aria-label="{t('maison.chauffage.table.palier')} {hhmm(b.min)} {b.deg}°">
                <em class="num">{#if fit(b, end) === 'time'}{hhmm(b.min)} ·&nbsp;{/if}{#if fit(b, end) !== 'none'}{b.deg}°{/if}</em>
              </button>
              <button
                class="handle"
                class:anchor={bi === 0}
                class:sel={selected?.day === di && selected?.index === bi}
                style:left="{(b.min / 1440) * 100}%"
                disabled={readOnly || bi === 0}
                onpointerdown={(e) => dragStart(di, bi, e)}
                title="{hhmm(b.min)} · {b.deg}°"
                aria-label="{t('maison.chauffage.table.palier')} {hhmm(b.min)} {b.deg}°"></button>
            {/each}
            <span class="now" style:left="{(nowMin / 1440) * 100}%"></span>
          </div>
          {#if !readOnly}
            <div class="tools">
              <button
                class="add"
                onclick={() => addZone(di)}
                disabled={full(di)}
                title={full(di) ? t('maison.chauffage.table.paliers', { n: MAX_BLOCKS }) : t('maison.chauffage.table.ajouter')}
                aria-label={t('maison.chauffage.table.ajouter')}><Icon name="plus" size={15} /></button>
              <button onclick={() => flat(di)} title={t('maison.chauffage.table.aplatir')} aria-label={t('maison.chauffage.table.aplatir')}><Icon name="undo" size={14} /></button>
              <button onclick={() => applyAll(di)} title={t('maison.chauffage.table.tous')} aria-label={t('maison.chauffage.table.tous')}><Icon name="copy" size={14} /></button>
            </div>
          {/if}
        </div>

        {#if sel && sel.day === di && !readOnly}
          {@const b = draft[sel.day]?.[sel.index]}
          <div class="edit" role="group" aria-label={t('maison.chauffage.table.consigne')}>
            <span>{t(`maison.chauffage.jour.${DAYS[sel.day]}`)} · <b class="num">{hhmm(b.min)}</b></span>
            <div class="levels">
              <button class:on={level(b.deg) === 'confort'} onclick={() => setDeg(sel.day, sel.index, confort)}>
                {t('maison.accueil.chauffage_confort')}<small class="num">{confort}°</small>
              </button>
              <button class:on={level(b.deg) === 'reduit'} onclick={() => setDeg(sel.day, sel.index, reduit)}>
                {t('maison.accueil.chauffage_reduit')}<small class="num">{reduit}°</small>
              </button>
              <span class="level" class:on={level(b.deg) === 'custom'}>{t('maison.chauffage.niveau.custom')}</span>
            </div>
            <div class="stepper">
              <button onclick={() => step(sel.day, sel.index, -1)} disabled={b.deg <= MIN_DEG} aria-label={t('commun.clim.moins_chaud')}>−</button>
              <b class="num">{b.deg}°</b>
              <button onclick={() => step(sel.day, sel.index, 1)} disabled={b.deg >= MAX_DEG} aria-label={t('commun.clim.plus_chaud')}>+</button>
            </div>
            <button class="drop" onclick={() => drop(sel.day, sel.index)} disabled={sel.index === 0} title={t('maison.chauffage.table.supprimer')} aria-label={t('maison.chauffage.table.supprimer')}><Icon name="trash" size={15} /></button>
            <button class="to" onclick={() => copyTo(sel.day, (sel.day + 1) % 7)} title={t('maison.chauffage.table.copier')} aria-label={t('maison.chauffage.table.copier')}><Icon name="copy" size={15} /></button>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="legend">
    <span><i class="dot" style:background={tone(confort)}></i>{t('maison.accueil.chauffage_confort')} <b class="num">{confort}°</b></span>
    <span><i class="dot" style:background={tone(reduit)}></i>{t('maison.accueil.chauffage_reduit')} <b class="num">{reduit}°</b></span>
    <span><i class="dot" style:background="var(--ink-3)"></i>{t('maison.chauffage.niveau.custom')}</span>
  </div>

  {#each Object.entries(rewritten) as [day, text] (day)}
    <p class="notice">{t('maison.chauffage.message_relu', { texte: `${t(`maison.chauffage.jour.${day}`)} · ${text}` })}</p>
  {/each}

  {#if !readOnly}
    <div class="bar">
      <span class="cap" class:on={dirty}>{dirty ? t('maison.chauffage.table.modifie') : t('maison.chauffage.table.a_jour')}</span>
      {#if broken.length}
        <span class="cap bad">{t('maison.chauffage.table.invalide', { jours: broken.map((d) => t(`maison.chauffage.jour.${d}`)).join(', ') })}</span>
      {:else}
        <span class="count muted">{t('maison.chauffage.table.paliers', { n: MAX_BLOCKS })}</span>
      {/if}
      <button class="ghost" onclick={reload} disabled={!dirty || saving}>{t('commun.annuler')}</button>
      <button class="save" onclick={save} disabled={!dirty || saving || !!broken.length}><Icon name="save" size={16} />{saving ? t('maison.chauffage.table.envoi') : t('maison.chauffage.table.enregistrer')}</button>
    </div>
  {/if}
{/if}

<style>
  /* One place for the three column widths: the axis, the rows, the edit block
     and the legend must never disagree on where the track starts and ends. */
  .week {
    --name-w: 84px;
    --tools-w: 98px;
    --gap: 10px;
    display: grid;
    gap: 6px;
  }

  .day {
    display: grid;
  }

  .scale {
    display: grid;
    grid-template-columns: var(--name-w) 1fr var(--tools-w);
    align-items: end;
    gap: var(--gap);
  }

  /* Read-only rows draw no tools, so their third column collapses to 0:
     the axis must drop that column's width too, or every tick drifts left
     (the gap stays, exactly like the row's). */
  .scale.ro,
  .row.ro {
    grid-template-columns: var(--name-w) 1fr 0;
  }

  .ticks {
    position: relative;
    height: 14px;
  }

  .ticks span {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10.5px;
    font-weight: 650;
    color: var(--ink-3);
    letter-spacing: 0.02em;
  }

  .ticks span:first-child {
    transform: none;
  }

  .ticks span:last-child {
    transform: translateX(-100%);
  }

  .row {
    display: grid;
    grid-template-columns: var(--name-w) 1fr var(--tools-w);
    align-items: center;
    gap: var(--gap);
  }

  .name {
    font-size: 13px;
    font-weight: 650;
    color: var(--ink-2);
  }

  .name.wait {
    color: var(--warm-ink);
  }

  .track {
    position: relative;
    height: 34px;
    border-radius: 10px;
    background: var(--surface-2);
    overflow: hidden;
    touch-action: none;
    /* the hour grid: a mark every hour, a stronger one every six */
    background-image:
      repeating-linear-gradient(90deg, rgb(0 0 0 / 7%) 0 1px, transparent 1px calc(100% / 24)),
      repeating-linear-gradient(90deg, rgb(0 0 0 / 16%) 0 1px, transparent 1px calc(100% / 4));
  }

  .seg {
    position: absolute;
    top: 0;
    bottom: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 0;
    border-right: 2px solid var(--surface-2);
    padding: 0;
    font: inherit;
    cursor: pointer;
  }

  /* A read-only step is still a button: nothing is disabled, so the browser
     keeps firing pointer events and its `title` stays readable — the tooltip
     is the only place the hour survives a pill too narrow to print it. */
  .seg.ro {
    cursor: default;
  }

  .seg.sel {
    outline: 2px solid var(--ink);
    outline-offset: -3px;
    z-index: 1;
  }

  .seg em {
    font-style: normal;
    font-size: 11.5px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 2px rgb(0 0 0 / 35%);
    pointer-events: none;
    white-space: nowrap;
    padding: 0 4px;
  }

  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 14px;
    margin-left: -7px;
    border: 0;
    background: none;
    cursor: ew-resize;
    padding: 0;
  }

  .handle::after {
    content: '';
    position: absolute;
    inset: 4px 6px;
    border-radius: 2px;
    background: rgb(255 255 255 / 85%);
  }

  .handle.anchor {
    cursor: default;
  }

  .handle.anchor::after {
    display: none;
  }

  .handle.sel::after {
    background: var(--ink);
  }

  .now {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--alert);
    opacity: 0.7;
  }

  .tools {
    display: flex;
    gap: 4px;
  }

  .tools button,
  .drop,
  .to {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--ink-3);
    cursor: pointer;
  }

  .edit {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    margin: 6px 0 0 calc(var(--name-w) + var(--gap));
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--surface-2);
    font-size: 13.5px;
  }

  .levels {
    display: flex;
    gap: 6px;
  }

  .levels button,
  .levels .level {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 11px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink-2);
    font: inherit;
    font-size: 12.5px;
    font-weight: 650;
    cursor: pointer;
  }

  .levels .level {
    cursor: default;
  }

  .levels button.on,
  .levels .level.on {
    border-color: var(--warm);
    color: var(--warm-ink);
  }

  .levels small {
    font-weight: 700;
    opacity: 0.75;
  }

  .tools button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-top: 10px;
    padding-left: calc(var(--name-w) + var(--gap));
    font-size: 12px;
    color: var(--ink-3);
  }

  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .legend .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .stepper button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .edit .drop,
  .edit .to {
    margin-left: auto;
  }

  .edit .to {
    margin-left: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
  }

  .cap {
    font-size: 12.5px;
    font-weight: 650;
    color: var(--ink-3);
  }

  .cap.on {
    color: var(--warm-ink);
  }

  .count {
    margin-right: auto;
    font-size: 12px;
  }

  .bar .ghost,
  .bar .save {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 999px;
    padding: 0 16px;
    height: 34px;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .bar .ghost {
    background: var(--surface-2);
    color: var(--ink-2);
  }

  .bar .save {
    background: var(--warm);
    color: #1c1407;
  }

  .bar button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .ro .track {
    opacity: 0.85;
  }

  .notice {
    margin: 6px 0 0;
    padding: 8px 12px;
    border-radius: var(--r-sm);
    background: var(--warm-soft);
    color: var(--warm-ink);
    font-size: 12.5px;
  }

  .cap.bad {
    color: var(--alert);
  }
</style>
