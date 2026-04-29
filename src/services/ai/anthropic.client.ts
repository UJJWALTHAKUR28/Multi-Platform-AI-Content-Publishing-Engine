import Anthropic from "@anthropic-ai/sdk"

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

const AnthropicClient = async (params: CallParameters) => {
    const client = new Anthropic({ apiKey: params.apiKey || process.env.ANTHROPIC_API_KEY || '' });
    const response = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-6',
        max_tokens: 1000,
        system: params.systemPrompt,
        messages: [
            { role: "user", content: params.userPrompt }
        ]
    });
    return response;
}

export const callAnthropicApi = async (params: CallParameters): Promise<AIResponse> => {
    const response = await AnthropicClient(params);
    const raw = response.content.filter(block => block.type === 'text').map(block => (block as any).text).join('');
    return {
        raw,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        model: response.model
    }
}