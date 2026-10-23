<script>
  import { home, hub, value, device, clock, num, nameOf, doorOpen, leak, lowBattery, act, pending, HOUSE_TZ } from '../lib/home.svelte.js';
  import { isPrinter, phase } from '../lib/printers.js';
  import { t, locale } from '../../lib/i18n.svelte.js';
  import Icon from '../ui/Icon.svelte';
  import SkyHero from '../ui/SkyHero.svelte';
  import HeatingBar from '../ui/HeatingBar.svelte';
  import WeekWeather from '../ui/WeekWeather.svelte';
  import WeatherNow from '../ui/WeatherNow.svelte';
  import TabletteRows from '../ui/TabletteRows.svelte';
  import BatteryGauge from '../ui/BatteryGauge.svelte';
  import AccueilBadges from '../ui/AccueilBadges.svelte';
  import PlanPreview from '../ui/PlanPreview.svelte';
  import BinsCard from '../ui/BinsCard.svelte';
  import PoolCard from '../ui/PoolCard.svelte';
  import CameraCard from '../ui/CameraCard.svelte';

  const cfg = $derived(home.config ?? {});
  const out = $derived(cfg.outdoor ?? {});

  // La caméra de la tablette : la première des favoris (l'entrée), sinon la
  // première caméra de la maison. Elle n'existe que si elle répond.
  const camera = $derived.by(() => {
    const fav = (cfg.favorites?.cameras ?? [])[0];
    if (fav?.id && device(fav.id)) return { id: fav.id, name: fav.name ?? nameOf(fav.id) };
    const cam = Object.values(hub.devices).find((d) => d.camera === true);
    return cam ? { id: cam.id, name: nameOf(cam.id) } : null;
  });


  // The house's mode (a helper, « Mode Maison »): one tap, like Home
  // Assistant's mode buttons.
  const modeDevice = $derived(Object.values(hub.devices).find((d) => d.id.endsWith(':mode_maison')));
  const modes = $derived(modeDevice?.points.find((p) => p.key === 'state')?.kind.values ?? []);
  const mode = $derived(modeDevice ? value(modeDevice.id, 'state') : null);
  const MODE_ICON = { Normal: 'home', Nuit: 'moon', Absent: 'lock', Vacances: 'palm' };
  /** A mode's name in the house's language (an unknown one shows as it is). */
  function modeName(m) {
    const key = `maison.accueil.mode.${String(m).toLowerCase()}`;
    const word = t(key);
    return word === key ? m : word;
  }
  function setMode(m) {
    if (m !== mode) act(`${modeDevice.id}/state`, m, t('maison.accueil.mode_action', { mode: modeName(m) }));
  }

  // The speakers that talk (announcements): one tap silences them all, for
  // four hours at most (they speak again by themselves).
  const talkers = $derived(Object.values(hub.devices).filter((d) => d.points.some((p) => p.key === 'quiet' && p.access?.write)));
  const quiet = $derived(talkers.some((d) => value(d.id, 'quiet') === true));
  const quietUntil = $derived(Math.max(0, ...talkers.map((d) => Number(value(d.id, 'quiet_until') ?? 0))));
  function toggleQuiet() {
    for (const d of talkers) act(`${d.id}/quiet`, !quiet, quiet ? t('maison.accueil.annonces_retablies') : t('maison.accueil.annonces_coupees'));
  }

  // What deserves a word right now. Silence when all is well.
  const notices = $derived.by(() => {
    const list = [];
    // Smoke and water from any sensor that knows it, not only the listed ones.
    const all = Object.values(hub.devices);
    for (const d of all) {
      if (value(d.id, 'smoke') === true) list.push({ tone: 'alert', icon: 'fire', text: t('maison.accueil.fumee', { name: nameOf(d.id) }), href: '#/pieces' });
      if (leak(d.id)) list.push({ tone: 'alert', icon: 'water', text: t('maison.accueil.fuite', { name: nameOf(d.id) }), href: '#/pieces' });
    }
    if (hub.approvals?.length) list.push({ tone: 'cool', icon: 'lock', text: t('maison.accueil.demandes', { count: hub.approvals.length }), href: '#/atelier' });
    for (const door of cfg.doors ?? []) {
      const d = device(door.id);
      if (!d) continue;
      if (doorOpen(door.id) === true) list.push({ tone: 'warm', icon: 'door-open', text: t('maison.accueil.porte_ouverte', { name: door.name }), href: '#/pieces' });
    }
    const bell = (cfg.favorites?.cameras ?? [])[0]?.id;
    if (bell && value(bell, 'doorbell') === true) list.push({ tone: 'alert', icon: 'bell', text: t('maison.accueil.sonnette'), href: '#/cameras' });
    if (bell && value(bell, 'person') === true) list.push({ tone: 'warm', icon: 'account', text: t('maison.accueil.quelquun'), href: '#/cameras' });
    for (const p of Object.values(hub.devices).filter(isPrinter)) {
      if (p.online === false) continue;
      const st = phase(value(p.id, 'state'));
      const left = value(p.id, 'remaining');
      const pct = Math.round(Number(value(p.id, 'progress') ?? 0));
      if (st === 'printing') {
        const text =
          typeof left === 'number'
            ? t('maison.accueil.impression_fin', { name: nameOf(p.id), pct, time: clock(home.now + left * 60_000) })
            : t('maison.accueil.impression', { name: nameOf(p.id), pct });
        list.push({ tone: 'cool', icon: 'printer3d', text, href: '#/impression' });
      } else if (st === 'paused') {
        list.push({ tone: 'warm', icon: 'printer3d', text: t('maison.accueil.impression_pause', { name: nameOf(p.id), pct }), href: '#/impression' });
      } else if (st === 'error') {
        list.push({ tone: 'alert', icon: 'printer3d', text: t('maison.accueil.impression_erreur', { name: nameOf(p.id) }), href: '#/impression' });
      }
    }
    if (value('energie:maison', 'over_budget') === true) {
      const bill = value('energie:maison', 'bill_projection');
      list.push({ tone: 'warm', icon: 'bolt', text: t('maison.accueil.facture', { bill: num(bill) }), href: '#/energie' });
    }
    // A dead battery takes its sensor offline: count it all the same.
    const flat = all.filter((d) => lowBattery(d.id));
    if (flat.length) {
      const text =
        flat.length <= 3
          ? t('maison.accueil.piles_liste', { count: flat.length, names: flat.map((d) => nameOf(d.id)).join(', ') })
          : t('maison.accueil.piles', { count: flat.length });
      list.push({ tone: 'cool', icon: 'alert', text, href: '#/pieces' });
    }
    if (out.pool && value(out.pool, 'action_required') === true) list.push({ tone: 'cool', icon: 'pool', text: t('maison.accueil.piscine_oeil'), href: '#/dehors' });
    return list;
  });
