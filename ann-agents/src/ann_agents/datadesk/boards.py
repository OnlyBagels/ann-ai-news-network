"""Fetch the data boards. Each returns a dict in the camelCase shape the
renderer reads (WeatherBoard, SportsBoard, MarketsBoard in
ann-web/src/broadcast/types.ts), or None when the source didn't answer."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from loguru import logger

UA = {"User-Agent": "ANN news desk (data desk)"}

CITIES = [
    ("New York", 40.71, -74.01), ("Los Angeles", 34.05, -118.24), ("Chicago", 41.88, -87.63),
    ("Houston", 29.76, -95.37), ("Phoenix", 33.45, -112.07), ("Seattle", 47.61, -122.33),
    ("Denver", 39.74, -104.99), ("Atlanta", 33.75, -84.39), ("Miami", 25.76, -80.19),
    ("Minneapolis", 44.98, -93.27), ("Dallas", 32.78, -96.80), ("Boston", 42.36, -71.06),
]

LEAGUES = [
    ("NFL", "football/nfl"), ("NBA", "basketball/nba"), ("MLB", "baseball/mlb"),
    ("NHL", "hockey/nhl"), ("WNBA", "basketball/wnba"), ("MLS", "soccer/usa.1"),
]

COINS = [("bitcoin", "BTC"), ("ethereum", "ETH"), ("solana", "SOL"), ("ripple", "XRP"), ("dogecoin", "DOGE"), ("cardano", "ADA")]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def wmo_icon(code: int, is_day: int) -> str:
    """Open-Meteo's WMO weather code to one of the wall's icons."""
    if code == 0:
        return "sun" if is_day else "night"
    if code <= 2:
        return "partly"
    if code == 3:
        return "cloud"
    if code <= 48:
        return "fog"
    if code <= 67 or 80 <= code <= 82:
        return "rain"
    if code <= 77 or code in (85, 86):
        return "snow"
    return "storm"


def wmo_words(code: int) -> str:
    return {
        "sun": "clear", "night": "clear", "partly": "partly cloudy", "cloud": "cloudy",
        "fog": "foggy", "rain": "rain", "snow": "snow", "storm": "thunderstorms",
    }[wmo_icon(code, 1)]


async def weather(client: httpx.AsyncClient) -> Optional[Dict[str, Any]]:
    params = {
        "latitude": ",".join(str(c[1]) for c in CITIES),
        "longitude": ",".join(str(c[2]) for c in CITIES),
        "current": "temperature_2m,weather_code,is_day",
        "daily": "temperature_2m_max,temperature_2m_min",
        "temperature_unit": "fahrenheit",
        "timezone": "auto",
        "forecast_days": 1,
    }
    r = await client.get("https://api.open-meteo.com/v1/forecast", params=params)
    r.raise_for_status()
    data = r.json()
    places = []
    for (name, lat, lon), w in zip(CITIES, data):
        cur = w["current"]
        places.append({
            "name": name, "lat": lat, "lon": lon,
            "tempF": round(cur["temperature_2m"]),
            "icon": wmo_icon(cur["weather_code"], cur.get("is_day", 1)),
            "words": wmo_words(cur["weather_code"]),
            "hiF": round(w["daily"]["temperature_2m_max"][0]),
            "loF": round(w["daily"]["temperature_2m_min"][0]),
        })
    return {"kind": "weather", "source": "Open-Meteo", "asOf": _now(), "places": places}


async def sports(client: httpx.AsyncClient) -> Optional[Dict[str, Any]]:
    games: List[Dict[str, Any]] = []
    for league, path in LEAGUES:
        try:
            r = await client.get(f"https://site.api.espn.com/apis/site/v2/sports/{path}/scoreboard")
            r.raise_for_status()
        except httpx.HTTPError as e:
            logger.warning(f"[datadesk] {league} scores unavailable: {e}")
            continue
        for e in r.json().get("events", []):
            comp = e["competitions"][0]["competitors"]
            home = next(c for c in comp if c["homeAway"] == "home")
            away = next(c for c in comp if c["homeAway"] == "away")
            state = e["status"]["type"]["state"]  # pre | in | post
            started = state != "pre"
            games.append({
                "league": league,
                "away": away["team"]["abbreviation"], "home": home["team"]["abbreviation"],
                "awayName": away["team"].get("shortDisplayName") or away["team"]["abbreviation"],
                "homeName": home["team"].get("shortDisplayName") or home["team"]["abbreviation"],
                "awayScore": int(away["score"]) if started and away.get("score") not in (None, "") else None,
                "homeScore": int(home["score"]) if started and home.get("score") not in (None, "") else None,
                "status": e["status"]["type"]["shortDetail"],
                "state": state,
            })
    if not games:
        return None
    # Finished and live games first.
    order = {"post": 0, "in": 1, "pre": 2}
    games.sort(key=lambda g: order.get(g["state"], 3))
    return {"kind": "sports", "source": "ESPN", "asOf": _now(), "games": games[:12]}


async def markets(client: httpx.AsyncClient) -> Optional[Dict[str, Any]]:
    r = await client.get(
        "https://api.coingecko.com/api/v3/coins/markets",
        params={"vs_currency": "usd", "ids": ",".join(c[0] for c in COINS), "sparkline": "true", "price_change_percentage": "24h"},
    )
    r.raise_for_status()
    by_id = {q["id"]: q for q in r.json()}
    quotes = []
    for coin_id, symbol in COINS:
        q = by_id.get(coin_id)
        if not q or q.get("current_price") is None:
            continue
        spark = (q.get("sparkline_in_7d") or {}).get("price") or []
        quotes.append({
            "symbol": symbol, "name": q["name"], "price": q["current_price"],
            "changePct": round(q.get("price_change_percentage_24h") or 0.0, 2),
            "spark": [round(v, 6) for v in spark[-48:]],  # last two days, hourly
        })
    if not quotes:
        return None
    return {"kind": "markets", "source": "CoinGecko", "asOf": _now(), "quotes": quotes}


class DataDesk:
    """Cached boards: weather every 15 minutes, scores and prices every 5."""

    TTL = {"weather": 900, "sports": 300, "markets": 300}

    def __init__(self) -> None:
        self._cache: Dict[str, tuple] = {}

    async def board(self, kind: str) -> Optional[Dict[str, Any]]:
        hit = self._cache.get(kind)
        if hit and time.monotonic() - hit[0] < self.TTL[kind]:
            return hit[1]
        fetch = {"weather": weather, "sports": sports, "markets": markets}[kind]
        try:
            async with httpx.AsyncClient(timeout=20, headers=UA, follow_redirects=True) as client:
                board = await fetch(client)
        except (httpx.HTTPError, KeyError, ValueError) as e:
            logger.warning(f"[datadesk] {kind} unavailable: {e}")
            board = hit[1] if hit else None
        self._cache[kind] = (time.monotonic(), board)
        return board
