<script>
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n.svelte.js';
  import {
    nameOf,
    deviceOf,
    value,
    pinIcon,
    deviceKind,
    isOn,
    doorOpen,
    leak,
    motion,
  } from '../lib/home.svelte.js';
  import Icon from './Icon.svelte';

  let floor = $state(null);
  // Measured image box, snapped to 8 px: a resize fires many events,
  // and the layout below must not re-run for each of them.
  let rawW = $state(0);
  let rawH = $state(0);
  const frameW = $derived(Math.round(rawW / 8) * 8);
  const frameH = $derived(Math.round(rawH / 8) * 8);

  // The card draws at ~400 px: the full plan (two thousand pixels wide,
  // megabytes) is a download the tablet pays and cannot show. The server
  // names the thumbnail next to the image (`thumb`, a `.webp`) when one
  // exists; without it the card takes the full image rather than a guess
  // that would cost a 404 on every load.
  const src = $derived(floor?.thumb ?? floor?.image);

  // Geometry only: where the plan put each device. The device itself is
  // looked up live in the markup, so a state tick never re-runs the layout.
  const spots = $derived((floor?.devices ?? []).map((s) => ({ id: s.id, x: s.x, y: s.y })));

  const lit = (d) =>
    ['light', 'group', 'plug', 'tv', 'speaker', 'fan'].includes(deviceKind(d)) && isOn(d.id);
  const opening = (d) => doorOpen(d.id) === true;
  const triggered = (d) => motion(d.id);
  const alarming = (d) => value(d.id, 'smoke') === true || leak(d.id);

  // Only the devices one can command earn a token, plus the ones whose state
  // is worth seeing from across the room — an open door, someone walking,
  // an alarm. A thermometer that only reports is not drawn at all: the card
  // is a link to the Plan, nobody can act on it here, and eight readings at
  // 22 px buried the rest.
  const HEATS = ['system_mode', 'occupied_heating_setpoint'];
  const LOOKS = ['brightness', 'color', 'color_temp'];
  const SWITCHES = ['on', 'state', 'switch_led', 'switch', 'switch_1'];
  function commands(d) {
    const w = d.points.filter((p) => p.access?.write);
    if (w.some((p) => p.semantic === 'on_off' && p.kind?.type === 'binary')) return true;
    if (w.some((p) => SWITCHES.includes(p.key))) return true;
    if (w.some((p) => HEATS.includes(p.key))) return true;
    return w.some((p) => LOOKS.includes(p.key));
  }

  onMount(async () => {
    try {
      const res = await fetch('/api/plan');
      if (!res.ok) return;
      const plan = await res.json();
      floor = (plan.floors ?? []).find((f) => f.image) ?? null;
    } catch {
      /* the card shows its empty state */
    }
  });

  // The tokens are a fixed size on a small image, so two devices drawn in
  // the same spot would hide one another. Every token is pulled toward its
  // true place, but pushed apart from its too-close neighbours: a short,
  // deterministic relaxation, run in the card's own pixels. Displacement
  // stays small (bounded by SEP / 2 per pair), so a token never strays far
  // from its room.
  const SEP = 28;
  // Half a token plus room for its glow: keeping every centre this far
  // from the image border holds the dot, its warm halo and its alarm
  // pulse on the plan.
  const EDGE = 18;
  const ITERS = 200;
  // The relaxation only depends on where the devices sit and how big the
  // image is — not on their live state — so it runs here, keyed on that
  // geometry, and a temperature tick never recomputes it.
  const shown = $derived.by(() => {
    // A spot whose device is not in the store is never drawn: laying it out
    // anyway would reserve a slot and push the pins that are drawn. Same for
    // a device with nothing to say here — it keeps its place on the Plan
    // page, not on this thumbnail.
    const live = spots.filter((s) => deviceOf(s.id)).filter((s) => {
      const d = deviceOf(s.id);
      return commands(d) || opening(d) || triggered(d) || alarming(d);
    });
    const list = live.map((s) => ({ s, x: s.x * frameW, y: s.y * frameH, vx: 0, vy: 0 }));
    if (!frameW || !frameH || frameW < 3 * EDGE || frameH < 3 * EDGE) {
      return list.map((e) => ({ id: e.s.id, x: e.s.x, y: e.s.y }));
    }
    for (let it = 0; it < ITERS; it++) {
      for (const e of list) {
        e.vx += (e.s.x * frameW - e.x) * 0.03;
        e.vy += (e.s.y * frameH - e.y) * 0.03;
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.hypot(dx, dy);
          if (dist >= SEP) continue;
          // Two tokens exactly on top of each other: split them sideways,
          // a unit step (no division by a near-zero distance).
          if (dist < 1e-6) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          const push = (SEP - dist) * 0.5;
          const ux = dx / dist;
          const uy = dy / dist;
          a.vx += ux * push;
          a.vy += uy * push;
          b.vx -= ux * push;
          b.vy -= uy * push;
        }
      }
      for (const e of list) {
        e.vx *= 0.6;
        e.vy *= 0.6;
        e.x = Math.min(frameW - EDGE, Math.max(EDGE, e.x + e.vx));
        e.y = Math.min(frameH - EDGE, Math.max(EDGE, e.y + e.vy));
      }
    }
    return list.map((e) => ({ id: e.s.id, x: e.x / frameW, y: e.y / frameH }));
  });
