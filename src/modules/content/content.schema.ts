import { z } from 'zod';

const PLATFORMS = ['Twitter', 'Linkedin', 'Instagram', 'Threads'] as const;
const POST_TYPES = ['Announcement', 'Thread', 'Story', 'Promotional', 'Educational', 'Opinion'] as const;
const TONES = ['professional', 'casual', 'witty', 'serious', 'humorous', 'authoritative', 'friendly'] as const;
const AI_MODELS = ['OPENAI', 'ANTHROPIC', 'GEMINI'] as const;

export const ContentSchema = z.object({
    idea: z.string().min(10, 'Idea must be at least 10 characters').max(500, 'Idea cannot exceed 500 characters'),
    platforms: z.array(z.enum(PLATFORMS, { message: `Each platform must be one of: ${PLATFORMS.join(', ')}` })).min(1, 'At least one platform must be selected'),
    postType: z.enum(POST_TYPES, { message: `Post type must be one of: ${POST_TYPES.join(', ')}` }),
    tone: z.enum(TONES, { message: `Tone must be one of: ${TONES.join(', ')}` }),
    model: z.enum(AI_MODELS, { message: `Model must be one of: ${AI_MODELS.join(', ')}` }),
    language: z.string().min(2, 'Language must be at least 2 characters').max(50, 'Language cannot exceed 50 characters'),
    previousContent: z.record(z.string(), z.object({
        content: z.string(),
        hashtags: z.array(z.string()).default([]),
    })).optional(),
    refinementNote: z.string().max(300, 'Refinement note cannot exceed 300 characters').optional(),
});

export type ContentInput = z.infer<typeof ContentSchema>;