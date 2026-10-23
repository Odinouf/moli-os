// La géométrie d'un historique : une seule implémentation, deux habillages
// (la feuille de la Maison et le panneau de l'Atelier dessinent les mêmes
// courbes). Rien ici ne touche au DOM : tout se calcule à partir de la
// réponse de `/api/history`, donc tout se teste.

/** Une valeur d'historique en nombre, ou null si elle ne se dessine pas. */
export function toNum(v) {
  if (typeof v === 'boolean') return Number(v);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return null;
}

/** Points à dessiner : `[ts, valeur, min, max]`, la valeur tenue en tête. */
export function seriesData(series) {
  if (!series) return [];
  const points = series.buckets?.length
    ? series.buckets.map((b) => [b.ts, b.avg, b.min, b.max])
    : (series.raw ?? []).map(([ts, v]) => {
        const n = toNum(v);
        return [ts, n, n, n];
      });
  if (series.before) {
    const v = toNum(series.before[1]);
    if (v !== null) points.unshift([series.from, v, v, v]);
  }
  return points.filter((p) => p[1] !== null);
}

/** Échelle : `x(ts)`, `y(valeur)` et les bornes réellement dessinées.
 *  Un binaire tient sur 0..1 — sans marge, ses deux paliers restent lisibles. */
export function scaleFor(series, data, pad, size, binary = false) {
  if (!series || !data.length) return null;
  const values = data.map((p) => p[1]);
  const mins = data.map((p) => p[2]);
  const maxs = data.map((p) => p[3]);
  const lo = binary ? 0 : Math.min(...mins, ...values);
  const hi = binary ? 1 : Math.max(...maxs, ...values);
  const span = hi - lo || Math.abs(hi) || 1;
  const y0 = binary ? 0 : lo - span * 0.08;
  const y1 = binary ? 1 : hi + span * 0.08;
  const width = size.w - pad.l - pad.r;
  const height = size.h - pad.t - pad.b;
  const from = series.from;
  const to = series.to;
  const x = (ts) => pad.l + ((ts - from) / (to - from || 1)) * width;
  const y = (v) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * height;
  return { x, y, y0, y1 };
}

/** Escalier : une valeur tient jusqu'au changement suivant, puis jusqu'à
 *  maintenant. Un capteur ne glisse pas, il saute. */
export function stepPath(scale, data, endTs) {
  if (!scale || !data.length) return '';
  let d = '';
  data.forEach(([ts, v], i) => {
    const px = scale.x(ts);
    const py = scale.y(v);
    d += i === 0 ? `M${px},${py}` : `H${px}V${py}`;
  });
  return `${d}H${scale.x(endTs)}`;
}

/** Bande min/max des tranches (l'épaisseur de la mesure sur la période). */
export function bandPath(scale, data, buckets) {
  if (!scale || !buckets) return '';
  const top = data.map(([ts, , , max]) => `${scale.x(ts)},${scale.y(max)}`);
  const bottom = data.map(([ts, , min]) => `${scale.x(ts)},${scale.y(min)}`).reverse();
  return `M${top.join('L')}L${bottom.join('L')}Z`;
}

/** Graduations de l'axe vertical : deux pour un binaire, cinq sinon. */
export function ticksFor(scale, binary = false, n = 4) {
  if (!scale) return [];
  if (binary) return [0, 1];
  return Array.from({ length: n + 1 }, (_, i) => scale.y0 + ((scale.y1 - scale.y0) * i) / n);
}

/** Graduations de l'axe horizontal, régulièrement réparties. */
export function xTicksFor(series, n = 4) {
  if (!series) return [];
  return Array.from({ length: n + 1 }, (_, i) => series.from + ((series.to - series.from) * i) / n);
}

/** Synthèse d'une série : la dernière valeur, le min et le max observés. */
export function statsFor(data) {
  if (!data.length) return null;
  return {
    last: data.at(-1)[1],
    min: Math.min(...data.map((p) => p[2])),
    max: Math.max(...data.map((p) => p[3])),
  };
}
