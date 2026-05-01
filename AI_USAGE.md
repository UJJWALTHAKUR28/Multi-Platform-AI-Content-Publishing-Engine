# AI Usage — Postly Backend

This document is a transparent record of every significant instance where AI assistance was used during development of the Postly backend. It covers what tool was used, what the task was, what the AI produced, and what I changed, validated, or rejected before committing.

This is not a disclaimer — it is documentation of a real development practice. Using AI to move faster on things you understand is a skill. Using it as a replacement for understanding is not.

---

## Table of Contents

- [How I Used AI](#how-i-used-ai)
- [Section-by-Section Breakdown](#section-by-section-breakdown)
  - [Schema Design](#schema-design)
  - [Authentication Service](#authentication-service)
  - [Encryption Utility](#encryption-utility)
  - [AI Service & Prompt Engineering](#ai-service--prompt-engineering)
  - [BullMQ Queue & Workers](#bullmq-queue--workers)
  - [Telegram Bot State Machine](#telegram-bot-state-machine)
  - [Platform Publishers](#platform-publishers)
  - [Rate Limiter](#rate-limiter)
  - [Partial Failure / syncPostStats](#partial-failure--syncpoststats)
  - [Zod Schemas & Validation](#zod-schemas--validation)
  - [Error Handling Middleware](#error-handling-middleware)
  - [Documentation (this repo)](#documentation-this-repo)
- [What I Did Not Use AI For](#what-i-did-not-use-ai-for)
- [What I Rejected or Changed](#what-i-rejected-or-changed)

---

## How I Used AI

I used **Claude (Anthropic)** and **GitHub Copilot** as my primary tools throughout this project.

My workflow was:
1. Design the approach myself first — data model, API contract, failure modes
2. Use AI to scaffold boilerplate or draft a first pass
3. Read everything line by line before committing
4. Change whatever did not match my intent, the framework docs, or the actual API specs
5. Test it (manual curl, or writing a test scenario)

I did not accept any AI output without reading and understanding it. Where I found errors or mismatches with what I actually wanted, I fixed them — and those fixes are documented below.

---

## Section-by-Section Breakdown

---

### Schema Design

**Tool:** Claude

**Task:** I described the full domain in natural language — users, posts going to multiple platforms, AI keys per user, social tokens, queued jobs, audit logs — and asked for a Prisma schema that covered it.

**What AI produced:** A schema with most of the right tables, but with some issues:
- It used `String` for all encrypted fields without any comment — I added schema comments and mapped column names with `@map()` for clarity
- It did not include `@@unique([userId, platform])` on `SocialAccount` — I added this because a user should have at most one account per platform
- It did not include `@@unique([postId, platform])` on `PlatformPost` — I added this to prevent duplicate publishing jobs
- `Post.deletedat` was missing — I added soft delete support
- The audit log `action` enum was generic strings initially — I replaced them with a typed `AuditAction` enum covering every meaningful action
- Index definitions were minimal — I reviewed every query pattern I intended to write and added `@@index` accordingly

**What I kept:** The table names, basic field structure, and enum definitions for `Platform`, `PostType`, `AIModel`, `JobStatus`.

**What I validated:** I read the Prisma docs on `@unique`, `@@unique`, `@map`, `@@map`, and `@@index` to confirm the syntax. I also cross-checked that all relations had proper `onDelete` behaviour — `Cascade` for child records that should die with the parent, `SetNull` for audit logs that should survive user deletion.

---

### Authentication Service

**Tool:** Claude + Copilot

**Task:** JWT access token + rotating refresh token with bcrypt hashing.

**Prompt:** "Implement a secure refresh token rotation system in TypeScript where the raw token is never stored — only a bcrypt hash. The client gets the raw token in a cookie. On refresh, scan non-revoked tokens and bcrypt-compare until match, then rotate."

**What AI produced:** A working draft. Key issues I found and fixed:

- The initial draft stored the refresh token hash in a Redis set for O(1) lookup — clever, but it created a tight coupling between Redis and auth correctness. I decided to keep the source of truth entirely in Postgres for refresh tokens, accepting the linear scan trade-off at this scale.
- The `verifyRefreshToken` function used `===` string comparison on first draft — I caught this and confirmed bcrypt `compare()` was used instead (timing-safe).
- Cookie options were missing `sameSite: "none"` for production cross-origin use — I added the conditional logic based on `NODE_ENV`.
- The `authenticateNoVerify` middleware variant was entirely my own addition. AI did not suggest it — I realised during testing that users could not log out if they hadn't verified their email yet, because the standard `authenticate` middleware blocked them.

**What I validated:** I read the `jsonwebtoken` docs for `SignOptions`, tested token expiry manually, and checked that `httpOnly` cookies were being set correctly in both dev and prod configurations.

---

### Encryption Utility

**Tool:** Claude

**Task:** AES-256-GCM encryption for storing sensitive strings in Postgres.

**Prompt:** "Write a Node.js utility using the built-in crypto module for AES-256-GCM encryption. The key comes from an environment variable as a 64-char hex string. The output should be a self-contained string with IV and auth tag encoded into it."

**What AI produced:** The `encrypt` / `decrypt` functions are close to what I shipped. The format `{iv}:{authTag}:{ciphertext}` was the AI's suggestion and I kept it — it is clean and self-describing.

**What I changed:**
- Added a strict key validation: `if (!hex || hex.length !== 64)` — the AI draft just did `Buffer.from(hex, 'hex')` without checking.
- Added the `maskSecret()` helper myself — AI did not produce this. I needed to return tokens to the client in a masked form and wrote it independently.

**What I validated:** I wrote a quick local test encrypting and decrypting the same string to verify round-trip correctness. I also verified the auth tag was being set and checked correctly — if you tamper with the ciphertext, `decipher.final()` throws.

---

### AI Service & Prompt Engineering

**Tool:** Claude, then heavily iterated manually

**Task:** The system and user prompt design — this was the most iterative part of the whole project.

**Initial prompt to AI:** "Write a system prompt for an LLM that generates social media content for Twitter, LinkedIn, Instagram, and Threads from a short idea. Output should be JSON only."

**What AI produced:** A generic system prompt that got the JSON structure right but the platform rules were too vague.

**What I iterated:**
- Twitter: the AI initially said "keep it short" — I rewrote this to "maximum 280 characters total including hashtags, start with a punchy hook, 2–3 hashtags placed at the very end"
- LinkedIn: the AI did not enforce the professional tone override regardless of global tone — I added "ALWAYS professional tone regardless of the global tone setting"
- Instagram: hashtag count was wrong (AI said "5–10") — I corrected to "10–15" based on actual Instagram engagement research
- The JSON schema instruction was added by me — the AI draft said "respond in JSON" but did not specify which keys to set to null for unused platforms, leading to hallucinated keys on first run

**The character trimming logic** in `ai.service.ts` (`fullText.length > limit → slice`) is mine — AI did not produce this.

**The refinement mode** (passing `previousContent` + `refinementNote` back to the AI) was designed by me. I asked AI to help write the prompt template for it, and the output was close to final.

**What I validated:** I ran the generation endpoint with all three models, inspected the JSON output, checked character counts manually, and fixed the prompt when output was wrong.

---

### BullMQ Queue & Workers

**Tool:** Copilot + BullMQ docs

**Task:** Queue configuration, worker setup, custom backoff.

**What AI produced:** The basic `Queue` and `Worker` instantiation. The `backoffStrategy` custom function was drafted by Copilot.

**What I changed:**
- The initial backoff was `[2000, 10000, 30000]` — I changed to `[1000, 5000, 25000]` based on platform API rate limit characteristics (Twitter resets quickly; 25s is usually enough for a third attempt)
- `removeOnComplete: { count: 100 }` and `removeOnFail: { count: 500 }` were my additions — without these, completed/failed jobs accumulate in Redis forever
- The worker event handlers (`active`, `completed`, `failed`, `stalled`) were my addition — AI scaffolded a basic `failed` handler but I added structured logging and the "only call handleJobFailure on last attempt" guard
- `handleJobFailure()` and `syncPostStats()` are entirely my design — AI did not produce the concept of a separate "sync post parent status after child changes" function

**What I validated:** I tested the queue by deliberately throwing errors in a publisher and watching the retry behaviour in logs.

---

### Telegram Bot State Machine

**Tool:** Claude

**Task:** A multi-step Telegram bot conversation with Redis-backed sessions.

**Prompt:** "Implement a Telegram bot conversation flow using node-telegram-bot-api and webhook mode. The flow goes: post type → platforms (multi-select) → tone → AI model → idea → preview → confirm. State is stored in Redis with a 30-minute TTL."

**What AI produced:** A working skeleton of the state machine. Several issues:

- Platform selection was initially single-select (tap one, move on) — I redesigned it to multi-select with toggle buttons ("tap to add/remove, then Done")
- The initial draft did not handle the `✅` prefix on toggled buttons — Telegram sends the button text as-is, so if the button says `✅ Twitter`, the received text is `✅ Twitter`. I added the `cleanText = text.replace(/^✅\s*/, '')` stripping.
- The email/OTP account linking flow (`AWAITING_EMAIL` → `AWAITING_OTP`) was entirely my design — AI produced a bot that assumed users were always already linked.
- Deduplication via `WebhookEvent` was my addition — AI did not suggest it.
- `safeSend()` wrapper with try/catch was my addition — Telegram send calls can fail silently and I needed to protect the flow.

**What I validated:** I tested the full flow manually end-to-end multiple times, including: pressing Cancel mid-flow, editing an idea after preview, sending invalid text at each step, and the OTP linking flow.

---

### Platform Publishers

**Tool:** Claude + platform API docs

**Task:** HTTP clients for Twitter v2, LinkedIn UGC Posts, Instagram Graph API, Threads Graph API.

**Prompt:** "Write a TypeScript function that posts a tweet using the Twitter v2 API with a Bearer token. The access token is retrieved from the database and decrypted. Handle 429 rate limit by reading the x-rate-limit-reset header."

**What AI produced per publisher:** Reasonable first drafts. Key corrections I made:

- **Twitter:** AI used `Authorization: Bearer` which is app-only context. For user tweets you need OAuth 2.0 user context. I documented this as a known limitation rather than silently shipping broken code.
- **LinkedIn:** The `urn:li:person:` prefix handling — AI initially always prepended it. I changed it to check `if (!platformUserId.startsWith('urn:li:'))` first, because some users store the full URN.
- **Instagram:** AI produced a text-post flow (which Instagram's Graph API does not support for non-business accounts). I changed it to a REELS container approach, which is the closest to text-only they support, and documented the limitation.
- **All publishers:** The `tokenExpiresAt < new Date()` check before calling the API was my addition. AI did not include pre-flight token expiry checks.

**What I validated:** I read the Twitter v2 docs, LinkedIn UGC Posts docs, Instagram Graph API docs, and Threads API docs to verify each request format, endpoint URL, and response shape.

---

### Rate Limiter

**Tool:** Claude

**Task:** Redis sliding-window rate limiter middleware.

**Prompt:** "Implement an Express middleware for rate limiting using a Redis sorted set sliding window. It should support named presets with different window sizes and max hit counts."

**What AI produced:** The core algorithm (`zremrangebyscore` → `zcard` → `zadd` → `expire` pipeline) is close to what I shipped.

**What I changed:**
- The initial draft used a single Redis `GET`/`SET` counter — I rewrote it to use a sorted set for true sliding window behaviour (counters reset on a fixed window, not a rolling one)
- The `forgotPassword` identifier using `{ip}:{email}` was my addition
- The "fail open" catch block (log and call `next()` if Redis is down) was my deliberate addition — AI had a hard `throw` which would take down all endpoints if Redis failed

**What I validated:** I tested rate limit behaviour by sending rapid requests and confirming 429 responses.

---

### Partial Failure / syncPostStats

**Tool:** None — designed independently

This is the piece I am most deliberate about. I designed the state derivation logic myself because it is core business correctness.

The `syncPostStats()` function checks the complete set of `platformPost.status` values and derives the parent `Post.stats`. The priority ordering matters:

1. All Published → Published
2. All Failed → Failed
3. All Cancelled → Cancelled
4. Any Published (but not all) → Partial
5. Any active (InProgress or Queued) → Processing
6. Otherwise → Failed

I wrote this without AI assistance because I wanted to be certain I understood every state transition. I then asked Claude to review it and suggest edge cases — it suggested the "all cancelled" case which I had missed.

---

### Zod Schemas & Validation

**Tool:** Copilot

**Task:** Zod schemas for request bodies.

**What AI produced:** Basic field definitions. What I added:
- The `COMMON_PASSWORDS` set in `auth.schema.ts` — AI suggested a generic "no common passwords" refine but did not include the actual list
- The `publishPostSchema.content` using `z.record(z.enum(PLATFORM_KEYS), platformContentItem)` was my design — Copilot suggested `z.object({Twitter: ..., Linkedin: ...})` which would require all four platforms in every request
- Coercion on query params (`z.coerce.number()`) — Copilot's first draft used `z.number()` which fails for query string values that arrive as strings

---

### Error Handling Middleware

**Tool:** Copilot

**Task:** Central Express error handler.

**What AI produced:** Handling for `ApiError` and generic errors.

**What I added:**
- ZodError handling with field-level error mapping
- JWT error type detection
- Prisma `P2002` unique constraint handling
- The "dev vs prod message" conditional

---

### Documentation (this repo)

**Tool:** Claude

**Task:** README.md, ARCHITECTURE.md, AI_USAGE.md, .env.example

**What AI produced:** Drafts based on my prompts describing the project structure and intent.

**What I wrote/changed:** The architecture diagrams (ASCII), the exact API request/response examples (verified against the actual schema and code), the known limitations section (I wrote these based on actual issues I discovered), and this AI_USAGE.md itself.

---

## What I Did Not Use AI For

- The overall system design decision (one queue, multiple publishers, syncPostStats pattern)
- The two-middleware pattern (`authenticate` vs `authenticateNoVerify`)
- The decision to use BullMQ over simpler cron — and the reasoning (retries, backoff, job deduplication by `platformPostId` as `jobId`)
- The decision to store AI key resolution priority (user key → platform fallback → error)
- The `maskSecret()` function
- The deduplication of Telegram webhooks via `WebhookEvent` unique constraint
- The `retryFailedPlatforms` function design (only retry failed, not successful)
- The `syncPostStats` logic (designed independently, reviewed by AI for edge cases)
- The OAuth state parameter generation and CSRF protection pattern
- The audit log action enum — I wrote every action name based on what I actually needed to track

---

## What I Rejected or Changed

| AI Output | Why I Changed It |
|---|---|
| Refresh token stored in Redis set | Correctness: Postgres is the source of truth for auth state |
| `===` string comparison for token matching | Security: needs bcrypt `compare()` |
| Generic rate limiter with fixed window | Accuracy: sliding window is more precise |
| Platform multi-select as single-select | UX: users need to pick multiple platforms |
| Instagram text-only post | API reality: Instagram doesn't support pure text |
| Twitter `Bearer` token for user tweets | API reality: user tweets need user-context OAuth |
| `z.object` for platform content in schema | Flexibility: `z.record(z.enum(...))` allows partial content |
| Always prepend `urn:li:person:` on LinkedIn | Bug: some stored values already include the prefix |
| Hard throw in rate limiter Redis error | Availability: fail open on infrastructure errors |
