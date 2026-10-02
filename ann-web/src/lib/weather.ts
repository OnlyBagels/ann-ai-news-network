// Current weather for the cities on the weather wall, from Open-Meteo.
// Cached for 15 minutes; the page says where the numbers came from and when.

const CITIES: [string, number, number][] = [
  ["New York", 40.71, -74.01], ["Los Angeles", 34.05, -118.24], ["Chicago", 41.88, -87.63],
  ["Houston", 29.76, -95.37], ["Phoenix", 33.45, -112.07], ["Seattle", 47.61, -122.33],
  ["Denver", 39.74, -104.99], ["Atlanta", 33.75, -84.39], ["Miami", 25.76, -80.19],
  ["Minneapolis", 44.98, -93.27], ["Dallas", 32.78, -96.8], ["Boston", 42.36, -71.06],
];

export interface CityWeather {
  name: string;
  tempF: number;
  conditions: string;
  hiF: number;
  loF: number;
}

function words(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code <= 48) return "Fog";
  if (code <= 67 || (code >= 80 && code <= 82)) return "Rain";
  if (code <= 77 || code === 85 || code === 86) return "Snow";
  return "Thunderstorms";
}

export async function getWeather(): Promise<{ cities: CityWeather[]; asOf: Date } | null> {
  const params = new URLSearchParams({
    latitude: CITIES.map((c) => c[1]).join(","),
    longitude: CITIES.map((c) => c[2]).join(","),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min",
    temperature_unit: "fahrenheit",
    timezone: "auto",
    forecast_days: "1",
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current: { temperature_2m: number; weather_code: number };
      daily: { temperature_2m_max: number[]; temperature_2m_min: number[] };
    }[];
    return {
      asOf: new Date(),
      cities: data.map((w, i) => ({
        name: CITIES[i][0],
        tempF: Math.round(w.current.temperature_2m),
        conditions: words(w.current.weather_code),
        hiF: Math.round(w.daily.temperature_2m_max[0]),
        loF: Math.round(w.daily.temperature_2m_min[0]),
      })),
    };
  } catch (error) {
    console.error("Weather unavailable:", error);
    return null;
  }
}
