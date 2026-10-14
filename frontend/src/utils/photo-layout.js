// Justified rows retain every photograph's original aspect ratio and source order.
export function photoRows(photos, width, target = 280, gap = 12, maxItems = Infinity) {
  if (width <= 0) return [];
  const rows = [];
  let pending = [], ratio = 0;
  function flush(last = false) {
    if (!pending.length) return;
    const fit = (width - gap * (pending.length - 1)) / ratio;
    rows.push({ photos: pending, height: last ? Math.min(target, fit) : fit });
    pending = []; ratio = 0;
  }
  for (const photo of photos) {
    pending.push(photo); ratio += photo.width / photo.height;
    if (pending.length >= maxItems || ratio * target + gap * (pending.length - 1) >= width) flush();
  }
  flush(true);
  return rows;
}
