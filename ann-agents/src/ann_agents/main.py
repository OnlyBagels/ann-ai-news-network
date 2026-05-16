"""ANN Agentic Newsroom - Main entry point.

Usage:
    python -m ann_agents.main                    # Run a demo story through the pipeline
    python -m ann_agents.main --ingest           # Ingest from all sources and process
    python -m ann_agents.main --pipeline         # Run pipeline on existing stories
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime

from loguru import logger

from ann_agents.core.types import Category, SourceItem, Story
from ann_agents.ingestion.source_ingester import SourceIngester
from ann_agents.pipeline.story_pipeline import StoryPipeline


async def run_demo() -> None:
    """Run a demo story through the full agent pipeline."""
    logger.info("=== ANN Agentic Newsroom Demo ===")

    # Create a sample story
    story = Story(
        title="DeepSeek Releases New Model with 1M Context Window",
        source_items=[
            SourceItem(
                title="DeepSeek Releases New Model with 1M Context Window",
                url="https://deepseek.com/blog/new-model",
                source_name="DeepSeek Blog",
                source_type="rss",
                author="DeepSeek Team",
                published_at=datetime.utcnow(),
                content="""DeepSeek has released a new version of their flagship model with 
                a 1 million token context window, matching Gemini's capabilities. The model 
                shows strong performance on long-context benchmarks including RULER and 
                Needle-in-a-Haystack tests. Pricing remains at $0.28/M input tokens, 
                making it one of the most cost-effective options for long-context applications.
                
                Key improvements include:
                - 1M token context window (up from 128K)
                - Improved retrieval accuracy at long contexts (+15% on RULER)
                - Same pricing as previous generation
                - Available immediately via API and open-source weights
                
                This positions DeepSeek as a strong competitor to Gemini 2.0 Pro and 
                Claude 3.5 Sonnet for enterprise long-context use cases.""",
                summary="DeepSeek releases new model with 1M context window, matching Gemini's capabilities at competitive pricing.",
                tags=["deepseek", "models", "context-window", "long-context"],
            )
        ],
        primary_source=SourceItem(
            title="DeepSeek Releases New Model with 1M Context Window",
            url="https://deepseek.com/blog/new-model",
            source_name="DeepSeek Blog",
            source_type="rss",
            author="DeepSeek Team",
            published_at=datetime.utcnow(),
            content="DeepSeek has released a new version of their flagship model...",
            tags=["deepseek", "models"],
        ),
        tags=["deepseek", "models"],
        category=Category.MODELS,
    )

    # Run through the pipeline
    pipeline = StoryPipeline()
    result = await pipeline.run_full_pipeline(story)

    # Print results
    print("\n" + "=" * 60)
    print("PIPELINE RESULTS")
    print("=" * 60)
    print(f"Title: {result.title}")
    print(f"Headline: {result.headline or 'N/A'}")
    print(f"Status: {result.status.value}")
    print(f"Category: {result.category}")
    print(f"TL;DR: {result.tl_dr or 'N/A'}")
    print(f"Summary: {result.summary or 'N/A'}")
    print(f"Tags: {', '.join(result.tags)}")
    print(f"Agents Involved: {len(result.agents_involved)}")
    for role in result.agents_involved:
        print(f"  - {role.value}")
    if result.confidence:
        print(f"Confidence: {result.confidence.overall_confidence:.2f}")
        print(f"Hallucination Risk: {result.confidence.hallucination_risk:.2f}")
    if result.scores:
        print(f"Signal Score: {result.scores.signal_score}")
        print(f"Overall Score: {result.scores.overall_score}")
    if result.risk:
        print(f"Risk Level: {result.risk.risk_level.value}")
        if result.risk.risk_factors:
            print(f"Risk Factors: {', '.join(result.risk.risk_factors)}")
    print(f"Suggested Headlines:")
    for h in result.suggested_headlines:
        print(f"  - {h}")
    print("=" * 60)


async def run_ingest() -> None:
    """Ingest from all sources and process through pipeline."""
    logger.info("=== ANN Ingestion Run ===")
    ingester = SourceIngester()
    pipeline = StoryPipeline()

    # Ingest from multiple sources
    hn_items = await ingester.ingest_hn(top_n=10)
    arxiv_items = await ingester.ingest_arxiv(max_results=5)
    github_items = await ingester.ingest_github_trending()

    all_items = hn_items + arxiv_items + github_items
    logger.info(f"Total items ingested: {len(all_items)}")

    # Process each item through the pipeline
    for item in all_items[:5]:  # Limit to 5 for demo
        story = Story(
            title=item.title,
            source_items=[item],
            primary_source=item,
            tags=item.tags,
        )
        result = await pipeline.run_full_pipeline(story)
        logger.info(f"Processed: {result.title[:60]} -> {result.status.value}")


async def main() -> None:
    """Main entry point."""
    # Configure logging
    logger.remove()
    logger.add(sys.stderr, format="<green>{time:HH:mm:ss}</green> | <level>{level:8}</level> | <cyan>{message}</cyan>", level="INFO")

    args = sys.argv[1:]

    if "--ingest" in args:
        await run_ingest()
    elif "--pipeline" in args:
        logger.info("Pipeline mode - would process existing stories from database")
    else:
        await run_demo()


if __name__ == "__main__":
    asyncio.run(main())
