import type { Request } from "express";
export interface RequestMeta {
  ipAddress: string;
  userAgent: string;
  deviceName: string | null;
}
export function extractRequestMeta(req: Request): RequestMeta {
  const forwarded = req.headers["x-forwarded-for"];
  const ipAddress =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim()) ||
    req.ip ||
    "unknown";
  const userAgent = (req.headers["user-agent"] as string) || "unknown";
  const deviceName = parseDeviceName(userAgent);
  return { ipAddress, userAgent, deviceName };
}
function parseDeviceName(ua: string): string | null {
  if (!ua || ua === "unknown") return null;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s[\d.]+;\s*([^;)]+)/);
    return match ? match[1].trim() : "Android Device";
  }
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux PC";

  return null;
}
