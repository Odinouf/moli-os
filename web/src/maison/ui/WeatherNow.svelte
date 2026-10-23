<script>
  // La météo du moment, en une ligne (38 px) : le ciel, la température, le
  // libellé et les extrêmes du jour. C'est la carte « conditions » de la
  // tablette, réduite à ce qu'on lit d'un coup d'œil.
  import { home, value, num, historyOf } from '../lib/home.svelte.js';
  import { watchSky } from '../lib/sky.svelte.js';
  import { weatherOf } from '../lib/icons.js';
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  const out = $derived(home.config?.outdoor ?? {});
  const w = $derived(out.weather);
  const day = $derived(value(w, 'daylight') !== false);
  const now = $derived(weatherOf(value(w, 'weather_code'), day));

  onMount(() => watchSky());
</script>

{#if w}
  <section class="now" aria-label={now.label}>
    <Icon path={now.icon} size={20} />
    <button class="temp live" onclick={() => historyOf(w, 'temperature')} title={t('maison.historique.ouvrir', { name: `${t('maison.meteo.titre')} · ${t('commun.piece.temperature')}` })} aria-label={t('maison.historique.ouvrir', { name: `${t('maison.meteo.titre')} · ${t('commun.piece.temperature')}` })}>
      <b class="num">{num(value(w, 'temperature'), 0)}°</b>
    </button>
    <span class="label">{now.label}</span>
    <span class="range num">↑ {num(value(w, 'today_max'), 0)}° ↓ {num(value(w, 'today_min'), 0)}°</span>
  </section>
{/if}

<style>
  .now {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 14px;
    border-radius: var(--r-sm);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--ink-2);
    min-width: 0;
  }

  .now b {
    font-size: 16px;
    font-weight: 750;
    color: var(--ink);
  }

  /* La température extérieure ouvre son historique : c'est un relevé, pas
     une commande — le bouton resterait sinon invisible dans la ligne. */
  .temp.live {
    border: 0;
    padding: 2px 4px;
    margin: -2px -4px;
    border-radius: var(--r-sm);
    background: none;
    cursor: pointer;
  }

  @media (hover: hover) {
    .temp.live:hover {
      background: var(--surface-2);
    }
  }

  .temp.live:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }

  .label {
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .range {
    margin-left: auto;
    flex: none;
    font-size: 12px;
    color: var(--ink-3);
  }
</style>
