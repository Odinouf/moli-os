<script>
  // The rooms at a glance: one pastille a room with the temperature and, when
  // a sensor knows it, the humidity. The colour follows the temperature
  // (cold blue → hot red), so the page reads at arm's length. A tap opens
  // the room's page with all its lights.
  import { home, roomList, value, num, tempIgnored } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  /** The layout's rooms, in its order, with the readings from their sensors. */
  const rooms = $derived.by(() => {
    const byName = new Map(roomList().map((r) => [r.name, r]));
    const defs = (home.config?.rooms ?? []).length ? home.config.rooms : [...byName.keys()].map((name) => ({ name }));
    return defs
      .map((def) => {
        const room = byName.get(def.name);
        const list = room ? [...room.sensors, ...room.climates] : [];
        const online = list.filter((d) => d.online !== false);
        const skip = tempIgnored(def.name);
        const temps = online.filter((d) => !skip.has(d.id)).map((d) => value(d.id, 'temperature') ?? value(d.id, 'temp_current') ?? value(d.id, 'local_temperature')).filter((x) => typeof x === 'number');
        const hums = online.map((d) => value(d.id, 'humidity') ?? value(d.id, 'humidity_value')).filter((x) => typeof x === 'number');
        const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
        return { name: def.name, icon: def.icon ?? 'home', temp: avg(temps), humidity: avg(hums) };
      })
      .filter((r) => r.temp != null || r.humidity != null || byName.has(r.name));
  });

  const tone = (deg) => (deg == null ? '' : deg < 18 ? 'cold' : deg < 20 ? 'cool' : deg <= 24 ? 'good' : deg <= 27 ? 'warm' : 'hot');
</script>

{#if rooms.length}
  <section class="card rooms" aria-label={t('maison.accueil.pieces_titre')}>
    <div class="strip">
      {#each rooms as r (r.name)}
        <a class="pastille {tone(r.temp)}" href="#/pieces" title={r.name}>
          <span class="room-ico"><Icon name={r.icon} size={18} /></span>
          <span class="words">
            <b>{r.name}</b>
            <span class="readings">
              {#if r.temp != null}<span class="t num">{num(r.temp, 1)}°</span>{/if}
              {#if r.humidity != null}<span class="h num"><Icon name="humidity" size={12} />{num(r.humidity, 0)}%</span>{/if}
              {#if r.temp == null && r.humidity == null}<span class="h">{t('maison.accueil.sans_mesure')}</span>{/if}
            </span>
          </span>
        </a>
      {/each}
    </div>
  </section>
{/if}

<style>
  .rooms {
    display: grid;
    gap: 12px;
  }

  .strip {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    scrollbar-width: thin;
    padding-bottom: 4px;
  }

  .pastille {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 150px;
    padding: 10px 12px;
    border-radius: 16px;
    background: var(--surface-2);
    color: inherit;
    text-decoration: none;
  }

  .room-ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 11px;
    background: var(--surface);
    color: var(--ink-3);
  }

  .words {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .words b {
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .readings {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
  }

  .readings .t {
    font-size: 16px;
    font-weight: 750;
  }

  .readings .h {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-3);
  }

  .cold .readings .t {
    color: #3b7bea;
  }

  .cool .readings .t {
    color: #2aa5bd;
  }

  .good .readings .t {
    color: #2f9e55;
  }

  .warm .readings .t {
    color: #e08a00;
  }

  .hot .readings .t {
    color: #e5482b;
  }
</style>
