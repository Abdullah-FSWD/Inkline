import type { Request, Response, NextFunction } from "express";
import { verifySessionToken, SESSION_COOKIE_NAME } from "../lib/session.js";
import { UserModel } from "../models/User.js";

export interface CurrentUser {
  id: string;
  email: string;
}

declare global {
  // Augmenting Express's Request type requires the namespace form.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      user?: CurrentUser;
    }
  }
}

// Resolves the current user, not just a valid token: a session whose JWT is still
// unexpired but whose account no longer exists (e.g. deleted after the token was
// issued) must not be treated as authenticated for up to the token's remaining
// 7-day lifetime, so this looks the user up rather than trusting the payload alone.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  const payload = typeof token === "string" ? verifySessionToken(token) : null;

  const user = payload ? await UserModel.findById(payload.sub) : null;
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  req.userId = user._id.toString();
  req.user = { id: user._id.toString(), email: user.email };
  next();
}
