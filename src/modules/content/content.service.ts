import { generateContent } from '../../services/ai/ai.service';
import { ContentInput }    from './content.schema';

export const generate = async (userId: string, body: ContentInput) => {
  // FIX: body.model is 'OPENAI' | 'ANTHROPIC' | 'GEMINI' from the schema.
  // ai.service.ts GenerateParams.model is now the same uppercase enum — no mapping needed.
  const result = await generateContent({
    idea:      body.idea,
    postType:  body.postType,
    platforms: body.platforms,
    tone:      body.tone,
    language:  body.language,
    model:     body.model,
    userId,
  });

  return result;
};