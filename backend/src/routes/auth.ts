import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/User.js";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "../lib/session.js";
import { requireAuth } from "../middleware/requireAuth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// A precomputed hash with no matching password, compared against on a login attempt for
// an email that doesn't exist. Without this, that path returns instantly while a wrong
// password on a real account pays the cost of bcrypt.compare - a timing side-channel an
// attacker could use to enumerate registered emails even though the error message itself
// never differs.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("no-such-account", 10);

export const authRouter = Router();

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

function setSessionCookie(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE_NAME, createSessionToken(userId), {
    ...sessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
}

authRouter.post("/signup", async (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };

  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!EMAIL_RE.test(normalizedEmail)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  if (typeof password !== "string" || password.trim().length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    return;
  }

  const existing = await UserModel.findOne({ email: normalizedEmail });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await UserModel.create({ email: normalizedEmail, passwordHash });
    setSessionCookie(res, user._id.toString());
    res.status(201).json({ id: user._id.toString(), email: user.email });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    throw err;
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const invalidCredentials = () => res.status(401).json({ error: "Invalid email or password." });

  const user = await UserModel.findOne({ email: normalizedEmail });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    invalidCredentials();
    return;
  }

  setSessionCookie(res, user._id.toString());
  res.status(200).json({ id: user._id.toString(), email: user.email });
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json(req.user);
});
