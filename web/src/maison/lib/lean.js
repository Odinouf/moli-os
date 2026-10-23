/**
 * Whether this screen should settle for a still rendering: the weather map
 * drawn once instead of a stream of particles. A person who asked for
 * reduced motion wants none of it; a small tablet (a gigabyte of memory) has
 * no frame to spare either.
 *
 * Cores alone are not enough to condemn a machine: four-core laptops and
 * desktops with plenty of memory draw the map fine, and freezing the sky
 * there would take away a signature of the Accueil for nothing. Few cores
 * count only when the memory says the device is small too. What the browser
 * does not report is not held against it.
 */
export function isLean({ deviceMemory, hardwareConcurrency, reducedMotion } = {}) {
  if (reducedMotion) return true;
  const memory = typeof deviceMemory === 'number' ? deviceMemory : null;
  if (memory !== null && memory <= 1) return true;
  return typeof hardwareConcurrency === 'number' && hardwareConcurrency <= 4 && memory !== null && memory <= 2;
}
