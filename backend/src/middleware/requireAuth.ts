import type { Request, Response, NextFunction } from "express";
import { verifySessionToken, SESSION_COOKIE_NAME } from "../lib/session.js";

declare global {
  // Augmenting Express's Request type requires the namespace form.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  const payload = typeof token === "string" ? verifySessionToken(token) : null;

  if (!payload) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  req.userId = payload.sub;
  next();
}
