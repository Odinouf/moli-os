<script>
  // La pile de rangées de la tablette (colonne de gauche) : une rangée par
  // appareil commandé depuis l'Accueil, avec ses lectures en pastilles —
  // l'équivalent Moli des « bubble card » de Home Assistant.
  //
  // La liste vient de `data/home.json` (`tablette.rows`) : c'est la maison
  // qui nomme ses appareils, pas le code. Une entrée porte un `room` (on
  // prend le premier appareil de la pièce), ou un `match` (expression
  // régulière sur le nom), ou un `id` explicite ; `kind` filtre le genre,
  // `pair` met deux rangées côte à côte, `toggles: false` rend la rangée
  // en lecture seule, `level` affiche un pourcentage, `power` ajoute la
  // consommation d'une pince du Linky, `valve` nomme la vanne thermostatique
  // dont la rangée porte le témoin (à défaut, la vanne de sa pièce).
  import { home, hub } from '../lib/home.svelte.js';
  import { t } from '../../lib/i18n.svelte.js';
  import { deriveRows } from '../lib/layout.js';
  import TabletteRow from './TabletteRow.svelte';

  const devices = $derived(Object.values(hub.devices));
  // `deriveRows` always gives every row its `subs` array: no copy needed.
  const rows = $derived(deriveRows(home.config, devices, t));

  const groups = $derived.by(() => {
    const out = [];
    for (const r of rows) {
      const last = out.at(-1);
      if (r.pair && last?.pair) last.items.push(r);
      else out.push({ pair: r.pair, items: [r] });
    }
    return out;
  });

</script>

<div class="rows" aria-label={t('maison.accueil.tablette_lignes')} role="group">
  {#each groups as g, i (i)}
    {#if g.pair}
      <div class="pair">
        {#each g.items as r (r.key)}
          <TabletteRow id={r.id} name={r.label} icon={r.icon} level={r.level} toggles={r.toggles} subs={r.subs} />
        {/each}
      </div>
    {:else}
      {#each g.items as r (r.key)}
        <TabletteRow id={r.id} name={r.label} icon={r.icon} level={r.level} toggles={r.toggles} subs={r.subs} />
      {/each}
    {/if}
  {/each}
</div>

<style>
  .rows {
    display: grid;
    gap: 8px;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  @media (max-width: 760px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
