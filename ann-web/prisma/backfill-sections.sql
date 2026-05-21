-- Backfill section + region from legacy Category values.
-- Run once after adding the section/region columns.
-- Safe to re-run; only touches rows where section is NULL or still the default.

UPDATE "Article"
SET section = 'science', region = 'global'
WHERE category = 'research';

UPDATE "Article"
SET section = 'politics', region = 'global'
WHERE category = 'regulation';

UPDATE "Article"
SET section = 'business', region = 'global'
WHERE category = 'funding';

-- models, open_source, coding_ai, agents, security → tech (default)
UPDATE "Article"
SET section = 'tech', region = 'global'
WHERE category IN ('models', 'open_source', 'coding_ai', 'agents', 'security');
