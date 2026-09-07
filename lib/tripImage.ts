// A tasteful stock photo per trip, picked from the destination so the desktop
// sidebar has something to look forward to. The user can swap in their own.
const base = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&q=75&auto=format&fit=crop`;

const MATCHES: { keys: string[]; url: string }[] = [
  {
    keys: ["toronto", "canada", "quebec", "québec", "montreal", "ontario", "yyz", "yul", "yqb"],
    url: base("photo-1517935706615-2717063c2225"),
  },
  {
    keys: ["tahoe", "lake", "mountain", "ski", "alps", "aspen", "banff", "whistler", "yosemite"],
    url: base("photo-1506905925346-21bda4d32df4"),
  },
  {
    keys: ["vegas", "reno", "nevada"],
    url: base("photo-1605833556294-ea5c7a74f57d"),
  },
  {
    keys: ["beach", "hawaii", "maui", "cancun", "maldives", "bali", "miami", "coast", "tulum"],
    url: base("photo-1507525428034-b723cf961d3e"),
  },
];

const DEFAULT = base("photo-1488646953014-85cb44e25828");

// `text` = the trip label plus its locations, lower-cased downstream.
export function stockTripImage(text: string): string {
  const t = text.toLowerCase();
  for (const m of MATCHES) {
    if (m.keys.some((k) => t.includes(k))) return m.url;
  }
  return DEFAULT;
}
