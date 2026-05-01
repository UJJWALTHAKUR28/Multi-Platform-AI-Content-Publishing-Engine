<div align="center">

# 🚀 Postly — Multi-Platform AI Content Publishing Engine

**Generate. Schedule. Publish. Track — across every major social network.**

[![Live API](https://img.shields.io/badge/Live%20API-postly--aicontent.up.railway.app-6366f1?style=for-the-badge&logo=railway)](https://postly-aicontent.up.railway.app/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com/)

---

### 🌐 Live Base URL

```
https://postly-aicontent.up.railway.app
```

> The API is fully deployed, the Telegram bot is live with webhook active, and all endpoints are callable right now. Deployment will remain live for at least 7 days from submission.

</div>

---

## 📋 Table of Contents

- [What Is Postly?](#-what-is-postly)
- [Live Deployment](#-live-deployment)
- [Quick Start — Local Setup](#-quick-start--local-setup)
- [Environment Variables Reference](#-environment-variables-reference)
- [API Documentation](#-api-documentation)
- [Telegram Bot Setup](#-telegram-bot-setup)
- [Architecture Overview](#-architecture-overview)
- [Data Flow Diagram](#-data-flow-diagram)
- [Schema Design & Indexing](#-schema-design--indexing)
- [Partial Failure Handling](#-partial-failure-handling)
- [Design Decisions & Trade-offs](#-design-decisions--trade-offs)
- [Known Issues & Limitations](#-known-issues--limitations)
- [Project Structure](#-project-structure)
- [Security Notes](#-security-notes)

---

## 🧠 What Is Postly?

Postly is a production-grade backend for AI-powered social media content publishing. You give it an idea; it generates platform-native content for Twitter/X, LinkedIn, Instagram, and Threads — then queues, schedules, and publishes it, with per-platform retry logic, partial failure recovery, and real-time status tracking.

**Core capabilities:**

- **Multi-model AI generation** — OpenAI (GPT-4o), Anthropic (Claude), Google Gemini, switchable per request
- **Platform-aware content rules** — character limits, hashtag counts, and tone enforced per platform
- **Resilient job queue** — BullMQ with exponential backoff, stall detection, and graceful shutdown
- **Telegram bot interface** — full publish/schedule flow without touching the REST API
- **Scheduled publishing** — delay jobs up to 1 year in advance, cancellable before execution
- **Partial failure recovery** — one platform failing never blocks the others; retry only what failed
- **AES-256-GCM encryption** — every stored token and API key is encrypted at rest
- **Sliding-window rate limiting** — Redis-backed per-IP/endpoint presets
- **Complete audit trail** — every auth and publish action logged

---

## 🌐 Live Deployment

| Resource | URL |
|---|---|
| **Base API** | `https://postly-aicontent.up.railway.app` |
| **Health Check** | `https://postly-aicontent.up.railway.app/health` |
| **Telegram Bot** | Active — webhook configured via `setWebhook` |

**Verify the deployment is alive:**
```bash
curl https://postly-aicontent.up.railway.app/health
# → OK
```

---

## ⚡ Quick Start — Local Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- [Node.js 20+](https://nodejs.org/) (for local dev without Docker)
- Git

### Option A — Docker Compose (Recommended, zero config)

```bash
# 1. Clone the repository
git clone https://github.com/UJJWALTHAKUR28/Multi-Platform-AI-Content-Publishing-Engine.git
cd Multi-Platform-AI-Content-Publishing-Engine

# 2. Create your environment file
cp .env.example .env
# Edit .env — minimum required: DATABASE_URL, REDIS_URL, JWT secrets, ENCRYPTION_KEY
# (Docker Compose overrides DATABASE_URL and REDIS_URL automatically)

# 3. Boot everything (Postgres + Redis + API)
docker compose up --build

# 4. Verify
curl http://localhost:3000/health
# → OK
```

The `docker compose up` command:
- Starts PostgreSQL 16 and Redis 7 with health checks
- Builds the API image in a multi-stage Docker build
- Runs `prisma migrate deploy` before the server starts
- Exposes the API on port 3000

### Option B — Local Dev (Hot reload)

```bash
# 1. Clone and install
git clone https://github.com/UJJWALTHAKUR28/Multi-Platform-AI-Content-Publishing-Engine.git
cd Multi-Platform-AI-Content-Publishing-Engine
npm install

# 2. Start infrastructure only
docker compose up postgres redis -d

# 3. Set up environment
cp .env.example .env
# Fill in required vars (see Environment Variables section)

# 4. Run migrations
npm run db:migrate

# 5. Start dev server (hot reload via ts-node-dev)
npm run dev

# 6. Optional: Open Prisma Studio to inspect data
npm run db:studio
```

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Generate Prisma client + compile TypeScript |
| `npm start` | Run compiled production build |
| `npm test` | Run test suite |
| `npm run db:migrate` | Create and apply a new migration (dev) |
| `npm run db:deploy` | Apply existing migrations (production) |
| `npm run db:studio` | Open Prisma Studio GUI |

---

## 🔧 Environment Variables Reference

Copy `.env.example` to `.env` and fill in the required values. Variables marked **Required** will cause the server to exit on startup if missing or invalid.

```env
# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postly?schema=public&sslmode=disable
# Required. Full Postgres connection string.
# Docker Compose overrides this automatically with the internal container address.

# ─── Redis ───────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
# Required. Used for BullMQ job queue, rate limiter, and Telegram bot sessions.
# Use rediss:// for TLS-enabled connections (Railway, Upstash, etc.)

# ─── JWT Authentication ───────────────────────────────────────────────────────
JWT_ACCESS_SECRET=your-access-secret-min-32-chars-here
# Required. Min 32 characters. Signs short-lived access tokens (default: 15m).

JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars-here
# Required. Min 32 characters. Signs refresh token meta — NOT the stored token itself
# (the stored token is a bcrypt hash of a random 48-byte hex string).

ACCESS_TOKEN_EXPIRY=15m
# Optional. Default: 15m. Any value accepted by jsonwebtoken (e.g. 1h, 7d).

REFRESH_TOKEN_EXPIRY_DAYS=7
# Optional. Default: 7. Number of days before a refresh token expires.

BCRYPT_COST=12
# Optional. Default: 12. bcrypt work factor. Must be ≥ 12 — enforced at runtime.

# ─── Encryption ──────────────────────────────────────────────────────────────
ENCRYPTION_KEY=your-64-character-hex-string-here
# Required. Exactly 64 hex characters (= 32 bytes) for AES-256-GCM.
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Used to encrypt: social account tokens, platform user IDs, AI API keys at rest.

# ─── Email (Resend) ───────────────────────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
# Optional. If unset, emails are printed to stdout (dev mode).
# Get a key at https://resend.com

FROM_EMAIL=onboarding@resend.dev
# Optional. Default: onboarding@resend.dev Sender address for all outbound emails.

# ─── Application ─────────────────────────────────────────────────────────────
APP_URL=http://localhost:3000
# Required. Used to construct email verification links and OAuth callback URLs.
# In production: your public domain, e.g. https://postly-aicontent.up.railway.app

NODE_ENV=development
# Optional. Affects cookie SameSite policy, error message verbosity.
# Values: development | production | test

PORT=3000
# Optional. Default: 3000.

# ─── AI Models ───────────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-...
# Optional. Fallback key if the user has not added their own OpenAI key.

ANTHROPIC_API_KEY=sk-ant-...
# Optional. Fallback key if the user has not added their own Anthropic key.

GEMINI_API_KEY=AIza...
# Optional. Fallback key if the user has not added their own Gemini key.

OPENAI_MODEL=gpt-4o
# Optional. Default: gpt-4. Which OpenAI model to use.

ANTHROPIC_MODEL=claude-opus-4-6
# Optional. Default: claude-opus-4-6.

GEMINI_MODEL=gemini-2.5-flash
# Optional. Default: gemini-2.5-flash.

# ─── Telegram Bot ────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyz
# Optional. If unset, bot is disabled. Get from @BotFather on Telegram.

TELEGRAM_WEBHOOK_URL=https://your-domain.com/bot/webhook
# Optional. Public HTTPS URL where Telegram sends updates.
# Required if TELEGRAM_BOT_TOKEN is set and you want webhook mode.

TELEGRAM_WEBHOOK_SECRET=your-random-secret-string
# Optional but recommended. Telegram sends this in X-Telegram-Bot-Api-Secret-Token
# header; the server verifies it before processing any update.

# ─── OAuth (Social Account Linking) ──────────────────────────────────────────
OAUTH_CALLBACK_BASE_URL=https://your-domain.com
# Optional. Base URL for OAuth callback endpoints.
# Defaults to APP_URL if not set.

TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
# Twitter OAuth 2.0 credentials. Get from developer.twitter.com

LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
# LinkedIn OAuth credentials. Get from developer.linkedin.com

INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
# Instagram Basic Display API credentials. Get from developers.facebook.com

THREADS_CLIENT_ID=
THREADS_CLIENT_SECRET=
# Threads API credentials. Get from developers.facebook.com
```

---

## 📡 API Documentation

All endpoints return a consistent envelope:

```json
{
  "data": { ... },
  "meta": null,
  "error": null
}
```

Errors follow:
```json
{
  "data": null,
  "meta": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired access token",
    "details": { "field": ["error message"] }
  }
}
```

---

### Authentication — `/api/auth`

#### `POST /api/auth/register`
Register a new account. Sends a verification email.

**Rate limit:** 5 requests / hour / IP

**Request:**
```json
{
  "email": "user@example.com",
  "username": "ujjwal_28",
  "password": "MyStr0ng!Pass",
  "confirmPassword": "MyStr0ng!Pass"
}
```
**Response `201`:**
```json
{
  "data": {
    "user": { "id": "uuid", "email": "user@example.com", "username": "ujjwal_28", "emailverified": false },
    "message": "Registration successful. Please check your email to verify your account."
  }
}
```

---

#### `POST /api/auth/login`
Login and receive an access token + refresh token cookie.

**Rate limit:** 10 requests / 15 min / IP

**Request:**
```json
{
  "email": "user@example.com",
  "password": "MyStr0ng!Pass"
}
```
**Response `200`:**
```json
{
  "data": {
    "accessToken": "eyJhbGci...",
    "user": { "id": "uuid", "email": "user@example.com", "username": "ujjwal_28" }
  }
}
```
> The refresh token is set as an `httpOnly` cookie named `refreshToken`.

---

#### `POST /api/auth/refresh`
Exchange a refresh token cookie for a new access token. Rotates the refresh token.

**Rate limit:** 10 requests / 60 sec / IP

**Response `200`:**
```json
{
  "data": { "accessToken": "eyJhbGci..." }
}
```

---

#### `GET /api/auth/verify-email?token=<token>`
Verify email address from the link in the verification email.

---

#### `POST /api/auth/forgot-password`
Request a password reset email.

**Rate limit:** 3 requests / hour / IP+email

**Request:**
```json
{ "email": "user@example.com" }
```

---

#### `POST /api/auth/reset-password`
Complete a password reset. Revokes all existing refresh tokens.

**Request:**
```json
{
  "token": "<token-from-email>",
  "password": "NewStr0ng!Pass",
  "confirmPassword": "NewStr0ng!Pass"
}
```

---

#### `POST /api/auth/change-password` 🔒
Change password while authenticated.

**Request:**
```json
{
  "currentPassword": "OldPass!123",
  "newPassword": "NewStr0ng!Pass",
  "confirmNewPassword": "NewStr0ng!Pass"
}
```

---

#### `POST /api/auth/logout` 🔒
Revoke the current refresh token.

#### `POST /api/auth/logout-all` 🔒
Revoke all refresh tokens across all devices.

#### `GET /api/auth/me` 🔒
Return the authenticated user's profile.

---

### User — `/api/user`

> All endpoints require `Authorization: Bearer <accessToken>` 🔒

#### `GET /api/user/profile`
Return full user profile including preferences and linked bot IDs.

#### `PUT /api/user/profile`
Update profile fields.

**Request:**
```json
{
  "username": "new_username",
  "bio": "Building in public.",
  "defaultTone": "professional",
  "defaultLanguage": "en",
  "timezone": "Asia/Kolkata"
}
```

---

#### `POST /api/user/social-accounts`
Manually link a social account by providing tokens directly (for testing / Postman).

**Request:**
```json
{
  "platform": "Twitter",
  "platformUserId": "1234567890",
  "accessToken": "AAAAAAAAAAAAAAAAAAAAy...",
  "handle": "@ujjwal_28",
  "linkMethod": "manual"
}
```
> Tokens are encrypted with AES-256-GCM before storage. Never stored in plaintext.

#### `GET /api/user/social-accounts`
List all linked social accounts. Tokens are returned masked (e.g. `••••••••abcd`).

#### `DELETE /api/user/social-accounts/:id`
Disconnect a social account.

---

#### `GET /api/user/social-accounts/oauth/:platform`
Initiate OAuth flow. Returns a `redirectUrl` — open it in the browser.

**Supported platforms:** `Twitter`, `Linkedin`, `Instagram`, `Threads`

**Response:**
```json
{
  "data": {
    "redirectUrl": "https://twitter.com/i/oauth2/authorize?client_id=..."
  }
}
```

#### `GET /api/user/social-accounts/oauth/:platform/callback`
OAuth callback — called by the platform after the user authorizes. Stores tokens.

---

#### `PUT /api/user/ai-keys`
Store or update your personal AI API keys. Keys are encrypted before storage.

**Request:**
```json
{
  "openAiKey": "sk-...",
  "anthropicKey": "sk-ant-...",
  "geminiKey": "AIza...",
  "aiModel": "OPENAI"
}
```

**Response:** Keys are returned masked.

---

### Content Generation — `/api/content`

#### `POST /api/content/generate` 🔒
Generate platform-specific content from an idea. Does NOT publish — returns content for review.

**Request:**
```json
{
  "idea": "We just launched a new feature that lets you schedule posts across all platforms with one click",
  "platforms": ["Twitter", "Linkedin", "Instagram"],
  "postType": "Announcement",
  "tone": "professional",
  "model": "OPENAI",
  "language": "en"
}
```

**Response `200`:**
```json
{
  "data": {
    "generated": {
      "Twitter": {
        "content": "🚀 One-click scheduling is LIVE on Postly. Queue your content to Twitter, LinkedIn, Instagram & Threads — simultaneously.",
        "charCount": 142,
        "hashtags": ["ProductLaunch", "SocialMedia", "BuildInPublic"]
      },
      "Linkedin": {
        "content": "We've shipped one of our most-requested features: unified scheduling...",
        "charCount": 980,
        "hashtags": ["ProductLaunch", "ContentMarketing", "SaaS", "Productivity"]
      },
      "Instagram": {
        "content": "Schedule once. Publish everywhere. 🚀 Our new one-click scheduler is live!",
        "charCount": 287,
        "hashtags": ["ContentCreator", "SocialMediaMarketing", "..."]
      }
    },
    "modelUsed": "gpt-4o-2024-08-06",
    "tokensIn": 412,
    "tokensOut": 318,
    "tokensUsed": 730
  }
}
```

**Refinement mode** — pass previous content and a note to iterate without regenerating from scratch:
```json
{
  "idea": "...",
  "platforms": ["Twitter"],
  "postType": "Announcement",
  "tone": "witty",
  "model": "ANTHROPIC",
  "language": "en",
  "previousContent": {
    "Twitter": {
      "content": "One-click scheduling is LIVE on Postly.",
      "hashtags": ["ProductLaunch"]
    }
  },
  "refinementNote": "Make it punchier and add more urgency"
}
```

---

### Posts — `/api/posts`

#### `POST /api/posts/publish` 🔒
Publish immediately. Enqueues jobs for each platform.

**Workflow:** Call `/api/content/generate` first, then pass the result here.

**Request:**
```json
{
  "idea": "We just launched a new feature...",
  "postType": "Announcement",
  "platforms": ["Twitter", "Linkedin"],
  "tone": "professional",
  "model": "OPENAI",
  "language": "en",
  "content": {
    "Twitter": {
      "content": "🚀 One-click scheduling is LIVE on Postly.",
      "hashtags": ["ProductLaunch", "SocialMedia"]
    },
    "Linkedin": {
      "content": "We've shipped one of our most-requested features...",
      "hashtags": ["ProductLaunch", "SaaS"]
    }
  },
  "modelUsed": "gpt-4o-2024-08-06",
  "tokensUsed": 730
}
```

**Response `201`:**
```json
{
  "data": {
    "post": { "id": "uuid", "stats": "Processing" },
    "platforms": [
      { "platform": "Twitter", "platformPostId": "pp-uuid", "status": "Queued", "bullJobId": "job-id" },
      { "platform": "Linkedin", "platformPostId": "pp-uuid", "status": "Queued", "bullJobId": "job-id" }
    ],
    "summary": { "total": 2, "queued": 2, "failed": 0 }
  }
}
```

---

#### `POST /api/posts/schedule` 🔒
Schedule a post for future publishing. Identical to `/publish` but requires `publishAt`.

```json
{
  "...same as publish...",
  "publishAt": "2025-12-25T09:00:00.000Z"
}
```

Constraints: must be in the future, no more than 1 year from now.

---

#### `GET /api/posts` 🔒
List posts with filtering and pagination.

**Query params:**

| Param | Type | Description |
|---|---|---|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Results per page (default: 10, max: 100) |
| `status` | string | Filter by post status: `Pending`, `Processing`, `Partial`, `Published`, `Failed`, `Cancelled` |
| `platform` | string | Filter by platform: `Twitter`, `Linkedin`, `Instagram`, `Threads` |
| `date_from` | ISO date | Created after this date |
| `date_to` | ISO date | Created before this date |

**Response:**
```json
{
  "data": [ { "id": "uuid", "stats": "Published", "platformPosts": ["..."] } ],
  "meta": { "total": 42, "page": 1, "limit": 10, "totalPages": 5 }
}
```

---

#### `GET /api/posts/:id` 🔒
Get a single post by ID with all platform job details.

---

#### `POST /api/posts/:id/retry` 🔒
Retry only the failed platform jobs for a post. Successfully published platforms are untouched.

---

#### `DELETE /api/posts/:id` 🔒
Cancel a scheduled post. Platform jobs in `delayed` or `waiting` state are removed from the queue. Already-published platforms are preserved (resulting in a `Partial` status).

---

### Dashboard — `/api/dashboard`

#### `GET /api/dashboard/stats` 🔒
Aggregated publishing statistics for the authenticated user.

**Response:**
```json
{
  "data": {
    "totalPosts": 47,
    "successRate": 91,
    "postsPerPlatform": { "Twitter": 35, "Linkedin": 28, "Instagram": 20, "Threads": 15 },
    "publishedPerPlatform": { "Twitter": 33, "Linkedin": 25, "Instagram": 18, "Threads": 13 },
    "postsByStatus": { "Published": 38, "Partial": 3, "Failed": 4, "Pending": 2 },
    "modelUsage": { "OPENAI": 25, "ANTHROPIC": 15, "GEMINI": 7 },
    "scheduledUpcoming": 2,
    "activityLast7Days": {
      "2025-06-01": 3, "2025-06-02": 7, "2025-06-03": 2
    },
    "tokenStats": {
      "totalTokensUsed": 48920,
      "avgTokensPerPost": 1041,
      "maxTokensPerPost": 3200
    }
  }
}
```

#### `GET /api/dashboard/posts` 🔒
Post history with the same filters as `/api/posts` — optimized for dashboard display.

---

## 🤖 Telegram Bot Setup

The Telegram bot provides a full create/schedule/track flow without the REST API.

### Setup Instructions

**Step 1 — Create a bot**
1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the token: `123456789:ABCdefGhIJKlmNoPQRsTUVwxyz`

**Step 2 — Configure environment**
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyz
TELEGRAM_WEBHOOK_URL=https://your-public-domain.com/bot/webhook
TELEGRAM_WEBHOOK_SECRET=any-long-random-string
```

**Step 3 — Deploy and verify**

The webhook is registered automatically when the server starts (via `registerWebhook()`). To verify manually:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

**Step 4 — Link your Postly account**

The first time you message the bot, it will ask for your Postly account email, send a 6-digit OTP, and link the accounts. After that, your Postman tokens and your bot sessions share the same user record.

---

### Bot Commands

| Command | Description |
|---|---|
| `/start` or `/post` | Begin the content creation flow |
| `/status` | View recent posts and upcoming scheduled content |
| `/accounts` | See connected social accounts and token status |
| `/help` | Show all commands with usage guide |
| `/cancel` | Clear the current conversation session |

### Bot Conversation Flow

```
/post
  └─→ Select post type (Announcement / Thread / Story / Promotional / Educational / Opinion)
       └─→ Select platforms (multi-select with toggle — tap to add/remove, then Done)
            └─→ Select tone (Professional / Casual / Witty / Authoritative / Friendly / Humorous)
                 └─→ Select AI model (GPT-4o / Claude / Gemini)
                      └─→ Send your idea (max 500 chars)
                           └─→ [AI generates content — preview shown]
                                └─→ Post Now  ──────────→ Confirm & Publish → ✅ Queued
                                    Schedule for Later → Pick date → Pick time → Confirm & Schedule → 📅 Scheduled
                                    Rewrite Idea → [back to idea step]
```

**Session management:** All conversation state is stored in Redis with a 1-hour TTL. Closing Telegram and returning later resumes where you left off. `/cancel` clears the session immediately.

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                 │
│   REST API (Postman / Frontend)    Telegram Bot                 │
└──────────────┬─────────────────────────────┬────────────────────┘
               │                             │
               ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EXPRESS.JS SERVER                           │
│                                                                 │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐ │
│  │  Auth Routes  │  │  Post Routes   │  │  Bot Webhook Route  │ │
│  │  /api/auth    │  │  /api/posts    │  │  /bot/webhook       │ │
│  └──────┬───────┘  └───────┬────────┘  └──────────┬──────────┘ │
│         │                  │                       │            │
│  Middleware Stack: Helmet · CORS · Cookie Parser · Rate Limiter │
│                   Authenticate · Validate (Zod)                 │
└──────────┬───────────────────────────┬─────────────────────────┘
           │                           │
           ▼                           ▼
┌──────────────────┐        ┌─────────────────────────────────────┐
│   Auth Service   │        │         AI Service Layer            │
│   User Service   │        │                                     │
│   Audit Service  │        │  ┌──────────┐ ┌─────────┐ ┌──────┐ │
│   Email Service  │        │  │  OpenAI  │ │Anthropic│ │Gemini│ │
└────────┬─────────┘        │  │  Client  │ │ Client  │ │Client│ │
         │                  │  └──────────┘ └─────────┘ └──────┘ │
         │                  │  Key resolution: User Key → Fallback│
         │                  └──────────────┬──────────────────────┘
         │                                 │
         ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL                              │
│  users · posts · platform_posts · social_accounts · ai_keys    │
│  refresh_tokens · audit_logs · webhook_events · api_usage_logs  │
└─────────────────────────────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   BullMQ QUEUE      │
                    │   (Redis-backed)    │
                    │   Name: "publish"   │
                    │   Concurrency: 5    │
                    │   Backoff: custom   │
                    │   [1s, 5s, 25s]     │
                    └──────────┬──────────┘
                               │
               ┌───────────────┼────────────────┐
               ▼               ▼                 ▼
        ┌──────────┐   ┌──────────────┐  ┌────────────────┐
        │ Twitter  │   │   LinkedIn   │  │ Instagram /    │
        │Publisher │   │  Publisher   │  │ Threads Pub.   │
        └──────────┘   └──────────────┘  └────────────────┘
```

---

## 🔄 Data Flow Diagram

### REST API: Publish Flow

```
Client
  │
  ├─ POST /api/content/generate
  │    │
  │    ├─ Resolve AI key (user key → env fallback)
  │    ├─ Build system prompt (platform rules + tone + language)
  │    ├─ Call AI model API (OpenAI / Anthropic / Gemini)
  │    ├─ Parse JSON response
  │    ├─ Enforce character limits (truncate if over)
  │    ├─ Log token usage to api_usage_logs (async, fire-and-forget)
  │    └─→ Return { generated: { Twitter: {...}, Linkedin: {...} } }
  │
  └─ POST /api/posts/publish (with generated content)
       │
       ├─ Create Post record (stats: Pending)
       ├─ For each platform:
       │    ├─ Create PlatformPost record (status: Queued)
       │    ├─ Call enqueuePublishJob(data, delayMs=0)
       │    │    └─ BullMQ: add job with jobId = platformPostId (deduplication)
       │    └─ Update PlatformPost.bulljobId
       │
       ├─ Derive aggregate status → Update Post.stats to Processing
       ├─ Write audit log (POST_CREATED)
       └─→ Return { post, platforms[], summary }

Worker (async, concurrent):
  │
  ├─ Job dequeued
  ├─ Update PlatformPost.status = InProgress, attempts++
  ├─ Look up SocialAccount, check token expiry
  ├─ Decrypt access token (AES-256-GCM)
  ├─ Call platform API (Twitter/LinkedIn/Instagram/Threads)
  │
  ├─ SUCCESS:
  │    ├─ Update PlatformPost → status=Published, platformPostId
  │    └─ syncPostStats(postId) → recalculate Post.stats
  │
  └─ FAILURE:
       ├─ BullMQ retries with custom backoff [1s, 5s, 25s]
       └─ On final attempt:
            ├─ Update PlatformPost → status=Failed, errorMessage
            └─ syncPostStats(postId) → recalculate Post.stats
```

### Telegram Bot: Message Flow

```
Telegram servers
  │
  └─ POST /bot/webhook (with X-Telegram-Bot-Api-Secret-Token header)
       │
       ├─ Verify secret token → 403 if invalid
       ├─ Return 200 immediately (Telegram requires fast ack)
       ├─ dedup() → Insert WebhookEvent(source=telegram, externalId=message_id)
       │    └─ If P2002 unique constraint: message already processed → return
       │
       └─ handlePostFlow(bot, msg)
            │
            ├─ Load session from Redis (key: bot:session:{chatId}, TTL: 1h)
            ├─ Route by session.step:
            │    IDLE        → check telegramChatId link → POST_TYPE step
            │    AWAITING_EMAIL → initiateTelegramLink(email, chatId)
            │    AWAITING_OTP   → verifyTelegramOtp(otp, chatId) → save telegramChatId
            │    POST_TYPE      → validate + save → PLATFORMS step
            │    PLATFORMS      → multi-select toggle → TONE step
            │    TONE           → validate + save → MODEL step
            │    MODEL          → validate + save → IDEA step
            │    IDEA           → generateContent() → preview → WHEN step
            │    WHEN           → Post Now or Schedule → CONFIRM step
            │    SCHEDULE_DATE  → parse date → SCHEDULE_TIME step
            │    SCHEDULE_TIME  → parse time → validate future → CONFIRM step
            │    CONFIRM        → create Post + PlatformPosts + enqueue jobs
            │
            └─ Update WebhookEvent.stats → COMPLETED or FAILED
```

---

## 📊 Schema Design & Indexing Strategy

### Key Design Decisions

**1. `@@unique([userId, platform])` on `SocialAccount`**
A user can have at most one account per platform. This makes `findUnique({ userId_platform: ... })` an O(1) constant-time lookup in every publisher — no scanning needed.

**2. `@@unique([postId, platform])` on `PlatformPost`**
Prevents duplicate platform jobs from being created for the same post+platform pair, even under concurrent requests.

**3. `jobId = platformPostId` in BullMQ**
Using the database record ID as the Bull job ID provides automatic deduplication at the queue level — adding the same job twice is a no-op.

**4. Soft deletes on `Post` (`deletedat` field)**
Cancelled posts are soft-deleted. This preserves audit history while excluding them from active queries. All queries include `deletedat: null`.

**5. Encrypted fields in `SocialAccount` and `AIKey`**
`platformUserId`, `accessToken`, and `refreshToken` are AES-256-GCM encrypted before storage. The format is `{iv}:{authTag}:{ciphertext}` — self-describing and tamper-evident.

### Critical Indexes

| Table | Index | Purpose |
|---|---|---|
| `users` | `email` | Login lookup |
| `users` | `telegramChatId` | Bot session resolution |
| `posts` | `(userId, stats)` | Dashboard status filters |
| `posts` | `(publishAt, stats)` | Scheduled post discovery |
| `posts` | `(userId, deletedat)` | Active post listing |
| `platform_posts` | `(platform, status)` | Publisher status queries |
| `platform_posts` | `retryAfter` | Retry scheduling scan |
| `social_accounts` | `(platform, tokenExpiresAt)` | Token expiry monitoring |
| `refresh_tokens` | `(userId, revoked)` | Active token scan |
| `audit_logs` | `(userId, action)` | User audit history |

---

## ⚠️ Partial Failure Handling

When publishing to multiple platforms, one platform failing must not block or cancel the others. Here is how Postly handles it end-to-end.

### Publisher Independence

Each platform job is a separate BullMQ job with its own retry counter. They execute concurrently (up to 5 workers). A Twitter 429 rate limit does not delay the LinkedIn job.

### `syncPostStats` — State Machine

After every job completion or failure, `syncPostStats(postId)` is called. It reads the current status of all `PlatformPost` records and derives the parent `Post.stats` using this priority order:

```typescript
if (allPublished)      postStats = 'Published';  // Every platform succeeded
else if (allFailed)    postStats = 'Failed';      // Every platform failed
else if (allCancelled) postStats = 'Cancelled';   // User cancelled everything
else if (anyPublished) postStats = 'Partial';     // Mixed: some won, some lost
else if (anyActive)    postStats = 'Processing';  // Still in flight
else                   postStats = 'Failed';      // Fallback
```

This runs inside the worker after every terminal state change — not on a cron. The post status is always consistent with its children.

### Retry — Only What Failed

`POST /api/posts/:id/retry` queries for `PlatformPost` records with `status = 'Failed'` and re-enqueues only those. Successfully published platforms are never touched again.

### Example Scenario

```
Post created for: Twitter, LinkedIn, Instagram

Twitter   → Published ✅  (attempt 1)
LinkedIn  → Failed ❌     (3 attempts exhausted — API error)
Instagram → Published ✅  (attempt 2 — first had a 429)

syncPostStats → anyPublished=true, not allPublished → Post.stats = Partial

User calls POST /posts/:id/retry
→ Only LinkedIn job is re-queued
→ Twitter and Instagram are left untouched
```

---

## ⚙️ Design Decisions & Trade-offs

### Why BullMQ over a cron job?

Cron jobs fire and forget. BullMQ provides: per-job retry with custom backoff, stall detection (stuck jobs are automatically re-queued), graceful shutdown (in-progress jobs complete before the process exits), and job deduplication via stable `jobId`. The trade-off is Redis as an infrastructure dependency — justified because Redis is already used for rate limiting and bot sessions.

### Why bcrypt for refresh tokens and not SHA-256?

SHA-256 is fast — which is a liability for token storage. If the database is compromised, an attacker can brute-force SHA-256 hashes quickly. bcrypt with cost ≥ 12 is intentionally slow. The trade-off is a linear scan of non-revoked tokens on refresh (we bcrypt-compare each until we find a match). At typical scales (< 100 active sessions per user) this is fine, and correctness wins over raw speed in auth flows.

### Why Postgres over Redis for refresh token source of truth?

An early draft stored refresh token hashes in a Redis set for O(1) lookup. This was rejected: if Redis is flushed or restarted, all sessions would be invalid, but users would still hold valid-looking tokens. Postgres is the durable source of truth. Redis is used only for ephemeral state (queue, sessions, rate limits).

### Why `z.record(z.enum(PLATFORMS), ...)` not `z.object({ Twitter: ..., Linkedin: ... })`?

`z.object` would require all four platform keys in every publish request. Using `z.record` with `z.enum` allows partial content — you only include the platforms you're actually posting to. The `superRefine` check then validates that every selected platform has corresponding content.

### Why AES-256-GCM over simpler encryption?

GCM mode provides authenticated encryption — the auth tag makes tampering with the ciphertext detectable. `decipher.final()` throws if the ciphertext has been modified. AES-256-CTR or CBC don't provide this guarantee. The self-describing `{iv}:{authTag}:{ciphertext}` format makes the encrypted string portable and independently verifiable.

### Why two auth middlewares (`authenticate` vs `authenticateNoVerify`)?

`authenticate` blocks unverified users — required for resource endpoints. But `/logout` and `/logout-all` must be accessible to unverified users (otherwise they'd be locked in: unverified → can't access anything → can't log out). `authenticateNoVerify` checks the JWT and account status but skips the email verification gate.

### Scheduling implementation

Scheduled posts use BullMQ's `delay` parameter: `delayMs = publishAt.getTime() - Date.now()`. The job sits in the `delayed` state in Redis until the delay elapses, then moves to `waiting` and is processed by the next available worker. This is more reliable than a cron-based approach because the job survives server restarts (it's durable in Redis) and benefits from all of BullMQ's retry and stall detection.

---

## 🐛 Known Issues & Limitations

### Twitter OAuth (User Context)

The Twitter publisher uses `Authorization: Bearer <token>` which works for app-only context. Posting tweets on behalf of a user requires OAuth 2.0 user-context tokens obtained through the full PKCE flow. The OAuth exchange (`exchangeOAuthCode`) currently throws a "not yet implemented" error for Twitter. **Workaround:** Add your user-context access token manually via `POST /api/user/social-accounts` with `linkMethod: "manual"`.

### Instagram — No Pure Text Posts

Instagram's Graph API does not support publishing plain-text posts for standard accounts. The publisher creates a REELS media container as the closest equivalent. This works for business/creator accounts with the `instagram_content_publish` permission. Personal accounts will receive a 403 from Instagram's API.

### LinkedIn URN handling

Some LinkedIn users store the full `urn:li:person:{id}` URN as their platform user ID; others store only the numeric ID. The publisher checks for the `urn:li:` prefix before prepending it — but edge cases with organization URNs (`urn:li:organization:`) may not resolve correctly.

### Refresh token scan performance

On refresh, the service scans all non-revoked tokens for the matching bcrypt hash. At high scale (users with hundreds of active sessions), this becomes slow. Mitigation: `@@index([userId, revoked])` limits the scan to one user's tokens. A future optimization would store a deterministic token fingerprint (first 8 bytes of SHA-256) for O(1) pre-filtering before bcrypt comparison.

### OAuth `exchangeOAuthCode` is stubbed

The `src/utils/oauth.util.ts` function `exchangeOAuthCode` makes the HTTP call to the token endpoint but always throws before storing the result. The OAuth redirect and CSRF state validation work correctly; only the final token exchange step needs to be implemented per platform.

### No WhatsApp Bot

The schema includes a `Bot.Whatsapp` enum and `whatsappNo` field on users, but the WhatsApp bot is not implemented. The Telegram bot is fully functional.

### Rate limiter — `forgotPassword` identifier

The forgot-password rate limiter uses `{ip}:{email}` as the key. A user behind a shared IP (corporate NAT, VPN) could be blocked if another user on the same IP triggers the limit. This is acceptable for the current scale and is consistent with industry practice.

---

## 📁 Project Structure

```
postly-backend/
├── src/
│   ├── app.ts                            # Express app setup, middleware chain
│   ├── server.ts                         # Entry point: DB connect, worker start, bot setup
│   │
│   ├── bot/
│   │   └── telegrambot/
│   │       ├── index.ts                  # Webhook route, command routing, dedup
│   │       ├── session.service.ts        # Redis session read/write/clear + date/time utils
│   │       ├── telegram-link.service.ts  # OTP email flow for account linking
│   │       └── handlers/
│   │           ├── posts.handlers.ts     # 12-step conversation state machine
│   │           ├── status.handlers.ts    # Post status and scheduling display
│   │           ├── accounts.handlers.ts  # Connected social accounts display
│   │           └── help.handlers.ts      # Help text and /cancel
│   │
│   ├── config/
│   │   ├── env.ts                        # Zod env validation (exits on invalid env)
│   │   └── redis.ts                      # ioredis client with TLS detection
│   │
│   ├── db/
│   │   └── prisma.ts                     # PrismaPg adapter with pg Pool
│   │
│   ├── middleware/
│   │   ├── authenticate.ts               # JWT verify + email verified gate
│   │   ├── require-verified-email.ts     # JWT verify only (no email gate — for logout)
│   │   ├── rate-limiter.ts               # Redis sliding-window rate limiter
│   │   ├── validate.ts                   # Zod schema validation middleware
│   │   └── error-handler.ts              # Central error handler (Zod, JWT, Prisma, ApiError)
│   │
│   ├── modules/
│   │   ├── auth/                         # Register, login, refresh, logout, password flows
│   │   ├── content/                      # AI content generation + prompt engineering
│   │   ├── posts/                        # Publish, schedule, list, retry, cancel
│   │   ├── user/                         # Profile, social accounts, AI keys, OAuth
│   │   └── dashboard/                    # Stats aggregation, post history
│   │
│   ├── queue/
│   │   ├── publish.queue.ts              # BullMQ queue definition + enqueue + cancel
│   │   ├── workers/
│   │   │   └── publish.worker.ts         # Worker: backoff, event handlers, graceful shutdown
│   │   ├── processors/
│   │   │   └── publish.processor.ts      # Job execution, failure handling, syncPostStats
│   │   └── publishers/
│   │       ├── twitter.publisher.ts
│   │       ├── linkedin.publisher.ts
│   │       ├── instagram.publisher.ts
│   │       └── threads.publisher.ts
│   │
│   ├── services/
│   │   ├── ai/
│   │   │   ├── ai.service.ts             # Key resolution, prompt build, parse, truncate
│   │   │   ├── openai.client.ts
│   │   │   ├── anthropic.client.ts
│   │   │   └── gemini.client.ts
│   │   ├── auth.service.ts               # Auth business logic
│   │   ├── user.service.ts               # User/account/key business logic
│   │   ├── audit.service.ts              # Audit log creation
│   │   └── email.service.ts              # Resend integration + dev-mode stdout
│   │
│   ├── types/
│   │   └── express.d.ts                  # Express Request type augmentation (req.user)
│   │
│   └── utils/
│       ├── api-error.ts                  # ApiError class with static factory methods
│       ├── api-response.ts               # sendSuccess, sendPaginated, sendError
│       ├── encryption.util.ts            # AES-256-GCM encrypt/decrypt/maskSecret
│       ├── jwt.util.ts                   # signAccessToken, verifyAccessToken, signRefreshToken
│       ├── oauth.util.ts                 # OAuth URL builder + code exchange
│       ├── password.util.ts              # bcrypt hash/verify with enforced min cost
│       ├── request-meta.util.ts          # IP, user-agent, device name extraction
│       └── token.util.ts                 # generateSecureToken, hashToken (SHA-256)
│
├── prisma/
│   ├── schema.prisma                     # Full database schema
│   └── migrations/                       # Prisma migration history
│
├── Dockerfile                            # Multi-stage build: builder → deps → production
├── docker-compose.yml                    # Postgres + Redis + API with health checks
├── tsconfig.json
├── package.json
└── .env.example
```

---

## 🔐 Security Notes

- **Access tokens** expire in 15 minutes. Refresh tokens rotate on every use.
- **Refresh tokens** are never stored in plaintext — only bcrypt hashes.
- **Social account tokens** and **AI API keys** are encrypted at rest with AES-256-GCM. Decryption keys live only in the environment.
- **OAuth state parameters** are stored in short-lived `httpOnly` cookies and verified on callback — CSRF-safe.
- **Webhook requests** from Telegram are verified via a shared secret in the `X-Telegram-Bot-Api-Secret-Token` header.
- **Rate limiting** uses Redis sorted sets for true sliding window behavior — not fixed-window counters.
- **Common passwords** are rejected at registration time via an allowlist of the 25 most common patterns.
- The server runs as a **non-root user** (`nodejs`, uid 1001) inside Docker.
- **`dumb-init`** is used as PID 1 to ensure signals are forwarded correctly and zombie processes don't accumulate.

---

<div align="center">

Built with ☕ and TypeScript · Deployed on [Railway](https://railway.app)

**[Live API](https://postly-aicontent.up.railway.app) · [GitHub](https://github.com/UJJWALTHAKUR28/Multi-Platform-AI-Content-Publishing-Engine)**

</div>
