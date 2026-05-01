import { redis } from '../../config/redis';
const TTL_SECONDS = 60 * 60;
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
  | 'WHEN'
  | 'SCHEDULE_DATE'
  | 'SCHEDULE_TIME'
  | 'CONFIRM';
export interface BotSession {
  step: BotStep;
  userId?: string;
  userName?: string;
  timezone?: string;
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
  publishType?: 'now' | 'schedule';
  scheduleDate?: string;
  scheduleTime?: string;
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
export const saveSession = async (chatId: number, session: BotSession): Promise<void> => {
  await redis.setex(key(chatId), TTL_SECONDS, JSON.stringify(session));
};
export const clearSession = async (chatId: number): Promise<void> => {
  await redis.del(key(chatId));
};
export function buildPublishAt(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const localIso = `${dateStr}T${timeStr}:00`;
  try {
    const naiveDate = new Date(`${localIso}Z`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(naiveDate);
    const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0');
    const tzYear = get('year'); const tzMonth = get('month'); const tzDay = get('day');
    const tzHour = get('hour'); const tzMinute = get('minute');
    const tzDate = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute));
    const offsetMs = naiveDate.getTime() - tzDate.getTime();
    const result = new Date(naiveDate.getTime() + offsetMs);
    return result;
  } catch {
    return new Date(`${localIso}Z`);
  }
}
export function formatInTz(date: Date, timezone: string): string {
  try {
    return date.toLocaleString('en-IN', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return date.toUTCString();
  }
}
export function getNextDays(
  timezone: string,
  count: number = 7,
): { label: string; value: string }[] {
  const days: { label: string; value: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1_000);
    const localStr = d.toLocaleDateString('en-CA', { timeZone: timezone });
    let label: string;
    if (i === 0) label = `Today (${d.toLocaleDateString('en-IN', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' })})`;
    else if (i === 1) label = `Tomorrow (${d.toLocaleDateString('en-IN', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' })})`;
    else label = d.toLocaleDateString('en-IN', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' });
    days.push({ label, value: localStr });
  }
  return days;
}
export function parseTimeInput(input: string): string | null {
  const s = input.trim().toLowerCase();
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1]); const m = parseInt(m24[2]);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m12) {
    let h = parseInt(m12[1]);
    const mm = m12[2] ? parseInt(m12[2]) : 0;
    const ap = m12[3];
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h >= 0 && h < 24 && mm >= 0 && mm < 60) {
      return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  return null;
}
export function parseDateInput(input: string, timezone: string): string | null {
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mDMY = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/);
  if (mDMY) {
    const d = parseInt(mDMY[1]); const m = parseInt(mDMY[2]);
    const year = mDMY[3]
      ? parseInt(mDMY[3])
      : new Date().toLocaleDateString('en-CA', { timeZone: timezone }).split('-')[0];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  const mWords = s.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/i);
  if (mWords) {
    const d = parseInt(mWords[1]);
    const mon = MONTHS[mWords[2].toLowerCase()];
    const yr = mWords[3]
      ? parseInt(mWords[3])
      : parseInt(new Date().toLocaleDateString('en-CA', { timeZone: timezone }).split('-')[0]);
    if (mon && d >= 1 && d <= 31) {
      return `${yr}-${mon}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}