</script>

<a class="card plan" href="#/plan" aria-label={t('maison.accueil.plan_ouvrir')}>
  {#if floor?.image}
    <div class="shot">
      <div class="frame">
        <img src="/api/plan/images/{src}" alt="" loading="lazy" bind:clientWidth={rawW} bind:clientHeight={rawH} />
        {#each shown as p (p.id)}
          {@const d = deviceOf(p.id)}
          {#if d}
            <span
              class="pin"
              class:lit={lit(d)}
              class:open={opening(d)}
              class:motion={triggered(d)}
              class:alarm={alarming(d)}
              class:off={d.online === false}
              style="left:{p.x * 100}%; top:{p.y * 100}%"
              title={nameOf(d.id)}
            >
              <span class="dot"><Icon name={pinIcon(d)} size={12} /></span>
            </span>
          {/if}
        {/each}
      </div>
    </div>
  {:else}
    <p class="muted">{t('maison.accueil.plan_vide')}</p>
  {/if}
</a>

<style>
  .plan {
    display: block;
    color: inherit;
    text-decoration: none;
    transition: transform 0.2s var(--ease);
  }

  .plan:hover {
    transform: translateY(-2px);
  }


  .shot {
    display: grid;
    place-items: center;
    margin-top: 12px;
  }

  .frame {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
    border-radius: var(--r-md);
    background: var(--surface-2);
  }

  .frame img {
    display: block;
    max-width: 100%;
    max-height: 360px;
    width: auto;
    height: auto;
    border-radius: var(--r-md);
  }

  .pin {
    position: absolute;
    display: grid;
    justify-items: center;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .dot {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink-2);
    box-shadow: var(--shadow-lift);
  }

  .pin.lit .dot {
    background: var(--warm);
    color: #1c1407;
    box-shadow:
      0 0 0 3px var(--warm-glow),
      0 0 14px 3px var(--warm-glow);
  }

  .pin.open .dot {
    background: var(--cool-soft);
    color: var(--cool);
  }

  /* A movement is red (asked), but steady: the alarm keeps the pulsing
     halo, so a walk-through never looks like smoke or a leak. */
  .pin.motion .dot {
    background: var(--alert);
    color: #fff;
  }

  .pin.alarm .dot {
    background: var(--alert);
    color: #fff;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .pin.off {
    opacity: 0.45;
  }

  @keyframes pulse {
    50% {
      box-shadow: 0 0 0 6px var(--alert-soft);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pin.alarm .dot {
      animation: none;
    }
  }

</style>
