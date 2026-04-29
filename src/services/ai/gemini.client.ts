import { GoogleGenAI } from "@google/genai";
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
const GeminiClient = async (params: CallParameters) => {
    const client = new GoogleGenAI({ apiKey: params.apiKey || process.env.GEMINI_API_KEY || "" });
    const modelId = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    try {
        const response = await client.models.generateContent({
            model: modelId,
            contents: params.userPrompt,
            config: {
                systemInstruction: params.systemPrompt,
            }
        });
        return response;
    } catch (error: any) {
        // Detailed logging for developers to see in their server logs
        console.error(`Gemini API Error [${modelId}]:`, error?.message || error);

        if (error?.error?.status === 'RESOURCE_EXHAUSTED' || error?.status === 429) {
            const message = error.error?.message || error.message || 'Quota exceeded';
            const errorObj = {
                status: 429,
                error: {
                    status: 'RESOURCE_EXHAUSTED',
                    message,
                    details: error.error?.details || error.details
                }
            };
            throw new Error(JSON.stringify(errorObj));
        }
        throw error;
    }
};

export const callGeminiApi = async (params: CallParameters): Promise<AIResponse> => {
    const response = await GeminiClient(params);
    const raw = response.text || "";
    return {
        raw,
        tokensIn: response.usageMetadata?.promptTokenCount || 0,
        tokensOut: response.usageMetadata?.candidatesTokenCount || 0,
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    };
};

