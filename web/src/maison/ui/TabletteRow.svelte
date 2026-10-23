<script>
  // Une rangée de la tablette : un nom, l'appareil qui la commande, et ses
  // lectures en pastilles (température, humidité, vitesse, consommation).
  // C'est l'équivalent Moli des « bubble card » de la tablette Home
  // Assistant : 56 px de haut, tout tient sur une ligne, un tap commande.
  import { device, isOn, pending, reachable, toggle, value, nameOf, spokenNameOf, pointLabel, historyOf } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  /** `subs` : pastilles de lecture, `{ icon, text, tone, dot, label, point }` —
   *  `dot` ajoute une pastille de couleur après le texte (l'état d'une vanne),
   *  `label` nomme la pastille pour les lecteurs d'écran, `point` (« id/clé »)
   *  la rend tapable : un tap ouvre son historique. `level` : la grandeur
   *  montrée en pourcentage quand la commande est allumée. */
  let { id, name = null, icon = 'light', subs = [], level = null, toggles = true } = $props();

  const d = $derived(device(id));
  const ok = $derived(reachable(id));
  const on = $derived(ok && isOn(id));
  const busy = $derived(pending(id));
  const label = $derived(nameOf(id, name));
  const pct = $derived(level ? value(id, level) : null);

  function tap() {
    if (!toggles || !ok) return;
    toggle(id, label);
  }

  /** Un relevé se lit, il ne commande pas : son tap ouvre l'historique du
   *  point, jamais l'appareil de la rangée. */
  function openHistory(point) {
    const cut = point.indexOf('/');
    historyOf(point.slice(0, cut), point.slice(cut + 1));
  }

  const historyLabel = (point, text) => {
    const cut2 = point.indexOf('/');
    const who = spokenNameOf(point.slice(0, cut2));
    // Le chiffre dit la valeur (« 20.3° »), le libellé du point dit de quoi.
    return t('maison.historique.ouvrir', { name: `${who} · ${pointLabel(null, point.slice(cut2 + 1))} ${text}` });
  };
</script>

<div class="row" class:on class:off={!ok}>
  {#if toggles}
    <button class="main" aria-pressed={on} disabled={busy || !ok} onclick={tap} title={label}>
      <span class="ico"><Icon name={icon} size={18} /></span>
      <span class="name">{label}</span>
      {#if pct != null && on}<span class="lvl num">{Math.round(Number(pct))} %</span>{/if}
    </button>
  {:else}
    <span class="main static" title={label}>
      <span class="ico"><Icon name={icon} size={18} /></span>
      <span class="name">{label}</span>
      {#if pct != null}<span class="lvl num">{Math.round(Number(pct))} %</span>{/if}
    </span>
  {/if}

  <span class="subs">
    {#each subs as s (s.key)}
      {#if s.point}
        <button class="sub {s.tone ?? ''} live" title={s.title ?? s.text} aria-label={historyLabel(s.point, s.text)} onclick={() => openHistory(s.point)}>
          <Icon name={s.icon} size={13} />{s.text}{#if s.dot != null}<i class="dot {s.dot}" aria-hidden="true"></i>{/if}
        </button>
      {:else}
        <span class="sub {s.tone ?? ''}" title={s.title ?? s.text} role={s.label ? 'img' : undefined} aria-label={s.label}><Icon name={s.icon} size={13} />{s.text}{#if s.dot != null}<i class="dot {s.dot}" aria-hidden="true"></i>{/if}</span>
      {/if}
    {/each}
  </span>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 56px;
    padding: 0 14px 0 10px;
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: var(--shadow);
    min-width: 0;
  }

  .main {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1 1 auto;
    border: 0;
    border-radius: 12px;
    padding: 4px 6px;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }

  .main.static {
    cursor: default;
  }

  .main:disabled {
    cursor: default;
  }

  @media (hover: hover) {
    .main:not(.static):not(:disabled):hover {
      background: var(--surface-2);
    }

    .row.off:hover .main {
      background: none;
    }
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
    transition: background 0.2s var(--ease), color 0.2s var(--ease);
  }

  .on .ico {
    background: var(--warm-soft);
    color: var(--warm-ink);
  }

  .off .ico {
    opacity: 0.55;
  }

  .off .name {
    color: var(--ink-3);
  }

  .name {
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lvl {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-3);
  }

  .subs {
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .sub {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--ink-3);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
  }

  /* Un relevé qu'on peut interroger : la pastille se comporte comme un
     bouton, sans prendre le geste de la rangée (qui commande l'appareil).
     La zone tapable s'agrandit sans grossir la pastille : sur une tablette
     murale, 22 px de haut ne se touchent pas au doigt. */
  .sub.live {
    border: 0;
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    padding-block: 11px;
    margin-block: -8px;
    cursor: pointer;
  }

  @media (hover: hover) {
    .sub.live:hover {
      background: var(--surface-3);
      color: var(--ink-2);
    }
  }

  .sub.live:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }

  .sub.warm {
    background: var(--warm-soft);
    color: var(--warm-ink);
  }

  .sub.cool {
    background: var(--cool-soft);
    color: var(--cool);
  }

  .sub.good {
    background: var(--good-soft);
    color: var(--good);
  }

  /* L'état d'une vanne : un point de couleur après la consigne. Une vanne
     éteinte a son propre point, gris plein — pas un point absent, qui se
     lirait comme « rien à dire ». */
  .sub .dot {
    width: 7px;
    height: 7px;
    margin-left: 1px;
    border-radius: 50%;
    background: var(--ink-3);
  }

  .sub .dot.warm {
    background: var(--warm-ink);
  }

  .sub .dot.cool {
    background: var(--cool);
  }

  .sub .dot.alert {
    background: var(--alert);
  }
</style>
