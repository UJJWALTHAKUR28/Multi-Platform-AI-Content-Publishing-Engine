-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('Twitter', 'Linkedin', 'Instagram', 'Threads');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('Announcement', 'Thread', 'Story', 'Promotional', 'Educational', 'Opinion');

-- CreateEnum
CREATE TYPE "PostStats" AS ENUM ('Pending', 'Processing', 'Partial', 'Published', 'Failed', 'Cancelled');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('Queued', 'InProgress', 'Published', 'Failed', 'Cancelled');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('POST_PUBLISHED', 'POST_PARTIAL', 'POST_FAILED', 'TOKEN_EXPIRING', 'TOKEN_EXPIRED', 'SCHEDULE_REMINDER', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "AIModel" AS ENUM ('OPENAI', 'ANTHROPIC', 'GEMINI');

-- CreateEnum
CREATE TYPE "Bot" AS ENUM ('Telegram', 'Whatsapp');

-- CreateEnum
CREATE TYPE "WebhookStats" AS ENUM ('PROCESSING', 'COMPLETED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_REGISTERED', 'USER_LOGIN', 'USER_LOGOUT', 'TOKEN_REFRESHED', 'TOKEN_REVOKED', 'PASSWORD_CHANGED', 'EMAIL_VERIFIED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'SOCIAL_ACCOUNT_CONNECTED', 'SOCIAL_ACCOUNT_DISCONNECTED', 'AI_KEY_UPDATED', 'PROFILE_UPDATED', 'POST_CREATED', 'POST_CANCELLED', 'POST_DELETED', 'POST_RETRIED', 'SUSPICIOUS_LOGIN', 'ACCOUNT_SUSPENDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "telegram_chat_id" TEXT,
    "whatsapp_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hashedtoken" TEXT NOT NULL,
    "expiresat" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_agent" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "lastused_at" TIMESTAMP(3),
    "device_name" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enc_openaikey" TEXT,
    "enc_anthropickey" TEXT,
    "enc_geminikey" TEXT,
    "default_ai_model" "AIModel" NOT NULL DEFAULT 'OPENAI',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platform_userid" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "handle" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "title" TEXT,
    "post_type" "PostType" NOT NULL,
    "tone" TEXT,
    "model_used" TEXT,
    "ai_model" "AIModel",
    "tokens_used" INTEGER,
    "stats" "PostStats" NOT NULL DEFAULT 'Pending',
    "publish_at" TIMESTAMP(3),
    "bot" "Bot",
    "template_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_templates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "post_type" "PostType" NOT NULL,
    "tone" TEXT NOT NULL,
    "platform" "Platform"[],
    "prefer_model" "AIModel" NOT NULL DEFAULT 'OPENAI',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_posts" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "social_account_id" TEXT,
    "platform" "Platform" NOT NULL,
    "content" TEXT NOT NULL,
    "hashtages" TEXT[],
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "JobStatus" NOT NULL DEFAULT 'Queued',
    "attemps" INTEGER NOT NULL DEFAULT 0,
    "platform_post_id" TEXT,
    "publish_at" TIMESTAMP(3),
    "error_message" TEXT,
    "platform_error" JSONB,
    "retry_after" TIMESTAMP(3),
    "bulljob_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "post_id" TEXT,
    "provider" "AIModel" NOT NULL,
    "model" TEXT NOT NULL,
    "tokens_in" INTEGER NOT NULL,
    "tokens_out" INTEGER NOT NULL,
    "cost_usd" DECIMAL(10,6),
    "used_own_key" BOOLEAN NOT NULL DEFAULT false,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action_url" TEXT,
    "sent_via_telegram" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT,
    "resource_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "stats" "WebhookStats" NOT NULL DEFAULT 'PROCESSING',
    "payload" JSONB NOT NULL,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_telegram_chat_id_idx" ON "users"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "users_whatsapp_number_idx" ON "users"("whatsapp_number");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_token_idx" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_hashedtoken_key" ON "refresh_tokens"("hashedtoken");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_hashedtoken_idx" ON "refresh_tokens"("hashedtoken");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_idx" ON "refresh_tokens"("user_id", "revoked");

-- CreateIndex
CREATE UNIQUE INDEX "ai_keys_user_id_key" ON "ai_keys"("user_id");

-- CreateIndex
CREATE INDEX "social_accounts_user_id_idx" ON "social_accounts"("user_id");

-- CreateIndex
CREATE INDEX "social_accounts_platform_token_expires_at_idx" ON "social_accounts"("platform", "token_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_user_id_platform_key" ON "social_accounts"("user_id", "platform");

-- CreateIndex
CREATE INDEX "posts_user_id_idx" ON "posts"("user_id");

-- CreateIndex
CREATE INDEX "posts_stats_idx" ON "posts"("stats");

-- CreateIndex
CREATE INDEX "posts_publish_at_idx" ON "posts"("publish_at");

-- CreateIndex
CREATE INDEX "posts_publish_at_stats_idx" ON "posts"("publish_at", "stats");

-- CreateIndex
CREATE INDEX "posts_template_id_idx" ON "posts"("template_id");

-- CreateIndex
CREATE INDEX "posts_user_id_stats_idx" ON "posts"("user_id", "stats");

-- CreateIndex
CREATE INDEX "posts_user_id_deleted_at_idx" ON "posts"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "posts_bot_idx" ON "posts"("bot");

-- CreateIndex
CREATE INDEX "posts_ai_model_idx" ON "posts"("ai_model");

-- CreateIndex
CREATE INDEX "post_templates_user_id_idx" ON "post_templates"("user_id");

-- CreateIndex
CREATE INDEX "platform_posts_post_id_idx" ON "platform_posts"("post_id");

-- CreateIndex
CREATE INDEX "platform_posts_status_idx" ON "platform_posts"("status");

-- CreateIndex
CREATE INDEX "platform_posts_publish_at_idx" ON "platform_posts"("publish_at");

-- CreateIndex
CREATE INDEX "platform_posts_platform_status_idx" ON "platform_posts"("platform", "status");

-- CreateIndex
CREATE INDEX "platform_posts_social_account_id_status_idx" ON "platform_posts"("social_account_id", "status");

-- CreateIndex
CREATE INDEX "platform_posts_retry_after_idx" ON "platform_posts"("retry_after");

-- CreateIndex
CREATE UNIQUE INDEX "platform_posts_post_id_platform_key" ON "platform_posts"("post_id", "platform");

-- CreateIndex
CREATE INDEX "api_usage_logs_user_id_idx" ON "api_usage_logs"("user_id");

-- CreateIndex
CREATE INDEX "api_usage_logs_user_id_created_at_idx" ON "api_usage_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "api_usage_logs_post_id_idx" ON "api_usage_logs"("post_id");

-- CreateIndex
CREATE INDEX "api_usage_logs_provider_created_at_idx" ON "api_usage_logs"("provider", "created_at");

-- CreateIndex
CREATE INDEX "user_notifications_user_id_read_at_idx" ON "user_notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "user_notifications_user_id_created_at_idx" ON "user_notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_action_idx" ON "audit_logs"("user_id", "action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_processed_at_idx" ON "webhook_events"("processed_at");

-- CreateIndex
CREATE INDEX "webhook_events_stats_idx" ON "webhook_events"("stats");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_source_external_id_key" ON "webhook_events"("source", "external_id");

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "post_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_templates" ADD CONSTRAINT "post_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_posts" ADD CONSTRAINT "platform_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_posts" ADD CONSTRAINT "platform_posts_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
