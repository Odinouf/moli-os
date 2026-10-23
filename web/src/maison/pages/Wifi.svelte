<script>
  // Wifi : de quoi rejoindre le réseau de la maison. Les images (QR codes)
  // viennent de /api/plan/images, leur nom = empreinte du contenu.
  import { home } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from '../ui/Icon.svelte';

  const wifi = $derived(home.config?.wifi ?? {});
  const shots = $derived(
    [
      { key: 'bbox', label: t('maison.wifi.bbox'), img: wifi.bbox },
      { key: 'mercusys', label: t('maison.wifi.mercusys'), img: wifi.mercusys },
    ].filter((s) => s.img),
  );
</script>

<div class="wifi">
  <header class="head">
    <div>
      <h1 class="page-title">{t('maison.wifi.titre')}</h1>
      <p class="page-sub">{t('maison.wifi.sous_titre')}</p>
    </div>
  </header>

  {#if shots.length}
    <p class="muted small"><Icon name="wifi" size={15} />{t('maison.wifi.scan')}</p>
    <div class="shots">
      {#each shots as s (s.key)}
        <section class="card shot">
          <h2>{s.label}</h2>
          <img src="/api/plan/images/{s.img}" alt={s.label} loading="lazy" />
        </section>
      {/each}
    </div>
  {:else}
    <p class="muted">{t('maison.accueil.plan_vide')}</p>
  {/if}
</div>

<style>
  .wifi {
    display: grid;
    gap: 20px;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px 16px;
  }

  .small {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .shots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: 20px;
  }

  .shot {
    display: grid;
    gap: 12px;
    place-items: center;
  }

  .shot h2 {
    font-size: 15px;
    font-weight: 700;
    justify-self: start;
  }

  .shot img {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: var(--r-md);
    background: #fff;
  }
</style>
