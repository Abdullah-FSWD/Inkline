import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/User.js";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "../lib/session.js";
import { requireAuth } from "../middleware/requireAuth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export const authRouter = Router();

function setSessionCookie(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
  });
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
  if (!user) {
    invalidCredentials();
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    invalidCredentials();
    return;
  }

  setSessionCookie(res, user._id.toString());
  res.status(200).json({ id: user._id.toString(), email: user.email });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await UserModel.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  res.status(200).json({ id: user._id.toString(), email: user.email });
});
