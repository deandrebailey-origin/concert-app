/** Same rules as embed/lastfm.py normalize_tag: one spelling per genre. */
const ALIASES: Record<string, string> = {
  hiphop: "hip-hop", rnb: "r&b", rhythmandblues: "r&b", alternativernb: "alternative r&b",
  altrnb: "alternative r&b", contemporaryrnb: "contemporary r&b", neosoul: "neo-soul", lofi: "lo-fi",
  kpop: "k-pop", jpop: "j-pop", electronica: "electronic", poprap: "pop rap", cloudrap: "cloud rap",
  indiepop: "indie pop", indierock: "indie rock", alternativerock: "alternative rock", drumandbass: "drum and bass",
};

function key(name: string) {
  return name.toLowerCase().replace(/[\s\-_/.]+/g, "").replace(/&/g, "and").replace("randb", "rnb");
}

export function normalizeTag(name: string) {
  const clean = name.toLowerCase().trim().replace(/\s+/g, " ");
  return ALIASES[key(clean)] ?? clean;
}

/** Normalize and drop duplicates, keeping the first (strongest) occurrence. */
export function uniqueTags<T extends { name: string }>(tags: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of tags) {
    const name = normalizeTag(t.name);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ ...t, name });
  }
  return out;
}
