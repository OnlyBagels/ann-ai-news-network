"""WaterSheep: calibrated yes/no, choice, rating and multi-label answers about a text.

https://huggingface.co/samratduttaofficial/WaterSheep (Apache-2.0) is a
ModernBERT-base encoder with a small option-scoring head. This runs its
quantized ONNX export with onnxruntime and the tokenizers library, on CPU,
without PyTorch and without executing the model repo's custom code. The
input layout follows the repo's pipeline_watersheep.py.

    python -m ann_agents.llm.watersheep --download     # fetch the model into WATERSHEEP_DIR
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from ann_agents.core.config import settings

REPO = "https://huggingface.co/samratduttaofficial/WaterSheep/resolve/main"
FILES = ["onnx/model_quantized.onnx", "tokenizer/tokenizer.json", "watersheep.json", "LICENSE"]
TAGS = {"binary": "[yes/no]", "choice": "[choose]", "score": "[rate]", "multi": "[select all]"}
YESNO = ["yes", "no"]


@dataclass
class Answer:
    type: str
    probs: Dict[str, float]
    answer: object  # str, or a list for multi
    confidence: float

    @property
    def p_yes(self) -> float:
        return self.probs.get("yes", 0.0)


@dataclass
class Ask:
    text: str
    question: str
    options: Optional[List[str]] = None
    type: Optional[str] = None  # binary | choice | score | multi; inferred when None


def _infer(options: Sequence[str]) -> str:
    low = [o.strip().lower() for o in options]
    if low == YESNO:
        return "binary"
    if all(len(o) == 1 and o.isdigit() for o in low):
        values = [int(o) for o in low]
        if values == list(range(values[0], values[0] + len(values))):
            return "score"
    return "choice"


class WaterSheep:
    def __init__(self, model_dir: str, threads: int = 0):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        root = Path(model_dir)
        meta = json.loads((root / "watersheep.json").read_text())
        self.max_len = meta["max_len"]
        self.max_question = meta["max_question_tokens"]
        self.max_option = meta["max_option_tokens"]
        self.max_options = meta["max_options"]
        self.temperatures = meta["temperatures"]
        self.multi_threshold = meta.get("multi_threshold", 0.5)
        self.name = meta.get("name", "watersheep")

        self.tok = Tokenizer.from_file(str(root / "tokenizer" / "tokenizer.json"))
        self.cls, self.sep = self.tok.token_to_id("[CLS]"), self.tok.token_to_id("[SEP]")
        self.mask, self.pad = self.tok.token_to_id("[MASK]"), self.tok.token_to_id("[PAD]")

        options = ort.SessionOptions()
        if threads:
            options.intra_op_num_threads = threads
        self.session = ort.InferenceSession(
            str(root / "onnx" / "model_quantized.onnx"), options, providers=["CPUExecutionProvider"]
        )

    def _encode(self, text: str) -> List[int]:
        return self.tok.encode(text, add_special_tokens=False).ids

    def _layout(self, kind: str, text: str, question: str, options: Sequence[str]) -> Tuple[List[int], List[int]]:
        ids = [self.cls] + self._encode(f"{TAGS[kind]} {question}")[: self.max_question] + [self.sep]
        positions = []
        for option in options:
            positions.append(len(ids))
            ids += [self.mask] + self._encode(option)[: self.max_option]
        ids.append(self.sep)
        room = self.max_len - len(ids) - 1
        body = self._encode(text)
        if room > 0 and body:
            ids += body[:room]
        ids.append(self.sep)
        if len(ids) > self.max_len or any(p >= self.max_len - 1 for p in positions):
            raise ValueError("the options do not fit in the model's input; shorten them")
        return ids, positions

    def ask_many(self, asks: Sequence[Ask], batch_size: int = 16) -> List[Answer]:
        """Answer several questions, batched through one model run per batch."""
        prepared = []
        for ask in asks:
            options = [str(o) for o in (ask.options or YESNO)]
            kind = ask.type or _infer(options)
            if kind == "binary":
                options = list(YESNO)
            if len(options) > self.max_options:
                raise ValueError(f"at most {self.max_options} options per question")
            ids, positions = self._layout(kind, ask.text or "", ask.question, options)
            prepared.append((kind, options, ids, positions))

        answers: List[Answer] = []
        for start in range(0, len(prepared), batch_size):
            part = prepared[start : start + batch_size]
            n = max(len(p[2]) for p in part)
            m = max(len(p[3]) for p in part)
            input_ids = np.full((len(part), n), self.pad, dtype=np.int64)
            attention = np.zeros((len(part), n), dtype=np.int64)
            option_positions = np.zeros((len(part), m), dtype=np.int64)
            option_mask = np.zeros((len(part), m), dtype=np.int64)
            for b, (_, _, ids, positions) in enumerate(part):
                input_ids[b, : len(ids)] = ids
                attention[b, : len(ids)] = 1
                option_positions[b, : len(positions)] = positions
                option_mask[b, : len(positions)] = 1
            (logits,) = self.session.run(
                None,
                {
                    "input_ids": input_ids,
                    "attention_mask": attention,
                    "option_positions": option_positions,
                    "option_mask": option_mask,
                },
            )
            for (kind, options, _, positions), z in zip(part, logits):
                answers.append(self._answer(kind, options, z[: len(positions)]))
        return answers

    def ask(self, text: str, question: str, options: Optional[List[str]] = None, type: Optional[str] = None) -> Answer:
        return self.ask_many([Ask(text, question, options, type)])[0]

    def _answer(self, kind: str, options: List[str], z: np.ndarray) -> Answer:
        t = max(1e-6, self.temperatures.get(kind, 1.0))
        z = z.astype(np.float64) / t
        if kind == "multi":
            p = 1.0 / (1.0 + np.exp(-np.clip(z, -60, 60)))
            chosen = [o for o, v in zip(options, p) if v >= self.multi_threshold]
            confidence = float(np.mean([max(v, 1 - v) for v in p]))
            return Answer(kind, {o: float(v) for o, v in zip(options, p)}, chosen, confidence)
        e = np.exp(z - z.max())
        p = e / e.sum()
        i = int(np.argmax(p))
        return Answer(kind, {o: float(v) for o, v in zip(options, p)}, options[i], float(p[i]))


@lru_cache(maxsize=1)
def watersheep() -> Optional[WaterSheep]:
    """The shared model from WATERSHEEP_DIR, or None when it isn't downloaded."""
    root = Path(settings.watersheep_dir)
    if not (root / "onnx" / "model_quantized.onnx").exists():
        return None
    return WaterSheep(str(root), threads=settings.watersheep_threads)


def download(target: str) -> None:
    import httpx

    root = Path(target)
    with httpx.Client(follow_redirects=True, timeout=600) as client:
        for name in FILES:
            path = root / name
            if path.exists() and path.stat().st_size > 0:
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            print(f"downloading {name}")
            with client.stream("GET", f"{REPO}/{name}") as response:
                response.raise_for_status()
                tmp = path.with_suffix(path.suffix + ".part")
                with tmp.open("wb") as fh:
                    for chunk in response.iter_bytes():
                        fh.write(chunk)
                tmp.rename(path)
    print(f"WaterSheep is in {root}")


if __name__ == "__main__":
    if "--download" in sys.argv:
        download(settings.watersheep_dir)
    else:
        print(__doc__)
