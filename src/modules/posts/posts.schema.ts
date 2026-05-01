import { z } from 'zod';
export const PLATFORMS     = ['Twitter', 'Linkedin', 'Instagram', 'Threads'] as const;
export const POST_TYPES    = ['Announcement', 'Thread', 'Story', 'Promotional', 'Educational', 'Opinion'] as const;
export const TONES         = ['professional', 'casual', 'witty', 'serious', 'humorous', 'authoritative', 'friendly'] as const;
export const AI_MODELS     = ['OPENAI', 'ANTHROPIC', 'GEMINI'] as const;
export const JOB_STATUSES  = ['Queued', 'InProgress', 'Published', 'Failed', 'Cancelled'] as const;
export const POST_STATUSES = ['Pending', 'Processing', 'Partial', 'Published', 'Failed', 'Cancelled'] as const;
const platformContentItem = z.object({
  content  : z.string().min(1, 'Content cannot be empty').max(5_000, 'Content too long'),
  charCount: z.number().int().nonnegative().optional(),
  hashtags : z.array(z.string().max(100)).max(30).default([]),
});
const contentSchema = z.object({
  Twitter  : platformContentItem.optional(),
  Linkedin : platformContentItem.optional(),
  Instagram: platformContentItem.optional(),
  Threads  : platformContentItem.optional(),
});
export const publishPostSchema = z
  .object({
    idea: z
      .string()
      .min(10,  'Idea must be at least 10 characters')
      .max(500, 'Idea cannot exceed 500 characters'),
    postType: z.enum(POST_TYPES, {
      error: `postType must be one of: ${POST_TYPES.join(', ')}`,
    }),
    platforms: z
      .array(z.enum(PLATFORMS, { error: `Each platform must be one of: ${PLATFORMS.join(', ')}` }))
      .min(1, 'At least one platform must be selected')
      .max(4, 'Cannot post to more than 4 platforms')
      .refine((arr) => new Set(arr).size === arr.length, {
        message: 'Duplicate platforms are not allowed',
      }),
    tone: z.enum(TONES, {
      error: `Tone must be one of: ${TONES.join(', ')}`,
    }),
    model: z.enum(AI_MODELS, {
      error: `Model must be one of: ${AI_MODELS.join(', ')}`,
    }),
    language  : z.string().min(2).max(50).default('en'),
    content   : contentSchema,
    modelUsed : z.string().optional(),
    tokensUsed: z.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    const missing = data.platforms.filter(
      (p) => !data.content[p as keyof typeof data.content]?.content?.trim(),
    );
    if (missing.length > 0) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ['content'],
        message:
          `Missing or empty content for platform(s): ${missing.join(', ')}. ` +
          `Call POST /api/content/generate first, then pass the result here.`,
      });
    }
    const extra = (Object.keys(data.content) as string[]).filter(
      (k) => data.content[k as keyof typeof data.content] !== undefined &&
             !(data.platforms as string[]).includes(k),
    );
    if (extra.length > 0) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ['content'],
        message: `Unused content key(s): ${extra.join(', ')}. These platforms are not in platforms[].`,
        fatal  : false,
      });
    }
  });
export type PublishPostInput = z.infer<typeof publishPostSchema>;
export const schedulePostSchema = publishPostSchema
  .extend({
    publishAt: z
      .string()
      .datetime({ message: 'publishAt must be a valid ISO 8601 datetime string' })
      .refine((val) => new Date(val) > new Date(), {
        message: 'publishAt must be in the future',
      }),
  })
  .superRefine((data, ctx) => {
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    if (new Date(data.publishAt) > maxDate) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ['publishAt'],
        message: 'Cannot schedule a post more than 1 year in advance',
      });
    }
  });
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;
export const listPostsQuerySchema = z.object({
  page     : z.coerce.number().int().min(1).default(1),
  limit    : z.coerce.number().int().min(1).max(100).default(10),
  status   : z.enum(POST_STATUSES).optional(),
  platform : z.enum(PLATFORMS).optional(),
  date_from: z.string().optional(),
  date_to  : z.string().optional(),
});

export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;