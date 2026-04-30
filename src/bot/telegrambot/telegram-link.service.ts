import { prisma }    from '../../db/prisma';
import { redis }     from '../../config/redis';
import { ApiError }  from '../../utils/api-error';
import crypto        from 'crypto';
const OTP_TTL = 60 * 5; // 5 minutes
export const initiateTelegramLink = async (  email:string,telegramChatId: string,
): Promise<void> => {
  const user = await prisma.user.findUnique({
    where:  { email: email.toLowerCase().trim() },
    select: { id: true, email: true, username: true },
  });
  if (!user) {
    throw new ApiError(
           404,
      'No account found with that email. Sign up at postly.app first.',
      'USER_NOT_FOUND',
    );
  }
  const conflict = await prisma.user.findFirst({
    where: { telegramChatId, id: { not: user.id } },
    select: { id: true },
  });
  if (conflict) {
    throw new ApiError(
        409,
      'This Telegram account is already linked to another Postly account.',
      'ALREADY_LINKED',
    );
  }
  const otp = crypto.randomInt(100_000, 999_999).toString();
  const redisKey = `telegram:otp:${telegramChatId}`;
  await redis.setex(
    redisKey,
    OTP_TTL,
    JSON.stringify({ otp, email: user.email, userId: user.id }),
  );
  await sendOtpEmail(user.email, user.username, otp);
};
export const verifyTelegramOtp = async (otp:string, telegramChatId: string,): Promise<string> => { 
  const redisKey = `telegram:otp:${telegramChatId}`;
  const raw      = await redis.get(redisKey);
  if (!raw) {
    throw new ApiError(400,'Code expired or not found. Type your email again to get a new code.','OTP_EXPIRED',);
  }
  const stored = JSON.parse(raw) as {
    otp:    string;
    email:  string;
    userId: string;
  };
  if (stored.otp !== otp.trim()) {
    throw new ApiError(400,
      'Wrong code. Please check your email and try again.',
      'OTP_INVALID',
    );
  }
  await prisma.user.update({
    where: { id: stored.userId },
    data:  { telegramChatId },
  });
  await redis.del(redisKey);
  const user = await prisma.user.findUnique({
    where:  { id: stored.userId },
    select: { username: true },
  });
  return user?.username ?? 'there';
};
const sendOtpEmail = async (email:string,name:string,otp:string):Promise<void> => {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    process.env.FROM_EMAIL ?? 'noreply@postly.app',
      to:      email,
      subject: 'Your Postly Telegram link code',
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;">
          <h2 style="color:#1a1a2e;margin-bottom:8px;">Hi ${escapeHtml(name)} 👋</h2>
          <p style="color:#4a4a5a;font-size:15px;line-height:1.6;">
            Your Postly Telegram link code is:
          </p>
          <div style="text-align:center;margin:28px 0;">
            <span style="letter-spacing:12px;font-size:48px;font-weight:700;color:#6366f1;">
              ${otp}
            </span>
          </div>
          <p style="color:#4a4a5a;font-size:15px;">
            This code expires in <strong>5 minutes</strong>.
          </p>
          <p style="color:#4a4a5a;font-size:15px;">
            Enter this code in the Postly Telegram bot to link your account.
          </p>
          <p style="color:#9a9ab0;font-size:13px;margin-top:24px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(
        500,
      `Failed to send OTP email: ${(err as any)?.message ?? 'Unknown error'}`,
      'EMAIL_SEND_FAILED',
    );
  }
};
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}