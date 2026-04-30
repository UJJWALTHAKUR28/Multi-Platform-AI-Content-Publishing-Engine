import { redis } from '../../config/redis';
const TTL_SECONDS = 60 * 30;
const key = (chatId: number) => `bot:session:${chatId}`;
export type BotStep =
  | 'IDLE'
  | 'AWAITING_EMAIL'   
  | 'AWAITING_OTP'   
  | 'POST_TYPE'
  | 'PLATFORMS'
  | 'TONE'
  | 'MODEL'
  | 'IDEA'
  | 'CONFIRM';

export interface BotSession {
  step: BotStep;
  userId?: string;        
  userName?: string;       
  postType?: string;       
  platforms?: string[];      
  tone?: string;
  model?: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
  idea?: string;
  generated?: Record<string, {
    content: string;
    charCount: number;
    hashtags: string[];
  }>;
  modelUsed?: string;
  tokensUsed?: number;
}

export const getSession = async (chatId: number): Promise<BotSession> => {
  try {
    const raw = await redis.get(key(chatId));
    if (!raw) return { step: 'IDLE' };
    return JSON.parse(raw) as BotSession;
  } catch {
    return { step: 'IDLE' };
  }
};
export const saveSession = async (
  chatId: number,
  session: BotSession,
): Promise<void> => {
  await redis.setex(key(chatId), TTL_SECONDS, JSON.stringify(session));
};
export const clearSession = async (chatId: number): Promise<void> => {
  await redis.del(key(chatId));
};