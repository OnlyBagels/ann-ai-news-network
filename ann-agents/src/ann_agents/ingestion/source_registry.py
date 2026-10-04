"""The newsroom's sources, kept in the Source table so editors can manage them.

Each cycle reads the active sources, fetches them, and records how it went:
when a feed last worked, its last error, and how many fetches in a row have
failed. The defaults below are added once; edits made in the admin area win.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Sequence, Tuple

from loguru import logger
from sqlalchemy import text
from sqlalchemy.engine import Engine

from ann_agents.core.types import SourceItem
from ann_agents.ingestion.source_ingester import SourceIngester

# The feeds a new newsroom starts with, as (name, type, url, category,
# ai_only). Names are read on air, so they are the names readers know, not
# whatever the feed calls itself. Each feed was fetched and parsed on
# 2026-10-02 and had a post within the last 60 days. The category is a hint
# for the beat; WaterSheep makes the call per story. ai_only feeds skip the
# "is this about AI?" screen. Anthropic has no official feed, so its two
# entries are the community mirror at github.com/Olshansk/rss-feeds.
DEFAULT_SOURCES: List[Tuple[str, str, Optional[str], Optional[str], bool]] = [
    # models
    ("Ai2 Blog", "rss", "https://allenai.org/rss.xml", "models", True),
    (
        "Anthropic News",
        "rss",
        "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
        "models",
        True,
    ),
    ("Apple Machine Learning Research", "rss", "https://machinelearning.apple.com/rss.xml", "models", True),
    ("Ars Technica AI", "rss", "https://arstechnica.com/ai/feed/", "models", True),
    ("Google AI Blog", "rss", "https://blog.google/innovation-and-ai/technology/ai/rss/", "models", True),
    ("Google DeepMind", "rss", "https://deepmind.google/blog/rss.xml", "models", True),
    ("Microsoft Research Blog", "rss", "https://www.microsoft.com/en-us/research/feed/", "models", True),
    ("Mistral AI", "rss", "https://mistral.ai/news/rss", "models", True),
    (
        "MIT Technology Review AI",
        "rss",
        "https://www.technologyreview.com/topic/artificial-intelligence/feed",
        "models",
        True,
    ),
    ("NVIDIA Blog: Generative AI", "rss", "https://blogs.nvidia.com/blog/category/generative-ai/feed/", "models", True),
    ("One Useful Thing", "rss", "https://www.oneusefulthing.org/feed", "models", True),
    ("OpenAI News", "rss", "https://openai.com/news/rss.xml", "models", True),
    ("Stability AI News", "rss", "https://stability.ai/news-updates?format=rss", "models", True),
    ("TechCrunch AI", "rss", "https://techcrunch.com/category/artificial-intelligence/feed/", "models", True),
    ("The Decoder", "rss", "https://the-decoder.com/feed/", "models", True),
    (
        "The Register AI",
        "rss",
        "https://api.theregister.com/api/v1/article?orderBy=published&site_id=2&remapper=rss&query=(tag:software+AND+tag:%22ai+and+ml%22)",
        "models",
        True,
    ),
    ("The Verge AI", "rss", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "models", True),
    ("Wired AI", "rss", "https://www.wired.com/feed/tag/ai/latest/rss", "models", True),
    ("Amazon Science", "rss", "https://www.amazon.science/index.rss", "models", False),
    # open_source
    ("Hugging Face Blog", "rss", "https://huggingface.co/blog/feed.xml", "open_source", True),
    ("Interconnects", "rss", "https://www.interconnects.ai/feed", "open_source", True),
    ("Mozilla.ai Blog", "rss", "https://blog.mozilla.ai/rss/", "open_source", True),
    ("Ollama Blog", "rss", "https://ollama.com/blog/rss.xml", "open_source", True),
    ("Together AI Blog", "rss", "https://www.together.ai/blog/rss.xml", "open_source", True),
    ("vLLM Blog", "rss", "https://vllm.ai/blog/rss.xml", "open_source", True),
    # coding_ai
    ("GitHub Blog: AI & ML", "rss", "https://github.blog/ai-and-ml/feed/", "coding_ai", True),
    ("GitHub Changelog: Copilot", "rss", "https://github.blog/changelog/label/copilot/feed/", "coding_ai", True),
    ("JetBrains AI Blog", "rss", "https://blog.jetbrains.com/ai/feed/", "coding_ai", True),
    (
        "Simon Willison: AI-assisted programming",
        "rss",
        "https://simonwillison.net/tags/ai-assisted-programming.atom",
        "coding_ai",
        True,
    ),
    ("The New Stack AI", "rss", "https://thenewstack.io/category/ai/feed/", "coding_ai", True),
    # agents
    ("AI News (smol.ai)", "rss", "https://news.smol.ai/rss.xml", "agents", True),
    (
        "Claude Blog",
        "rss",
        "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_claude.xml",
        "agents",
        True,
    ),
    ("LangChain Blog", "rss", "https://www.langchain.com/blog/rss.xml", "agents", True),
    ("Latent Space", "rss", "https://www.latent.space/feed", "agents", True),
    ("Model Context Protocol Blog", "rss", "https://blog.modelcontextprotocol.io/index.xml", "agents", True),
    # research
    ("Ahead of AI", "rss", "https://magazine.sebastianraschka.com/feed", "research", True),
    ("Epoch AI", "rss", "https://epochai.substack.com/feed", "research", True),
    ("Google Research Blog", "rss", "https://research.google/blog/rss/", "research", True),
    ("IEEE Spectrum AI", "rss", "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss", "research", True),
    ("Import AI", "rss", "https://importai.substack.com/feed", "research", True),
    ("METR", "rss", "https://metr.org/feed.xml", "research", True),
    # security
    ("Adversa AI", "rss", "https://adversa.ai/rss.xml", "security", True),
    ("OWASP GenAI Security Project", "rss", "https://genai.owasp.org/feed/", "security", True),
    (
        "Simon Willison: prompt injection",
        "rss",
        "https://simonwillison.net/tags/prompt-injection.atom",
        "security",
        True,
    ),
    ("Embrace The Red", "rss", "https://embracethered.com/blog/index.xml", "security", False),
    ("tl;dr sec", "rss", "https://rss.beehiiv.com/feeds/xgTKUmMmUm.xml", "security", False),
    ("Trail of Bits Blog", "rss", "https://blog.trailofbits.com/index.xml", "security", False),
    # funding
    ("AI Business", "rss", "https://aibusiness.com/rss.xml", "funding", True),
    ("SiliconANGLE AI", "rss", "https://siliconangle.com/category/ai/feed/", "funding", True),
    ("Crunchbase News AI", "rss", "https://news.crunchbase.com/sections/ai/feed/", "funding", False),
    ("Sifted AI", "rss", "https://sifted.eu/sector/artificial-intelligence/feed", "funding", False),
    ("TechCrunch Venture", "rss", "https://techcrunch.com/category/venture/feed/", "funding", False),
    # regulation
    ("AI Now Institute", "rss", "https://ainowinstitute.org/feed", "regulation", True),
    ("AI Safety Newsletter (CAIS)", "rss", "https://newsletter.safe.ai/feed", "regulation", True),
    ("EU AI Act Newsletter", "rss", "https://artificialintelligenceact.substack.com/feed", "regulation", True),
    ("Transformer", "rss", "https://www.transformernews.ai/feed", "regulation", True),
    (
        "Federal Register: AI",
        "rss",
        "https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bterm%5D=%22artificial+intelligence%22&order=newest",
        "regulation",
        False,
    ),
    ("FTC Press Releases", "rss", "https://www.ftc.gov/feeds/press-release.xml", "regulation", False),
    ("Politico Technology", "rss", "https://rss.politico.com/technology.xml", "regulation", False),
    # not RSS
    ("Hacker News", "hackernews", "https://news.ycombinator.com", None, False),
    ("arXiv", "arxiv", "https://arxiv.org/list/cs.AI/recent", "research", True),
    ("GitHub Trending", "github_trending", "https://github.com/trending", "open_source", False),
    ("HuggingFace", "huggingface", "https://huggingface.co/models", "open_source", True),
]

# General news, as (name, type, url, section, ai_only, lean, paywalled). Each
# feed was fetched on 2026-10-02 and had posted within 7 days; paywalled
# feeds are left out because their text can't be fetched to check against.
# lean is Ad Fontes Media's rating where it has one, kept so politics
# coverage can be checked for balance. An outlet with feeds in several
# sections is stored as "Outlet / Section"; stories still credit the outlet.
NEWS_SOURCES: List[Tuple] = [
    # World
    ("BBC News / World", "rss", "https://feeds.bbci.co.uk/news/world/rss.xml", "world", False, "center", False),
    ("Al Jazeera", "rss", "https://www.aljazeera.com/xml/rss/all.xml", "world", False, "center-left", False),
    ("The Guardian / World", "rss", "https://www.theguardian.com/world/rss", "world", False, "center-left", False),
    ("DW", "rss", "https://rss.dw.com/xml/rss-en-world", "world", False, None, False),
    ("France 24", "rss", "https://www.france24.com/en/rss", "world", False, None, False),
    ("CBC News", "rss", "https://www.cbc.ca/webfeed/rss/rss-world", "world", False, "center", False),
    ("ABC News (Australia)", "rss", "https://www.abc.net.au/news/feed/2942460/rss.xml", "world", False, None, False),
    ("PBS NewsHour / World", "rss", "https://www.pbs.org/newshour/feeds/rss/world", "world", False, "center", False),
    ("UN News", "rss", "https://news.un.org/feed/subscribe/en/news/all/rss.xml", "world", False, "center", False),
    (
        "The Christian Science Monitor / World",
        "rss",
        "https://rss.csmonitor.com/feeds/world",
        "world",
        False,
        "center",
        False,
    ),
    ("The Japan Times", "rss", "https://www.japantimes.co.jp/feed/", "world", False, None, False),
    # U.S.
    ("PBS NewsHour / U.S.", "rss", "https://www.pbs.org/newshour/feeds/rss/nation", "us", False, "center", False),
    ("ABC News", "rss", "https://abcnews.go.com/abcnews/usheadlines", "us", False, "center", False),
    ("CBS News / U.S.", "rss", "https://www.cbsnews.com/latest/rss/us", "us", False, "center", False),
    ("NBC News / U.S.", "rss", "https://feeds.nbcnews.com/nbcnews/public/us-news", "us", False, "center", False),
    (
        "The Christian Science Monitor / U.S.",
        "rss",
        "https://rss.csmonitor.com/feeds/usa",
        "us",
        False,
        "center",
        False,
    ),
    ("Axios", "rss", "https://api.axios.com/feed/", "us", False, "center", False),
    ("The Guardian / U.S.", "rss", "https://www.theguardian.com/us-news/rss", "us", False, "center-left", False),
    ("ProPublica", "rss", "https://feeds.propublica.org/propublica/main", "us", False, "center-left", False),
    ("Fox News / U.S.", "rss", "https://moxie.foxnews.com/google-publisher/us.xml", "us", False, "center-right", False),
    ("New York Post", "rss", "https://nypost.com/us-news/feed/", "us", False, "center-right", False),
    ("The Free Press", "rss", "https://www.thefp.com/feed", "us", False, "center-right", False),
    # Politics
    ("Politico", "rss", "https://rss.politico.com/politics-news.xml", "politics", False, "center", False),
    ("The Hill", "rss", "https://thehill.com/homenews/feed/", "politics", False, "center", False),
    (
        "PBS NewsHour / Politics",
        "rss",
        "https://www.pbs.org/newshour/feeds/rss/politics",
        "politics",
        False,
        "center",
        False,
    ),
    ("Roll Call", "rss", "https://rollcall.com/feed/", "politics", False, "center", False),
    (
        "The Guardian / Politics",
        "rss",
        "https://www.theguardian.com/us-news/us-politics/rss",
        "politics",
        False,
        "center-left",
        False,
    ),
    ("HuffPost", "rss", "https://www.huffpost.com/section/politics/feed", "politics", False, "center-left", False),
    ("Mother Jones", "rss", "https://www.motherjones.com/politics/feed/", "politics", False, "left", False),
    (
        "Fox News / Politics",
        "rss",
        "https://moxie.foxnews.com/google-publisher/politics.xml",
        "politics",
        False,
        "center-right",
        False,
    ),
    (
        "Washington Examiner",
        "rss",
        "https://www.washingtonexaminer.com/section/politics/feed/",
        "politics",
        False,
        "center-right",
        False,
    ),
    ("National Review", "rss", "https://www.nationalreview.com/feed/", "politics", False, "right", False),
    ("Washington Free Beacon", "rss", "https://freebeacon.com/feed/", "politics", False, "right", False),
    # Business
    (
        "MarketWatch",
        "rss",
        "https://feeds.content.dowjones.io/public/rss/mw_topstories",
        "business",
        False,
        "center",
        False,
    ),
    ("Business Insider", "rss", "https://feeds.businessinsider.com/custom/all", "business", False, "center", False),
    ("Fortune", "rss", "https://fortune.com/feed/", "business", False, "center", False),
    (
        "BBC News / Business",
        "rss",
        "https://feeds.bbci.co.uk/news/business/rss.xml",
        "business",
        False,
        "center",
        False,
    ),
    (
        "The Guardian / Business",
        "rss",
        "https://www.theguardian.com/business/rss",
        "business",
        False,
        "center-left",
        False,
    ),
    ("CBS News / Business", "rss", "https://www.cbsnews.com/latest/rss/moneywatch", "business", False, "center", False),
    (
        "Fox Business",
        "rss",
        "https://moxie.foxbusiness.com/google-publisher/latest.xml",
        "business",
        False,
        "center-right",
        False,
    ),
    ("Forbes", "rss", "https://www.forbes.com/business/feed/", "business", False, "center", False),
    ("Quartz", "rss", "https://qz.com/rss", "business", False, "center", False),
    ("Kiplinger", "rss", "https://www.kiplinger.com/feeds/all", "business", False, None, False),
    # Crypto
    ("CoinDesk", "rss", "https://www.coindesk.com/arc/outboundfeeds/rss/", "crypto", False, None, False),
    ("The Block", "rss", "https://www.theblock.co/rss.xml", "crypto", False, None, False),
    ("Decrypt", "rss", "https://decrypt.co/feed", "crypto", False, None, False),
    ("Cointelegraph", "rss", "https://cointelegraph.com/rss", "crypto", False, None, False),
    ("Bitcoin Magazine", "rss", "https://bitcoinmagazine.com/feed", "crypto", False, None, False),
    ("Unchained", "rss", "https://unchainedcrypto.com/feed/", "crypto", False, None, False),
    ("CryptoSlate", "rss", "https://cryptoslate.com/feed/", "crypto", False, None, False),
    ("The Defiant", "rss", "https://thedefiant.io/api/feed", "crypto", False, None, False),
    ("Protos", "rss", "https://protos.com/feed/", "crypto", False, None, False),
    ("NFT Evening", "rss", "https://nftevening.com/feed/", "crypto", False, None, False),
    ("Sports Collectors Digest", "rss", "https://www.si.com/collectibles/feed", "crypto", False, None, False),
    ("Cardlines", "rss", "https://www.cardlines.com/feed/", "crypto", False, None, False),
    # Tech
    ("The Verge / Tech", "rss", "https://www.theverge.com/rss/index.xml", "tech", False, "center-left", False),
    ("Ars Technica", "rss", "https://feeds.arstechnica.com/arstechnica/index", "tech", False, "center", False),
    ("TechCrunch", "rss", "https://techcrunch.com/feed/", "tech", False, "center", False),
    ("Engadget", "rss", "https://www.engadget.com/rss.xml", "tech", False, "center", False),
    ("The Register", "rss", "https://www.theregister.com/headlines.atom", "tech", False, None, False),
    ("9to5Mac", "rss", "https://9to5mac.com/feed/", "tech", False, None, False),
    ("Android Authority", "rss", "https://www.androidauthority.com/feed/", "tech", False, None, False),
    ("Tom's Hardware", "rss", "https://www.tomshardware.com/feeds/all", "tech", False, None, False),
    ("BleepingComputer", "rss", "https://www.bleepingcomputer.com/feed/", "tech", False, None, False),
    ("BBC News / Tech", "rss", "https://feeds.bbci.co.uk/news/technology/rss.xml", "tech", False, "center", False),
    ("Hacker News / Tech", "rss", "https://hnrss.org/frontpage", "tech", False, None, False),
    # Science
    ("Science News", "rss", "https://www.sciencenews.org/feed", "science", False, "center", False),
    (
        "ScienceDaily / Science",
        "rss",
        "https://www.sciencedaily.com/rss/top/science.xml",
        "science",
        False,
        None,
        False,
    ),
    ("Phys.org", "rss", "https://phys.org/rss-feed/", "science", False, None, False),
    ("NASA", "rss", "https://www.nasa.gov/news-release/feed/", "science", False, None, False),
    ("Science", "rss", "https://www.science.org/rss/news_current.xml", "science", False, None, False),
    ("Live Science", "rss", "https://www.livescience.com/feeds/all", "science", False, None, False),
    (
        "BBC News / Science",
        "rss",
        "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "science",
        False,
        "center",
        False,
    ),
    ("Quanta Magazine", "rss", "https://www.quantamagazine.org/feed/", "science", False, None, False),
    ("The Conversation", "rss", "https://theconversation.com/us/articles.atom", "science", False, "center", False),
    ("Astronomy", "rss", "https://www.astronomy.com/feed/", "science", False, None, False),
    # Climate
    ("Inside Climate News", "rss", "https://insideclimatenews.org/feed/", "climate", False, "center-left", False),
    ("Carbon Brief", "rss", "https://www.carbonbrief.org/feed/", "climate", False, None, False),
    ("Grist", "rss", "https://grist.org/feed/", "climate", False, None, False),
    (
        "The Guardian / Climate",
        "rss",
        "https://www.theguardian.com/environment/rss",
        "climate",
        False,
        "center-left",
        False,
    ),
    ("Yale Environment 360", "rss", "https://e360.yale.edu/feed.xml", "climate", False, None, False),
    ("Climate Home News", "rss", "https://www.climatechangenews.com/feed/", "climate", False, None, False),
    ("Canary Media", "rss", "https://www.canarymedia.com/rss.rss", "climate", False, None, False),
    ("Heatmap", "rss", "https://heatmap.news/feeds/feed.rss", "climate", False, None, False),
    ("Mongabay", "rss", "https://news.mongabay.com/feed/", "climate", False, None, False),
    ("NOAA", "rss", "https://www.noaa.gov/rss.xml", "climate", False, None, False),
    ("Eos", "rss", "https://eos.org/feed", "climate", False, None, False),
    # Health
    ("STAT", "rss", "https://www.statnews.com/feed/", "health", False, "center", False),
    ("KFF Health News", "rss", "https://kffhealthnews.org/feed/", "health", False, None, False),
    ("BBC News / Health", "rss", "https://feeds.bbci.co.uk/news/health/rss.xml", "health", False, "center", False),
    (
        "The Guardian / Health",
        "rss",
        "https://www.theguardian.com/society/health/rss",
        "health",
        False,
        "center-left",
        False,
    ),
    ("Medical Xpress", "rss", "https://medicalxpress.com/rss-feed/", "health", False, None, False),
    ("MedPage Today", "rss", "https://www.medpagetoday.com/rss/headlines.xml", "health", False, None, False),
    ("CBS News / Health", "rss", "https://www.cbsnews.com/latest/rss/health", "health", False, "center", False),
    ("NBC News / Health", "rss", "https://feeds.nbcnews.com/nbcnews/public/health", "health", False, "center", False),
    (
        "FDA",
        "rss",
        "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml",
        "health",
        False,
        None,
        False,
    ),
    ("Healthcare Dive", "rss", "https://www.healthcaredive.com/feeds/news/", "health", False, None, False),
    (
        "ScienceDaily / Health",
        "rss",
        "https://www.sciencedaily.com/rss/health_medicine.xml",
        "health",
        False,
        None,
        False,
    ),
    # Sports
    ("BBC Sport", "rss", "https://feeds.bbci.co.uk/sport/rss.xml", "sports", False, "center", False),
    ("CBS Sports", "rss", "https://www.cbssports.com/rss/headlines/", "sports", False, None, False),
    ("Yahoo Sports", "rss", "https://sports.yahoo.com/rss/", "sports", False, None, False),
    ("Sky Sports", "rss", "https://www.skysports.com/rss/12040", "sports", False, None, False),
    ("The Guardian / Sports", "rss", "https://www.theguardian.com/sport/rss", "sports", False, "center-left", False),
    (
        "Fox Sports",
        "rss",
        "https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30",
        "sports",
        False,
        None,
        False,
    ),
    ("NBC Sports", "rss", "https://profootballtalk.nbcsports.com/feed/", "sports", False, None, False),
    ("Sports Illustrated", "rss", "https://www.si.com/feed", "sports", False, None, False),
    ("CBC Sports", "rss", "https://www.cbc.ca/webfeed/rss/rss-sports", "sports", False, None, False),
    ("Sporting News", "rss", "https://www.sportingnews.com/us/rss", "sports", False, None, False),
    ("SB Nation", "rss", "https://www.sbnation.com/rss/index.xml", "sports", False, None, False),
    # Entertainment
    ("Variety", "rss", "https://variety.com/feed/", "entertainment", False, "center", False),
    ("The Hollywood Reporter", "rss", "https://www.hollywoodreporter.com/feed/", "entertainment", False, None, False),
    ("Deadline", "rss", "https://deadline.com/feed/", "entertainment", False, "center", False),
    ("Billboard", "rss", "https://www.billboard.com/feed/", "entertainment", False, "center", False),
    ("Rolling Stone", "rss", "https://www.rollingstone.com/feed/", "entertainment", False, "left", False),
    ("Pitchfork", "rss", "https://pitchfork.com/feed/feed-news/rss", "entertainment", False, None, False),
    ("IndieWire", "rss", "https://www.indiewire.com/feed/", "entertainment", False, None, False),
    (
        "BBC News / Entertainment",
        "rss",
        "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
        "entertainment",
        False,
        "center",
        False,
    ),
    (
        "The Guardian / Entertainment",
        "rss",
        "https://www.theguardian.com/culture/rss",
        "entertainment",
        False,
        "center-left",
        False,
    ),
    ("The A.V. Club", "rss", "https://www.avclub.com/rss", "entertainment", False, None, False),
    ("Stereogum", "rss", "https://www.stereogum.com/feed/", "entertainment", False, None, False),
    # Games
    ("Polygon", "rss", "https://www.polygon.com/feed/", "gaming", False, None, False),
    ("IGN", "rss", "https://feeds.ign.com/ign/all", "gaming", False, None, False),
    ("Kotaku", "rss", "https://kotaku.com/feed", "gaming", False, None, False),
    ("PC Gamer", "rss", "https://www.pcgamer.com/rss/", "gaming", False, None, False),
    ("Eurogamer", "rss", "https://www.eurogamer.net/feed", "gaming", False, None, False),
    ("GamesIndustry.biz", "rss", "https://www.gamesindustry.biz/feed", "gaming", False, None, False),
    ("Rock Paper Shotgun", "rss", "https://www.rockpapershotgun.com/feed", "gaming", False, None, False),
    ("Game Developer", "rss", "https://www.gamedeveloper.com/rss.xml", "gaming", False, None, False),
    ("Video Games Chronicle", "rss", "https://www.videogameschronicle.com/feed/", "gaming", False, None, False),
    ("GameSpot", "rss", "https://www.gamespot.com/feeds/news/", "gaming", False, None, False),
    ("Nintendo Life", "rss", "https://www.nintendolife.com/feeds/latest", "gaming", False, None, False),
    ("Gematsu", "rss", "https://www.gematsu.com/feed", "gaming", False, None, False),
    # Internet
    ("Know Your Meme", "rss", "https://knowyourmeme.com/editorials.rss", "internet", False, None, False),
    ("The Daily Dot", "rss", "https://www.dailydot.com/feed/", "internet", False, "center-left", False),
    ("Garbage Day", "rss", "https://rss.beehiiv.com/feeds/owMwaGYU36.xml", "internet", False, None, False),
    ("Mashable", "rss", "https://mashable.com/feeds/rss/all", "internet", False, "center-left", False),
    (
        "The Verge / Internet",
        "rss",
        "https://www.theverge.com/rss/web/index.xml",
        "internet",
        False,
        "center-left",
        False,
    ),
    ("Snopes", "rss", "https://www.snopes.com/feed/", "internet", False, "center", False),
    ("Rest of World", "rss", "https://restofworld.org/feed/latest/", "internet", False, None, False),
    ("Tubefilter", "rss", "https://www.tubefilter.com/feed/", "internet", False, None, False),
    ("Social Media Today", "rss", "https://www.socialmediatoday.com/feeds/news/", "internet", False, None, False),
    ("Dexerto", "rss", "https://www.dexerto.com/feed/", "internet", False, None, False),
]

DEFAULT_SOURCES = DEFAULT_SOURCES + NEWS_SOURCES

# Feed URLs that earlier versions seeded and that have since moved. Seeding
# points a source still on one of these at its new URL.
RETIRED_URLS = {
    "https://openai.com/blog/rss.xml",
    "https://blog.google/technology/ai/rss/",
    "https://mistral.ai/news/rss/",
}

FEED_LIMIT = 30


@dataclass
class SourceRow:
    id: str
    name: str
    type: str
    url: Optional[str]
    category: Optional[str]
    ai_only: bool
    lean: Optional[str] = None
    paywalled: bool = False


def outlet(name: str) -> str:
    """The outlet a source belongs to: "The Guardian / Politics" -> "The Guardian"."""
    return name.split(" / ")[0]


class SourceRegistry:
    def __init__(self, engine: Engine, ingester: Optional[SourceIngester] = None):
        self.engine = engine
        self.ingester = ingester or SourceIngester()

    def seed(self, sources: Sequence[Tuple] = DEFAULT_SOURCES) -> int:
        """Add any default source that isn't in the table yet (matched by name or URL).

        Entries are (name, type, url, category, ai_only) with optional
        (lean, paywalled) after them.
        """
        added = 0
        with self.engine.begin() as conn:
            for entry in sources:
                name, kind, url, category, ai_only = entry[:5]
                lean = entry[5] if len(entry) > 5 else None
                paywalled = bool(entry[6]) if len(entry) > 6 else False
                exists = conn.execute(
                    text('SELECT id, url FROM "Source" WHERE name = :name OR (url IS NOT NULL AND url = :url)'),
                    {"name": name, "url": url},
                ).first()
                if exists:
                    if exists[1] in RETIRED_URLS and url != exists[1]:
                        conn.execute(
                            text('UPDATE "Source" SET url = :url, failures = 0, "lastError" = NULL, '
                                 '"updatedAt" = now() WHERE id = :id'),
                            {"url": url, "id": exists[0]},
                        )
                    continue
                conn.execute(
                    text("""
                        INSERT INTO "Source" (id, name, url, type, category, "aiOnly", lean, paywalled, "isActive",
                                              failures, "createdAt", "updatedAt")
                        VALUES (gen_random_uuid()::text, :name, :url, :type, :category, :ai_only, :lean, :paywalled,
                                true, 0, now(), now())
                    """),
                    {"name": name, "url": url, "type": kind, "category": category, "ai_only": ai_only,
                     "lean": lean, "paywalled": paywalled},
                )
                added += 1
        if added:
            logger.info(f"[sources] added {added} default source(s)")
        return added

    def active(self) -> List[SourceRow]:
        with self.engine.connect() as conn:
            rows = conn.execute(
                text('SELECT id, name, type, url, category, "aiOnly", lean, paywalled FROM "Source" WHERE "isActive" ORDER BY name')
            ).fetchall()
        return [SourceRow(*r) for r in rows]

    def record(self, source: SourceRow, items: int, error: Optional[str]) -> None:
        now = datetime.now(timezone.utc)
        with self.engine.begin() as conn:
            if error is None:
                conn.execute(
                    text("""
                        UPDATE "Source" SET "lastFetched" = :now, "lastSuccessAt" = :now, "lastItemCount" = :items,
                               "lastError" = NULL, failures = 0, "updatedAt" = :now WHERE id = :id
                    """),
                    {"now": now, "items": items, "id": source.id},
                )
            else:
                conn.execute(
                    text("""
                        UPDATE "Source" SET "lastFetched" = :now, "lastError" = :error, "lastItemCount" = :items,
                               failures = failures + 1, "updatedAt" = :now WHERE id = :id
                    """),
                    {"now": now, "error": error[:500], "items": items, "id": source.id},
                )

    async def _fetch(self, source: SourceRow) -> List[SourceItem]:
        ing = self.ingester
        if source.type == "rss":
            return await ing.fetch_feed(source.url or "", source.name, FEED_LIMIT)
        if source.type == "hackernews":
            items = await ing.ingest_hn(top_n=30)
        elif source.type == "arxiv":
            items = await ing.ingest_arxiv(max_results=20)
        elif source.type == "github_trending":
            items = await ing.ingest_github_trending()
        elif source.type == "huggingface":
            items = await ing.ingest_huggingface(limit=20)
        else:
            raise ValueError(f"unknown source type {source.type!r}")
        if not items:
            raise RuntimeError("returned no items")
        return items

    async def fetch_all(self, concurrency: int = 8) -> List[SourceItem]:
        """Fetch every active source, a few at a time, recording each one's health."""
        gate = asyncio.Semaphore(concurrency)

        async def one(source: SourceRow) -> List[SourceItem]:
            async with gate:
                try:
                    items = await self._fetch(source)
                except Exception as e:
                    logger.warning(f"[sources] {source.name} failed: {e}")
                    self.record(source, 0, f"{type(e).__name__}: {e}")
                    return []
            for item in items:
                item.source_name = outlet(source.name)
                item.metadata["source_id"] = source.id
                item.metadata["ai_only"] = source.ai_only
                item.metadata["lean"] = source.lean
                item.metadata["paywalled"] = source.paywalled
                if source.category:
                    item.metadata["category_hint"] = source.category
            self.record(source, len(items), None)
            return items

        results = await asyncio.gather(*(one(s) for s in self.active()))
        return [item for batch in results for item in batch]
