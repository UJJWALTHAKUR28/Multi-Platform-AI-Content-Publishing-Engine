import { GoogleGenAI } from "@google/genai";
export interface CallParameters {
    systemPrompt: string;
    userPrompt: string;
    apiKey: string;
}
export interface AIResponse {
    raw: string;
    tokenIn: number;
    tokenOut: number;
    tokensused: number;
    model: string;
}
const GeminiClient = async (params: CallParameters) => {
    const client = new GoogleGenAI({ apiKey: params.apiKey || process.env.GEMINI_API_KEY || "" });
    const prompt = `System Prompt:${params.systemPrompt}User Prompt:${params.userPrompt}`;
    const response = await client.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3-flash",
        contents: prompt,
    });
    return response;
};
export const callGeminiApi = async (params: CallParameters): Promise<AIResponse> => {
    const response = await GeminiClient(params);
    const raw = response.text || "";
    return {
        raw,
        tokenIn: response.usageMetadata?.promptTokenCount || 0,
        tokenOut: response.usageMetadata?.candidatesTokenCount || 0,
        tokensused: response.usageMetadata?.totalTokenCount || 0,
        model: process.env.GEMINI_MODEL || "gemini-3-flash",
    };
};