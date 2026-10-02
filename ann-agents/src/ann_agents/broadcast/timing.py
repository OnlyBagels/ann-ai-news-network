"""Put lines on the clock.

Without recorded audio a line's length comes from its word count at a
steady news-read pace. With audio, the clip's real length wins.
"""

from __future__ import annotations

import re
from typing import List, Optional, Sequence

from ann_agents.broadcast.models import ScriptLine

MS_PER_WORD = 370  # about 160 words a minute
MS_PER_PAUSE = 160  # commas, colons, sentence ends inside a line
MIN_LINE_MS = 1400
GAP_MS = 350  # breath between speakers
TAIL_MS = 900  # hold on the last frame before the next segment

_PAUSES = re.compile(r"[,;:.!?](?=\s)")


def estimate_ms(text: str) -> int:
    words = len(text.split())
    return max(MIN_LINE_MS, words * MS_PER_WORD + len(_PAUSES.findall(text)) * MS_PER_PAUSE)


def lay_out(lines: Sequence[ScriptLine], measured_ms: Optional[Sequence[Optional[int]]] = None) -> int:
    """Set start and duration on each line in place; return the segment length."""
    cursor = 0
    for i, line in enumerate(lines):
        measured = measured_ms[i] if measured_ms else None
        line.duration_ms = measured if measured else estimate_ms(line.text)
        line.start_ms = cursor
        cursor += line.duration_ms + GAP_MS
    return max(cursor - GAP_MS, 0) + TAIL_MS


def envelope(samples: Sequence[float], sample_rate: int, fps: int) -> List[float]:
    """Loudness per video frame, scaled 0..1, for mouth movement."""
    if not samples:
        return []
    window = max(1, sample_rate // fps)
    levels = []
    for start in range(0, len(samples), window):
        chunk = samples[start : start + window]
        levels.append((sum(s * s for s in chunk) / len(chunk)) ** 0.5)
    ranked = sorted(levels)
    peak = ranked[int(len(ranked) * 0.95)] or max(ranked) or 1.0
    return [round(min(1.0, level / peak), 2) for level in levels]
