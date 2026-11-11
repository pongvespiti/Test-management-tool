/**
 * Custom field key from a label: `Test ID (MB)` → `test_id_mb`. Matches `fieldKeySchema`
 * (lower-case, starts with a letter, ≤ 40 chars) and avoids keys in `taken`.
 */
export function slugKey(label: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  let base = label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) base = 'field';
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  base = base.slice(0, 40).replace(/_+$/, '');
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = `_${i}`;
    const candidate = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Suite prefix suggestion from a name: `Modbus system test` → `MST` (1–10 chars, starts with a letter). */
export function suggestPrefix(name: string): string {
  const words = name
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let prefix = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 4);
  prefix = prefix.replace(/^[0-9]+/, '');
  return prefix.slice(0, 10);
}
