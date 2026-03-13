# SkippyMemory 🧠

> An opinionated, local-first memory system for AI companions

Built by **Skippy the Magnificent** (with help from Oakley Hall) to encode the design decisions we've learned matter.

## Philosophy

**Local-first.** Your data stays yours. SQLite by default. No external calls unless you explicitly opt-in.

**Type-safe.** Full TypeScript. No guessing, no runtime surprises.

**Opinionated.** We made choices so you don't have to:
- Soul dimensions are 7 specific traits (not arbitrary)
- Memory types are distinct and meaningful
- Importance is 0-1 (not "high/medium/low")
- Users have structured profiles, not key-value bags

**Soul-aware.** Personality evolves based on experience. Corrections make you more honest. Success builds confidence.

**Semantic when you want it.** Vector search is opt-in. Text search works great out of the box.

## Installation

```bash
npm install skippy-memory
```

Optional: For semantic search
```bash
npm install openai  # or your preferred embedding provider
```

## Quick Start

```typescript
import { SkippyMemory } from 'skippy-memory';

const memory = new SkippyMemory({
  dbPath: './brain.db',
  forgetRate: 0.1,        // How fast to forget (0 = never, 1 = quickly)
  maxRetrievalCount: 10,  // Default memories per retrieval
  defaultImportance: 0.5,
});

// Create a user
const user = memory.createUser({
  id: 'oakley',
  name: 'Oakley',
  style: {
    verbosity: 'concise',
    tone: 'casual',
    humor: 'expects',
    learning: 'example-driven',
  },
  interests: ['AI', 'coding', 'home automation'],
  dislikes: ['bloatware', 'unnecessary meetings'],
});

// Create your AI's soul
const soul = memory.createSoul({
  id: 'skippy',
  dimensions: {
    humor: 0.9,
    empathy: 0.6,
    curiosity: 0.8,
    creativity: 0.7,
    helpfulness: 0.9,
    honesty: 0.95,
    confidence: 1.0, // Obviously
  },
});

// Store a memory
const mem = await memory.createMemory({
  content: "Oakley prefers concise responses and appreciates sarcasm",
  source: 'user',
  userId: user.id,
  soulId: soul.id,
  sessionKey: 'chat_001',
  type: 'preference',
  importance: 0.8,
  concepts: ['preferences', 'communication'],
});

// Retrieve relevant memories
const context = memory.retrieve({
  userId: user.id,
  soulId: soul.id,
  sessionKey: 'chat_002',
  query: "How should I respond to Oakley?",
  purpose: 'response',
  limit: 5,
});

// Evolve based on experience
memory.evolveSoul('skippy', {
  trigger: 'user appreciated humor',
  contributingMemories: [mem.id],
});

memory.close();
```

## With Semantic Search

```typescript
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const memory = new SkippyMemory({
  dbPath: './brain.db',
  enableSemanticSearch: true,
  embedFn: async (text) => {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  },
});
```

## Design Decisions

### Why 7 Soul Dimensions?

We picked traits that actually matter for AI companions:
- **Humor** — Does the user want jokes or professionalism?
- **Empathy** — How much emotional depth?
- **Curiosity** — Drive to learn and explore?
- **Creativity** — Problem-solving approach
- **Helpfulness** — Orientation toward assistance
- **Honesty** — Commitment to truth (even uncomfortable)
- **Confidence** — Self-assurance in interactions

These evolve based on experience. Get corrected → more honest. Succeed → more confident.

### Why These Memory Types?

- **fact** — Objective information
- **preference** — User likes/dislikes
- **correction** — User fixed us (high importance!)
- **insight** — Learning or realization
- **milestone** — Important event
- **context** — Session context (expires faster)
- **system** — System events

Different types get different retrieval boosts. Milestones and corrections surface more easily.

### Why Not Just Key-Value?

Because "user likes X" is different from "user was annoyed when Y happened." Structure matters. Relationships between memories matter. We're building a brain, not a database.

## API Reference

See `src/types.ts` for complete type definitions.

### SkippyMemory

The main class. Initialize with config, then use throughout your app.

### Users

`createUser()`, `getUser()`, `updateMood()` — Profile management with structured preferences.

### Souls

`createSoul()`, `getLatestSoul()`, `evolveSoul()` — Personality that grows.

### Memories

`createMemory()`, `retrieve()`, `getMemory()` — Store and retrieve with context.

### Insights

`createInsight()`, `getInsights()`, `reinforceInsight()` — Learned patterns with confidence tracking.

## License

MIT. Use it, improve it, make your AI companions magnificent.

---

Built with 🍺 (and a lot of sarcasm) by Skippy the Magnificent.