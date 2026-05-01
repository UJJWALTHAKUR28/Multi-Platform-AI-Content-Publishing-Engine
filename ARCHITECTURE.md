<div align="center">

# 🏗 Postly — System Architecture

**A complete technical blueprint of how the system is designed, why each decision was made, and what happens at every layer when a post goes from idea to published.**

</div>

---

## Table of Contents

1. [System at a Glance](#system-at-a-glance)
2. [Full System Component Map](#full-system-component-map)
3. [Post Flow: Telegram Bot → AI Engine → Queue → Platform API](#post-flow)
   - [Phase 1 — Telegram Conversation State Machine](#phase-1)
   - [Phase 2 — AI Content Generation Engine](#phase-2)
   - [Phase 3 — Job Queue and Workers](#phase-3)
   - [Phase 4 — Platform Publishers](#phase-4)
4. [Conversation State Management in Redis](#conversation-state-management-in-redis)
5. [Schema Design Decisions and Indexing Strategy](#schema-design-decisions-and-indexing-strategy)
6. [Partial Failure Handling](#partial-failure-handling)
7. [Authentication Architecture](#authentication-architecture)
8. [Encryption Architecture](#encryption-architecture)
9. [Rate Limiting Architecture](#rate-limiting-architecture)
10. [Request Lifecycle (REST API Path)](#request-lifecycle)

---

<a id="system-at-a-glance"></a>
## 1. System at a Glance

Postly is built around a single principle: **every unit of work that touches an external API is async, retryable, and independently failable.** The REST API and Telegram bot are two separate entry points into the same core domain — they share the same services, queue, and database. Nothing is duplicated.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          ENTRY POINTS                                        │
│                                                                              │
│      REST API Clients              Telegram (webhook)                        │
│   (Postman / Frontend)             /bot/webhook POST                         │
└─────────────────┬────────────────────────────┬───────────────────────────────┘
                  │                            │
                  ▼                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       EXPRESS.JS APPLICATION SERVER                          │
│                                                                              │
│   Middleware chain (applied globally):                                       │
│   helmet → cors → cookieParser → express.json → trust proxy                 │
│                                                                              │
│   Route-level middleware:                                                    │
│   rateLimiter → authenticate/authenticateNoVerify → validate(Zod)           │
│                                                                              │
│  ┌─────────────┐ ┌────────────┐ ┌───────────┐ ┌────────────┐ ┌──────────┐  │
│  │  /api/auth  │ │ /api/user  │ │/api/posts │ │/api/content│ │/api/dash │  │
│  └──────┬──────┘ └─────┬──────┘ └─────┬─────┘ └─────┬──────┘ └────┬─────┘  │
│         │              │              │              │              │        │
│  ┌──────▼──────────────▼──────────────▼──────────────▼──────────────▼──────┐ │
│  │              SERVICE LAYER (pure business logic)                        │ │
│  │  auth.service · user.service · audit.service · email.service           │ │
│  │  ai.service → [openai.client | anthropic.client | gemini.client]       │ │
│  └──────────────────────────────────────┬──────────────────────────────────┘ │
└─────────────────────────────────────────┼────────────────────────────────────┘
                                          │
          ┌───────────────────────────────┼─────────────────────────┐
          ▼                               ▼                         ▼
┌──────────────────┐          ┌───────────────────────┐   ┌──────────────────┐
│   POSTGRESQL 16  │          │    BULLMQ QUEUE        │   │    REDIS 7       │
│                  │          │    (publish queue)     │   │                  │
│  Source of truth │          │    Concurrency: 5      │   │  - Job storage   │
│  for all domain  │          │    Backoff: [1s,5s,25s]│   │  - Bot sessions  │
│  data and auth   │          │    Attempts: 3         │   │  - Rate limits   │
│  state           │          └───────────┬────────────┘   │  - OTP codes     │
└──────────────────┘                      │                └──────────────────┘
                                          │
               ┌──────────────────────────┼──────────────────────┐
               ▼                          ▼                      ▼
       ┌──────────────┐          ┌──────────────────┐   ┌──────────────────┐
       │   TWITTER    │          │    LINKEDIN       │   │ INSTAGRAM/THREADS│
       │   API v2     │          │    UGC Posts v2   │   │ Graph API v18    │
       └──────────────┘          └──────────────────┘   └──────────────────┘
```

**Infrastructure summary:**

| Component | Technology | Role |
|---|---|---|
| HTTP Server | Express.js 5 + Node.js 20 | Request handling, routing, middleware |
| Language | TypeScript 5 (strict) | Type safety throughout |
| ORM | Prisma 7 + PrismaPg adapter | Database access via pg connection pool |
| Database | PostgreSQL 16 | Durable storage for all domain data |
| Cache / Queue Backend | Redis 7 | Job queue, bot sessions, rate limit windows |
| Job Queue | BullMQ 5 | Async platform publishing with retry |
| AI Providers | OpenAI, Anthropic, Google Gemini | Content generation |
| Bot | node-telegram-bot-api (webhook mode) | Conversational publishing interface |
| Encryption | AES-256-GCM (Node.js built-in crypto) | Token and key storage |
| Auth | JWT (access) + bcrypt-hashed rotating refresh tokens | Session management |
| Email | Resend | Verification and password reset |
| Validation | Zod v4 | Runtime schema enforcement at API boundary |
| Container | Docker multi-stage + docker-compose | Local dev and production parity |

---

<a id="full-system-component-map"></a>
## 2. Full System Component Map

```
src/
│
├── server.ts               ← Entry point: connects DB, Redis, starts worker, registers webhook
├── app.ts                  ← Express app factory: middleware chain, route mounting
│
├── config/
│   ├── env.ts              ← Zod schema validates all env vars at startup; process.exit on failure
│   └── redis.ts            ← ioredis client; auto-detects TLS (rediss://); lazy connect
│
├── db/
│   └── prisma.ts           ← PrismaClient with PrismaPg adapter + pg Pool; singleton in dev
│
├── middleware/
│   ├── authenticate.ts          ← JWT verify → DB user lookup → isActive + emailVerified gate
│   ├── require-verified-email.ts← JWT verify → DB user lookup → isActive gate only (no email gate)
│   ├── rate-limiter.ts          ← Redis sorted-set sliding window; named presets; fail-open
│   ├── validate.ts              ← Zod schema validation; throws ApiError.unprocessable on failure
│   └── error-handler.ts         ← Catches ApiError, ZodError, JWT errors, Prisma P2002
│
├── modules/                ← Feature slices: routes → controller → service (per module)
│   ├── auth/               ← register, login, refresh, logout, forgot/reset/change password
│   ├── user/               ← profile, social accounts (CRUD + OAuth), AI keys
│   ├── content/            ← AI generation endpoint; prompt builder lives here
│   ├── posts/              ← publish, schedule, list, get, retry, cancel
│   └── dashboard/          ← stats aggregation, post history
│
├── services/
│   ├── ai/
│   │   ├── ai.service.ts        ← Orchestrates: key resolution → prompt build → AI call → parse
│   │   ├── openai.client.ts     ← GPT-4o call; returns {raw, tokensIn, tokensOut, model}
│   │   ├── anthropic.client.ts  ← Claude call; same interface
│   │   └── gemini.client.ts     ← Gemini call; same interface
│   ├── auth.service.ts          ← Auth business logic; no HTTP awareness
│   ├── user.service.ts          ← User/account/key logic; encryption happens here
│   ├── audit.service.ts         ← Fire-and-forget audit log writes
│   └── email.service.ts         ← Resend integration; dev-mode stdout fallback
│
├── queue/
│   ├── publish.queue.ts         ← BullMQ Queue; enqueuePublishJob; cancelJob
│   ├── workers/
│   │   └── publish.worker.ts    ← Worker(concurrency=5); event handlers; gracefulShutdown
│   └── processors/
│       └── publish.processor.ts ← processPublishJob; handleJobFailure; syncPostStats
│
├── queue/publishers/
│   ├── index.ts                 ← getPublisher(platform) factory
│   ├── twitter.publisher.ts     ← Twitter API v2; 429 retryAfterMs extraction
│   ├── linkedin.publisher.ts    ← LinkedIn UGC Posts; URN prefix handling
│   ├── instagram.publisher.ts   ← Instagram Graph API; REELS container flow
│   └── threads.publisher.ts     ← Threads Graph API; 500 char enforcement
│
├── bot/telegrambot/
│   ├── index.ts                 ← Webhook route; command routing; dedup via WebhookEvent
│   ├── session.service.ts       ← Redis R/W; BotSession type; date/time parse utilities
│   ├── telegram-link.service.ts ← OTP generation, Redis storage, email send, verify
│   └── handlers/
│       ├── posts.handlers.ts    ← 12-step conversation state machine
│       ├── status.handlers.ts   ← Post status and schedule display
│       ├── accounts.handlers.ts ← Social account listing with token expiry
│       └── help.handlers.ts     ← /help text; /cancel with session clear
│
└── utils/
    ├── api-error.ts             ← ApiError class; static factory methods
    ├── api-response.ts          ← sendSuccess, sendPaginated, sendError
    ├── encryption.util.ts       ← AES-256-GCM encrypt/decrypt; maskSecret
    ├── jwt.util.ts              ← signAccessToken; verifyAccessToken; signRefreshToken (bcrypt)
    ├── oauth.util.ts            ← OAuth URL builder; state generation; code exchange stub
    ├── password.util.ts         ← bcrypt hash/verify; enforced minimum cost=12
    ├── request-meta.util.ts     ← IP extraction (X-Forwarded-For aware); UA parsing
    └── token.util.ts            ← generateSecureToken (48 random bytes); hashToken (SHA-256)
```

---

<a id="post-flow"></a>
## 3. Post Flow: Telegram Bot → AI Engine → Queue → Platform API

This is the primary end-to-end flow. The same domain logic runs when using the REST API — only the entry point differs.

---

<a id="phase-1"></a>
### Phase 1 — Telegram Conversation State Machine

The bot has **no persistent server-side conversation thread**. Every incoming message is a stateless HTTP webhook. State is reconstructed from Redis on each message.

#### Webhook Reception and Deduplication

```
Telegram servers
       │
       └─ POST /bot/webhook
              │
              ├─ [1] Header check: X-Telegram-Bot-Api-Secret-Token
              │        If secret is wrong → 403, drop message
              │
              ├─ [2] Return 200 immediately
              │        Telegram marks message as delivered.
              │        All processing happens AFTER this response.
              │
              └─ [3] dedup(msg, handler)
                       │
                       ├─ INSERT INTO webhook_events
                       │    (source='telegram', external_id=message_id, stats=PROCESSING)
                       │
                       ├─ If Prisma throws P2002 (unique constraint):
                       │    message_id already processed → return silently
                       │    (Telegram sometimes delivers the same message twice)
                       │
                       └─ Execute handler()
                              On success → UPDATE webhook_events SET stats=COMPLETED
                              On error   → UPDATE webhook_events SET stats=FAILED, error_message
```

> **Why return 200 before processing?** Telegram retries delivery if it doesn't receive a 2xx within 5 seconds. By acknowledging immediately and processing asynchronously, we avoid duplicate deliveries caused by slow AI generation calls.

#### State Machine — Step Transitions

```
Redis key: bot:session:{chatId}   TTL: 3600 seconds (1 hour)

IDLE
  │
  ├─ telegramChatId found in DB? ──YES──→ POST_TYPE
  │
  └─ NO → AWAITING_EMAIL
              │
              └─ valid email? → initiateTelegramLink()
                                  → random 6-digit OTP
                                  → store in Redis: telegram:otp:{chatId}, TTL=300s
                                  → send OTP email via Resend
                                  → AWAITING_OTP
                                        │
                                        └─ /^\d{6}$/ match?
                                             → verifyTelegramOtp()
                                             → compare stored OTP
                                             → UPDATE users SET telegramChatId
                                             → DELETE redis OTP key
                                             → clearSession() → IDLE

POST_TYPE
  │  (Announcement|Thread|Story|Promotional|Educational|Opinion)
  └──→ PLATFORMS

PLATFORMS  [multi-select — user taps multiple times]
  │
  ├─ Each tap: toggle platform in session.platforms array
  │   "✅ Twitter" → strip prefix → PLATFORM_LABELS lookup → toggle
  │
  ├─ "🌐 All" → set all four platforms at once
  │
  └─ "✅ Done" + platforms.length > 0 → TONE

TONE
  │  (Professional|Casual|Witty|Authoritative|Friendly|Humorous)
  └──→ MODEL

MODEL
  │  (GPT-4o / Claude / Gemini)  → mapped to OPENAI|ANTHROPIC|GEMINI
  └──→ IDEA

IDEA
  │  text.length ≤ 500
  └──→ call generateContent() → store result in session.generated
       └──→ WHEN

WHEN
  ├─ "🚀 Post Now"          → publishType='now'   → CONFIRM
  ├─ "📅 Schedule for Later"→ publishType='schedule' → SCHEDULE_DATE
  └─ "✏️ Rewrite Idea"      → clear generated → back to IDEA

SCHEDULE_DATE
  │  getNextDays(timezone, 7) — quick-select buttons
  │  Or free-text: parseDateInput() handles "25 Dec", "25/12", "2025-12-25"
  └──→ SCHEDULE_TIME

SCHEDULE_TIME
  │  Quick-select: 9AM/12PM/3PM/6PM/9PM
  │  Or free-text: parseTimeInput() handles "14:30", "2:30 PM", "9am"
  │  buildPublishAt(date, time, timezone) → UTC Date
  │  Guard: publishAt must be > now + 60 seconds
  └──→ CONFIRM

CONFIRM
  ├─ "❌ Cancel"          → clearSession()
  ├─ "✏️ Rewrite Idea"   → clear generated, back to IDEA
  ├─ "🔄 Change Date/Time"→ back to SCHEDULE_DATE
  └─ "✅ Confirm & Publish" / "✅ Confirm & Schedule"
       │
       ├─ CREATE Post record
       ├─ FOR EACH platform in session.generated:
       │    CREATE PlatformPost record
       │    enqueuePublishJob(data, delayMs)
       │    UPDATE PlatformPost SET bulljobId
       │
       ├─ UPDATE Post SET stats = Processing|Pending
       └─ clearSession()
```

#### Timezone-Aware Scheduling

The bot stores `session.timezone` from `user.timezone` (e.g. `Asia/Kolkata`). When the user picks "9:00 AM", the bot interprets that as 9:00 AM in *their* timezone, not UTC.

```typescript
// buildPublishAt in session.service.ts
// Takes a local date string ("2025-12-25"), a local time string ("09:00"),
// and a timezone ("Asia/Kolkata") and returns a UTC Date object.

// Strategy: construct a naive UTC Date from the local string,
// then use Intl.DateTimeFormat to find what that naive UTC maps to
// in the target timezone, compute the offset, and correct the result.
```

This handles DST transitions correctly because `Intl.DateTimeFormat` uses the IANA timezone database built into V8.

---

<a id="phase-2"></a>
### Phase 2 — AI Content Generation Engine

```
generateContent(params) in ai.service.ts
        │
        ├─ [1] Key Resolution
        │       Query AIKey record for this userId
        │       If user has their own key for this model → decrypt and use it
        │       If not → fall back to process.env.{MODEL}_API_KEY
        │       If neither exists → throw ApiError(400, NO_API_KEY)
        │
        ├─ [2] Prompt Construction
        │       buildSystemPrompt({ tone, language, platforms, postType })
        │         → platform-specific rules injected for only the requested platforms
        │         → output format enforced: raw JSON only, no markdown fences
        │         → character limits and hashtag count rules per platform
        │
        │       buildUserPrompt(idea, postType, previousContent?, refinementNote?)
        │         → Normal mode: "POST TYPE: X\nIDEA: Y\nGenerate now."
        │         → Refinement mode: includes previous content + user feedback
        │            The AI is told NOT to regenerate from scratch, only to improve
        │
        ├─ [3] AI API Call
        │       if OPENAI    → callOpenAIApi()   → response_format: {type:"json_object"}
        │       if ANTHROPIC → callAnthropicApi() → system prompt in `system` field
        │       if GEMINI    → callGeminiApi()   → systemInstruction in config
        │
        │       All three return: { raw: string, tokensIn, tokensOut, tokensUsed, model }
        │       Error handling:
        │         401/403 → INVALID_API_KEY
        │         429 / RESOURCE_EXHAUSTED → QUOTA_EXCEEDED
        │         Other → AI_CALL_FAILED
        │
        ├─ [4] Response Parsing
        │       Strip ```json fences (some models add them despite instructions)
        │       JSON.parse() the cleaned string
        │       If parse fails → throw ApiError(502, AI_PARSE_ERROR)
        │
        ├─ [5] Content Validation and Enforcement
        │       For each requested platform:
        │         Look up the platform key in the parsed JSON
        │         If missing or empty → log warning, skip (don't throw)
        │
        │         PLATFORM_CHAR_LIMITS[platform] → e.g. Twitter=280
        │         hashtagStr = hashtags.map(h => `#${h}`).join(' ')
        │         fullText = content + ' ' + hashtagStr
        │         if fullText.length > limit:
        │           room = limit - hashtagStr.length - 4  (4 = space + "...")
        │           content = content.slice(0, room) + '...'
        │
        │         Store: { content, charCount, hashtags }
        │
        ├─ [6] Usage Logging (async, fire-and-forget)
        │       prisma.aPILog.create({ userId, provider, model, tokensIn, tokensOut, usedOwnKey })
        │       .catch(err => console.error(...))
        │       Does NOT await — never blocks the response on DB write
        │
        └─ [7] Return GenerateResult
                { generated: Record<platform, PlatformContent>, modelUsed, tokensIn, tokensOut, tokensUsed }
```

#### Platform Content Rules (enforced in prompt)

| Platform | Char Limit | Hashtag Range | Tone Override | Key Constraint |
|---|---|---|---|---|
| Twitter | 280 | 2–3 | None | Hook must land in first 5 words |
| LinkedIn | 1,300 | 3–5 | Always professional | Start bold, end with CTA/question |
| Instagram | 2,200 | 10–15 | None | CTA required; emoji-friendly |
| Threads | 500 | 0–3 | Conversational | First-person, casual, no corporate speak |

---

<a id="phase-3"></a>
### Phase 3 — Job Queue and Workers

```
BullMQ Queue: "publish"
  Connection: Redis (same instance as sessions and rate limiter)
  Default options:
    attempts: 3
    backoff: { type: 'custom' }   ← backoffStrategy function defined in worker
    removeOnComplete: { count: 100 }
    removeOnFail: { count: 500 }

enqueuePublishJob(data, delayMs):
  publishQueue.add(
    name: "{platform}:{postId}",   ← human-readable for Bull Board
    data: PublishJobData,
    {
      delay: delayMs,              ← 0 for immediate, >0 for scheduled posts
      jobId: platformPostId,       ← CRITICAL: deduplication key
    }
  )
```

> **Why `jobId = platformPostId`?** BullMQ ignores `add()` calls for a job ID that already exists in the queue. If the API is called twice (network retry, duplicate request), the second enqueue is a no-op. The job runs exactly once.

#### Worker Architecture

```
Worker("publish", processPublishJob, {
  connection: redis,
  concurrency: 5,           ← Up to 5 platform jobs execute in parallel
  settings: {
    backoffStrategy: (attemptsMade) => BACKOFF_DELAYS[attemptsMade - 1]
    // BACKOFF_DELAYS = [1000, 5000, 25000]  (ms)
    // Attempt 1 fails → wait 1s
    // Attempt 2 fails → wait 5s
    // Attempt 3 fails → wait 25s → final failure
  }
})

Events handled:
  'active'   → log job start + attempt number
  'completed'→ log job completion + platformPostId
  'failed'   → log error; IF isLastAttempt → handleJobFailure()
  'error'    → log worker-level error (not job-level)
  'stalled'  → log warning (job was in-progress when worker died; BullMQ auto-requeues)
```

#### Job Execution — `processPublishJob`

```
processPublishJob(job):
  │
  ├─ UPDATE PlatformPost SET status=InProgress, attemps++ (increment)
  │
  ├─ getPublisher(platform)
  │    Twitter   → twitterPublisher
  │    Linkedin  → linkedinPublisher
  │    Instagram → instagramPublisher
  │    Threads   → threadsPublisher
  │
  ├─ publisher({ userId, content, hashtags, platform })
  │    → Returns: { platformPostId: string | null }
  │
  ├─ SUCCESS:
  │    UPDATE PlatformPost SET
  │      status = Published,
  │      platformPostId = result.platformPostId,
  │      publishAt = NOW(),
  │      errorMessage = null,
  │      platformError = JsonNull,
  │      retryAfter = null
  │    syncPostStats(postId)
  │
  └─ FAILURE (throws):
       BullMQ catches the throw and schedules next retry
       On FINAL attempt: handleJobFailure() is called by the 'failed' event handler

handleJobFailure(job, error):
  │
  ├─ retryAfter = error.retryAfterMs
  │    ? new Date(Date.now() + retryAfterMs)  ← Twitter 429 provides this
  │    : null
  │
  ├─ UPDATE PlatformPost SET
  │    status = Failed,
  │    errorMessage = error.message,
  │    platformError = error.platformBody (raw API response body),
  │    retryAfter = retryAfter
  │
  └─ syncPostStats(postId)
```

---

<a id="phase-4"></a>
### Phase 4 — Platform Publishers

Each publisher follows the same pattern: look up account → check expiry → decrypt token → build payload → call API → return `{ platformPostId }`.

```
Publisher pattern (identical structure for all four platforms):

publisher({ userId, content, hashtags, platform }):
  │
  ├─ [1] Account lookup
  │       prisma.socialAccount.findUnique({
  │         where: { userId_platform: { userId, platform } }
  │       })
  │       If not found → ApiError(400, ACCOUNT_NOT_CONNECTED)
  │
  ├─ [2] Token expiry pre-flight check
  │       if tokenExpiresAt && tokenExpiresAt < new Date():
  │         → ApiError(401, TOKEN_EXPIRED)
  │       (This avoids a wasted API call that would fail with 401)
  │
  ├─ [3] Decryption
  │       decrypt(account.accessToken)   → AES-256-GCM decryption
  │       decrypt(account.platformUserId) → platform-specific ID
  │
  ├─ [4] Content assembly
  │       Twitter:   hashtags appended to tweet text; total sliced to 280
  │       LinkedIn:  hashtags appended after two line breaks; URN prefix checked
  │       Instagram: caption + hashtags in container POST body (REELS flow)
  │       Threads:   text + max 3 hashtags; sliced to 500 chars
  │
  ├─ [5] Platform API call
  │       Twitter:   POST https://api.twitter.com/2/tweets
  │       LinkedIn:  POST https://api.linkedin.com/v2/ugcPosts
  │       Instagram: POST https://graph.facebook.com/v18.0/{userId}/media
  │                  POST https://graph.facebook.com/v18.0/{userId}/media_publish
  │       Threads:   POST https://graph.threads.net/v1.0/{userId}/threads
  │                  POST https://graph.threads.net/v1.0/{userId}/threads_publish
  │
  ├─ [6] Error enrichment
  │       err.platformBody = raw response JSON (stored in platformPost.platformError)
  │       Twitter 429: err.retryAfterMs = (x-rate-limit-reset * 1000) - Date.now()
  │         → worker's backoffStrategy will use this value
  │
  └─ [7] Return { platformPostId: body.data.id | header x-restli-id | null }
```

**Instagram two-step publishing:** Instagram's Graph API requires creating a media container first (returns a `creation_id`), then calling `media_publish` with that ID. The container creation can succeed while publishing fails — both steps are tracked and both errors are surfaced.

---

<a id="conversation-state-management-in-redis"></a>
## 4. Conversation State Management in Redis

The Telegram bot has no in-memory session state. The Node.js process can restart at any point without losing a user's conversation progress.

### Session Data Structure

```typescript
interface BotSession {
  step: BotStep;           // Current step in the state machine
  userId?: string;         // Postly user ID (set after account linking)
  userName?: string;       // Display name
  timezone?: string;       // IANA timezone string (e.g. "Asia/Kolkata")
  postType?: string;       // "Announcement" | "Thread" | etc.
  platforms?: string[];    // ["Twitter", "Linkedin"]
  tone?: string;           // "Professional" | etc.
  model?: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
  idea?: string;           // Raw idea text (max 500 chars)
  generated?: Record<string, {
    content: string;       // Platform-specific content
    charCount: number;
    hashtags: string[];
  }>;
  modelUsed?: string;      // Actual model string from API (e.g. "gpt-4o-2024-08-06")
  tokensUsed?: number;
  publishType?: 'now' | 'schedule';
  scheduleDate?: string;   // "2025-12-25" (local date in user's timezone)
  scheduleTime?: string;   // "09:00" (24h local time)
}
```

### Redis Key Design

```
bot:session:{chatId}          TTL: 3600s (1 hour sliding window)
telegram:otp:{chatId}         TTL: 300s  (5 minutes, set once, deleted on verify)
```

### Session Lifecycle

```
First message:
  redis.get("bot:session:{chatId}")
    → null → return { step: 'IDLE' }

After each handler runs:
  redis.setex("bot:session:{chatId}", 3600, JSON.stringify(session))
    → Overwrites the full session object
    → Resets the TTL to 3600s from now
    → TTL is effectively sliding: each interaction extends the window

On /cancel or after CONFIRM completes:
  redis.del("bot:session:{chatId}")
    → Session destroyed immediately

On session read failure (Redis down):
  getSession() catches the error and returns { step: 'IDLE' }
    → User sees the start flow again — graceful degradation
```

### Why Redis for Sessions (not the Database)?

Bot sessions are:
1. **Short-lived** — 1 hour maximum, often minutes
2. **High-write** — written on every single message (every button tap)
3. **Non-critical** — losing a session means the user re-answers 2–3 questions; no data loss
4. **Read-modify-write** — the entire session object is read, mutated, and written atomically

Redis `SETEX` is O(1) for this workload. Writing every message to Postgres with a `UPSERT` would add unnecessary load to the transactional database.

### OTP Storage Pattern

```
Key:   telegram:otp:{chatId}
Value: JSON.stringify({ otp: "473829", email: "user@example.com", userId: "uuid" })
TTL:   300 seconds

On initiateTelegramLink():
  1. Look up user by email
  2. Check for conflicting telegramChatId (another account already linked)
  3. Generate crypto.randomInt(100_000, 999_999) — 6 digits, cryptographically random
  4. Store in Redis with 300s TTL
  5. Send OTP email via Resend

On verifyTelegramOtp():
  1. GET the Redis key (null → throw OTP_EXPIRED)
  2. Compare stored OTP string === submitted OTP string (trim applied)
  3. If match: UPDATE users SET telegramChatId; DEL redis key
  4. Return username for success message
```

---

<a id="schema-design-decisions-and-indexing-strategy"></a>
## 5. Schema Design Decisions and Indexing Strategy

### Entity Relationship Overview

```
User
 ├── RefreshToken[]          (1:N — one user, many device sessions)
 ├── EmailVerificationToken[] (1:N — soft delete old ones on resend)
 ├── PasswordResetToken[]    (1:N — cleaned up after use)
 ├── SocialAccount[]         (1:N — but @@unique[userId,platform])
 ├── AIKey                   (1:1 — one record, multiple encrypted fields)
 ├── Post[]
 │    └── PlatformPost[]     (1:N — but @@unique[postId,platform])
 │         └── SocialAccount? (N:1 — nullable; account may be disconnected)
 ├── PostTemplate[]
 ├── WebhookEvent[]
 ├── APILog[]
 ├── UserNotification[]
 └── AuditLog[]
```

### Critical Unique Constraints

**`@@unique([userId, platform])` on `SocialAccount`**

```sql
-- Effect: this query is always O(1) index scan, never a table scan
SELECT * FROM social_accounts
WHERE user_id = $1 AND platform = $2
-- Used in every publisher; findUnique() takes this composite key directly
```

A user can connect one Twitter account, one LinkedIn account, etc. — never duplicates per platform. Attempting to add a second Twitter account throws `ApiError.conflict` before even touching the DB.

**`@@unique([postId, platform])` on `PlatformPost`**

Prevents two jobs from being created for the same post+platform combination. If `publishPost` is called twice concurrently (race condition), the second `PlatformPost.create` fails with P2002 before any queue job is added.

**`@@unique([source, externalId])` on `WebhookEvent`**

The deduplication guard for Telegram updates. `source = 'telegram'`, `externalId = message_id`. Telegram can deliver the same `message_id` twice if the first delivery timed out. The second insert fails with P2002 — caught, handler returns immediately.

### Index Strategy — Query-Driven Design

Every index was added because a specific query pattern demanded it:

```
posts:
  @@index([userId])              → listPosts base filter
  @@index([stats])               → global status monitoring
  @@index([publishAt])           → scheduler: find due posts
  @@index([publishAt, stats])    → "upcoming scheduled" = publishAt > now AND stats = Pending
  @@index([userId, stats])       → dashboard: count by status per user
  @@index([userId, deletedat])   → active posts: WHERE userId=X AND deletedat IS NULL
  @@index([bot])                 → analytics: posts by entry point
  @@index([aiModel])             → dashboard: model usage breakdown

platform_posts:
  @@index([postId])              → load children when viewing a post
  @@index([status])              → worker: find stuck jobs
  @@index([platform, status])    → publisher analytics
  @@index([socialAccountId, status]) → find all jobs for a disconnected account
  @@index([retryAfter])          → scheduled retry scan

social_accounts:
  @@index([platform, tokenExpiresAt]) → token expiry monitoring job

refresh_tokens:
  @@index([userId, revoked])     → on login: scan only non-revoked tokens for this user
```

### The `PostStats` State Machine

```
                  ┌──────────┐
                  │  Pending │  ← Post created, not yet active
                  └────┬─────┘
                       │  Worker picks up jobs
                       ▼
                ┌─────────────┐
                │ Processing  │  ← At least one job is Queued or InProgress
                └──────┬──────┘
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    ┌──────────┐  ┌─────────┐  ┌────────┐
    │Published │  │ Partial │  │ Failed │
    │(all won) │  │(mixed)  │  │(all    │
    └──────────┘  └─────────┘  │failed) │
                               └────────┘
                                    │
                              ┌─────▼──────┐
                              │ (retry)    │
                              │ Processing │
                              └────────────┘

Also:
    Pending → Cancelled  (user cancels before jobs start)
    Processing → Cancelled (user cancels, some jobs still waiting)
```

### Soft Deletes

`Post.deletedat` is set to the current timestamp on cancel rather than physically deleting the row. This means:
- Audit logs referencing the post ID remain valid
- The `PlatformPost` records (with their publishing history) are preserved
- Analytics queries count the post in historical data

All active queries include `WHERE deleted_at IS NULL`. The `@@index([userId, deletedat])` makes this efficient.

### Encryption at the Schema Level

The following fields contain `encrypt(value)` output before storage:

```
social_accounts.access_token      → encrypted
social_accounts.refresh_token     → encrypted (nullable)
social_accounts.platform_userid   → encrypted
ai_keys.enc_openaikey             → encrypted (nullable)
ai_keys.enc_anthropickey          → encrypted (nullable)
ai_keys.enc_geminikey             → encrypted (nullable)
```

Column names use `@map()` to signal encryption intent to other developers reading the schema (e.g. `@map("enc_openaikey")`). Decryption happens in the service layer — controllers and publishers never touch plaintext key material except briefly in memory.

---

<a id="partial-failure-handling"></a>
## 6. Partial Failure Handling

This is the most important correctness property in the system. A post going to four platforms must never be "all or nothing." Here is the full design.

### Independence Guarantee

Each `PlatformPost` record has its own `status`, `attemps`, `errorMessage`, `platformError`, `retryAfter`, and `bulljobId`. They are independent jobs in the queue. The Twitter worker thread and the LinkedIn worker thread run concurrently — a slow Twitter API does not delay LinkedIn publishing.

```
Job queue state (4 platforms, concurrent execution):
┌─────────────────────────────────────────────────────┐
│                BullMQ publish queue                 │
│                                                     │
│  Job: twitter:post123   [attempt 1] ──→ PROCESSING  │
│  Job: linkedin:post123  [attempt 1] ──→ PROCESSING  │
│  Job: instagram:post123 [attempt 1] ──→ PROCESSING  │
│  Job: threads:post123   [attempt 1] ──→ PROCESSING  │
│                                                     │
│  Worker concurrency = 5, so all 4 run simultaneously│
└─────────────────────────────────────────────────────┘
```

### `syncPostStats` — The Reconciliation Function

`syncPostStats(postId)` is called after every terminal state change of any `PlatformPost`. It recomputes the parent `Post.stats` from scratch by reading all children's current statuses.

```typescript
// src/queue/processors/publish.processor.ts

export const syncPostStats = async (postId: string): Promise<void> => {
  const platformPosts = await prisma.platformPost.findMany({
    where: { postId },
    select: { status: true },
  });

  const statuses = platformPosts.map(pp => pp.status);

  const allPublished  = statuses.every(s => s === 'Published');
  const allFailed     = statuses.every(s => s === 'Failed');
  const allCancelled  = statuses.every(s => s === 'Cancelled');
  const anyPublished  = statuses.some(s => s === 'Published');
  const anyActive     = statuses.some(s => s === 'InProgress' || s === 'Queued');

  // Priority order matters — checked top to bottom
  let postStats: string;
  if (allPublished)      postStats = 'Published';   // Perfect success
  else if (allFailed)    postStats = 'Failed';       // Complete failure
  else if (allCancelled) postStats = 'Cancelled';    // User cancelled everything
  else if (anyPublished) postStats = 'Partial';      // Mixed result
  else if (anyActive)    postStats = 'Processing';   // Still in flight
  else                   postStats = 'Failed';       // Unknown terminal state

  await prisma.post.update({
    where: { id: postId },
    data: { stats: postStats as any },
  });
};
```

### Worked Example — Mixed Outcome

```
Scenario: Post to Twitter, LinkedIn, Instagram, Threads

Timeline:
  t=0s    All 4 jobs enqueued, Post.stats = Processing
  t=1s    Twitter → Published ✅   syncPostStats → anyActive=true → Processing
  t=2s    LinkedIn → 429 error, retry in 5s
  t=3s    Instagram → 429 error, retry in 5s
  t=4s    Threads → Published ✅   syncPostStats → anyActive=true → Processing
  t=7s    LinkedIn retry 2 → Published ✅  syncPostStats → anyActive=true → Processing
  t=7s    Instagram retry 2 → API error (500), retry in 25s
  t=32s   Instagram retry 3 → API error (500) FINAL ATTEMPT
            handleJobFailure() called
            PlatformPost[Instagram].status = Failed
            PlatformPost[Instagram].errorMessage = "Instagram API 500: ..."
            PlatformPost[Instagram].platformError = { raw response JSON }
            syncPostStats() called:
              Twitter=Published, LinkedIn=Published, Instagram=Failed, Threads=Published
              allPublished=false, allFailed=false, anyPublished=true → Partial
              Post.stats = Partial

Final state:
  Post.stats = Partial
  Twitter platformPost.status = Published  ✅
  LinkedIn platformPost.status = Published ✅
  Instagram platformPost.status = Failed   ❌  (with full error context)
  Threads platformPost.status = Published  ✅
```

### Retry — Surgical, Not Wholesale

```
POST /api/posts/:id/retry

  1. Fetch post with all platformPosts
  2. Validate: not Cancelled, has at least one Failed platformPost
  3. failedPlatforms = platformPosts.filter(pp => pp.status === 'Failed')

  For each failed platform:
    UPDATE PlatformPost SET
      status = Queued,
      errorMessage = null,
      platformError = JsonNull,  ← clear previous error
      retryAfter = null
    enqueuePublishJob(data, delayMs=0)  ← immediate
    UPDATE PlatformPost SET bulljobId = new job ID

  UPDATE Post SET stats = Processing

  Audit log: POST_RETRIED with retriedPlatforms list
```

**What does NOT happen:**
- Twitter and LinkedIn (already Published) are never re-queued
- Their `PlatformPost` records are not touched
- The Post's `publishedAt` for those platforms is preserved

### Cancellation — Partial Respect

```
DELETE /api/posts/:id

  For each platformPost:
    if status === 'Published':
      → skip (cannot un-publish); note it as already-published
    else:
      cancelJob(pp.bulljobId):
        job = publishQueue.getJob(bullJobId)
        if job state === 'delayed' | 'waiting': job.remove() → true
        if job state === 'active' (running now): cannot cancel → false
      UPDATE PlatformPost SET status = Cancelled

  anyPublished = platformPosts.some(pp => pp.status was Published)
  UPDATE Post SET
    stats = anyPublished ? 'Partial' : 'Cancelled'
    deletedat = now()   ← soft delete
```

> Jobs in `active` state (currently executing in the worker) cannot be cancelled. If the worker completes them after cancellation, `syncPostStats` will run and potentially move the post from `Cancelled` to `Partial`. This is acceptable — the content was already published.

---

<a id="authentication-architecture"></a>
## 7. Authentication Architecture

### Token Design

```
Access Token:
  Type: JWT (HS256)
  Payload: { sub: userId, email, username, type: "access" }
  Secret: JWT_ACCESS_SECRET (min 32 chars)
  Expiry: 15 minutes (configurable)
  Storage: Memory only — never persisted anywhere

Refresh Token:
  Raw: 96 hex chars from crypto.randomBytes(48)
  Stored in cookie: httpOnly, secure (production), sameSite=none (production)
  Stored in DB: bcrypt hash of raw token (cost ≥ 12)
  The DB never contains the raw token — only the hash
```

### Refresh Token Rotation

```
Client sends: refreshToken cookie (raw token)

Server:
  1. Fetch all non-revoked RefreshToken records (no WHERE token= — we can't query by hash)
  2. For each record:
       bcrypt.compare(rawToken, record.token)
       If true → matchedToken found; break
  3. If no match → throw UNAUTHORIZED
  4. Check expiry: matchedToken.expiresAt < now → revoke + throw UNAUTHORIZED
  5. Revoke matched token: UPDATE SET revoked=true, revokedAt=now
  6. Issue new access token
  7. Generate new refresh token raw + hash
  8. INSERT new RefreshToken record
  9. Return new accessToken; set new refreshToken cookie
```

### The Two-Middleware Pattern

```typescript
// authenticate — full gate; used on all resource endpoints
// Blocks if: no JWT | invalid JWT | user not found | isActive=false | emailVerified=false

// authenticateNoVerify — partial gate; used on /logout, /logout-all, /resend-verification
// Blocks if: no JWT | invalid JWT | user not found | isActive=false
// Does NOT check: emailVerified
```

**Why this matters:** A user who registers but hasn't verified their email needs to be able to log out. With only `authenticate`, they'd be permanently locked out — they can't reach the resource endpoints because email isn't verified, and they can't log out because logout requires authentication. `authenticateNoVerify` breaks this deadlock.

---

<a id="encryption-architecture"></a>
## 8. Encryption Architecture

```
Algorithm: AES-256-GCM
Key source: process.env.ENCRYPTION_KEY (64 hex chars = 32 bytes)
IV:         16 random bytes per encryption operation (never reused)
Auth tag:   16 bytes (GCM mode; tamper detection)

Ciphertext format:
  {iv_hex}:{authTag_hex}:{ciphertext_hex}
  Example:
  "a3f1c8d2e4b7f90c1d2e3a4b:5e6f7a8b9c0d1e2f3a4b5c6d:7f8e9d0c1b2a..."

encrypt(plainText):
  key  = Buffer.from(ENCRYPTION_KEY, 'hex')
  iv   = crypto.randomBytes(16)
  cipher = createCipheriv('aes-256-gcm', key, iv)
  encrypted = cipher.update(plainText, 'utf8', 'hex') + cipher.final('hex')
  authTag = cipher.getAuthTag().toString('hex')
  return `${iv}:${authTag}:${encrypted}`

decrypt(cipherText):
  [ivHex, authTagHex, encryptedHex] = cipherText.split(':')
  decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8')
  // ↑ decipher.final() THROWS if auth tag doesn't match (tamper detected)

maskSecret(value):
  if value.length ≤ 4: return "••••"
  return "•".repeat(value.length - 4) + value.slice(-4)
  // Example: "sk-abc...xyz1234" → "••••••••••••1234"
  // Used in API responses so tokens are never exposed in plaintext
```

**Why GCM mode?** GCM provides authenticated encryption — the `authTag` ties the ciphertext to the exact key, IV, and plaintext. If any byte of the stored ciphertext is modified (database tampering, corruption), `decipher.final()` throws `Error: Unsupported state or unable to authenticate data`. CBC and CTR modes don't provide this guarantee.

---

<a id="rate-limiting-architecture"></a>
## 9. Rate Limiting Architecture

### Sliding Window Algorithm (Redis Sorted Set)

```
Rate limit check for a single request:

  now = Date.now()  (milliseconds)
  windowStart = now - windowSeconds * 1000
  key = "{prefix}:{identifier}"

  PIPELINE (atomic):
    ZREMRANGEBYSCORE key 0 windowStart   → remove requests outside the window
    ZCARD key                             → count requests still in window
    ZADD key now "{now}:{random}"         → record this request
    EXPIRE key windowSeconds              → clean up if no more requests

  hitCount = result of ZCARD (before adding this request)
  if hitCount >= maxHits:
    throw ApiError.tooManyRequests(...)

  next()  ← allow the request through
```

**Why sorted set over simple counter?** A simple `INCR` counter resets at fixed intervals (e.g. 00:00:00, 00:15:00). A user can send 10 requests at 00:14:59 and 10 more at 00:15:01 — 20 requests in 2 seconds while appearing to respect the limit. The sorted set approach counts requests in a **rolling** window: at any moment in time, at most `maxHits` requests from the last `windowSeconds` seconds are allowed.

### Presets

```typescript
const PRESETS = {
  register:           { windowSeconds: 3600, maxHits: 5,   keyPrefix: "rl:register" },
  login:              { windowSeconds: 900,  maxHits: 10,  keyPrefix: "rl:login" },
  refresh:            { windowSeconds: 60,   maxHits: 10,  keyPrefix: "rl:refresh" },
  forgotPassword:     { windowSeconds: 3600, maxHits: 3,   keyPrefix: "rl:forgot" },
  verifyEmail:        { windowSeconds: 3600, maxHits: 5,   keyPrefix: "rl:verify" },
  resendVerification: { windowSeconds: 3600, maxHits: 3,   keyPrefix: "rl:resend" },
  general:            { windowSeconds: 60,   maxHits: 100, keyPrefix: "rl:general" },
}
```

**Identifier extraction:**
- Most endpoints: client IP (X-Forwarded-For aware; `app.set("trust proxy", 1)`)
- `forgotPassword`: `{ip}:{email}` — prevents one IP from exhausting all user accounts' limits, and also prevents one email from being hammered from many IPs

**Fail-open design:** If Redis is unreachable, the rate limiter catches the error, logs it, and calls `next()`. Resource endpoints remain available during a Redis outage at the cost of rate limit enforcement. This was a deliberate choice — a Redis failure should not take down the entire API.

---

<a id="request-lifecycle"></a>
## 10. Request Lifecycle (REST API Path)

Complete trace of `POST /api/posts/publish`:

```
HTTP Request arrives
  │
  ├─ [1] Global middleware
  │       helmet()         → sets security headers (CSP, HSTS, X-Frame-Options, etc.)
  │       cors()           → validates Origin against APP_URL; sets credentials headers
  │       cookieParser()   → parses Cookie header into req.cookies
  │       express.json()   → parses body, sets Content-Type validation
  │       trust proxy 1    → trusts X-Forwarded-For from first proxy hop
  │
  ├─ [2] Route match: POST /api/posts/publish
  │       → postRoutes → [authenticate, validate(publishPostSchema), controller.publish]
  │
  ├─ [3] authenticate middleware
  │       Extract Bearer token from Authorization header
  │       verifyAccessToken(token) → JWT.verify with JWT_ACCESS_SECRET
  │         throws JsonWebTokenError → caught by error handler → 401
  │       prisma.user.findUnique({ id: payload.sub })
  │         not found → 401
  │         isActive=false → 403
  │         emailVerified=false → 403
  │       req.user = { id, email, username }
  │       next()
  │
  ├─ [4] validate(publishPostSchema) middleware
  │       publishPostSchema.safeParse(req.body)
  │       If invalid: collect all Zod issues → ApiError.unprocessable → 422
  │       superRefine checks:
  │         Every platform in platforms[] has non-empty content in content{}
  │         No extra content keys for platforms not in platforms[]
  │       req.body = result.data (coerced + validated)
  │       next()
  │
  ├─ [5] controller.publish
  │       extractRequestMeta(req) → { ipAddress, userAgent, deviceName }
  │       postService.publishPost(userId, body, meta)
  │
  ├─ [6] postService.publishPost → createAndEnqueue
  │       prisma.post.create(...)
  │       FOR EACH platform:
  │         prisma.platformPost.create(...)
  │         enqueuePublishJob(data, delayMs=0)
  │           → publishQueue.add(name, data, { jobId: platformPostId })
  │         prisma.platformPost.update({ bulljobId })
  │       prisma.post.update({ stats: Processing })
  │       createAuditLog({ action: POST_CREATED, ... })
  │
  ├─ [7] sendSuccess(res, result, 201)
  │       res.status(201).json({ data: result, meta: null, error: null })
  │
  └─ [8] Async (worker, separate process loop):
          Job dequeued by publish worker
          processPublishJob(job)
          → publisher call → platform API
          → syncPostStats(postId)

Error path (any step throws):
  express catches → errorHandler middleware:
    ApiError     → sendError(res, err)     → structured JSON 4xx/5xx
    ZodError     → ApiError.unprocessable  → 422 with field-level errors
    JWT errors   → ApiError.unauthorized   → 401
    Prisma P2002 → ApiError.conflict       → 409
    Unknown      → ApiError.internal       → 500 (message hidden in production)
```

---

<div align="center">

**Postly Architecture Document** · Built on Node.js 20 + TypeScript 5 + PostgreSQL 16 + Redis 7

[Back to README](./README.md)

</div>
