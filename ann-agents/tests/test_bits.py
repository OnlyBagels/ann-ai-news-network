import json
from datetime import datetime, timezone

import pytest

from ann_agents.broadcast import bits as bits_module
from ann_agents.broadcast.director import Director
from ann_agents.broadcast.lineup import load_lineup
from ann_agents.llm import router as router_module
from test_watersheep import FakeWaterSheep


def reply(lines):
    async def complete(self, tier, system_prompt, user_prompt, **kwargs):
        assert "DESK BANTER" in system_prompt and "No facts at all" in system_prompt
        return json.dumps({"lines": lines})
    return complete


async def test_bits_drop_numbers_politics_and_strangers(monkeypatch):
    lineup = load_lineup()
    show = next(s for s in lineup.shows if s.id == "daytime")
    monkeypatch.setattr(router_module.LLMRouter, "complete", reply([
        {"speaker": "marla", "text": "Oscar, the coffee is sentient again.", "mood": "amused"},
        {"speaker": "oscar", "text": "It got 3 stars from me.", "mood": "happy"},
        {"speaker": "oscar", "text": "Like the senator said yesterday.", "mood": "happy"},
        {"speaker": "someone", "text": "Hello from nowhere.", "mood": "happy"},
        {"speaker": "oscar", "text": "Then it is now my co-anchor.", "mood": "weird"},
    ]))
    lines = await bits_module.write_bit(lineup, show, ["marla", "oscar"])
    assert [l.text for l in lines] == ["Oscar, the coffee is sentient again.", "Then it is now my co-anchor."]
    assert lines[1].mood == "amused"  # unknown moods fall back


@pytest.mark.asyncio
async def test_director_airs_a_bit_and_watersheep_cuts_factual_lines(monkeypatch, store, engine):
    monkeypatch.setattr(router_module.LLMRouter, "complete", reply([
        {"speaker": "marla", "text": "The teleprompter is racing me again.", "mood": "amused"},
        {"speaker": "oscar", "text": "It knows you take your coffee slow.", "mood": "happy"},
        {"speaker": "oscar", "text": "A big phone maker shipped something today.", "mood": "excited"},
    ]))
    monkeypatch.setattr(Director, "BIT_CHANCE", 1.0)
    ws = FakeWaterSheep(lambda ask: 0.9 if "phone maker" in ask.text else 0.1)
    d = Director(store, load_lineup(), None, lookahead_seconds=600, always_on=True, bits=True, watersheep=ws)
    result = await d.tick(datetime(2026, 10, 2, 15, 40, tzinfo=timezone.utc))  # 11:40 AM Eastern: ANN Daytime
    assert result.segment.kind == "bit" and result.segment.title == "Desk banter"
    assert [l.text for l in result.segment.lines] == ["The teleprompter is racing me again.", "It knows you take your coffee slow."]
