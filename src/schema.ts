import Database from 'better-sqlite3';
import { Memory, Soul, UserProfile, MemoryType, Insight } from './types.js';

/**
 * Database schema and migrations for SkippyMemory
 * 
 * Design principle: Schema is explicit, typed, and opinionated
 * No JSON columns for core data - proper relational structure
 */

const SCHEMA_VERSION = 1;

const CREATE_TABLES_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Souls table - personality dimensions over time
CREATE TABLE IF NOT EXISTS souls (
  id TEXT PRIMARY KEY,
  humor REAL NOT NULL CHECK (humor >= 0 AND humor <= 1),
  empathy REAL NOT NULL CHECK (empathy >= 0 AND empathy <= 1),
  curiosity REAL NOT NULL CHECK (curiosity >= 0 AND curiosity <= 1),
  creativity REAL NOT NULL CHECK (creativity >= 0 AND creativity <= 1),
  helpfulness REAL NOT NULL CHECK (helpfulness >= 0 AND helpfulness <= 1),
  honesty REAL NOT NULL CHECK (honesty >= 0 AND honesty <= 1),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  narrative TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users table - profiles that evolve
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  verbosity TEXT CHECK (verbosity IN ('terse', 'concise', 'moderate', 'detailed')),
  tone TEXT CHECK (tone IN ('formal', 'casual', 'playful', 'technical')),
  humor TEXT CHECK (humor IN ('avoids', 'appreciates', 'expects', 'initiates')),
  learning TEXT CHECK (learning IN ('visual', 'textual', 'example-driven', 'reference-heavy')),
  current_valence REAL CHECK (current_valence >= -1 AND current_valence <= 1),
  current_arousal REAL CHECK (current_arousal >= 0 AND current_arousal <= 1),
  mood_timestamp DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User interests (many-to-many)
CREATE TABLE IF NOT EXISTS user_interests (
  user_id TEXT NOT NULL,
  interest TEXT NOT NULL,
  relevance_score REAL DEFAULT 0.5 CHECK (relevance_score >= 0 AND relevance_score <= 1),
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, interest),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User dislikes (many-to-many)
CREATE TABLE IF NOT EXISTS user_dislikes (
  user_id TEXT NOT NULL,
  dislike TEXT NOT NULL,
  severity REAL DEFAULT 0.5 CHECK (severity >= 0 AND severity <= 1),
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, dislike),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Memories table - the core
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user', 'ai', 'system')),
  user_id TEXT NOT NULL,
  soul_id TEXT NOT NULL,
  session_key TEXT,
  type TEXT NOT NULL CHECK (type IN ('fact', 'preference', 'correction', 'insight', 'milestone', 'context', 'system')),
  importance REAL NOT NULL CHECK (importance >= 0 AND importance <= 1),
  embedding BLOB, -- stored as JSON array
  concepts TEXT, -- comma-separated for simple queries
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (soul_id) REFERENCES souls(id)
);

-- Memory relationships (graph structure)
CREATE TABLE IF NOT EXISTS memory_relationships (
  from_memory_id TEXT NOT NULL,
  to_memory_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('related', 'caused', 'corrected', 'context_for')),
  strength REAL DEFAULT 0.5 CHECK (strength >= 0 AND strength <= 1),
  PRIMARY KEY (from_memory_id, to_memory_id),
  FOREIGN KEY (from_memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (to_memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Insights - learned patterns
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('preference', 'pattern', 'correction', 'fact')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reinforced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reinforcement_count INTEGER DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Link insights to their source memories
CREATE TABLE IF NOT EXISTS insight_sources (
  insight_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  PRIMARY KEY (insight_id, memory_id),
  FOREIGN KEY (insight_id) REFERENCES insights(id) ON DELETE CASCADE,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_key);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed);
CREATE INDEX IF NOT EXISTS idx_insights_user ON insights(user_id);
CREATE INDEX IF NOT EXISTS idx_souls_timestamp ON souls(timestamp DESC);
`;

/**
 * Initialize the database schema
 */
export function initSchema(db: Database.Database): void {
  db.exec(CREATE_TABLES_SQL);
  
  // Check/update schema version
  const versionStmt = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
  const currentVersion = versionStmt.get() as { version: number } | undefined;
  
  if (!currentVersion) {
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  } else if (currentVersion.version < SCHEMA_VERSION) {
    // Run migrations here when needed
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  }
}

/**
 * Wipe all data (dangerous!)
 */
export function wipeDatabase(db: Database.Database): void {
  db.exec(`
    DELETE FROM insight_sources;
    DELETE FROM insights;
    DELETE FROM memory_relationships;
    DELETE FROM memories;
    DELETE FROM user_dislikes;
    DELETE FROM user_interests;
    DELETE FROM users;
    DELETE FROM souls;
  `);
}