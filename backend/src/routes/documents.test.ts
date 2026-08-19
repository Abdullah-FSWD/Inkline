import { describe, expect, it, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { UserModel } from "../models/User.js";
import { DocumentModel } from "../models/Document.js";
import { deleteFile } from "../lib/gridfs.js";

const app = createApp();

const testEmails: string[] = [];
function uniqueEmail() {
  const email = `documents-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  testEmails.push(email);
  return email;
}

afterEach(async () => {
  const docs = await DocumentModel.find({ originalFilename: { $regex: /^documents-test-/ } });
  for (const doc of docs) {
    await deleteFile(doc.fileId);
  }
  await DocumentModel.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
  await UserModel.deleteMany({ email: { $in: testEmails } });
  testEmails.length = 0;
});

function pdfBuffer() {
  return Buffer.from("%PDF-1.4 fake pdf content");
}

describe("POST /documents/upload", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).post("/documents/upload").attach("file", pdfBuffer(), "documents-test-1.pdf");
    expect(res.status).toBe(401);
  });

  it("accepts a PDF upload from an authenticated user and persists it", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-2.pdf");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: "documents-test-2", sourceType: "pdf", status: "ready" });

    const stored = await DocumentModel.findById(res.body.id);
    expect(stored).not.toBeNull();
    expect(stored!.originalFilename).toBe("documents-test-2.pdf");
    expect(stored!.fileId).toBeDefined();
  });

  it("rejects a non-PDF file", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent
      .post("/documents/upload")
      .attach("file", Buffer.from("<html></html>"), "documents-test-3.html");

    expect(res.status).toBe(400);
    const stored = await DocumentModel.findOne({ originalFilename: "documents-test-3.html" });
    expect(stored).toBeNull();
  });

  it("rejects a request with no file attached", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.post("/documents/upload");
    expect(res.status).toBe(400);
  });
});
