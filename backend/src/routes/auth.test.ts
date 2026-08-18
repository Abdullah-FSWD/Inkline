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
  it("creates a new user, sets a session cookie, and returns it without the password hash", async () => {
    const email = uniqueEmail();
    const res = await request(app).post("/auth/signup").send({ email, password: "correct-horse" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email });
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^session=.+HttpOnly/);

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

  it("rejects a duplicate email that only differs by case", async () => {
    const email = uniqueEmail();
    await request(app).post("/auth/signup").send({ email, password: "correct-horse" });
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: email.toUpperCase(), password: "another-password" });

    expect(res.status).toBe(409);
  });

  it("trims and lowercases the email before storing", async () => {
    const email = uniqueEmail();
    const padded = `  ${email.toUpperCase()}  `;
    const res = await request(app).post("/auth/signup").send({ email: padded, password: "correct-horse" });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
  });

  it("rejects a whitespace-only password", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ email: uniqueEmail(), password: "        " });

    expect(res.status).toBe(400);
  });

  it("rejects a malformed JSON body", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials and sets a session cookie", async () => {
    const email = uniqueEmail();
    await request(app).post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await request(app).post("/auth/login").send({ email, password: "correct-horse" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^session=.+HttpOnly/);
  });

  it("rejects an incorrect password with a generic error", async () => {
    const email = uniqueEmail();
    await request(app).post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await request(app).post("/auth/login").send({ email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password.");
  });

  it("rejects a nonexistent email with the same generic error as a wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: uniqueEmail(), password: "correct-horse" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password.");
  });

  it("rejects a login attempt with missing fields", async () => {
    const res = await request(app).post("/auth/login").send({ email: "a@example.com" });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("returns the current user when the session cookie is valid", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.get("/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email });
  });

  it("rejects a request with no session cookie", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a request with a garbage session cookie", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "session=not-a-real-token");
    expect(res.status).toBe(401);
  });
});
