<script>
  // The top of the home page: the greeting, and the weather over a living
  // map. Behind « 24°, clear sky », the land around the house with the
  // clouds, the rain and the wind flowing as they are now, faded into the
  // page: a picture first, true to what is happening (a storm looks like
  // one). A tap opens the detail: the next day on the map, the hours and the
  // days to come.
  import { onMount } from 'svelte';
  import { home, value, clock, num, longDate, historyOf } from '../lib/home.svelte.js';
  import { sky, watchSky, hours, outlook, localTs } from '../lib/sky.svelte.js';
  import { weatherOf } from '../lib/icons.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';
  import WeatherMap from './WeatherMap.svelte';
  import SkyDetail from './SkyDetail.svelte';

  let { children } = $props();

  const out = $derived(home.config?.outdoor ?? {});
  const w = $derived(out.weather);
  const day = $derived(value(w, 'daylight') !== false);
  const now = $derived(weatherOf(value(w, 'weather_code'), day));
  const hhmm = (iso) => (iso ? String(iso).slice(11, 16) : '—');
  const line = $derived(outlook(hours(sky.forecast)));
  let open = $state(false);
  let narrow = $state(false);

  // The map's « now »: hours since its first one.
  const hour = $derived.by(() => {
    const first = sky.map?.weather?.hours?.[0];
    if (!first) return 0;
    const t0 = localTs(first, Number(sky.map.weather.utc_offset_seconds ?? 0));
    return Math.max(0, (home.now - t0) / 3_600_000);
  });

  onMount(() => {
    const phone = window.matchMedia('(max-width: 760px)');
    narrow = phone.matches;
    const change = () => (narrow = phone.matches);
    phone.addEventListener('change', change);
    const stop = watchSky();
    return () => {
      phone.removeEventListener('change', change);
      stop();
    };
  });
</script>

