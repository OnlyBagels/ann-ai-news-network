"""What the broadcast spends on Claude, and whether it may spend more today."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Tuple

# USD per million tokens (input, output), first-party API rates.
PRICES: Dict[str, Tuple[float, float]] = {
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-opus-4-7": (5.0, 25.0),
    "claude-fable-5-1": (10.0, 50.0),
}
# Unknown model ids are charged at the most expensive rate so the cap errs
# on the side of stopping.
UNKNOWN_PRICE = (10.0, 50.0)
CACHE_WRITE = 1.25
CACHE_READ = 0.1


@dataclass
class Spend:
    usd: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0

    def __add__(self, other: "Spend") -> "Spend":
        return Spend(
            self.usd + other.usd,
            self.input_tokens + other.input_tokens,
            self.output_tokens + other.output_tokens,
            self.calls + other.calls,
        )


def cost_of(model: str, usage: Any) -> Spend:
    """Price one response's usage block."""
    price_in, price_out = PRICES.get(model, UNKNOWN_PRICE)
    plain = getattr(usage, "input_tokens", 0) or 0
    written = getattr(usage, "cache_creation_input_tokens", 0) or 0
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    out = getattr(usage, "output_tokens", 0) or 0
    usd = (plain + written * CACHE_WRITE + read * CACHE_READ) * price_in / 1e6 + out * price_out / 1e6
    return Spend(usd=usd, input_tokens=plain + written + read, output_tokens=out, calls=1)


def can_spend(spent_today_usd: float, daily_cap_usd: float, estimate_usd: float = 0.02) -> bool:
    """Leave room for one more segment under the daily cap."""
    return spent_today_usd + estimate_usd <= daily_cap_usd
