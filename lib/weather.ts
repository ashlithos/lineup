import { placeFor } from "./sun";

// Forecasts come from Open-Meteo: free, no API key, and it blends ECMWF's IFS
// with the national models (ICON, GFS) rather than relying on one — the most
// accurate source available without a commercial contract.
//
// Forecasts only exist about 16 days out. Past that there is genuinely nothing
// to show, so we show nothing rather than a guess or a seasonal average.

export interface DayWeather {
  date: string; // YYYY-MM-DD
  code: number; // WMO weather code
  high: number;
  low: number;
  rainChance: number; // percent
}

// WMO code → a glyph and a plain description.
export function weatherLook(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Clear" };
  if (code === 1) return { icon: "🌤️", label: "Mostly clear" };
  if (code === 2) return { icon: "⛅", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", label: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "🌦️", label: "Showers" };
  if (code === 85 || code === 86) return { icon: "🌨️", label: "Snow showers" };
  if (code >= 95) return { icon: "⛈️", label: "Thunderstorms" };
  return { icon: "", label: "" };
}

/**
 * Daily forecast for a booking location, keyed by date. Returns an empty map
 * for a place we have no coordinates for, or when the network call fails —
 * the caller then simply renders nothing.
 */
export async function forecastFor(
  location: string | undefined,
): Promise<Map<string, DayWeather>> {
  const empty = new Map<string, DayWeather>();
  const place = placeFor(location);
  if (!place) return empty;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(place.tz)}&forecast_days=16`;

  try {
    // An hour of caching is plenty — forecasts don't move faster than that.
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return empty;
    const d = (await res.json()) as {
      daily?: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: (number | null)[];
      };
    };
    const dl = d.daily;
    if (!dl?.time) return empty;
    const out = new Map<string, DayWeather>();
    dl.time.forEach((date, i) => {
      const high = dl.temperature_2m_max[i];
      const low = dl.temperature_2m_min[i];
      if (high == null || low == null) return;
      out.set(date, {
        date,
        code: dl.weather_code[i] ?? 0,
        high: Math.round(high),
        low: Math.round(low),
        rainChance: Math.round(dl.precipitation_probability_max[i] ?? 0),
      });
    });
    return out;
  } catch {
    return empty; // offline, rate-limited, whatever — just show nothing
  }
}

/** Forecasts for several places at once, keyed by the original location string. */
export async function forecastForPlaces(
  locations: (string | undefined)[],
): Promise<Record<string, Map<string, DayWeather>>> {
  const unique = [...new Set(locations.filter((l): l is string => !!l))];
  const results = await Promise.all(unique.map((l) => forecastFor(l)));
  return Object.fromEntries(unique.map((l, i) => [l, results[i]]));
}
