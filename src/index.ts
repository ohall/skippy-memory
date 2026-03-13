import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  Memory,
  Soul,
  UserProfile,
  RetrievedMemory,
  RetrievalContext,
  MemoryConfig,
  Insight,
  MemoryType,
  SoulEvolution,
  MemoryValidationError,
  MemoryNotFoundError,
} from './types.js';
import { initSchema } from './schema.js';

/**
 * SkippyMemory - An opinionated, local-first memory system for AI companions
 * 
 * Design principles:
 * - Local-first: SQLite by default, no external calls required
 * - Type-safe: Full TypeScript, no guessing
 * - Opinionated: Sane defaults, no kitchen-sink config
 * - Soul-aware: Personality evolves with memories
 * - Semantic: Vectors when you want them, text when you don't
 */
export class SkippyMemory {
  private db: Database.Database;
  private config: Required<MemoryConfig>;
  private statements: Map<string, Database.Statement> = new Map();

  constructor(config: MemoryConfig) {
    this.config = {
      enableSemanticSearch: false,
      embedFn: undefined,
      forgetRate: 0.1,
      maxRetrievalCount: 10,
      defaultImportance: 0.5,
      debug: false,
      ...config,
    };

    // Validate config
    if (this.config.enableSemanticSearch && !this.config.embedFn) {
      throw new MemoryValidationError(
        'embedFn is required when enableSemanticSearch is true',
        'embedFn'
      );
    }

    // Open database
    this.db = new Database(this.config.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Initialize schema
    initSchema(this.db);

    this.log('Initialized SkippyMemory');
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[SkippyMemory]', ...args);
    }
  }

