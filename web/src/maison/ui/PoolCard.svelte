<script>
  // La piscine, en une carte de 62 px : la température de l'eau, la pompe,
  // et le coup d'œil quand la sonde le demande. Un tap ouvre Dehors.
  import { home, value, num, isOn, reachable, device, powerKey, historyOf } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  const out = $derived(home.config?.outdoor ?? {});
  const pool = $derived(out.pool);
  const temp = $derived(pool ? value(pool, 'temperature') : null);
  const look = $derived(pool ? value(pool, 'action_required') : null);
  const pumpId = $derived(out.pool_pump ?? null);
  const pumpKnown = $derived(!!(pumpId && reachable(pumpId) && powerKey(device(pumpId))));
  const tempLabel = $derived(t('maison.historique.ouvrir', { name: `${t('maison.accueil.piscine_titre')} · ${t('maison.dehors.eau')}` }));
</script>

<div class="card pool">
  <a class="open" href="#/dehors" aria-label={t('maison.accueil.piscine_ouvrir')}></a>
  <span class="ico"><Icon name="pool" size={19} /></span>
  <span class="words">
    <b>{t('maison.accueil.piscine_titre')}</b>
    <small>{pumpKnown ? (isOn(pumpId) ? t('maison.accueil.piscine_marche') : t('maison.accueil.piscine_arret')) : '—'}</small>
  </span>
  <span class="facts">
    {#if pool && temp != null}
      <button class="temp num" onclick={() => historyOf(pool, 'temperature')} title={tempLabel} aria-label={tempLabel}>{num(temp, 1)}°</button>
    {:else}
      <b class="num">—</b>
    {/if}
    {#if look === true}<span class="chip cool">{t('maison.dehors.coup_oeil')}</span>{:else if look === false}<span class="chip good">{t('maison.dehors.tout_va_bien')}</span>{/if}
  </span>
</div>

<style>
  .pool {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 62px;
    padding: 0 14px;
    color: inherit;
    text-decoration: none;
  }

  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: var(--cool-soft);
    color: var(--cool);
  }

  .words {
    display: grid;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .words b {
    font-size: 14px;
    font-weight: 700;
  }

  .words small {
    font-size: 12px;
    color: var(--ink-3);
  }

  /* Au-dessus du lien de carte : sinon la surface `.open` intercepterait
     le tap sur la température et renverrait vers Dehors. */
  .facts {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }

  /* Le lien de la carte : toute la surface, sous le relevé. */
  .open {
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  .facts .temp {
    border: 0;
    padding: 2px 6px;
    margin: -2px -6px;
    border-radius: var(--r-sm);
    background: none;
    color: inherit;
    font: inherit;
    font-size: 18px;
    font-weight: 750;
    cursor: pointer;
  }

  @media (hover: hover) {
    .facts .temp:hover {
      background: var(--surface-2);
    }
  }

  .facts .temp:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }

  .facts b {
    font-size: 18px;
    font-weight: 750;
  }
</style>
