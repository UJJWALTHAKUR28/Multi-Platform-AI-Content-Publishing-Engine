import { z } from 'zod'

export const addSocialaccountSchema = z.object({
    platform: z.enum(['Twitter', 'Linkedin', 'Instagram', 'Threads']),
    platformUserId: z.string().min(1, "platformuserID is required"),
    accessToken: z.string().min(1, "accesstoken is required"),
    refreshToken: z.string().optional(),
    expiresAt: z.string().datetime().optional(),
    scope: z.string().optional(),
    handle: z.string().min(1, 'handle is required'),
    linkMethod: z.enum(["manual", "oauth"]).default("manual"),
});
export type AddSocialAccountInput = z.infer<typeof addSocialaccountSchema>

export const updateProfileSchema = z.object({
    username: z.string().trim().min(3, "Username must be at least 3 characters").max(30, "Username must be at most 30 characters").regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
    bio: z.string().max(500, "Bio must be at most 500 characters").optional(),
    defaultTone: z.string().min(1, "Default tone is required").optional(),
    defaultLanguage: z.string().min(1, "Default language is required").optional(),
    timezone: z.string().min(1, "Timezone is required").optional(),
    telegramChatId: z.string().min(1, "Telegram chat ID is required").optional(),
    whatsappNo: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid whatsapp number").optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const addApikeys = z.object({
    openAiKey: z.string().min(1, "OpenAI key is required").optional(),
    anthropicKey: z.string().min(1, "Anthropic key is required").optional(),
    geminiKey: z.string().min(1, "Gemini key is required").optional(),
    aiModel: z.enum(["OPENAI", "ANTHROPIC", "GEMINI"]).optional(),
});
export type AddApikeysInput = z.infer<typeof addApikeys>
