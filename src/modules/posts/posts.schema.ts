import { z } from 'zod';

const PLATFORMS = ['Twitter', 'Linkedin', 'Instagram', 'Threads'] as const;
const POST_TYPES = ['Announcement', 'Thread', 'Story', 'Promotional', 'Educational', 'Opinion'] as const;
const TONES = ['professional', 'casual', 'witty', 'serious', 'humorous', 'authoritative', 'friendly'] as const;
const AI_MODELS = ['OPENAI', 'ANTHROPIC', 'GEMINI'] as const;
const JOB_STATUSES = ['Queued', 'InProgress', 'Published', 'Failed', 'Cancelled'] as const;
const POST_STATUSES = ['Pending', 'Processing', 'Partial', 'Published', 'Failed', 'Cancelled'] as const;
const platformContentItem = z.object({
  content: z.string().min(1, 'Content cannot be empty'),
  charCount: z.number().int().optional(),
  hashtags: z.array(z.string()).default([]),
});
const PLATFORM_KEYS = ['Twitter', 'Linkedin', 'Instagram', 'Threads'] as const;
export const publishPostSchema = z.object({
  idea: z.string().min(10, 'Idea must be at least 10 characters').max(500, 'Idea cannot exceed 500 characters'),
  postType: z.enum(POST_TYPES, { message: `Post type must be one of: ${POST_TYPES.join(', ')}` }),
  platforms: z.array(z.enum(PLATFORMS, { message: `Each platform must be one of: ${PLATFORMS.join(', ')}` })).min(1, 'At least one platform must be selected'),
  tone: z.enum(TONES, { message: `Tone must be one of: ${TONES.join(', ')}` }),
  model: z.enum(AI_MODELS, { message: `Model must be one of: ${AI_MODELS.join(', ')}` }),
  language: z.string().min(2, 'Language must be at least 2 characters').max(50, 'Language cannot exceed 50 characters').default('en'),
  content: z.record(
    z.enum(PLATFORM_KEYS, { message: `Platform key must be one of: ${PLATFORM_KEYS.join(', ')}` }),
    platformContentItem,
  ).refine(
    (obj) => Object.keys(obj).length > 0,
    { message: 'At least one platform content entry is required' },
  ),
  modelUsed: z.string().optional(),
  tokensUsed: z.number().int().optional(),
});
export type PublishPostInput = z.infer<typeof publishPostSchema>;
export const schedulePostSchema = publishPostSchema.extend({
  publishAt: z.string().datetime({ message: 'publishAt must be a valid ISO datetime string' }).refine((val) => new Date(val) > new Date(), {
    message: 'publishAt must be in the future',
  }),
});
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;
export const listPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(POST_STATUSES).optional(),
  platform: z.enum(PLATFORMS).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;