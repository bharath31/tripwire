CREATE TABLE IF NOT EXISTS behavioral_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  installation_id TEXT NOT NULL CHECK (
    length(installation_id) = 32
    AND installation_id NOT GLOB '*[^a-f0-9]*'
  ),
  event TEXT NOT NULL CHECK (event = 'behavioral_run_completed'),
  command TEXT NOT NULL CHECK (command IN ('analyze', 'test', 'test-all', 'action')),
  agent TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'behavior_failure', 'infrastructure_error')),
  version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cli', 'github_action'))
);

CREATE INDEX IF NOT EXISTS behavioral_events_occurred_at
  ON behavioral_events (occurred_at);

CREATE INDEX IF NOT EXISTS behavioral_events_installation_id
  ON behavioral_events (installation_id);
