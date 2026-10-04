import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { getWeather } from "@/lib/weather";

export const metadata: Metadata = {
  title: "Weather",
  description: "Current temperatures and conditions across the US, from Open-Meteo.",
};

export const revalidate = 900;

export default async function WeatherPage() {
  const weather = await getWeather();
  const asOf = weather
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(weather.asOf)
    : null;

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Weather">
        Current conditions in twelve US cities, the same numbers the weather wall shows on ANN Live.
      </PageHeader>
      {!weather ? (
        <p className="text-lg text-muted-foreground">The forecast service isn&rsquo;t answering right now. Try again in a few minutes.</p>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Current temperature, conditions and today&rsquo;s high and low by city</caption>
              <thead>
                <tr className="border-b border-rule-strong text-left">
                  <th scope="col" className="label-caps py-2 pr-6 font-normal text-muted-foreground">City</th>
                  <th scope="col" className="label-caps py-2 pr-6 font-normal text-muted-foreground">Now</th>
                  <th scope="col" className="label-caps py-2 pr-6 font-normal text-muted-foreground">Conditions</th>
                  <th scope="col" className="label-caps py-2 font-normal text-muted-foreground">High / low</th>
                </tr>
              </thead>
              <tbody>
                {weather.cities.map((c) => (
                  <tr key={c.name} className="border-b border-border">
                    <th scope="row" className="py-4 pr-6 text-left font-semibold">{c.name}</th>
                    <td className="display py-4 pr-6 text-2xl">{c.tempF}&deg;F</td>
                    <td className="py-4 pr-6 text-muted-foreground">{c.conditions}</td>
                    <td className="label py-4 text-muted-foreground">
                      {c.hiF}&deg; / {c.loF}&deg;
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="label text-muted-foreground">
            Data from{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="link">
              Open-Meteo
            </a>
            , as of {asOf} ET. Updated every 15 minutes.
          </p>
        </>
      )}
    </div>
  );
}
