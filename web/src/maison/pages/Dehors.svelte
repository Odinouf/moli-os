<script>
  import { home, value, num, isOn, reachable, device, powerKey, historyOf } from '../lib/home.svelte.js';
  import { weatherOf } from '../lib/icons.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from '../ui/Icon.svelte';
  import LightTile from '../ui/LightTile.svelte';
  import CameraTile from '../ui/CameraTile.svelte';

  const out = $derived(home.config?.outdoor ?? {});
  const w = $derived(out.weather);
  const air = $derived(out.air);
  const pool = $derived(out.pool);
  const v = (id, key) => value(id, key);
  const histTitle = (k) => t('maison.historique.ouvrir', { name: `${t('maison.dehors.titre')} · ${t(`maison.dehors.${k}`)}` });

  const day = $derived(v(w, 'daylight') !== false);
  const sky = $derived(weatherOf(v(w, 'weather_code'), day));
  const hhmm = (iso) => (iso ? String(iso).slice(11, 16) : '—');

  const aqi = $derived(v(air, 'aqi'));
  const aqiWord = $derived(
    aqi == null
      ? '—'
      : aqi <= 20
        ? t('maison.air.tres_bon')
        : aqi <= 40
          ? t('maison.air.bon')
          : aqi <= 60
            ? t('maison.air.moyen')
            : aqi <= 80
              ? t('maison.air.mediocre')
              : t('maison.air.mauvais'),
  );
  const aqiTone = $derived(aqi == null ? '' : aqi <= 40 ? 'good' : aqi <= 60 ? 'warm' : 'alert');
  const uv = $derived(v(air, 'uv_index'));
  const uvWord = $derived(
    uv == null ? '' : uv < 3 ? t('maison.dehors.uv_faible') : uv < 6 ? t('maison.dehors.uv_modere') : uv < 8 ? t('maison.dehors.uv_eleve') : t('maison.dehors.uv_tres_eleve'),
  );

  // Pool chemistry: in range or not, in words.
  const ph = $derived(v(pool, 'ph'));
  const orp = $derived(v(pool, 'orp'));
  const phWord = $derived(
    ph == null ? null : ph < 7.0 ? t('maison.dehors.ph_acide') : ph > 7.6 ? t('maison.dehors.ph_basique') : t('maison.dehors.ph_equilibre'),
  );
  const orpWord = $derived(
    orp == null ? null : orp < 650 ? t('maison.dehors.orp_faible') : orp > 800 ? t('maison.dehors.orp_forte') : t('maison.dehors.orp_saine'),
  );
  const pumpId = $derived(out.pool_pump);
  const pumpKnown = $derived(pumpId && reachable(pumpId) && powerKey(device(pumpId)) != null);

  const outsideCams = $derived((home.config?.favorites?.cameras ?? []).filter((c) => !/sonnette|doorbell/i.test(c.name)));

  const sunPos = $derived.by(() => {
    const rise = Date.parse(v(w, 'sunrise'));
    const set = Date.parse(v(w, 'sunset'));
    if (!Number.isFinite(rise) || !Number.isFinite(set)) return null;
    return Math.min(1, Math.max(0, (home.now - rise) / (set - rise)));
  });
</script>

