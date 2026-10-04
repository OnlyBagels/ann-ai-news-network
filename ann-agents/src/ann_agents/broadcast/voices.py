"""Download the Piper voices the lineup names.

    python -m ann_agents.broadcast.voices

Fetches each anchor's voice (model and config) from rhasspy/piper-voices
on Hugging Face into BROADCAST_PIPER_VOICES_DIR, skipping ones already there.
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx
from loguru import logger

from ann_agents.broadcast.lineup import load_lineup
from ann_agents.core.config import settings

BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"


def voice_url(voice: str, ext: str) -> str:
    # en_US-amy-medium -> en/en_US/amy/medium/en_US-amy-medium.onnx
    locale, name, quality = voice.split("-", 2)
    return f"{BASE}/{locale.split('_')[0]}/{locale}/{name}/{quality}/{voice}.{ext}"


def main() -> int:
    target = Path(settings.broadcast_piper_voices_dir)
    target.mkdir(parents=True, exist_ok=True)
    lineup = load_lineup()
    voices = sorted({a.voice for a in lineup.anchors} | {r.voice for r in lineup.reporters})
    failed = 0
    with httpx.Client(follow_redirects=True, timeout=120) as client:
        for voice in voices:
            for ext in ("onnx", "onnx.json"):
                path = target / f"{voice}.{ext}"
                if path.exists() and path.stat().st_size > 0:
                    continue
                logger.info(f"downloading {path.name}")
                try:
                    with client.stream("GET", voice_url(voice, ext)) as response:
                        response.raise_for_status()
                        tmp = path.with_suffix(path.suffix + ".part")
                        with tmp.open("wb") as fh:
                            for chunk in response.iter_bytes():
                                fh.write(chunk)
                        tmp.rename(path)
                except httpx.HTTPError as e:
                    logger.error(f"could not download {path.name}: {e}")
                    failed += 1
    logger.info(f"{len(voices)} voice(s) in {target}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
