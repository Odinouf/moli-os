// Rooms, compared the way the household writes them: `Étage` = `etage`,
// `VMC  +  SDB` = `vmc + sdb`. One normalization rule for the whole
// dashboard — the model (`home.svelte.js`), the rows (`layout.js`), the
// valve witness (`trv.js`) and the node tests all read it here.
//
// Dependency-free on purpose: no Svelte runes, no hub, so `node --test`
// can load it.

export function roomKey(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** The layout's name for a room called `raw` somewhere (a bridge, the plan):
 *  `home.json`'s own name when an alias matches (« Cave » → « Cave à Vins »,
 *  « Appart » → « Appartement »), `raw` otherwise. `rooms` is
 *  `home.config.rooms`. */
export function roomNamed(raw, rooms = []) {
  const key = roomKey(raw);
  for (const room of rooms) {
    if ([room.name, ...(room.aliases ?? [])].some((n) => roomKey(n) === key)) return room.name;
  }
  return raw;
}

/** The room a device is in, by the layout's names and aliases: the
 *  household's label first, the bridge's second. */
export function roomOf(d, rooms = []) {
  const raw = d?.label?.room || d?.native_room || null;
  return raw ? roomNamed(raw, rooms) : null;
}
