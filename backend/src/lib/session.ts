import jwt from "jsonwebtoken";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export interface SessionPayload {
  sub: string;
}

export function createSessionToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies SessionPayload, getSecret(), {
    expiresIn: SESSION_MAX_AGE_MS / 1000,
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded === "object" && decoded !== null && typeof decoded.sub === "string") {
      return { sub: decoded.sub };
    }
    return null;
  } catch {
    return null;
  }
}
