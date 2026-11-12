// Pembatas laju sederhana di memori (cukup untuk satu instance).
const buckets = new Map<string, { count: number; reset: number }>();

/** true jika masih boleh; false jika sudah melewati batas dalam jendela waktu. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function resetLimit(key: string): void {
  buckets.delete(key);
}
