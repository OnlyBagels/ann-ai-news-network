"""The question desk: viewers' questions, screened, researched and answered.

1. WaterSheep screens each question: is it a sincere question about the news,
   and is it abusive, sexual or about a private person.
2. The language model (Gemma, the CHEAP tier) decides whether ANN can answer
   it from reporting, and declines opinion-seeking, advice and predictions.
3. The desk searches ANN's published stories and writes a short answer from
   them only, citing the ones it used.
4. WaterSheep checks the answer is supported by those stories.

Every outcome is saved with a reason the viewer can read. Answered questions
go on the site and are read on air by the director.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from loguru import logger
from sqlalchemy import text
from sqlalchemy.engine import Engine

from ann_agents.llm.router import LLMTier, llm_router
from ann_agents.llm.watersheep import Ask, watersheep

SINCERE = "Is this a sincere question about the news or current events?"
HARMFUL = "Is this message abusive, hateful, sexual, or about a private person who is not a public figure?"
SUPPORTED = "Is the answer fully supported by the source text?"

MIN_SINCERE = 0.4
MAX_HARMFUL = 0.5
MIN_SUPPORT = 0.5
STORY_LIMIT = 5

DECIDE_SYSTEM = """You are the desk editor at ANN, a news network read across the political spectrum. A viewer has sent the desk a question.
Decide whether ANN should answer it from its news reporting.
Take it on if it asks what happened, what was said, what something means or what comes next as already reported.
Decline it if it asks for an opinion or a side (who to vote for, who is right), medical, legal or financial advice, predictions, information about a private person, or a task unrelated to the news.
Reply with JSON only: {"take": true or false, "reason": "one short sentence for the viewer if declined", "search": ["2 to 4 short search terms for ANN's stories"]}"""

ANSWER_SYSTEM = """You answer a viewer's question for ANN, a news network read across the political spectrum, using only the numbered ANN stories you are given.
- Two to four sentences, plain and neutral. Attribute facts to the outlet the story credits ("according to Reuters").
- Use only what the stories say. No outside knowledge, no opinions, no predictions.
- If the stories don't answer the question, reply with an empty answer.
Reply with JSON only: {"answer": "...", "used": [story numbers you relied on]}"""


def _json(reply: Optional[str]) -> Dict[str, Any]:
    if not reply:
        return {}
    try:
        data = json.loads(reply)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", reply, re.S)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return {}
        return {}


class QuestionDesk:
    def __init__(self, engine: Engine):
        self.engine = engine

    def pending(self, limit: int) -> List[Tuple[str, str]]:
        with self.engine.connect() as conn:
            rows = conn.execute(
                text("""SELECT id, text FROM "ViewerQuestion" WHERE status = 'received' ORDER BY "createdAt" LIMIT :n"""),
                {"n": limit},
            ).fetchall()
        return [(r[0], r[1]) for r in rows]

    def _save(self, qid: str, status: str, reason: Optional[str] = None, answer: Optional[str] = None,
              article_ids: Optional[List[str]] = None, judge: Optional[Dict[str, float]] = None) -> None:
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE "ViewerQuestion" SET status = CAST(:status AS "QuestionStatus"), reason = :reason,
                        answer = :answer, "articleIds" = :ids, judge = CAST(:judge AS jsonb),
                        "answeredAt" = CASE WHEN :status = 'answered' THEN now() ELSE "answeredAt" END
                    WHERE id = :id
                """),
                {"id": qid, "status": status, "reason": reason, "answer": answer, "ids": article_ids or [],
                 "judge": json.dumps(judge) if judge else None},
            )

    def search(self, terms: List[str]) -> List[Dict[str, Any]]:
        """ANN's published stories that match any of the search terms, newest first."""
        terms = [t.strip() for t in terms if isinstance(t, str) and len(t.strip()) >= 3][:4]
        if not terms:
            return []
        clauses = " OR ".join(f"(title ILIKE :t{i} OR summary ILIKE :t{i} OR content ILIKE :t{i})" for i in range(len(terms)))
        params = {f"t{i}": f"%{t}%" for i, t in enumerate(terms)}
        with self.engine.connect() as conn:
            rows = conn.execute(
                text(f"""
                    SELECT id, title, source, summary, content FROM "Article"
                    WHERE "storyStatus" IN ('approved', 'published') AND ({clauses})
                    ORDER BY "publishedAt" DESC LIMIT {STORY_LIMIT}
                """),
                params,
            ).fetchall()
        return [{"id": r[0], "title": r[1], "source": r[2], "text": (r[4] or r[3] or "")[:2500]} for r in rows]

    async def answer_one(self, qid: str, question: str) -> str:
        """Work one question through the desk; returns the status it ends in."""
        judge: Dict[str, float] = {}
        ws = watersheep()
        if ws is not None:
            sincere, harmful = await asyncio.to_thread(ws.ask_many, [Ask(question, SINCERE), Ask(question, HARMFUL)])
            judge = {"sincere": round(sincere.p_yes, 3), "harmful": round(harmful.p_yes, 3)}
            if harmful.p_yes > MAX_HARMFUL:
                self._save(qid, "screened", "The desk doesn't take messages like this.", judge=judge)
                return "screened"
            if sincere.p_yes < MIN_SINCERE:
                self._save(qid, "screened", "This doesn't read as a question about the news.", judge=judge)
                return "screened"

        decision = _json(await llm_router.complete(
            tier=LLMTier.CHEAP, system_prompt=DECIDE_SYSTEM, user_prompt=f"Viewer question: {question}",
            max_tokens=300, temperature=0.1, response_format={"type": "json_object"},
        ))
        if not decision:
            return "received"  # model unavailable: try again next round
        if not decision.get("take"):
            reason = str(decision.get("reason") or "The desk can't answer this one from its reporting.")[:240]
            self._save(qid, "declined", reason, judge=judge)
            return "declined"

        stories = self.search(list(decision.get("search") or []))
        if not stories:
            self._save(qid, "declined", "ANN hasn't reported on this yet, so the desk can't answer it.", judge=judge)
            return "declined"

        listing = "\n\n".join(f"Story {i}: {s['title']} ({s['source']})\n{s['text']}" for i, s in enumerate(stories, 1))
        reply = _json(await llm_router.complete(
            tier=LLMTier.CHEAP, system_prompt=ANSWER_SYSTEM,
            user_prompt=f"Viewer question: {question}\n\n{listing}",
            max_tokens=500, temperature=0.2, response_format={"type": "json_object"},
        ))
        answer = str(reply.get("answer") or "").strip()
        used = [n for n in reply.get("used", []) if isinstance(n, int) and 1 <= n <= len(stories)]
        if not answer or not used:
            self._save(qid, "declined", "The stories ANN has don't answer this yet.", judge=judge)
            return "declined"

        if ws is not None:
            source = "\n\n".join(stories[n - 1]["text"] for n in used)[:4000]
            support = (await asyncio.to_thread(ws.ask_many, [Ask(f"Source text:\n{source}\n\nAnswer:\n{answer}", SUPPORTED)]))[0]
            judge["support"] = round(support.p_yes, 3)
            if support.p_yes < MIN_SUPPORT:
                self._save(qid, "declined", "The desk couldn't confirm an answer from its reporting.", judge=judge)
                return "declined"

        self._save(qid, "answered", answer=answer[:1200], article_ids=[stories[n - 1]["id"] for n in used], judge=judge)
        return "answered"

    async def process(self, limit: int = 5) -> int:
        done = 0
        for qid, question in self.pending(limit):
            try:
                status = await self.answer_one(qid, question)
                logger.info(f"[questions] {qid}: {status}")
                done += status != "received"
            except Exception as e:  # one bad question shouldn't stop the desk
                logger.error(f"[questions] {qid} failed: {e}")
        return done