</script>

<div class="accueil">
  <SkyHero><PlanPreview /></SkyHero>

  {#if modes.length}
    <div class="modes" role="radiogroup" aria-label={t('maison.accueil.mode_maison')}>
      {#each modes as m (m)}
        <button role="radio" aria-checked={m === mode} class:on={m === mode} disabled={pending(modeDevice.id, 'state')} onclick={() => setMode(m)}>
          <Icon name={MODE_ICON[m] ?? 'home'} size={16} />{modeName(m)}
        </button>
      {/each}
      {#if talkers.length}
        <span class="sep" aria-hidden="true"></span>
        <button class="hush" class:on={quiet} aria-pressed={quiet} onclick={toggleQuiet} title={quiet ? t('maison.accueil.sonos_reparle') : t('maison.accueil.sonos_coupe')}>
          <Icon name={quiet ? 'volume-off' : 'speaker'} size={16} />{quiet && quietUntil ? t('maison.accueil.sonos_muette_jusqua', { time: new Date(quietUntil).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: HOUSE_TZ }) }) : t('maison.accueil.sonos_muette')}
        </button>
      {/if}
    </div>
  {/if}

  <section class="notices" aria-label={t('maison.accueil.a_savoir')}>
    {#each notices as n (n.text)}
      <a class="chip {n.tone}" href={n.href}><Icon name={n.icon} size={16} />{n.text}</a>
    {:else}
      <span class="chip good"><Icon name="leaf" size={16} />{t('maison.accueil.calme')}</span>
    {/each}
  </section>

  <AccueilBadges />

  <div class="sections">
    <div class="col">
      <WeatherNow />
      <WeekWeather />
      <HeatingBar />
      <TabletteRows />
    </div>

    <div class="col">
      <div class="bins-cam">
        <BinsCard />
        {#if camera}<CameraCard id={camera.id} name={camera.name} />{/if}
      </div>
      {#if out.pool}<PoolCard />{/if}
      <BatteryGauge />
    </div>
  </div>
</div>

<style>
  .accueil {
    display: grid;
    gap: 22px;
  }

  .modes {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
  }

  .modes button {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    border-radius: 999px;
    padding: 8px 14px;
    font: inherit;
    font-size: 14px;
    font-weight: 650;
    background: var(--surface-2);
    color: var(--ink-3);
    cursor: pointer;
  }

  .modes button.on {
    background: var(--warm-soft);
    color: var(--warm-ink);
  }

  .modes .sep {
    flex: none;
    width: 1px;
    margin: 6px 4px;
    background: var(--line, color-mix(in srgb, var(--ink) 14%, transparent));
  }

  .modes button.hush.on {
    background: color-mix(in srgb, var(--alert) 16%, var(--surface-2));
    color: var(--alert);
  }

  .notices {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .notices a {
    text-decoration: none;
  }

  .notices .chip {
    padding: 9px 14px;
    font-size: 14px;
  }

  /* La grille à deux colonnes de la tablette : deux colonnes égales,
     gouttière de 32 px, l'ensemble centré. Le contenu de la page peut être
     plus large que 928 px : sans le centrage, les deux colonnes restaient
     collées à gauche en laissant un grand vide à droite (on croyait à une
     troisième colonne manquante). */
  .sections {
    display: grid;
    gap: 32px;
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    max-width: 464px;
    margin-inline: auto;
  }

  .col {
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
  }

  /* Poubelles empilées à gauche, caméra à droite : le « horizontal-stack »
     de la tablette. La caméra prend la place restante. */
  .bins-cam {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  /* Deux colonnes dès qu'elles tiennent vraiment (2 × 464 + 32 = 960 px de
     contenu, soit ~1100 px de fenêtre avec la barre latérale) : en dessous,
     deux colonnes de 360 px ne se lisent pas. Une seule colonne, bornée à
     464 px et centrée, dans tous les autres cas. */
  @media (min-width: 1100px) {
    .sections {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      max-width: 960px;
    }
  }

  /* Sur un téléphone, les poubelles et la caméra s'empilent : deux
     vignettes de 160 px de large ne se lisent pas. */
  @media (max-width: 520px) {
    .bins-cam {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .small {
    font-size: 13px;
    margin-top: 10px;
  }
</style>
