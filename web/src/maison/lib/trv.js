// A thermostatic valve, seen from the Accueil: which valve belongs to a row,
// and what it is doing right now. No device id here — a row names its valve,
// or the valve is found in the row's own room.
//
// Deliberately dependency-free (no Svelte, no hub): the row component and the
// node tests load the same code. `roomKey` is the dashboard's one
// normalization rule, in `lib/rooms.js`.
import { roomKey } from './rooms.js';

/** The points that make a climate device a thermostatic valve: it states its
 *  target the ZCL way, not as Home Assistant's `target_temperature`. */
export const VALVE_KEYS = ['occupied_heating_setpoint', 'system_mode'];

const has = (d, key) => (d?.points ?? []).some((p) => p.key === key);

/** A valve is a climate device that speaks the ZCL setpoint
 *  (`deviceKind`, in `lib/kinds.js`, reads the same `VALVE_KEYS`). */
export function isValve(d) {
  return VALVE_KEYS.some((k) => has(d, k));
}

/** The valve of a room: the first valve whose room is that room. */
export function valveIn(devices, room, roomOf) {
  if (!room) return null;
  const key = roomKey(room);
  return devices.find((d) => isValve(d) && roomKey(roomOf(d)) === key) ?? null;
}

/** What the valve is doing, in the four states a household reads at a glance:
 *  unplugged, shut, heating, and waiting. `null` when it says nothing at all
 *  (no setpoint yet): a witness with no reading would be a lie.
 *
 *  `read` is `value(id, key)` from `home.svelte.js`. */
export function witnessOf(d, read) {
  if (!d) return null;
  const setpoint = read(d.id, 'occupied_heating_setpoint');
  const mode = read(d.id, 'system_mode');
  const running = read(d.id, 'running_state');
  if (typeof setpoint !== 'number' && mode == null) return null;
  // A TRVZB states `running_state` the ZCL way: `heat` when the valve opens,
  // `idle` when it closes — never `heating` (that is Home Assistant's word).
  const heating = running === 'heat' || running === 'heating';
  const state = d.online === false ? 'offline' : mode === 'off' ? 'off' : heating ? 'heating' : 'idle';
  return { state, setpoint: typeof setpoint === 'number' ? setpoint : null };
}
