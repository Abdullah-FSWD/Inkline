import { describe, expect, it, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { UserModel } from "../models/User.js";

const app = createApp();

const testEmails: string[] = [];
function uniqueEmail() {
  const email = `signup-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  testEmails.push(email);
  return email;
}

afterEach(async () => {
  await UserModel.deleteMany({ email: { $in: testEmails } });
  testEmails.length = 0;
});

describe("POST /auth/signup", () => {
  it("creates a new user and returns it without the password hash", async () => {
    const email = uniqueEmail();
    const res = await request(app).post("/auth/signup").send({ email, password: "correct-horse" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email });
    expect(res.body.passwordHash).toBeUndefined();

    const stored = await UserModel.findOne({ email });
    expect(stored).not.toBeNull();
    expect(stored!.passwordHash).not.toBe("correct-horse");
  });

  it("rejects an invalid email format", async () => {
    const res = await request(app).post("/auth/signup").send({ email: "not-an-email", password: "correct-horse" });
    expect(res.status).toBe(400);
  });

  it("rejects a password below the minimum length", async () => {
    const res = await request(app).post("/auth/signup").send({ email: uniqueEmail(), password: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects a duplicate email with a clear error", async () => {
    const email = uniqueEmail();
    await request(app).post("/auth/signup").send({ email, password: "correct-horse" });
    const res = await request(app).post("/auth/signup").send({ email, password: "another-password" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });
});
