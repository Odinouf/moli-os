<script>
  import { onMount } from 'svelte';
  import { hub } from './lib/hub.svelte.js';
  import Maison from './maison/Maison.svelte';
  import Atelier from './Atelier.svelte';

  // Two faces, one hub: « Maison » for the family (default), « Atelier »
  // for tinkering with every device. Routes live in the hash.
  const read = () => location.hash.replace(/^#\/?/, '');
  let route = $state(read());

  onMount(() => {
    const update = () => {
      // Le point ouvert appartient à la page qui l'a demandé : changer de
      // page referme la feuille, sinon elle réapparaîtrait sur l'Accueil.
      hub.chart = null;
      route = read();
    };
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  });
</script>

{#if route === 'atelier' || route.startsWith('atelier/')}
  <Atelier />
{:else}
  <Maison {route} />
{/if}
