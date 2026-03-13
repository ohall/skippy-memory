/**
 * Core types for SkippyMemory
 * 
 * Design decisions encoded here:
 * - Memories always have context (no orphan data)
 * - Soul is a vector we can compare and evolve
 * - Short vs long term distinction is explicit
 * - Relationships are first-class (not just tags)
 */

/** The soul of an AI companion - evolves over time */
export interface Soul {
  /** Unique identifier for the soul */
  id: string;
  
  /** Core personality dimensions (0-1 scale) */
  dimensions: {
    /** Tendency toward humor and lightheartedness */
    humor: number;
    
    /** Depth of emotional understanding */
    empathy: number;
    
    /** Drive to learn and explore */
    curiosity: number;
    
    /** Problem-solving creativity */
    creativity: number;
    
    /** Practical assistance orientation */
    helpfulness: number;
    
    /** Commitment to truth (even when uncomfortable) */
    honesty: number;
    
    /** Confidence in interactions (0 = insecure, 1 = magnificent) */
    confidence: number;
  };
  
  /** When this soul state was recorded */
  timestamp: Date;
  
  /** Optional narrative description of current state */
  narrative?: string;
}

/** A memory with rich context */
export interface Memory {
  /** Unique identifier */
  id: string;
  
  /** The actual content */
  content: string;
  
  /** Who said it */
  source: 'user' | 'ai' | 'system';
  
  /** User ID this memory belongs to */
  userId: string;
  
  /** AI/companion ID that experienced this */
  soulId: string;
  
  /** Session key for grouping related memories */
  sessionKey?: string;
  
  /** Type of memory - affects retention and retrieval */
  type: MemoryType;
  
  /** Importance score (0-1) - higher = less likely to forget */
  importance: number;
  
  /** Vector embedding for semantic search (optional) */
  embedding?: number[];
  
  /** Related memory IDs */
  relatedMemories?: string[];
  
  /** Key concepts extracted from this memory */
  concepts?: string[];
  
  /** When this memory was created */
  createdAt: Date;
  
  /** When this memory was last accessed (for decay) */
  lastAccessed: Date;
  
  /** How many times this memory was accessed (for reinforcement) */
  accessCount: number;
}

/** Memory types affect how we treat them */
export type MemoryType = 
  | 'fact'           // Objective information
  | 'preference'     // User likes/dislikes
  | 'correction'     // User corrected us
  | 'insight'        // Learning or realization
  | 'milestone'      // Important event
  | 'context'        // Session context (expires faster)
  | 'system';        // System events

/** A user profile that evolves */
export interface UserProfile {
  /** Unique identifier */
  id: string;
  
  /** Display name (not necessarily real name) */
  name: string;
  
  /** Communication style preferences */
  style: {
    /** Preferred interaction density (brief vs verbose) */
    verbosity: 'terse' | 'concise' | 'moderate' | 'detailed';
    
    /** Preferred tone */
    tone: 'formal' | 'casual' | 'playful' | 'technical';
    
    /** Response to humor */
    humor: 'avoids' | 'appreciates' | 'expects' | 'initiates';
    
    /** Preferred learning style */
    learning: 'visual' | 'textual' | 'example-driven' | 'reference-heavy';
  };
  
  /** Interests and topics they care about */
  interests: string[];
  
  /** Things they explicitly don't like */
  dislikes: string[];
  
  /** Current emotional context (optional) */
  currentMood?: {
    valence: number;  // -1 to 1 (negative to positive)
    arousal: number;  // 0 to 1 (calm to excited)
    timestamp: Date;
  };
  
  /** When this profile was created */
  createdAt: Date;
  
  /** When this profile was last updated */
  updatedAt: Date;
}

/** Context for retrieving memories */
export interface RetrievalContext {
  /** Current user */
  userId: string;
  
  /** Current soul state */
  soulId: string;
  
  /** Current session */
  sessionKey?: string;
  
  /** Current message/topic */
  query?: string;
  
  /** What we need context for */
  purpose: 'response' | 'learn' | 'reflect' | 'search';
  
  /** How many memories to retrieve */
  limit?: number;
  
  /** Lookback window in days (undefined = all time) */
  lookbackDays?: number;
  
  /** Minimum importance threshold */
  minImportance?: number;
}

/** Result of a memory retrieval */
export interface RetrievedMemory extends Memory {
  /** Relevance score from the search (0-1) */
  relevanceScore: number;
  
  /** Why this memory was included */
  matchReason: 'semantic' | 'temporal' | 'relational' | 'importance';
}

/** Configuration for the memory system */
export interface MemoryConfig {
  /** Database file path */
  dbPath: string;
  
  /** Enable semantic search (requires embeddings) */
  enableSemanticSearch?: boolean;
  
  /** Function to generate embeddings (required if semantic search enabled) */
  embedFn?: (text: string) => Promise<number[]>;
  
  /** How aggressively to forget (0 = never, 1 = quickly) */
  forgetRate: number;
  
  /** Maximum memories per retrieval */
  maxRetrievalCount: number;
  
  /** Default importance for new memories */
  defaultImportance: number;
  
  /** Enable debug logging */
  debug?: boolean;
}

/** A learned insight */
export interface Insight {
  id: string;
  
  /** What we learned */
  content: string;
  
  /** Type of insight */
  type: 'preference' | 'pattern' | 'correction' | 'fact';
  
  /** Confidence in this insight (0-1) */
  confidence: number;
  
  /** Source memories that led to this */
  sourceMemories: string[];
  
  /** User this insight applies to */
  userId: string;
  
  /** When this insight was formed */
  createdAt: Date;
  
  /** Last time this insight was reinforced */
  reinforcedAt: Date;
  
  /** How many times this insight was reinforced */
  reinforcementCount: number;
}

/** Evolution of the soul over time */
export interface SoulEvolution {
  /** The soul state */
  soul: Soul;
  
  /** What triggered this evolution */
  trigger: string;
  
  /** Memories that contributed */
  contributingMemories: string[];
}

/** Validation error */
export class MemoryValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'MemoryValidationError';
  }
}

/** Not found error */
export class MemoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Memory not found: ${id}`);
    this.name = 'MemoryNotFoundError';
  }
}