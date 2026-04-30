import { PLATFORM_RULES } from './platform.prompts';

interface PromptParams {
  tone: string;
  language: string;
  platforms: string[];
  postType: string;
}

export const buildSystemPrompt = (params: PromptParams): string => {
  const platformRulesText = params.platforms
    .map(p => `\n[${p}]\n${PLATFORM_RULES[p] ?? ''}`)
    .join('\n');

  return `
You are an expert social media content strategist and copywriter.
Your job is to take a raw idea and generate platform-specific content
that feels native to each platform — not copy-pasted from one to another.

GLOBAL SETTINGS:
- Post type: ${params.postType}
- Tone: ${params.tone}
- Language: ${params.language}
- Generate ALL content in the specified language

PLATFORM-SPECIFIC RULES (follow strictly for each platform):
${platformRulesText}

OUTPUT FORMAT:
Respond ONLY with a valid JSON object. 
No markdown code blocks. No explanation text. No preamble. Just raw JSON.

The JSON schema must be exactly:
{
  "Twitter":   { "content": "string", "hashtags": ["string"] } or null,
  "Linkedin":  { "content": "string", "hashtags": ["string"] } or null,
  "Instagram": { "content": "string", "hashtags": ["string"] } or null,
  "Threads":   { "content": "string", "hashtags": ["string"] } or null
}

Rules:
- Only include keys for the platforms listed in PLATFORM-SPECIFIC RULES
- Set platforms you were NOT asked to generate as null
- content field must NOT include hashtags (they go in the hashtags array)
- hashtags must NOT include the # symbol in the array values
- Never exceed the character limit for any platform
- Count characters carefully before responding
`.trim();
};
export const buildUserPrompt = (idea: string, postType: string, previousContent?: Record<string, { content: string; hashtags: string[] }>, refinementNote?: string): string => {
  let prompt = `POST TYPE: ${postType}\nIDEA: ${idea}\n`;
  if (previousContent && refinementNote) {
    prompt += `\nREFINEMENT MODE — do NOT generate from scratch.\n`;
    prompt += `The user already has content and wants changes.\n\n`;
    prompt += `USER FEEDBACK: ${refinementNote}\n\n`;
    prompt += `PREVIOUS CONTENT (improve this based on the feedback above):\n`;
    for (const [platform, data] of Object.entries(previousContent)) {
      const tags = data.hashtags?.length ? data.hashtags.join(', ') : 'none';
      prompt += `[${platform}] ${data.content} | hashtags: ${tags}\n`;
    }
    prompt += `\nApply the user's feedback and return the improved version. Keep platforms and format the same.`;
  } else {
    prompt += `\nGenerate the content now.`;
  }
  return prompt;
};