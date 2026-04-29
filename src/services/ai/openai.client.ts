import OpenAI from 'openai';

export interface CallParameters {
    systemPrompt: string;
    userPrompt: string;
    apiKey: string;
}

export interface AIResponse {
    raw: string;
    tokensIn: number;
    tokensOut: number;
    tokensUsed: number;
    model: string;
}

const OpenAIClient = async (params: CallParameters) => {
    const client = new OpenAI({
        apiKey: params.apiKey || process.env.OPENAI_API_KEY || '',
    });
    const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4",
    max_tokens: 2000,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: params.systemPrompt,
      },
      {
        role: "user",
        content: params.userPrompt,
      },
    ],
    response_format: {
      type: "json_object",
    },
  });
  return response;}
export const callOpenAIApi = async (params: CallParameters): Promise<AIResponse> => {
    const response = await OpenAIClient(params);
    const raw = response.choices[0].message.content||"";
    return {
        raw,
        tokensIn: response.usage?.prompt_tokens||0,
        tokensOut: response.usage?.completion_tokens||0,
        tokensUsed: response.usage?.total_tokens||0,
        model: response.model
    };
}    