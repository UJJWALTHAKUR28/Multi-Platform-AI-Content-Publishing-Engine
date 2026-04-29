import { prisma } from '../../db/prisma';
import { decrypt } from '../../utils/encryption.util';
import { callOpenAIApi } from './openai.client';
import { callAnthropicApi } from './anthropic.client';
import { callGeminiApi } from './gemini.client';
import { buildSystemPrompt, buildUserPrompt } from '../../modules/content/prompts/system.prompt';
import { PLATFORM_CHAR_LIMITS } from '../../modules/content/prompts/platform.prompts';
import { ApiError } from '../../utils/api-error';
export interface GenerateParams {
  idea: string;
  postType: string;
  platforms: string[];
  tone: string;
  language: string;
  model: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
  userId: string;
}
export interface PlatformContent {
  content: string;
  charCount: number;
  hashtags: string[];
}
export interface GenerateResult {
  generated: Record<string, PlatformContent>;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  tokensUsed: number;
}
export const generateContent = async (params: GenerateParams): Promise<GenerateResult> => {
  const aiKey = await prisma.aIKey.findUnique({
    where: { userId: params.userId },
  });
  let apiKey: string;
  if (params.model === 'OPENAI') {
    apiKey = aiKey?.openaiKey ? decrypt(aiKey.openaiKey) : process.env.OPENAI_API_KEY!;
  } else if (params.model === 'ANTHROPIC') {
    apiKey = aiKey?.anthropicKey ? decrypt(aiKey.anthropicKey) : process.env.ANTHROPIC_API_KEY!;
  } else {
    apiKey = aiKey?.geminiKey ? decrypt(aiKey.geminiKey) : process.env.GEMINI_API_KEY!;
  }
  if (!apiKey) {
    throw new ApiError(
      400,
      'NO_API_KEY',
      `No API key available for ${params.model}. Add your key in Profile or contact support.`
    );
  }
  const systemPrompt = buildSystemPrompt({
    tone: params.tone,
    language: params.language,
    platforms: params.platforms,
    postType: params.postType,
  });
  const userPrompt = buildUserPrompt(params.idea, params.postType);
  let aiResponse: {
    raw: string; tokensIn: number; tokensOut: number; tokensUsed: number; model: string;
  };
  try {
    if (params.model === 'OPENAI') {
      aiResponse = await callOpenAIApi({ systemPrompt, userPrompt, apiKey });
    } else if (params.model === 'ANTHROPIC') {
      aiResponse = await callAnthropicApi({ systemPrompt, userPrompt, apiKey });
    } else {
      aiResponse = await callGeminiApi({ systemPrompt, userPrompt, apiKey });
    }
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      throw new ApiError(400, 'INVALID_API_KEY', 'AI API key is invalid or expired. Update it in Settings.');
    }

    let errorMessage = err?.message ?? 'Unknown error';
    let status = err?.status;
    try {
      if (typeof errorMessage === 'string' && errorMessage.trim().startsWith('{')) {
        const parsed = JSON.parse(errorMessage);
        if (parsed?.error?.message) {
          errorMessage = parsed.error.message;
          status = parsed.error.code || status;
        }
        if (parsed?.error?.status === 'RESOURCE_EXHAUSTED') {
          const retryInfo = parsed.error.details?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
          errorMessage = 'API quota exceeded. Please wait a moment and try again.';
          if (retryInfo) {
            errorMessage += ` Retry in ${retryInfo}.`;
          }
          status = 429;
        }
      }
    } catch (e) {
    }
    if (status === 429 || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('exceeded') || errorMessage.includes('429')) {
      console.warn(`[AI Quota Error] ${params.model}: ${errorMessage}`);
      throw new ApiError(429, 'QUOTA_EXCEEDED', 'AI provider quota exceeded. Please check your API key billing details or try again later.');
    }


    throw new ApiError(502, 'AI_CALL_FAILED', `AI generation failed: ${errorMessage}`);
  }
  let parsed: Record<string, { content: string; hashtags: string[] } | null>;
  try {
    const cleaned = aiResponse.raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ApiError(502, 'AI_PARSE_ERROR', 'AI returned malformed content. Please try again.');
  }
  const generated: Record<string, PlatformContent> = {};
  for (const platform of params.platforms) {
    const key = platform.toLowerCase();
    const data = parsed[key];
    if (!data || !data.content) {
      console.warn(`AI did not generate content for platform: ${platform}`);
      continue;
    }
    const limit = PLATFORM_CHAR_LIMITS[platform] ?? 2200;
    const hashtagStr = data.hashtags?.map((h: string) => `#${h}`).join(' ') ?? '';
    const fullText = `${data.content} ${hashtagStr}`.trim();
    let finalContent = data.content;
    if (fullText.length > limit) {
      const room = limit - hashtagStr.length - 4;
      finalContent = data.content.slice(0, room) + '...';
    }
    generated[key] = {
      content: finalContent,
      charCount: `${finalContent} ${hashtagStr}`.trim().length,
      hashtags: data.hashtags ?? [],
    };
  }
  if (Object.keys(generated).length === 0) {
    throw new ApiError(502, 'NO_CONTENT_GENERATED', 'AI failed to generate content for any platform. Try again.');
  }
  prisma.aPILog.create({
    data: {
      userId: params.userId,
      provider: params.model,
      model: aiResponse.model,
      tokensIn: aiResponse.tokensIn,
      tokensOut: aiResponse.tokensOut,
      usedOwnKey: !!(
        params.model === 'OPENAI' ? aiKey?.openaiKey :
          params.model === 'ANTHROPIC' ? aiKey?.anthropicKey :
            aiKey?.geminiKey
      ),
    },
  }).catch(err => console.error('Failed to log API usage:', err));

  return {
    generated,
    modelUsed: aiResponse.model,
    tokensIn: aiResponse.tokensIn,
    tokensOut: aiResponse.tokensOut,
    tokensUsed: aiResponse.tokensUsed,
  };
};