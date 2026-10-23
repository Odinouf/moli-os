<script>
  // L'historique d'un relevé, ouvert depuis n'importe quel chiffre de la
  // maison : la même source que l'Atelier (/api/history), mais dans la
  // langue visuelle de la Maison — surfaces, arrondis, nuit comprise.
  //
  // Un nombre se lit comme une courbe (escalier, bande min/max des
  // tranches) ; tout le reste (portes, modes, mots) comme la liste de ses
  // derniers changements. Rien n'est inventé : une période sans relevé dit
  // qu'elle est vide.
  import { device, spokenNameOf, pointLabel } from '../lib/home.svelte.js';
  import { seriesData, scaleFor, stepPath, bandPath, ticksFor, xTicksFor, statsFor } from '../../lib/history.js';
  import { t, locale } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  /** `point` : « id/clé » — le même identifiant que l'Atelier et l'API. */
  let { point, onclose } = $props();

  const RANGES = [6, 24, 168];
  const RANGE_KEY = { 6: 'maison.historique.plage_6h', 24: 'maison.historique.plage_24h', 168: 'maison.historique.plage_7j' };

  let hours = $state(24);
  let series = $state(null);
  let error = $state('');

  const W = 560;
  const H = 180;
  const PAD = { l: 52, r: 18, t: 10, b: 24 };

  const deviceId = $derived(point.slice(0, point.indexOf('/')));
  const key = $derived(point.slice(point.indexOf('/') + 1));
  const d = $derived(device(deviceId));
  const spec = $derived(d?.points.find((p) => p.key === key));
  // Les libellés des pilotes arrivent souvent en anglais (« Local temperature »,
  // « Humidity ») : la maison a ses mots, on les préfère. Une clé inconnue
  // retombe sur le libellé du pilote, jamais sur une clé i18n affichée.
  const title = $derived(pointLabel(spec, key));
  const owner = $derived(spokenNameOf(deviceId));

  // Un nombre se résume en tranches (300 points suffisent) ; un état ne se
  // résume pas : on demande les bascules brutes, sinon un point qui change
  // souvent reviendrait bucketé et n'aurait plus de liste à montrer.
  const numeric = $derived(spec?.kind?.type === 'numeric');
  const perRange = $derived(numeric ? 300 : 5000);

  $effect(() => {
    const url = `/api/history?point=${encodeURIComponent(point)}&hours=${hours}&points=${perRange}`;
    series = null;
    error = '';
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error)))))
      .then((s) => {
        if (live) series = s;
      })
      .catch((e) => {
        if (live) error = e.message;
      });
    return () => {
      live = false;
    };
  });

  // Points à dessiner, échelle, escalier, bande : la géométrie partagée
  // (`lib/history.js`), la même que l'Atelier — seule la peau change.
  const data = $derived.by(() => seriesData(series));

  const binary = $derived(spec?.kind?.type === 'binary');
  // Un binaire ne se dessine pas en courbe : sa valeur ne change qu'à l'événement,
  // et une marche 0/1 dit moins qu'une liste datée des bascules. Il rejoint donc
  // les textuels dans la liste de changements. On ne regarde PAS `raw` : sur une
  // longue plage le serveur résume en tranches, et la liste serait vide.
  const listing = $derived(binary || spec?.kind?.type === 'string' || spec?.kind?.type === 'text');

  const scale = $derived(scaleFor(series, data, PAD, { w: W, h: H }, binary));
  const line = $derived(stepPath(scale, data, series?.to));
  const band = $derived(bandPath(scale, data, !!series?.buckets?.length));
  const ticks = $derived(ticksFor(scale, binary));
  const stats = $derived(statsFor(data));

  const nf = $derived(new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }));
  const timeFmt = $derived(
    new Intl.DateTimeFormat(locale(), hours > 24 ? { weekday: 'short', day: 'numeric' } : { hour: '2-digit', minute: '2-digit' }),
  );
  const fullFmt = $derived(new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short' }));
  const xTicks = $derived(xTicksFor(series));

  const unit = $derived(spec?.unit ? ` ${spec.unit}` : '');
  const shownNumber = (v) => (binary ? (v ? t('maison.historique.oui') : t('maison.historique.non')) : `${nf.format(v)}${unit}`);
  const shownChange = (v) => {
    if (binary) {
      const on = typeof v === 'boolean' ? v : Number(v) !== 0;
      return on ? t('maison.historique.oui') : t('maison.historique.non');
    }
    return v === true ? t('maison.historique.oui') : v === false ? t('maison.historique.non') : typeof v === 'number' ? `${nf.format(v)}${unit}` : String(v);
  };
  const changes = $derived(listing ? [...(series.raw ?? [])].reverse().slice(0, 30) : []);

  // La feuille prend le clavier : elle s'ouvre sur sa plage active et Tab y
  // tourne en rond, sinon le focus filerait derrière le fond opaque.
  let panel = $state(null);

  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusables = () => [...(panel?.querySelectorAll(FOCUSABLE) ?? [])].filter((el) => !el.disabled);

  $effect(() => {
    focusables().find((el) => el.classList.contains('active'))?.focus();
  });

  function onkey(e) {
    if (e.key === 'Escape') {
      onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="backdrop" onclick={onclose} role="presentation"></div>
<div class="panel" bind:this={panel} role="dialog" aria-modal="true" tabindex="-1" aria-label={t('maison.historique.aria', { name: owner })}>
  <header>
    <div class="who">
      <h3>{title}</h3>
      <p>{owner}</p>
    </div>
    <div class="ranges">
      {#each RANGES as h (h)}
        <button class:active={hours === h} onclick={() => (hours = h)}>{t(RANGE_KEY[h])}</button>
      {/each}
      <button class="close" onclick={onclose} aria-label={t('commun.fermer')}><Icon name="close" size={20} /></button>
    </div>
  </header>

  {#if error}
    <p class="empty">{t('maison.historique.indisponible')}</p>
  {:else if !series}
    <p class="empty">{t('maison.historique.chargement')}</p>
  {:else if listing}
    {#if changes.length}
      <ol class="changes">
        {#each changes as [ts, v], i (i)}
          <li><time class="num">{fullFmt.format(ts)}</time><b>{shownChange(v)}</b></li>
        {/each}
      </ol>
    {:else}
      <p class="empty">{t('maison.historique.vide')}</p>
    {/if}
  {:else if !data.length}
    <p class="empty">{t('maison.historique.vide')}</p>
  {:else}
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={t('maison.historique.courbe', { name: title })}>
      {#each ticks as tick (tick)}
        <line x1={PAD.l} x2={W - PAD.r} y1={scale.y(tick)} y2={scale.y(tick)} class="grid" />
        <text x={PAD.l - 6} y={scale.y(tick) + 4} text-anchor="end" class="axis num">{shownNumber(tick)}</text>
      {/each}
      {#each xTicks as tick, i (tick)}
        <text
          x={scale.x(tick)}
          y={H - 6}
          text-anchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          class="axis num">{timeFmt.format(tick)}</text>
      {/each}
      {#if band}<path d={band} class="band" />{/if}
      <path d={line} class="line" />
    </svg>
    {#if stats}
      <div class="stats">
        <span><small>{t('maison.historique.maintenant')}</small><b class="num">{shownNumber(stats.last)}</b></span>
        <span><small>{t('maison.historique.min')}</small><b class="num">{shownNumber(stats.min)}</b></span>
        <span><small>{t('maison.historique.max')}</small><b class="num">{shownNumber(stats.max)}</b></span>
      </div>
    {/if}
    <p class="meta num">
      {t('maison.historique.changements', { count: series.total })}{#if series.buckets?.length}{' · '}{t('maison.historique.moyenne')}{/if}
    </p>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--ink) 35%, transparent);
    z-index: 30;
  }

  .panel {
    position: fixed;
    z-index: 31;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
    overflow: auto;
    display: grid;
    gap: 12px;
    padding: 18px 20px 20px;
    border-radius: var(--r-lg);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-lift);
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .who {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  h3 {
    font-size: 17px;
    font-weight: 700;
  }

  .who p {
    color: var(--ink-3);
    font-size: 13px;
    font-weight: 650;
  }

  .ranges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .ranges button {
    border: 0;
    border-radius: 999px;
    padding: 6px 12px;
    background: var(--surface-2);
    color: var(--ink-3);
    font-size: 13px;
    font-weight: 650;
  }

  .ranges button.active {
    background: var(--warm-soft);
    color: var(--warm-ink);
  }

  .ranges .close {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    background: none;
    color: var(--ink-3);
  }

  svg {
    width: 100%;
    height: auto;
    display: block;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }

  .axis {
    fill: var(--ink-3);
    font-size: 10px;
  }

  .line {
    fill: none;
    stroke: var(--cool);
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .band {
    fill: color-mix(in srgb, var(--cool) 16%, transparent);
    stroke: none;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .stats span {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    background: var(--surface-2);
  }

  .stats small {
    font-size: 11px;
    font-weight: 650;
    color: var(--ink-3);
  }

  .stats b {
    font-size: 15px;
    font-weight: 700;
  }

  .meta,
  .empty {
    color: var(--ink-3);
    font-size: 13px;
  }

  .changes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
    font-size: 14px;
  }

  .changes li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .changes time {
    color: var(--ink-3);
  }

  @media (max-width: 520px) {
    .panel {
      padding: 14px 14px 16px;
    }
  }
</style>
