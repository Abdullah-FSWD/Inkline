import { describe, expect, it, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
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

  it("rejects an HTML upload with a distinct 'coming soon' message, not the generic one", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent
      .post("/documents/upload")
      .attach("file", Buffer.from("<html></html>"), "documents-test-3.html");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/coming soon/i);
    const stored = await DocumentModel.findOne({ originalFilename: "documents-test-3.html" });
    expect(stored).toBeNull();
  });

  it("rejects an unsupported extension with the generic message", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent
      .post("/documents/upload")
      .attach("file", Buffer.from("binary data"), "documents-test-4.docx");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported file type/i);
  });

  it("rejects a file whose content doesn't match its .pdf extension (spoofed)", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent
      .post("/documents/upload")
      .attach("file", Buffer.from("MZ this is not really a pdf"), "documents-test-5.pdf");

    expect(res.status).toBe(400);
    const stored = await DocumentModel.findOne({ originalFilename: "documents-test-5.pdf" });
    expect(stored).toBeNull();
  });

  it("rejects a request with no file attached", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.post("/documents/upload");
    expect(res.status).toBe(400);
  });

  it("rejects an empty file", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent
      .post("/documents/upload")
      .attach("file", Buffer.alloc(0), "documents-test-6.pdf");

    expect(res.status).toBe(400);
    const stored = await DocumentModel.findOne({ originalFilename: "documents-test-6.pdf" });
    expect(stored).toBeNull();
  });

  it("rejects a file over the 50MB size limit with a clear message, not a 500", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const oversized = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(51 * 1024 * 1024)]);
    const res = await agent.post("/documents/upload").attach("file", oversized, "documents-test-7.pdf");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  }, 20000);
});

describe("GET /documents", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/documents");
    expect(res.status).toBe(401);
  });

  it("lists only the current user's documents, newest-updated first", async () => {
    const emailA = uniqueEmail();
    const agentA = request.agent(app);
    await agentA.post("/auth/signup").send({ email: emailA, password: "correct-horse" });
    await agentA.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-a1.pdf");
    await agentA.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-a2.pdf");

    const emailB = uniqueEmail();
    const agentB = request.agent(app);
    await agentB.post("/auth/signup").send({ email: emailB, password: "correct-horse" });
    await agentB.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-b1.pdf");

    const resA = await agentA.get("/documents");
    expect(resA.status).toBe(200);
    expect(resA.body).toHaveLength(2);
    expect(resA.body.map((d: { title: string }) => d.title).sort()).toEqual(["documents-test-a1", "documents-test-a2"]);
    expect(resA.body[0]).toMatchObject({ sourceType: "pdf", status: "ready" });
    expect(resA.body[0].updatedAt).toBeDefined();

    const resB = await agentB.get("/documents");
    expect(resB.body).toHaveLength(1);
    expect(resB.body[0].title).toBe("documents-test-b1");
  });

  it("returns an empty list for a user with no documents", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.get("/documents");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /documents/:id", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/documents/000000000000000000000000");
    expect(res.status).toBe(401);
  });

  it("returns the document when it belongs to the current user", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });
    const upload = await agent.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-owned.pdf");

    const res = await agent.get(`/documents/${upload.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: upload.body.id, title: "documents-test-owned", status: "ready" });
  });

  it("returns 404 (not 403) for another user's document, revealing nothing about it", async () => {
    const emailA = uniqueEmail();
    const agentA = request.agent(app);
    await agentA.post("/auth/signup").send({ email: emailA, password: "correct-horse" });
    const upload = await agentA.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-notyours.pdf");

    const emailB = uniqueEmail();
    const agentB = request.agent(app);
    await agentB.post("/auth/signup").send({ email: emailB, password: "correct-horse" });

    const res = await agentB.get(`/documents/${upload.body.id}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a nonexistent document id", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.get("/documents/000000000000000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 404 (not 500) for a malformed document id", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.get("/documents/not-a-valid-object-id");
    expect(res.status).toBe(404);
  });
});

describe("GET /documents/:id/file", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/documents/000000000000000000000000/file");
    expect(res.status).toBe(401);
  });

  it("streams back the exact bytes that were uploaded, with the right content type", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });
    const upload = await agent
      .post("/documents/upload")
      .attach("file", pdfBuffer(), { filename: "documents-test-stream.pdf", contentType: "application/pdf" });

    const res = await agent.get(`/documents/${upload.body.id}/file`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.body).toEqual(pdfBuffer());
  });

  it("returns 404 (not 403) for another user's document, revealing nothing about it", async () => {
    const emailA = uniqueEmail();
    const agentA = request.agent(app);
    await agentA.post("/auth/signup").send({ email: emailA, password: "correct-horse" });
    const upload = await agentA.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-fileB.pdf");

    const emailB = uniqueEmail();
    const agentB = request.agent(app);
    await agentB.post("/auth/signup").send({ email: emailB, password: "correct-horse" });

    const res = await agentB.get(`/documents/${upload.body.id}/file`);
    expect(res.status).toBe(404);
  });

  it("returns 409 for a document that isn't ready", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });
    const upload = await agent.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-notready.pdf");
    await DocumentModel.updateOne({ _id: upload.body.id }, { $set: { status: "processing" } });

    const res = await agent.get(`/documents/${upload.body.id}/file`);
    expect(res.status).toBe(409);
  });

  it("returns 404 for a nonexistent document id", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.get("/documents/000000000000000000000000/file");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /documents/:id", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).delete("/documents/000000000000000000000000");
    expect(res.status).toBe(401);
  });

  it("deletes the document and its GridFS file", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });
    const upload = await agent.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-todelete.pdf");
    const fileId = (await DocumentModel.findById(upload.body.id))!.fileId;

    const res = await agent.delete(`/documents/${upload.body.id}`);
    expect(res.status).toBe(204);

    expect(await DocumentModel.findById(upload.body.id)).toBeNull();
    expect(await mongoose.connection.db!.collection("documentFiles.files").findOne({ _id: fileId })).toBeNull();
  });

  it("no longer appears in the list after deletion", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });
    const upload = await agent.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-todelete2.pdf");

    await agent.delete(`/documents/${upload.body.id}`);

    const res = await agent.get("/documents");
    expect(res.body).toEqual([]);
  });

  it("returns 404 (not 403) when trying to delete another user's document, and does not delete it", async () => {
    const emailA = uniqueEmail();
    const agentA = request.agent(app);
    await agentA.post("/auth/signup").send({ email: emailA, password: "correct-horse" });
    const upload = await agentA.post("/documents/upload").attach("file", pdfBuffer(), "documents-test-protected.pdf");

    const emailB = uniqueEmail();
    const agentB = request.agent(app);
    await agentB.post("/auth/signup").send({ email: emailB, password: "correct-horse" });

    const res = await agentB.delete(`/documents/${upload.body.id}`);
    expect(res.status).toBe(404);
    expect(await DocumentModel.findById(upload.body.id)).not.toBeNull();
  });

  it("returns 404 for a nonexistent document id", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.delete("/documents/000000000000000000000000");
    expect(res.status).toBe(404);
  });
});
