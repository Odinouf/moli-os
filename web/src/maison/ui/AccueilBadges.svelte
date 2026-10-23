<script>
  // La rangée de pastilles de la tablette : Tempo, la consommation de
  // l'appartement et du reste de la maison, puis les appareils qu'on
  // commande d'un tap. Une seule ligne, 36 px de haut, alignée sur les
  // colonnes de cartes, qui défile si l'écran est étroit.
  // Neutre par défaut : la couleur ne dit qu'une anomalie (puissance qui
  // monte), jamais « tout va bien ».
  import { home, value, isOn, toggle, pending } from '../lib/home.svelte.js';
  import { powerTone } from '../lib/power.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  // Tempo (EDF) : la couleur du jour et celle de demain, dans une pastille.
  const COLOURS = ['bleu', 'blanc', 'rouge'];
  const known = (c) => COLOURS.includes(c);
  const tempoId = $derived(home.config?.outdoor?.tempo ?? null);
  const tempoDay = $derived(tempoId ? value(tempoId, 'today') : null);
  const tempoNext = $derived(tempoId ? value(tempoId, 'tomorrow') : null);
  const tempoName = (c) => t(`maison.tempo.${known(c) ? c : 'inconnu'}`);

  // Les deux pinces du Linky : l'appartement et ce qui reste de la maison.
  const linky = $derived(home.config?.badges?.linky ?? 'linky:linky');
  const watts = (key) => {
    const v = value(linky, key);
    return typeof v === 'number' ? `${Math.round(Math.abs(v))} W` : '—';
  };
  const tone = (key) => powerTone(value(linky, key));

  const switches = $derived(home.config?.badges?.switches ?? []);
</script>

<nav class="badges" aria-label={t('maison.accueil.badges')}>
  {#if known(tempoDay)}
    <a class="badge tempo" href="#/energie" title={t('maison.accueil.badges_tempo')} aria-label={`${t('maison.accueil.badges_tempo')} : ${t('maison.accueil.badges_tempo_jour')} ${tempoName(tempoDay)}${known(tempoNext) ? `, ${t('maison.accueil.badges_tempo_demain')} ${tempoName(tempoNext)}` : ''}`}>
      <i class="dot {tempoDay}" aria-hidden="true"></i>
      <span class="tl">{t('maison.accueil.badges_tempo_jour')}</span>{tempoName(tempoDay)}
      {#if known(tempoNext)}
        <i class="dot {tempoNext}" aria-hidden="true"></i>
        <span class="tl">{t('maison.accueil.badges_tempo_demain')}</span>{tempoName(tempoNext)}
      {/if}
    </a>
  {/if}

  <a class="badge {tone('power_appart')}" href="#/energie" title={t('maison.accueil.badge_appart')}>
    <Icon name="flash" size={16} />{watts('power_appart')}
  </a>

  <a class="badge {tone('power_residuel')}" href="#/energie" title={t('maison.accueil.badge_residuel')}>
    <Icon name="bolt" size={16} />{watts('power_residuel')}
  </a>

  {#each switches as s (s.id)}
    <button class="badge" class:on={isOn(s.id)} class:busy={pending(s.id)} aria-pressed={isOn(s.id)} aria-label={s.name} title={s.name} onclick={() => toggle(s.id, s.name)}>
      <Icon name={s.icon ?? 'power'} size={16} />{#if !s.icon_only}{s.name}{/if}
    </button>
  {/each}
</nav>

<style>
  .badges {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
    width: 100%;
    /* La largeur de la grille de cartes de l'Accueil : une colonne de
       464 px tant qu'elles ne tiennent pas côte à côte, deux colonnes
       (2 × 464 + 32 = 960 px) au-dessus de 1100 px — mêmes bornes que
       `.sections`. Le bandeau s'aligne sur les colonnes, jamais sur la
       page entière ; s'il ne tient pas, il défile. */
    max-width: 464px;
    margin-inline: auto;
  }

  @media (min-width: 1100px) {
    .badges {
      max-width: 960px;
    }
  }

  .badge {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    border: 0;
    border-radius: 999px;
    padding: 0 12px;
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    background: var(--surface);
    color: var(--ink-3);
    text-decoration: none;
    cursor: pointer;
    transition: background 0.2s var(--ease), color 0.2s var(--ease);
  }

  .badge.warm {
    background: var(--warm-soft);
    color: var(--warm-ink);
  }

  .badge.alert {
    background: var(--alert-soft);
    color: var(--alert);
  }

  .badge.on {
    background: var(--warm);
    color: #fff;
  }

  .badge.busy {
    opacity: 0.55;
    cursor: progress;
  }

  .badge.tempo {
    gap: 5px;
    color: var(--ink-2);
  }

  .badge.tempo .tl {
    color: var(--ink-3);
    font-weight: 600;
  }

  .badge.tempo .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ink-3);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 12%);
  }

  .badge.tempo .dot + .tl {
    margin-left: 3px;
  }

  .badge.tempo .dot.bleu {
    background: #4b74f2;
  }

  .badge.tempo .dot.rouge {
    background: #df5a40;
  }

  .badge.tempo .dot.blanc {
    background: #eef1f6;
  }
</style>