<div class="dehors">
  <header>
    <h1 class="page-title">{t('maison.dehors.titre')}</h1>
    <p class="page-sub">{t('maison.dehors.sous_titre')}</p>
  </header>

  <section class="card sky" class:night={!day}>
    <div class="now">
      <svg class="sky-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={sky.icon} /></svg>
      <div>
        <button class="temp live num" onclick={() => historyOf(w, 'temperature')} title={t('maison.historique.ouvrir', { name: `${t('maison.dehors.titre')} · ${t('commun.piece.temperature')}` })} aria-label={t('maison.historique.ouvrir', { name: `${t('maison.dehors.titre')} · ${t('commun.piece.temperature')}` })}>{num(v(w, 'temperature'), 0)}°</button>
        <span class="label">{sky.label}</span>
        <span class="muted">{t('maison.dehors.ressenti')} <button class="live num" onclick={() => historyOf(w, 'feels_like')} title={histTitle('ressenti')} aria-label={histTitle('ressenti')}>{num(v(w, 'feels_like'), 0)}°</button> · {t('maison.dehors.ressenti_ecart', { max: num(v(w, 'today_max'), 0), min: num(v(w, 'today_min'), 0) })}</span>
      </div>
    </div>
    <div class="facts">
      <div><Icon name="humidity" size={20} /><small>{t('maison.dehors.humidite')}</small><button class="live num" onclick={() => historyOf(w, 'humidity')} title={histTitle('humidite')} aria-label={histTitle('humidite')}>{num(v(w, 'humidity'))} %</button></div>
      <div><Icon name="wind" size={20} /><small>{t('maison.dehors.vent')}</small><button class="live num" onclick={() => historyOf(w, 'wind_speed')} title={histTitle('vent')} aria-label={histTitle('vent')}>{num(v(w, 'wind_speed'))} km/h</button><em class="muted num">{t('maison.dehors.rafales')} <button class="live num" onclick={() => historyOf(w, 'wind_gusts')} title={histTitle('rafales')} aria-label={histTitle('rafales')}>{num(v(w, 'wind_gusts'))} km/h</button></em></div>
      <div><Icon name="water" size={20} /><small>{t('maison.dehors.pluie_jour')}</small><button class="live num" onclick={() => historyOf(w, 'today_rain')} title={histTitle('pluie_jour')} aria-label={histTitle('pluie_jour')}>{num(v(w, 'today_rain'), 1)} mm</button><em class="muted num">{t('maison.dehors.risque', { pct: num(v(w, 'today_rain_chance')) })}</em></div>
      <div><Icon name="sun-angle" size={20} /><small>{t('maison.dehors.soleil')}</small><b class="num">{hhmm(v(w, 'sunrise'))} → {hhmm(v(w, 'sunset'))}</b></div>
    </div>
    {#if sunPos != null}
      <div class="sunline" aria-hidden="true"><i style="left:{sunPos * 100}%"></i></div>
    {/if}
  </section>

  <div class="grid">
    <section class="card">
      <div class="card-head"><h2><Icon name="leaf" size={18} />{t('maison.dehors.air')}</h2><span class="chip {aqiTone}">{aqiWord}</span></div>
      <div class="pairs">
        <div><small>{t('maison.dehors.indice')}</small>{#if v(air, 'aqi') != null}<button class="live num" onclick={() => historyOf(air, 'aqi')} title={histTitle('indice')} aria-label={histTitle('indice')}>{num(aqi)}</button>{:else}<b class="num">—</b>{/if}</div>
        <div><small>UV</small>{#if v(air, 'uv_index') != null}<button class="live num" onclick={() => historyOf(air, 'uv_index')} title={t('maison.historique.ouvrir', { name: `${t('maison.dehors.air')} · UV` })} aria-label={t('maison.historique.ouvrir', { name: `${t('maison.dehors.air')} · UV` })}>{num(uv, 0)}</button>{:else}<b class="num">—</b>{/if}<em class="muted">{uvWord}</em></div>
        <div><small>{t('maison.dehors.particules')}</small><b class="num">{num(v(air, 'pm2_5'), 1)} µg/m³</b></div>
        <div><small>{t('maison.dehors.ozone')}</small><b class="num">{num(v(air, 'ozone'))} µg/m³</b></div>
      </div>
    </section>

    {#if pool}
      <section class="card">
        <div class="card-head">
          <h2><Icon name="pool" size={18} />{t('maison.dehors.piscine')}</h2>
          {#if v(pool, 'action_required') === true}<span class="chip cool">{t('maison.dehors.coup_oeil')}</span>{:else}<span class="chip good">{t('maison.dehors.tout_va_bien')}</span>{/if}
        </div>
        <div class="pairs">
          <div><small>{t('maison.dehors.eau')}</small>{#if v(pool, 'temperature') != null}<button class="live num" onclick={() => historyOf(pool, 'temperature')} title={histTitle('eau')} aria-label={histTitle('eau')}>{num(v(pool, 'temperature'), 1)}°</button>{:else}<b class="num">—</b>{/if}</div>
          <div><small>pH</small>{#if ph != null}<button class="live num" onclick={() => historyOf(pool, 'ph')} title={histTitle('piscine')} aria-label={histTitle('piscine')}>{num(ph, 1)}</button>{:else}<b class="num">—</b>{/if}{#if phWord}<em class="muted">{phWord}</em>{/if}</div>
          <div><small>{t('maison.dehors.chlore')}</small>{#if orp != null}<button class="live num" onclick={() => historyOf(pool, 'orp')} title={histTitle('chlore')} aria-label={histTitle('chlore')}>{num(orp)} mV</button>{:else}<b class="num">—</b>{/if}{#if orpWord}<em class="muted">{orpWord}</em>{/if}</div>
          <div><small>{t('maison.dehors.filtration')}</small><b class="num">{v(pool, 'filtration') != null ? t('maison.dehors.heures_jour', { hours: num(v(pool, 'filtration')) }) : '—'}</b></div>
        </div>
        {#if v(pool, 'temperature') == null && ph == null}
          <p class="muted small">{t('maison.dehors.sans_mesure')}</p>
        {/if}
        {#if pumpId}
          <div class="pump">
            {#if pumpKnown}
              <LightTile id={pumpId} name={t('maison.dehors.pompe')} icon="pool" compact />
            {:else}
              <p class="muted small"><Icon name="info" size={15} />{t('maison.dehors.pompe_inconnue')}</p>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    {#if out.garden_lights?.length}
      <section class="card">
        <div class="card-head"><h2><Icon name="flower-outline" size={18} />{t('maison.dehors.jardin')}</h2>
          <span class="muted">{out.garden_lights.filter((l) => isOn(l.id)).length ? t('maison.dehors.eclaire') : t('maison.dehors.noir')}</span>
        </div>
        <div class="lights">
          {#each out.garden_lights as l (l.id)}
            <LightTile id={l.id} name={l.name} icon="light" compact />
          {/each}
        </div>
      </section>
    {/if}
  </div>

  {#if outsideCams.length}
    <section class="cams">
      {#each outsideCams as cam (cam.id)}
        <CameraTile id={cam.id} name={cam.name} refresh={cam.refresh} battery={cam.battery} onopen={() => (location.hash = '#/cameras')} />
      {/each}
    </section>
  {/if}

  {#if w || air}
    <!-- CC BY 4.0: the weather and air data credit their source. -->
    <p class="credit">{t('maison.dehors.credit')} <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a></p>
  {/if}
</div>

<style>
  .credit {
    color: var(--ink-3);
    font-size: 12px;
    text-align: center;
  }

  .credit a {
    color: inherit;
  }

  .dehors {
    display: grid;
    gap: 20px;
  }

  .sky {
    padding: 28px;
    overflow: hidden;
    background:
      radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--sun) 22%, transparent), transparent 55%),
      var(--surface);
  }

  .sky.night {
    background:
      radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--cool) 22%, transparent), transparent 55%),
      var(--surface);
  }

  .now {
    display: flex;
    align-items: center;
    gap: 22px;
  }

  .sky-icon {
    width: 96px;
    height: 96px;
    fill: var(--sun);
    flex: none;
  }

  .night .sky-icon {
    fill: var(--cool);
  }

  .now > div {
    display: grid;
    gap: 2px;
  }

  .temp {
    font-size: 64px;
    font-weight: 250;
    letter-spacing: -0.04em;
    line-height: 0.95;
  }

  .label {
    font-size: 20px;
    font-weight: 650;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-top: 26px;
  }

  .facts > div,
  .pairs > div {
    display: grid;
    gap: 2px;
    align-content: start;
  }

  .facts :global(svg) {
    color: var(--ink-3);
    margin-bottom: 4px;
  }

  small {
    font-size: 12px;
    font-weight: 650;
    color: var(--ink-3);
  }

  b {
    font-size: 17px;
    font-weight: 650;
  }

  /* Un relevé cliquable garde la taille et la graisse de sa valeur ; seul
     son geste change (il ouvre l'historique, il ne commande rien). */
  .live {
    border: 0;
    padding: 1px 6px;
    margin: -1px -6px;
    border-radius: var(--r-sm);
    background: none;
    color: inherit;
    font: inherit;
    font-size: 17px;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }

  .now .temp.live {
    font-size: 64px;
    font-weight: 250;
    letter-spacing: -0.04em;
    line-height: 0.95;
  }

  @media (hover: hover) {
    .live:hover {
      background: color-mix(in srgb, var(--ink) 7%, transparent);
    }
  }

  .live:focus-visible {
    outline: 2px solid var(--cool);
    outline-offset: 2px;
  }

  em {
    font-style: normal;
    font-size: 13px;
  }

  .sunline {
    position: relative;
    height: 4px;
    border-radius: 4px;
    margin-top: 22px;
    background: linear-gradient(90deg, var(--surface-3), var(--sun), var(--surface-3));
  }

  .sunline i {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--sun);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--sun) 30%, transparent);
    transform: translate(-50%, -50%);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    align-items: start;
  }

  .pairs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px 16px;
  }

  .small {
    font-size: 13px;
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pump {
    margin-top: 16px;
  }

  .lights {
    display: grid;
    gap: 10px;
  }

  .cams {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
    gap: 20px;
  }

  @media (max-width: 760px) {
    .facts {
      grid-template-columns: 1fr 1fr;
    }

    .sky-icon {
      width: 64px;
      height: 64px;
    }

    .temp {
      font-size: 52px;
    }

    .now .temp.live {
      font-size: 52px;
    }
  }
</style>
