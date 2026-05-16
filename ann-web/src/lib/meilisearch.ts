import { Meilisearch } from "meilisearch";

const host = process.env.MEILISEARCH_HOST || "http://localhost:7700";
const apiKey = process.env.MEILISEARCH_API_KEY || "";

export const meilisearch = new Meilisearch({
  host,
  apiKey,
});

export const SEARCH_INDEX = "articles";

export async function setupSearchIndex() {
  try {
    const index = meilisearch.index(SEARCH_INDEX);

    // Configure searchable attributes
    await index.updateSearchableAttributes([
      "title",
      "summary",
      "tlDr",
      "content",
      "tags",
      "source",
      "author",
    ]);

    // Configure filterable attributes
    await index.updateFilterableAttributes([
      "category",
      "tags",
      "source",
      "publishedAt",
    ]);

    // Configure sortable attributes
    await index.updateSortableAttributes([
      "publishedAt",
      "scores.signalScore",
      "scores.overallScore",
    ]);

    // Configure ranking rules
    await index.updateRankingRules([
      "words",
      "typo",
      "proximity",
      "attribute",
      "sort",
      "exactness",
    ]);

    console.log("Meilisearch index configured successfully");
  } catch (error) {
    console.error("Failed to configure Meilisearch index:", error);
  }
}
