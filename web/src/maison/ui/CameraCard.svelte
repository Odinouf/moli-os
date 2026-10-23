<script>
  // La vignette caméra de la tablette (la « picture-entity » de Home
  // Assistant, à côté des poubelles) : la dernière image de la caméra,
  // rafraîchie tant que l'écran est visible, 120 px de haut. Un tap
  // agrandit, comme partout ailleurs dans la maison.
  import { onDestroy, onMount, untrack } from 'svelte';
  import { device, value } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import Icon from './Icon.svelte';

  let { id, name = null, refresh = 10 } = $props();

  const MIN_GAP = 1000;

  let src = $state(null);
  let loading = $state(false);
  let failed = $state(false);
  let visible = document.visibilityState === 'visible';
  let lastAt = 0;
  let destroyed = false;

  const camera = $derived(id);
  const every = $derived(refresh > 0 ? refresh * 1000 : 0);
  const online = $derived(device(id)?.online !== false);
  const title = $derived(name ?? t('maison.accueil.camera'));

  async function load(asked = false) {
    if (loading || !visible) return;
    if (!asked && Date.now() - lastAt < MIN_GAP) return;
    lastAt = Date.now();
    loading = true;
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}/snapshot`);
      if (!res.ok) throw new Error(res.status);
      const url = URL.createObjectURL(await res.blob());
      const img = new Image();
      img.src = url;
      await Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
      if (destroyed) {
        URL.revokeObjectURL(url);
        return;
      }
      if (src) URL.revokeObjectURL(src);
      src = url;
      failed = false;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  function onVisibility() {
    visible = document.visibilityState === 'visible';
    if (visible) load();
  }

  onMount(() => {
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  });

  $effect(() => {
    void camera;
    const ms = every;
    untrack(() => load(true));
    if (!ms) return;
    const timer = setInterval(() => load(), ms);
    return () => clearInterval(timer);
  });

  onDestroy(() => {
    destroyed = true;
    if (src) URL.revokeObjectURL(src);
  });

  const moving = $derived(value(id, 'motion') === true || Number(value(id, 'person') ?? 0) > 0);
</script>

<button class="cam" class:on={moving} onclick={() => load(true)} title={title} aria-label={t('maison.accueil.camera_actualiser', { nom: title })}>
  {#if src}
    <img {src} alt={title} />
  {:else}
    <span class="wait"><Icon name="cctv" size={22} /></span>
  {/if}
  <span class="tag" class:off={!online || failed}><i></i>{title}</span>
</button>

<style>
  .cam {
    all: unset;
    box-sizing: border-box;
    position: relative;
    display: block;
    height: 120px;
    border-radius: var(--r-md);
    overflow: hidden;
    background: #111621;
    box-shadow: var(--shadow);
    cursor: pointer;
    transition: box-shadow 0.2s var(--ease), transform 0.2s var(--ease);
  }

  .cam:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-lift);
  }

  /* Empilée sous les poubelles sur un téléphone : un bandeau de 120 px de
     haut sur toute la largeur n'a plus rien d'une vignette de caméra. */
  @media (max-width: 520px) {
    .cam {
      height: auto;
      aspect-ratio: 16 / 9;
    }
  }

  .cam:focus-visible {
    outline: 3px solid var(--cool);
    outline-offset: 3px;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .wait {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #8a93a8;
  }

  .tag {
    position: absolute;
    left: 8px;
    bottom: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    background: rgb(10 14 22 / 55%);
    backdrop-filter: blur(6px);
    color: #fff;
    font-size: 12px;
    font-weight: 650;
    max-width: calc(100% - 16px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag i {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #3ddc97;
    box-shadow: 0 0 0 3px rgb(61 220 151 / 25%);
  }

  .tag.off i {
    background: #8a93a8;
    box-shadow: none;
  }

  .cam.on .tag i {
    background: var(--warm);
    box-shadow: 0 0 0 3px rgb(245 174 76 / 25%);
  }
</style>