<section class="hero">
  <div class="hello">
    <p class="date">{longDate(home.now)}</p>
    <p class="time num">{clock(home.now)}</p>
  </div>

  {#if children}
    <div class="hero-plan">{@render children()}</div>
  {/if}

  {#if w}
    <!-- Le ciel entier ouvre le détail ; la température, elle, ouvre son
         historique. Deux boutons qui ne s'imbriquent pas : le second est
         posé au-dessus du premier. -->
    <div class="sky" class:live={sky.map}>
      <button class="open" onclick={() => (open = true)} aria-label={t('maison.meteo.ouvrir', { label: now.label })}></button>
      {#if sky.map}
        <span class="space" aria-hidden="true">
          <WeatherMap map={sky.map} {hour} tx={narrow ? 0.17 : 0.34} ty={0.5} />
        </span>
      {/if}
      <span class="now">
        <Icon path={now.icon} size={44} />
        <span class="words">
          <button class="temp num" onclick={() => historyOf(w, 'temperature')} title={t('maison.historique.ouvrir', { name: `${t('maison.meteo.titre')} · ${t('commun.piece.temperature')}` })} aria-label={t('maison.historique.ouvrir', { name: `${t('maison.meteo.titre')} · ${t('commun.piece.temperature')}` })}>{num(value(w, 'temperature'), 0)}°</button>
          <span class="label">{now.label}</span>
          <span class="small num"
            >↑ {num(value(w, 'today_max'), 0)}° ↓ {num(value(w, 'today_min'), 0)}° ·
            <Icon name={day ? 'sunset' : 'sunrise'} size={13} />
            {day ? hhmm(value(w, 'sunset')) : hhmm(value(w, 'sunrise'))}</span
          >
          {#if line}<span class="small outlook">{line}</span>{/if}
        </span>
      </span>
    </div>
  {/if}
</section>

{#if open}
  <SkyDetail onclose={() => (open = false)} />
{/if}

<style>
  .hero {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 16px;
    padding: 6px 0 0 4px;
    min-height: 160px;
  }

  .hello {
    align-self: end;
    flex: none;
  }

  /* The plan, between the date/time and the weather. It takes the free
     space (flex-grow) and centres the card there; the width is capped so
     the header grows by a bounded height, not all the free width. */
  .hero-plan {
    flex: 1 1 auto;
    min-width: 0;
    display: grid;
    place-items: center;
  }

  .hero-plan :global(.plan) {
    max-width: 436px;
    /* the plan stands on the page here: no card surface, no inner
       padding, no shadow — a few dozen pixels of height saved. */
    background: none;
    box-shadow: none;
    padding: 0;
  }

  /* The bare plan: a soft shadow gives it its own edge on the page. */
  .hero-plan :global(.frame img) {
    filter: drop-shadow(0 8px 22px rgb(23 32 56 / 18%));
  }

  .date {
    color: var(--ink-3);
    font-weight: 600;
  }

  .time {
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--ink);
  }

  .sky {
    position: relative;
    isolation: isolate;
    flex: 0 1 52%;
    min-width: 300px;
    display: flex;
    justify-content: end;
    align-items: end;
    border: 0;
    padding: 12px 18px 12px;
    background: none;
    color: inherit;
    text-align: left;
    border-radius: var(--r-lg);
  }

  /* Le ciel : une cible qui couvre toute la zone, sous la température. */
  .sky .open {
    position: absolute;
    inset: 0;
    z-index: 0;
    border: 0;
    padding: 0;
    border-radius: var(--r-lg);
    background: none;
    cursor: pointer;
  }

  @media (hover: hover) {
    .sky .open:hover {
      background: color-mix(in srgb, var(--surface) 45%, transparent);
    }
  }

  /* La température : au-dessus de la cible du ciel, pour ouvrir son
     historique plutôt que le détail météo. */
  .words .temp {
    justify-self: start;
    border: 0;
    padding: 0 4px;
    margin: 0 -4px;
    border-radius: var(--r-sm);
    background: none;
    color: inherit;
    font: inherit;
    font-size: 46px;
    font-weight: 300;
    letter-spacing: -0.03em;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
  }

  @media (hover: hover) {
    .words .temp:hover {
      background: color-mix(in srgb, var(--ink) 8%, transparent);
    }
  }

  .words .temp:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }

  /* The map: right half, melting into the page on the left, top and
     bottom (no frame). */
  .space {
    position: absolute;
    inset: -8px 0 -8px 0;
    z-index: -1;
    overflow: hidden;
    border-radius: 0 var(--r-lg) var(--r-lg) 0;
    -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 40%), linear-gradient(180deg, transparent 0%, #000 20%, #000 82%, transparent 100%);
    -webkit-mask-composite: source-in;
    mask-image: linear-gradient(90deg, transparent 0%, #000 40%), linear-gradient(180deg, transparent 0%, #000 20%, #000 82%, transparent 100%);
    mask-composite: intersect;
    animation: appear 1.2s var(--ease) both;
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }

  .now {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--sun);
    position: relative;
    z-index: 1;
    pointer-events: none;
  }

  .words {
    display: grid;
    color: var(--ink);
  }

  /* Over the map: white words, a soft shadow. */
  .live .now {
    color: #ffd75e;
    filter: drop-shadow(0 1px 8px rgb(0 0 0 / 55%));
  }

  .live .words {
    color: #fff;
  }

  .words strong {
    font-size: 46px;
    font-weight: 300;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .label {
    font-weight: 650;
  }

  .small {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    font-weight: 550;
    opacity: 0.92;
  }

  .outlook {
    max-width: 230px;
  }

  @media (max-width: 760px) {
    .hero {
      flex-direction: column;
      gap: 6px;
    }

    .hello {
      align-self: start;
    }

    .time {
      font-size: 34px;
    }

    .hero-plan {
      flex: none;
    }

    .sky {
      flex: none;
      min-width: 0;
      min-height: 140px;
      margin: 0 -4px;
    }

    .space {
      border-radius: var(--r-lg);
      -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 28%), linear-gradient(180deg, transparent 0%, #000 16%, #000 84%, transparent 100%);
      mask-image: linear-gradient(90deg, transparent 0%, #000 28%), linear-gradient(180deg, transparent 0%, #000 16%, #000 84%, transparent 100%);
    }
  }
</style>
