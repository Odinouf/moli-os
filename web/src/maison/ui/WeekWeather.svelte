<script>
  // The week at a glance, on the home page: one line a day, the temperature
  // range as a bar that slides (cold on the left, warm on the right), the sky
  // and the chance of rain. The whole week fits without opening anything.
  import { onMount } from 'svelte';
  import { sky, watchSky, days, dayName } from '../lib/sky.svelte.js';
  import { weatherOf } from '../lib/icons.js';
  import { num } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  let { daysShow = 8 } = $props();

  onMount(() => watchSky());

  const week = $derived(days(sky.forecast).slice(0, daysShow));
  const lo = $derived(Math.min(...week.map((d) => d.min).filter(Number.isFinite)));
  const hi = $derived(Math.max(...week.map((d) => d.max).filter(Number.isFinite)));
  const span = $derived(Math.max(1, hi - lo));
</script>

{#if week.length}
  <section class="card week" aria-label={t('maison.accueil.semaine')}>
    <ol class="rows">
      {#each week as d, i (d.date)}
        {@const s = weatherOf(d.code, true)}
        <li>
          <small class="dow">{dayName(d.date, i)}</small>
          <span class="ico" title={s.label}><Icon path={s.icon} size={18} /></span>
          <span class="min num">{num(d.min, 0)}°</span>
          <i class="bar" aria-hidden="true">
            <i style="left:{((d.min - lo) / span) * 100}%; right:{((hi - d.max) / span) * 100}%"></i>
          </i>
          <span class="max num">{num(d.max, 0)}°</span>
          <em class="num rain" class:dry={d.rain < 20}>{d.rain}%</em>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .week {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .rows li {
    display: grid;
    grid-template-columns: 42px 28px 38px minmax(60px, 1fr) 38px 42px;
    align-items: center;
    gap: 8px;
    padding: 1px 6px;
    border-radius: 10px;
    min-height: 24px;
  }

  .rows li:first-child {
    background: var(--surface-2);
  }

  .dow {
    font-size: 13px;
    font-weight: 650;
    color: var(--ink-2);
  }

  .ico {
    display: grid;
    place-items: center;
    color: var(--ink-2);
  }

  .min {
    text-align: right;
    font-size: 13px;
    color: var(--ink-3);
  }

  .max {
    text-align: right;
    font-size: 14px;
    font-weight: 700;
  }

  .bar {
    position: relative;
    height: 5px;
    border-radius: 3px;
    background: var(--surface-3);
  }

  .bar i {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 3px;
    background: linear-gradient(90deg, #6cb6f5, #f5a742);
  }

  .rain {
    text-align: right;
    font-style: normal;
    font-size: 12px;
    font-weight: 700;
    color: var(--cool);
  }

  .rain.dry {
    visibility: hidden;
  }

  @media (max-width: 760px) {
    .rows li {
      grid-template-columns: 38px 26px 34px minmax(40px, 1fr) 34px 40px;
      gap: 7px;
    }
  }
</style>
