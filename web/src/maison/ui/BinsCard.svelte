<script>
  // Les poubelles : la prochaine sortie de chaque bac, sans calendrier.
  // Chaque bac a une date d'ancrage et une récurrence de 14 jours (une
  // semaine sur deux), lues dans la configuration de la maison. Jours
  // restants calculés depuis la date du jour, à l'heure de la maison.
  // Deux cartes côte à côte, comme la tablette (J-10 · mer 28/10).
  import { home } from '../lib/home.svelte.js';
  import { t, locale } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  // { jaune: { anchor: '2026-10-28' }, noire: { anchor: '2026-10-21' } }
  const bins = $derived(home.config?.bins ?? null);

  const DAY = 86_400_000;

  /** Prochain ramassage à partir de l'ancre, par pas de 14 jours. */
  function nextOn(anchor, nowMs) {
    if (!anchor) return null;
    const t0 = Date.parse(`${anchor}T00:00:00`);
    if (!Number.isFinite(t0)) return null;
    if (t0 >= nowMs) return t0;
    const period = 14 * DAY;
    const steps = Math.ceil((nowMs - t0) / period);
    return t0 + steps * period;
  }

  const rows = $derived.by(() => {
    if (!bins) return [];
    const midnight = new Date(home.now);
    midnight.setHours(0, 0, 0, 0);
    const nowMs = midnight.getTime();
    return [
      { key: 'jaune', icon: 'recycle', tone: 'yellow', label: t('maison.accueil.poubelle_jaune_court'), at: nextOn(bins.jaune?.anchor, nowMs) },
      { key: 'noire', icon: 'trash-outline', tone: 'black', label: t('maison.accueil.poubelle_noire_court'), at: nextOn(bins.noire?.anchor, nowMs) },
    ]
      .filter((r) => r.at != null)
      .map((r) => ({ ...r, days: Math.round((r.at - nowMs) / DAY) }))
      .sort((a, b) => a.days - b.days);
  });

  function when(days) {
    if (days <= 0) return t('maison.accueil.poubelle_aujourdhui');
    if (days === 1) return t('maison.accueil.poubelle_demain');
    return t('maison.accueil.poubelle_j_moins', { n: days });
  }

  function dayLabel(ms) {
    return new Date(ms).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: '2-digit' });
  }
</script>

{#if rows.length}
  <div class="stack" aria-label={t('maison.accueil.poubelles')} role="group">
    {#each rows as r (r.key)}
      <a class="bin" class:soon={r.days <= 1} href="#/dehors" title={r.label}>
        <span class="ico {r.tone}"><Icon name={r.icon} size={17} /></span>
        <span class="words">
          <b>{when(r.days)}</b>
          <small>{r.label} · {dayLabel(r.at)}</small>
        </span>
      </a>
    {/each}
  </div>
{/if}

<style>
  .stack {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .bin {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 56px;
    padding: 0 12px;
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: var(--shadow);
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }

  .bin.soon {
    background: var(--warm-soft);
  }

  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--surface-2);
  }

  .ico.yellow {
    color: #b48a00;
  }

  .ico.black {
    color: var(--ink-3);
  }

  .words {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .words b {
    font-size: 14px;
    font-weight: 750;
  }

  .words small {
    font-size: 12px;
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .soon .words small {
    color: var(--warm-ink);
  }

  @media (max-width: 760px) {
    .stack {
      grid-template-columns: 1fr;
    }
  }
</style>