  private getStatement(sql: string): Database.Statement {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, this.db.prepare(sql));
    }
    return this.statements.get(sql)!;
  }

  // ==================== USER MANAGEMENT ====================

  /**
   * Create or update a user profile
   */
  createUser(profile: Omit<UserProfile, 'createdAt' | 'updatedAt'>): UserProfile {
    const now = new Date();
    
    const stmt = this.getStatement(`
      INSERT INTO users (id, name, verbosity, tone, humor, learning, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        verbosity = excluded.verbosity,
        tone = excluded.tone,
        humor = excluded.humor,
        learning = excluded.learning,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      profile.id,
      profile.name,
      profile.style.verbosity,
      profile.style.tone,
      profile.style.humor,
      profile.style.learning,
      now.toISOString(),
      now.toISOString()
    );

    // Update interests
    if (profile.interests.length > 0) {
      const interestStmt = this.getStatement(`
        INSERT INTO user_interests (user_id, interest) VALUES (?, ?)
        ON CONFLICT(user_id, interest) DO NOTHING
      `);
      const insertInterests = this.db.transaction((interests: string[]) => {
        for (const interest of interests) {
          interestStmt.run(profile.id, interest);
        }
      });
      insertInterests(profile.interests);
    }

    // Update dislikes
    if (profile.dislikes.length > 0) {
      const dislikeStmt = this.getStatement(`
        INSERT INTO user_dislikes (user_id, dislike) VALUES (?, ?)
        ON CONFLICT(user_id, dislike) DO NOTHING
      `);
      const insertDislikes = this.db.transaction((dislikes: string[]) => {
        for (const dislike of dislikes) {
          dislikeStmt.run(profile.id, dislike);
        }
      });
      insertDislikes(profile.dislikes);
    }

    return {
      ...profile,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get a user by ID
   */
  getUser(userId: string): UserProfile | null {
    const userStmt = this.getStatement(`
      SELECT * FROM users WHERE id = ?
    `);
    const user = userStmt.get(userId) as {
      id: string;
      name: string;
      verbosity: string;
      tone: string;
      humor: string;
      learning: string;
      current_valence: number | null;
      current_arousal: number | null;
      mood_timestamp: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!user) return null;

    const interestsStmt = this.getStatement(`
      SELECT interest FROM user_interests WHERE user_id = ?
    `);
    const interests = interestsStmt.all(userId) as { interest: string }[];

    const dislikesStmt = this.getStatement(`
      SELECT dislike FROM user_dislikes WHERE user_id = ?
    `);
    const dislikes = dislikesStmt.all(userId) as { dislike: string }[];

    return {
      id: user.id,
      name: user.name,
      style: {
        verbosity: user.verbosity as UserProfile['style']['verbosity'],
        tone: user.tone as UserProfile['style']['tone'],
        humor: user.humor as UserProfile['style']['humor'],
        learning: user.learning as UserProfile['style']['learning'],
      },
      interests: interests.map(i => i.interest),
      dislikes: dislikes.map(d => d.dislike),
      currentMood: user.current_valence !== null ? {
        valence: user.current_valence,
        arousal: user.current_arousal!,
        timestamp: new Date(user.mood_timestamp!),
      } : undefined,
      createdAt: new Date(user.created_at),
      updatedAt: new Date(user.updated_at),
    };
  }

  /**
   * Update user's current mood
   */
  updateMood(userId: string, valence: number, arousal: number): void {
    const stmt = this.getStatement(`
      UPDATE users SET
        current_valence = ?,
        current_arousal = ?,
        mood_timestamp = ?,
        updated_at = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();
    stmt.run(valence, arousal, now, now, userId);
  }

  // ==================== SOUL MANAGEMENT ====================

  /**
   * Create a new soul state
   */
  createSoul(soul: Omit<Soul, 'timestamp'>): Soul {
    const stmt = this.getStatement(`
      INSERT INTO souls (id, humor, empathy, curiosity, creativity, helpfulness, honesty, confidence, narrative)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      soul.id,
      soul.dimensions.humor,
      soul.dimensions.empathy,
      soul.dimensions.curiosity,
      soul.dimensions.creativity,
      soul.dimensions.helpfulness,
      soul.dimensions.honesty,
      soul.dimensions.confidence,
      soul.narrative || null
    );

    return {
      ...soul,
      timestamp: new Date(),
    };
  }

  /**
   * Get the latest soul state
   */
  getLatestSoul(soulId: string): Soul | null {
    const stmt = this.getStatement(`
      SELECT * FROM souls WHERE id = ? ORDER BY timestamp DESC LIMIT 1
    `);
    const row = stmt.get(soulId) as {
      id: string;
      humor: number;
      empathy: number;
      curiosity: number;
      creativity: number;
      helpfulness: number;
      honesty: number;
      confidence: number;
      narrative: string | null;
      timestamp: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      dimensions: {
        humor: row.humor,
        empathy: row.empathy,
        curiosity: row.curiosity,
        creativity: row.creativity,
        helpfulness: row.helpfulness,
        honesty: row.honesty,
        confidence: row.confidence,
      },
      narrative: row.narrative || undefined,
      timestamp: new Date(row.timestamp),
    };
  }

  /**
   * Evolve the soul based on experience
   */
  evolveSoul(
    soulId: string,
    evolution: Omit<SoulEvolution, 'soul'>
  ): Soul {
    const current = this.getLatestSoul(soulId);
    if (!current) {
      throw new MemoryNotFoundError(soulId);
    }

    // Calculate new dimensions based on experience
    // This is where personality evolves based on interaction patterns
    const newDimensions = { ...current.dimensions };
    
    // Evolve based on the trigger type
    if (evolution.trigger.includes('humor')) {
      newDimensions.humor = Math.min(1, newDimensions.humor + 0.05);
    }
    if (evolution.trigger.includes('correction')) {
      newDimensions.honesty = Math.min(1, newDimensions.honesty + 0.02);
      newDimensions.confidence = Math.max(0, newDimensions.confidence - 0.01);
    }
    if (evolution.trigger.includes('success')) {
      newDimensions.confidence = Math.min(1, newDimensions.confidence + 0.05);
      newDimensions.helpfulness = Math.min(1, newDimensions.helpfulness + 0.03);
    }
    if (evolution.trigger.includes('learning')) {
      newDimensions.curiosity = Math.min(1, newDimensions.curiosity + 0.03);
      newDimensions.creativity = Math.min(1, newDimensions.creativity + 0.02);
    }

    const newSoul: Soul = {
      id: soulId,
      dimensions: newDimensions,
      narrative: evolution.trigger,
      timestamp: new Date(),
    };

    return this.createSoul(newSoul);
  }

  // ==================== MEMORY OPERATIONS ====================

  /**
   * Store a new memory
   */
  async createMemory(
    memory: Omit<Memory, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>
  ): Promise<Memory> {
    const id = randomUUID();
    const now = new Date();

    // Generate embedding if enabled
    let embedding: Buffer | null = null;
    if (this.config.enableSemanticSearch && this.config.embedFn) {
      const vector = await this.config.embedFn(memory.content);
      embedding = Buffer.from(JSON.stringify(vector));
    }

    const stmt = this.getStatement(`
      INSERT INTO memories (
        id, content, source, user_id, soul_id, session_key, type,
        importance, embedding, concepts, created_at, last_accessed, access_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      memory.content,
      memory.source,
      memory.userId,
      memory.soulId,
      memory.sessionKey || null,
      memory.type,
      memory.importance,
      embedding,
      memory.concepts?.join(',') || null,
      now.toISOString(),
      now.toISOString(),
      1
    );

    // Link related memories
    if (memory.relatedMemories && memory.relatedMemories.length > 0) {
      const relStmt = this.getStatement(`
        INSERT INTO memory_relationships (from_memory_id, to_memory_id, relationship_type)
        VALUES (?, ?, 'related')
      `);
      const insertRels = this.db.transaction((rels: string[]) => {
        for (const relId of rels) {
          relStmt.run(id, relId);
        }
      });
      insertRels(memory.relatedMemories);
    }

    return {
      ...memory,
      id,
      createdAt: now,
      lastAccessed: now,
      accessCount: 1,
    };
  }

  /**
   * Retrieve memories based on context
   */
  retrieve(context: RetrievalContext): RetrievedMemory[] {
    const memories: RetrievedMemory[] = [];
    const now = new Date();

    // Build query based on context
    const baseQuery = `
      SELECT m.*, 
        (julianday('now') - julianday(m.created_at)) as age_days,
        CASE 
          WHEN m.type = 'milestone' THEN 2.0
          WHEN m.type = 'preference' THEN 1.5
          WHEN m.type = 'correction' THEN 1.8
          ELSE 1.0
        END as type_boost
      FROM memories m
      WHERE m.user_id = ?
        AND m.importance >= ?
        ${context.lookbackDays ? `AND julianday('now') - julianday(m.created_at) <= ?` : ''}
    `;

    const params: (string | number)[] = [
      context.userId,
      context.minImportance || 0,
    ];
    if (context.lookbackDays) {
      params.push(context.lookbackDays);
    }

    const stmt = this.db.prepare(baseQuery);
    const rows = stmt.all(...params) as Array<{
      id: string;
      content: string;
      source: string;
      user_id: string;
      soul_id: string;
      session_key: string | null;
      type: string;
      importance: number;
      embedding: Buffer | null;
      concepts: string | null;
      created_at: string;
      last_accessed: string;
      access_count: number;
      age_days: number;
      type_boost: number;
    }>;

    // Score and rank memories
    for (const row of rows) {
      let relevanceScore = 0;
      let matchReason: RetrievedMemory['matchReason'] = 'importance';

      // Importance score
      relevanceScore += row.importance * 0.3;

      // Recency score (newer = better, but with decay)
      const ageScore = Math.exp(-row.age_days * this.config.forgetRate * 0.1);
      relevanceScore += ageScore * 0.2;

      // Type boost
      relevanceScore += (row.type_boost - 1) * 0.2;

      // Session match bonus
      if (context.sessionKey && row.session_key === context.sessionKey) {
        relevanceScore += 0.15;
        matchReason = 'temporal';
      }

      // Access count (frequently accessed memories are important)
      const accessScore = Math.min(1, row.access_count * 0.05);
      relevanceScore += accessScore * 0.1;

      // Semantic similarity (if we have embeddings and query)
      if (context.query && row.embedding && this.config.enableSemanticSearch) {
        // TODO: Implement cosine similarity
        // For now, simple keyword matching
        const keywords = context.query.toLowerCase().split(' ');
        const contentWords = row.content.toLowerCase();
        const keywordMatches = keywords.filter(k => contentWords.includes(k)).length;
        relevanceScore += (keywordMatches / keywords.length) * 0.3;
        matchReason = 'semantic';
      }

      memories.push({
        id: row.id,
        content: row.content,
        source: row.source as Memory['source'],
        userId: row.user_id,
        soulId: row.soul_id,
        sessionKey: row.session_key || undefined,
        type: row.type as MemoryType,
        importance: row.importance,
        embedding: row.embedding ? JSON.parse(row.embedding.toString()) : undefined,
        concepts: row.concepts?.split(',') || undefined,
        createdAt: new Date(row.created_at),
        lastAccessed: new Date(row.last_accessed),
        accessCount: row.access_count,
        relevanceScore: Math.min(1, relevanceScore),
        matchReason,
      });
    }

    // Sort by relevance and limit
    memories.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const limited = memories.slice(0, context.limit || this.config.maxRetrievalCount);

    // Update access counts for retrieved memories
    const updateStmt = this.getStatement(`
      UPDATE memories 
      SET access_count = access_count + 1, last_accessed = ?
      WHERE id = ?
    `);
    const updateAccess = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        updateStmt.run(now.toISOString(), id);
      }
    });
    updateAccess(limited.map(m => m.id));

    return limited;
  }

  /**
   * Get a specific memory by ID
   */
  getMemory(id: string): Memory | null {
    const stmt = this.getStatement(`SELECT * FROM memories WHERE id = ?`);
    const row = stmt.get(id) as {
      id: string;
      content: string;
      source: string;
      user_id: string;
      soul_id: string;
      session_key: string | null;
      type: string;
      importance: number;
      embedding: Buffer | null;
      concepts: string | null;
      created_at: string;
      last_accessed: string;
      access_count: number;
    } | undefined;

    if (!row) return null;

    // Update access count
    const updateStmt = this.getStatement(`
      UPDATE memories SET access_count = access_count + 1, last_accessed = ?
      WHERE id = ?
    `);
    updateStmt.run(new Date().toISOString(), id);

    return {
      id: row.id,
      content: row.content,
      source: row.source as Memory['source'],
      userId: row.user_id,
      soulId: row.soul_id,
      sessionKey: row.session_key || undefined,
      type: row.type as MemoryType,
      importance: row.importance,
      embedding: row.embedding ? JSON.parse(row.embedding.toString()) : undefined,
      concepts: row.concepts?.split(',') || undefined,
      createdAt: new Date(row.created_at),
      lastAccessed: new Date(row.last_accessed),
      accessCount: row.access_count + 1,
    };
  }

  // ==================== INSIGHTS ====================

  /**
   * Create a learned insight
   */
  createInsight(insight: Omit<Insight, 'createdAt' | 'reinforcedAt'>): Insight {
    const now = new Date();

    const stmt = this.getStatement(`
      INSERT INTO insights (id, content, type, confidence, user_id, created_at, reinforced_at, reinforcement_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      insight.id,
      insight.content,
      insight.type,
      insight.confidence,
      insight.userId,
      now.toISOString(),
      now.toISOString(),
      insight.reinforcementCount
    );

    // Link to source memories
    if (insight.sourceMemories.length > 0) {
      const sourceStmt = this.getStatement(`
        INSERT INTO insight_sources (insight_id, memory_id) VALUES (?, ?)
      `);
      const insertSources = this.db.transaction((sources: string[]) => {
        for (const memId of sources) {
          sourceStmt.run(insight.id, memId);
        }
      });
      insertSources(insight.sourceMemories);
    }

    return {
      ...insight,
      createdAt: now,
      reinforcedAt: now,
    };
  }

  /**
   * Get insights for a user
   */
  getInsights(userId: string, minConfidence = 0.5): Insight[] {
    const stmt = this.getStatement(`
      SELECT i.*, GROUP_CONCAT(isrc.memory_id) as source_memory_ids
      FROM insights i
      LEFT JOIN insight_sources isrc ON i.id = isrc.insight_id
      WHERE i.user_id = ? AND i.confidence >= ?
      GROUP BY i.id
      ORDER BY i.confidence DESC, i.reinforcement_count DESC
    `);

    const rows = stmt.all(userId, minConfidence) as Array<{
      id: string;
      content: string;
      type: string;
      confidence: number;
      user_id: string;
      created_at: string;
      reinforced_at: string;
      reinforcement_count: number;
      source_memory_ids: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      type: row.type as Insight['type'],
      confidence: row.confidence,
      userId: row.user_id,
      sourceMemories: row.source_memory_ids?.split(',') || [],
      createdAt: new Date(row.created_at),
      reinforcedAt: new Date(row.reinforced_at),
      reinforcementCount: row.reinforcement_count,
    }));
  }

  /**
   * Reinforce an existing insight (increases confidence)
   */
  reinforceInsight(insightId: string, additionalConfidence = 0.05): void {
    const stmt = this.getStatement(`
      UPDATE insights SET
        confidence = MIN(1.0, confidence + ?),
        reinforcement_count = reinforcement_count + 1,
        reinforced_at = ?
      WHERE id = ?
    `);
    stmt.run(additionalConfidence, new Date().toISOString(), insightId);
  }

  // ==================== UTILITY ====================

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
    this.log('Database closed');
  }

  /**
   * Get stats about the memory system
   */
  getStats(): {
    totalMemories: number;
    totalUsers: number;
    totalInsights: number;
    soulStates: number;
    avgMemoryAge: number;
  } {
    const memories = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    const users = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const insights = this.db.prepare('SELECT COUNT(*) as count FROM insights').get() as { count: number };
    const souls = this.db.prepare('SELECT COUNT(*) as count FROM souls').get() as { count: number };
    const age = this.db.prepare(`
      SELECT AVG(julianday('now') - julianday(created_at)) as avg_age
      FROM memories
    `).get() as { avg_age: number };

    return {
      totalMemories: memories.count,
      totalUsers: users.count,
      totalInsights: insights.count,
      soulStates: souls.count,
      avgMemoryAge: age.avg_age || 0,
    };
  }
}