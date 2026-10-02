from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from ann_agents.broadcast.director import Director
from ann_agents.broadcast.lineup import load_lineup
from ann_agents.datadesk.boards import wmo_icon
from ann_agents.datadesk.scripts import markets_lines, sports_lines, weather_lines
from conftest import insert_article

AS_OF = "2026-10-02T22:30:00+00:00"
WEATHER = {
    "kind": "weather", "source": "Open-Meteo", "asOf": AS_OF,
    "places": [
        {"name": "New York", "lat": 40.7, "lon": -74.0, "tempF": 63, "icon": "cloud", "words": "cloudy", "hiF": 66, "loF": 55},
        {"name": "Phoenix", "lat": 33.4, "lon": -112.1, "tempF": 97, "icon": "sun", "words": "clear", "hiF": 101, "loF": 78},
        {"name": "Denver", "lat": 39.7, "lon": -105.0, "tempF": 58, "icon": "partly", "words": "partly cloudy", "hiF": 70, "loF": 41},
    ],
}


def test_weather_is_read_off_the_board():
    lines = weather_lines(WEATHER, "skye")
    said = " ".join(l.text for l in lines)
    assert "New York, 63 degrees and cloudy" in said
    assert "The high today in Phoenix is 101, and the low in Denver is 41." in said
    assert "Open-Meteo as of 6:30 pm Eastern" in said
    assert {l.speaker for l in lines} == {"skye"}


def test_sports_reads_finals_and_skips_games_not_started():
    board = {"kind": "sports", "source": "ESPN", "asOf": AS_OF, "games": [
        {"league": "NFL", "away": "PIT", "home": "CLE", "awayName": "Steelers", "homeName": "Browns", "awayScore": 24, "homeScore": 27, "status": "Final", "state": "post"},
        {"league": "MLB", "away": "NYY", "home": "BOS", "awayName": "Yankees", "homeName": "Red Sox", "awayScore": None, "homeScore": None, "status": "7:10 PM", "state": "pre"},
    ]}
    said = " ".join(l.text for l in sports_lines(board, ["kofi", "danny"]))
    assert "Final in the NFL: Steelers 24, Browns 27." in said
    assert "Yankees" not in said


def test_markets_says_it_is_not_advice():
    board = {"kind": "markets", "source": "CoinGecko", "asOf": AS_OF, "quotes": [
        {"symbol": "BTC", "name": "Bitcoin", "price": 84504, "changePct": -0.02, "spark": []},
    ]}
    lines = markets_lines(board, "nora")
    assert lines[1].text == "Bitcoin is at 84,504 dollars, down 0.02 percent over 24 hours."
    assert "not financial advice" in lines[-1].text.lower() or "nothing on ann is financial advice" in lines[-1].text.lower()


def test_wmo_codes_map_to_icons():
    assert wmo_icon(0, 1) == "sun" and wmo_icon(0, 0) == "night"
    assert wmo_icon(61, 1) == "rain" and wmo_icon(95, 1) == "storm" and wmo_icon(73, 1) == "snow"


class FakeDesk:
    def __init__(self):
        self.asked = []

    async def board(self, kind):
        self.asked.append(kind)
        return WEATHER if kind == "weather" else None


@pytest.mark.asyncio
async def test_morning_show_books_the_weather_after_its_open(store, engine):
    insert_article(engine, "a1", "Lab ships a model", summary="The model reads 1M tokens. " * 5)
    desk = FakeDesk()
    d = Director(store, load_lineup(), None, lookahead_seconds=600, data_desk=desk, always_on=True)
    top = datetime(2026, 10, 2, 9, 1, tzinfo=timezone.utc)  # 5:01 AM Eastern: the top of ANN Morning
    first = await d.tick(top)
    second = await d.tick(top)
    third = await d.tick(top)
    assert first.segment.kind == "ident" and first.segment.title == "ANN Morning"
    assert second.segment.kind == "weather" and second.segment.anchors == ["skye"]
    assert third.segment.kind == "reel"  # weather already aired this hour
    with engine.connect() as conn:
        script = conn.execute(text("""SELECT script FROM "BroadcastSegment" WHERE kind = 'weather'""")).scalar_one()
    assert script["set"] == "weather" and script["board"]["source"] == "Open-Meteo"
