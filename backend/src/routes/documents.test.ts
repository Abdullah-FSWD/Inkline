import { describe, expect, it, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { UserModel } from "../models/User.js";

const app = createApp();

const testEmails: string[] = [];
function uniqueEmail() {
  const email = `documents-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  testEmails.push(email);
  return email;
}

afterEach(async () => {
  await UserModel.deleteMany({ email: { $in: testEmails } });
  testEmails.length = 0;
});

describe("POST /documents/upload", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).post("/documents/upload").attach("file", Buffer.from("hello"), "test.pdf");
    expect(res.status).toBe(401);
  });

  it("accepts a multipart file upload from an authenticated user", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent
      .post("/documents/upload")
      .attach("file", Buffer.from("%PDF-1.4 fake pdf content"), "test.pdf");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ originalName: "test.pdf", mimeType: "application/pdf" });
  });

  it("rejects a request with no file attached", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.post("/documents/upload");
    expect(res.status).toBe(400);
  });
});
