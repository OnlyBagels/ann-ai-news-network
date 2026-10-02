"""Voices.

With BROADCAST_TTS=piper each line is spoken by Piper (https://github.com/rhasspy/piper),
a local neural TTS that runs on CPU, so voices cost nothing per line. Each
anchor's `voice` in lineup.json names a Piper voice model; put the .onnx
and .onnx.json files in BROADCAST_PIPER_VOICES_DIR.

With BROADCAST_TTS=none (the default) there is no audio; lines are timed
from their word count and the player shows captions.
"""

from __future__ import annotations

import asyncio
import wave
from array import array
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Protocol

from loguru import logger

from ann_agents.broadcast.models import MOUTH_FPS
from ann_agents.broadcast.timing import envelope


@dataclass
class Clip:
    file: str  # file name inside the audio dir
    duration_ms: int
    mouth: List[float]


class Voice(Protocol):
    async def speak(self, text: str, voice: str, name: str) -> Optional[Clip]: ...


class NoVoice:
    async def speak(self, text: str, voice: str, name: str) -> Optional[Clip]:
        return None


def read_clip(path: Path) -> Clip:
    with wave.open(str(path), "rb") as wav:
        rate, width, channels = wav.getframerate(), wav.getsampwidth(), wav.getnchannels()
        frames = wav.readframes(wav.getnframes())
    if width != 2:
        raise ValueError(f"{path.name}: expected 16-bit audio, got {8 * width}-bit")
    pcm = array("h")
    pcm.frombytes(frames)
    mono = [pcm[i] / 32768 for i in range(0, len(pcm), channels)]
    duration_ms = int(len(mono) * 1000 / rate)
    return Clip(file=path.name, duration_ms=duration_ms, mouth=envelope(mono, rate, MOUTH_FPS))


class PiperVoice:
    def __init__(self, binary: str, voices_dir: str, audio_dir: str):
        self.binary = binary
        self.voices_dir = Path(voices_dir)
        self.audio_dir = Path(audio_dir)
        self.audio_dir.mkdir(parents=True, exist_ok=True)

    async def speak(self, text: str, voice: str, name: str) -> Optional[Clip]:
        model = self.voices_dir / f"{voice}.onnx"
        out = self.audio_dir / f"{name}.wav"
        if not model.exists():
            logger.warning(f"[broadcast] Piper voice not found: {model}")
            return None
        proc = await asyncio.create_subprocess_exec(
            self.binary, "--model", str(model), "--output_file", str(out),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, err = await proc.communicate(text.encode("utf-8"))
        if proc.returncode != 0 or not out.exists():
            logger.error(f"[broadcast] Piper failed ({proc.returncode}): {err.decode(errors='replace')[-300:]}")
            return None
        return read_clip(out)


def make_voice(kind: str, binary: str, voices_dir: str, audio_dir: str) -> Voice:
    if kind == "piper":
        return PiperVoice(binary, voices_dir, audio_dir)
    return NoVoice()
