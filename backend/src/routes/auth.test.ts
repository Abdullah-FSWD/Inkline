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

  it("takes comparable time for a nonexistent email as for a wrong password (no timing leak)", async () => {
    const email = uniqueEmail();
    await request(app).post("/auth/signup").send({ email, password: "correct-horse" });

    const timeRequest = async (body: object) => {
      const start = performance.now();
      await request(app).post("/auth/login").send(body);
      return performance.now() - start;
    };

    // Both paths must run bcrypt.compare, which dominates timing (tens of ms) over
    // any fixed per-request overhead - a nonexistent-email response returning near-instantly
    // would indicate the compare is being skipped, leaking which emails are registered.
    const wrongPasswordMs = await timeRequest({ email, password: "wrong-password" });
    const nonexistentEmailMs = await timeRequest({ email: uniqueEmail(), password: "wrong-password" });

    expect(wrongPasswordMs).toBeGreaterThan(10);
    expect(nonexistentEmailMs).toBeGreaterThan(10);
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

  it("rejects a still-valid token whose account no longer exists", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    // simulate the account being deleted after the session token was issued;
    // the JWT itself is still cryptographically valid and unexpired
    await UserModel.deleteOne({ email });

    const res = await agent.get("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("clears the session cookie so a subsequent request is unauthenticated", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const beforeLogout = await agent.get("/auth/me");
    expect(beforeLogout.status).toBe(200);

    const logoutRes = await agent.post("/auth/logout");
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers["set-cookie"]?.[0]).toMatch(/^session=;/);

    const afterLogout = await agent.get("/auth/me");
    expect(afterLogout.status).toBe(401);
  });

  it("succeeds even when there was no session to begin with", async () => {
    const res = await request(app).post("/auth/logout");
    expect(res.status).toBe(200);
  });
});
