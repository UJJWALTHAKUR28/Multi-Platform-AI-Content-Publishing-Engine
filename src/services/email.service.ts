import { Resend } from "resend";
import { env } from "../config/env";
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
async function send(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.log("\n══════════════════════════════════════════════");
    console.log(`📧  EMAIL (dev mode — not actually sent)`);
    console.log(`    To:      ${to}`);
    console.log(`    Subject: ${subject}`);
    console.log(`    Body:\n${html}`);
    console.log("══════════════════════════════════════════════\n");
    return;
  }
  const { error } = await resend.emails.send({
    from: env.FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Resend email error:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
export async function sendVerificationEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${env.APP_URL}/api/auth/verify-email?token=${token}`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Welcome to Postly, ${escapeHtml(username)}!</h2>
      <p style="color: #4a4a5a; font-size: 15px; line-height: 1.6;">
        Thanks for signing up. Please verify your email address by clicking the button below.
        This link expires in <strong>24 hours</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verifyUrl}"
           style="background: #6366f1; color: #fff; padding: 12px 32px; border-radius: 8px;
                  text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="color: #9a9ab0; font-size: 13px;">
        If you didn't create an account, just ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e5ea; margin: 24px 0;" />
      <p style="color: #b0b0c0; font-size: 12px;">
        Or copy this link: <br/>
        <a href="${verifyUrl}" style="color: #6366f1; word-break: break-all;">${verifyUrl}</a>
      </p>
    </div>
  `;

  await send(to, "Verify your Postly email", html);
}
export async function sendPasswordResetEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password Reset</h2>
      <p style="color: #4a4a5a; font-size: 15px; line-height: 1.6;">
        Hi ${escapeHtml(username)}, we received a request to reset your password.
        Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}"
           style="background: #ef4444; color: #fff; padding: 12px 32px; border-radius: 8px;
                  text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="color: #9a9ab0; font-size: 13px;">
        If you didn't request a password reset, you can safely ignore this email.
        Your password won't be changed.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e5ea; margin: 24px 0;" />
      <p style="color: #b0b0c0; font-size: 12px;">
        Or copy this link: <br/>
        <a href="${resetUrl}" style="color: #ef4444; word-break: break-all;">${resetUrl}</a>
      </p>
    </div>
  `;

  await send(to, "Reset your Postly password", html);
}
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
