<script>
  // Les températures posées sur une photo du plan (l’équivalent Moli des
  // « picture-elements » de Home Assistant). L’image vient de /api/plan/
  // images (nom = empreinte du contenu) ; chaque point est placé en
  // pourcentage (top/left), lu en direct depuis l’appareil.
  import { home, value, num, nameOf, spokenNameOf, pointLabel, historyOf } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';

  const cfg = $derived(home.config?.plan_overlay ?? null);
  const elems = $derived(cfg?.elements ?? []);

  const shown = (e) => {
    const v = value(e.id, e.key ?? 'temperature');
    if (typeof v !== 'number') return '—';
    return `${num(v, e.digits ?? 1)}${e.unit ?? '°'}`;
  };
  const tone = (e) => {
    const v = value(e.id, e.key ?? 'temperature');
    if (typeof v !== 'number') return '';
    const cold = e.cold ?? 18;
    const hot = e.hot ?? 25;
    return v <= cold ? 'cold' : v >= hot ? 'hot' : '';
  };
</script>

{#if cfg?.image && elems.length}
  <section class="card plan-temps" aria-label={t('maison.accueil.plan_temp')}>
    <div class="frame">
      <img src="/api/plan/images/{cfg.image}" alt="" loading="lazy" />
      {#each elems as e (e.id + (e.key ?? ''))}
        {#if typeof value(e.id, e.key ?? 'temperature') === 'number'}
          <button class="label {tone(e)} live" style="top:{e.top}%; left:{e.left}%" title={t('maison.historique.ouvrir', { name: e.name ?? `${spokenNameOf(e.id)} · ${pointLabel(null, e.key ?? 'temperature')}` })} aria-label={t('maison.historique.ouvrir', { name: e.name ?? `${spokenNameOf(e.id)} · ${pointLabel(null, e.key ?? 'temperature')}` })} onclick={() => historyOf(e.id, e.key ?? 'temperature')}>
            {shown(e)}
          </button>
        {:else}
          <span class="label {tone(e)}" style="top:{e.top}%; left:{e.left}%" title={e.name ?? e.id}>
            {shown(e)}
          </span>
        {/if}
      {/each}
    </div>
  </section>
{/if}

<style>
  .plan-temps {
    display: grid;
    place-items: center;
  }

  .frame {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
    border-radius: var(--r-md);
    background: var(--surface-2);
    overflow: hidden;
  }

  .frame img {
    display: block;
    max-width: 100%;
    height: auto;
  }

  .label {
    position: absolute;
    transform: translate(-50%, -50%);
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font-size: 12px;
    font-weight: 750;
    line-height: 1.4;
    box-shadow: var(--shadow);
    white-space: nowrap;
  }

  .label.cold {
    color: #3b7bea;
  }

  .label.hot {
    color: #e5482b;
  }

  /* Sur le plan : le jeton est déjà une pastille, il devient un bouton. */
  button.label.live {
    border: 0;
    font: inherit;
    font-size: 12px;
    font-weight: 750;
    line-height: 1.4;
    cursor: pointer;
  }

  button.label.live:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }
</style>
