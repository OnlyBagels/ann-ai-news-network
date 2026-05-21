"""Three parallel researchers, one tool each.

Each researcher takes a Story and returns a string of research notes.
The JournalistResearcher orchestrator runs all three in parallel and
combines the notes into a single dossier that ArticleWriter consumes.

Design: each researcher uses ONE tool and contributes ONE perspective.
- WebSearchResearcher: queries Tavily (or DuckDuckGo) for related coverage
- CrossReferenceResearcher: fetches URLs linked from the source body
- EntityLookupResearcher: scenario-specific lookups (GitHub, arXiv, HF)
"""

from ann_agents.research.researchers.web_searcher import WebSearchResearcher
from ann_agents.research.researchers.cross_referencer import CrossReferenceResearcher
from ann_agents.research.researchers.entity_lookup import EntityLookupResearcher

__all__ = [
    "WebSearchResearcher",
    "CrossReferenceResearcher",
    "EntityLookupResearcher",
]
