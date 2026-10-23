<script>
  // La jauge 0–16 kWh de la tablette (le champ de la batterie solaire).
  // Moli n'a pas d'onduleur : la carte dit « — » et pourquoi. Aucune
  // valeur inventée, aucune graduation trompeuse. Si la maison déclare un
  // jour une source (`badges.gauge`), la carte la nomme au lieu de nier.
  import { home, value, nameOf, device, historyOf } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  const source = $derived(home.config?.badges?.gauge ?? null);
  const level = $derived(source ? value(source, 'level') : null);
  const levelKey = $derived(source && device(source)?.points?.some((p) => p.key === 'level') ? 'level' : null);
  const shown = $derived(typeof level === 'number' ? `${Math.round(level)} %` : '—');
  const words = $derived(source ? t('maison.accueil.batterie_source', { source: nameOf(source) }) : t('maison.accueil.batterie_absente'));
</script>

<section class="card gauge" aria-label={t('maison.accueil.batterie')}>
  <span class="ico"><Icon name="bolt" size={18} /></span>
  <span class="words">
    <b>{t('maison.accueil.batterie')}</b>
    <small>{words}</small>
  </span>
  {#if source && levelKey}
    <button class="value num live" onclick={() => historyOf(source, levelKey)} title={t('maison.historique.ouvrir', { name: `${t('maison.accueil.batterie')} · ${t('maison.historique.niveau')}` })} aria-label={t('maison.historique.ouvrir', { name: `${t('maison.accueil.batterie')} · ${t('maison.historique.niveau')}` })}>{shown}</button>
  {:else}
    <span class="value num">{shown}</span>
  {/if}
</section>

<style>
  .gauge {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 56px;
    padding: 0 14px;
  }

  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--ink-3);
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .value {
    font-size: 18px;
    font-weight: 750;
    color: var(--ink-3);
  }

  .value.live {
    border: 0;
    padding: 2px 6px;
    margin: -2px -6px;
    border-radius: var(--r-sm);
    background: none;
    font: inherit;
    font-size: 18px;
    font-weight: 750;
    color: var(--ink-3);
    cursor: pointer;
  }

  @media (hover: hover) {
    .value.live:hover {
      background: var(--surface-2);
      color: var(--ink-2);
    }
  }

  .value.live:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }
</style>
