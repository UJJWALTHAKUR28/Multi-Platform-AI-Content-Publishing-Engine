import { generateContent } from '../../services/ai/ai.service';
import { ContentInput }    from './content.schema';

export const generate = async (userId: string, body: ContentInput) => {
  const result = await generateContent({
    idea:      body.idea,
    postType:  body.postType,
    platforms: body.platforms,
    tone:      body.tone,
    language:  body.language,
    model:     body.model,
    userId,
    previousContent: body.previousContent,
    refinementNote: body.refinementNote,
  });

  return result;
};