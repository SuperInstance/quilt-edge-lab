-- quilt-edge-lab ledger schema.
-- Design source: the fleet's harness-experiments D1 ledger (uuid
-- 0cce20ec-b358-4be2-8570-844275ee08ba) — the gamma/eta/efficiency
-- conservation columns are quilt-dba culture (cost vs value accounting).
-- We mirror it in OUR OWN database to keep zero collision with its rows.

CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id TEXT UNIQUE,
  timestamp INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  hypothesis TEXT,
  model TEXT NOT NULL,
  batch_size INTEGER NOT NULL DEFAULT 1,
  concurrent_agents INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL DEFAULT 'cloudflare-worker',
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  wall_clock_seconds INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 1,
  items_completed INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  quality_score REAL DEFAULT 0,
  lessons_extracted INTEGER DEFAULT 0,
  notes TEXT,
  tags TEXT,
  gamma REAL GENERATED ALWAYS AS (
    tokens_in + tokens_out + (wall_clock_seconds * 10) + (api_calls * 50)
  ) STORED,
  eta REAL GENERATED ALWAYS AS (
    (items_completed * 100) + (quality_score * 500) + (lessons_extracted * 200)
  ) STORED,
  efficiency REAL GENERATED ALWAYS AS (
    CASE WHEN gamma > 0 THEN eta * 1.0 / gamma ELSE 0 END
  ) STORED,
  success_rate REAL GENERATED ALWAYS AS (
    CASE WHEN (items_completed + items_failed) > 0
      THEN items_completed * 1.0 / (items_completed + items_failed)
      ELSE 0 END
  ) STORED
);
