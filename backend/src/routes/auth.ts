import { Router } from "express";
import bcrypt from "bcryptjs";
import { UserModel } from "../models/User.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export const authRouter = Router();

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
    res.status(201).json({ id: user._id.toString(), email: user.email });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    throw err;
  }
});
