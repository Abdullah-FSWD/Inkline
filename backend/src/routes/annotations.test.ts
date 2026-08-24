import { describe, expect, it, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { UserModel } from "../models/User.js";
import { DocumentModel } from "../models/Document.js";
import { AnnotationModel } from "../models/Annotation.js";
import { deleteFile } from "../lib/gridfs.js";

const app = createApp();

const testEmails: string[] = [];
function uniqueEmail() {
  const email = `annotations-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  testEmails.push(email);
  return email;
}

afterEach(async () => {
  const docs = await DocumentModel.find({ originalFilename: { $regex: /^annotations-test-/ } });
  for (const doc of docs) {
    await deleteFile(doc.fileId);
    await AnnotationModel.deleteMany({ documentId: doc._id });
  }
  await DocumentModel.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
  await UserModel.deleteMany({ email: { $in: testEmails } });
  testEmails.length = 0;
});

function pdfBuffer() {
  return Buffer.from("%PDF-1.4 fake pdf content");
}

function validStroke(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pageNumber: 1,
    tool: "pencil",
    color: "#1c1a17",
    width: 2,
    opacity: 1,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    ...overrides,
  };
}

async function signupAndUpload(filename: string) {
  const email = uniqueEmail();
  const agent = request.agent(app);
  await agent.post("/auth/signup").send({ email, password: "correct-horse" });
  const upload = await agent.post("/documents/upload").attach("file", pdfBuffer(), filename);
  return { agent, documentId: upload.body.id as string };
}

describe("POST /documents/:id/annotations", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app)
      .post("/documents/000000000000000000000000/annotations")
      .send(validStroke());
    expect(res.status).toBe(401);
  });

  it("creates an annotation for an owned document", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-1.pdf");

    const res = await agent.post(`/documents/${documentId}/annotations`).send(validStroke());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      pageNumber: 1,
      tool: "pencil",
      color: "#1c1a17",
      width: 2,
      opacity: 1,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    expect(res.body.id).toBeDefined();

    const stored = await AnnotationModel.findById(res.body.id);
    expect(stored).not.toBeNull();
    expect(stored!.documentId.toString()).toBe(documentId);
  });

  it("returns 404 (not 403) for another user's document, revealing nothing about it", async () => {
    const { documentId } = await signupAndUpload("annotations-test-2.pdf");

    const emailB = uniqueEmail();
    const agentB = request.agent(app);
    await agentB.post("/auth/signup").send({ email: emailB, password: "correct-horse" });

    const res = await agentB.post(`/documents/${documentId}/annotations`).send(validStroke());
    expect(res.status).toBe(404);
    expect(await AnnotationModel.countDocuments({ documentId })).toBe(0);
  });

  it("returns 404 for a nonexistent document id", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.post("/documents/000000000000000000000000/annotations").send(validStroke());
    expect(res.status).toBe(404);
  });

  it("rejects a stroke with fewer than 2 points", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-3.pdf");

    const res = await agent
      .post(`/documents/${documentId}/annotations`)
      .send(validStroke({ points: [{ x: 0, y: 0 }] }));

    expect(res.status).toBe(400);
    expect(await AnnotationModel.countDocuments({ documentId })).toBe(0);
  });

  it("rejects an invalid tool", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-4.pdf");

    const res = await agent.post(`/documents/${documentId}/annotations`).send(validStroke({ tool: "marker" }));

    expect(res.status).toBe(400);
  });

  it("rejects an opacity outside 0-1", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-5.pdf");

    const res = await agent.post(`/documents/${documentId}/annotations`).send(validStroke({ opacity: 2 }));

    expect(res.status).toBe(400);
  });

  it("rejects a non-positive pageNumber", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-6.pdf");

    const res = await agent.post(`/documents/${documentId}/annotations`).send(validStroke({ pageNumber: 0 }));

    expect(res.status).toBe(400);
  });

  it("rejects a missing body", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-7.pdf");

    const res = await agent.post(`/documents/${documentId}/annotations`).send();

    expect(res.status).toBe(400);
  });
});

describe("GET /documents/:id/annotations", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/documents/000000000000000000000000/annotations");
    expect(res.status).toBe(401);
  });

  it("lists all annotations for the document, across pages, oldest first", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-8.pdf");
    await agent.post(`/documents/${documentId}/annotations`).send(validStroke({ pageNumber: 2 }));
    await agent.post(`/documents/${documentId}/annotations`).send(validStroke({ pageNumber: 1 }));

    const res = await agent.get(`/documents/${documentId}/annotations`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((a: { pageNumber: number }) => a.pageNumber)).toEqual([2, 1]);
  });

  it("returns an empty list for a document with no annotations", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-9.pdf");

    const res = await agent.get(`/documents/${documentId}/annotations`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 404 (not 403) for another user's document, revealing nothing about it", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-10.pdf");
    await agent.post(`/documents/${documentId}/annotations`).send(validStroke());

    const emailB = uniqueEmail();
    const agentB = request.agent(app);
    await agentB.post("/auth/signup").send({ email: emailB, password: "correct-horse" });

    const res = await agentB.get(`/documents/${documentId}/annotations`);
    expect(res.status).toBe(404);
  });

  it("does not include another document's annotations", async () => {
    const { agent, documentId: docA } = await signupAndUpload("annotations-test-11.pdf");
    const upload2 = await agent.post("/documents/upload").attach("file", pdfBuffer(), "annotations-test-12.pdf");
    const docB = upload2.body.id as string;

    await agent.post(`/documents/${docA}/annotations`).send(validStroke());
    await agent.post(`/documents/${docB}/annotations`).send(validStroke());

    const res = await agent.get(`/documents/${docA}/annotations`);
    expect(res.body).toHaveLength(1);
  });
});

describe("DELETE /documents/:id/annotations/:annotationId", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).delete(
      "/documents/000000000000000000000000/annotations/000000000000000000000000"
    );
    expect(res.status).toBe(401);
  });

  it("deletes the annotation", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-14.pdf");
    const create = await agent.post(`/documents/${documentId}/annotations`).send(validStroke());
    const annotationId = create.body.id;

    const res = await agent.delete(`/documents/${documentId}/annotations/${annotationId}`);
    expect(res.status).toBe(204);

    expect(await AnnotationModel.findById(annotationId)).toBeNull();
  });

  it("no longer appears in the list after deletion", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-15.pdf");
    const create = await agent.post(`/documents/${documentId}/annotations`).send(validStroke());
    await agent.post(`/documents/${documentId}/annotations`).send(validStroke({ pageNumber: 2 }));

    await agent.delete(`/documents/${documentId}/annotations/${create.body.id}`);

    const res = await agent.get(`/documents/${documentId}/annotations`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].pageNumber).toBe(2);
  });

  it("returns 404 (not 403) when the document belongs to another user, and does not delete the annotation", async () => {
    const { agent: agentA, documentId } = await signupAndUpload("annotations-test-16.pdf");
    const create = await agentA.post(`/documents/${documentId}/annotations`).send(validStroke());

    const emailB = uniqueEmail();
    const agentB = request.agent(app);
    await agentB.post("/auth/signup").send({ email: emailB, password: "correct-horse" });

    const res = await agentB.delete(`/documents/${documentId}/annotations/${create.body.id}`);
    expect(res.status).toBe(404);
    expect(await AnnotationModel.findById(create.body.id)).not.toBeNull();
  });

  it("returns 404 for a nonexistent annotation id", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-17.pdf");

    const res = await agent.delete(`/documents/${documentId}/annotations/000000000000000000000000`);
    expect(res.status).toBe(404);
  });

  it("returns 404 (not 500) for a malformed annotation id", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-18.pdf");

    const res = await agent.delete(`/documents/${documentId}/annotations/not-a-valid-object-id`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the annotation belongs to a different document than the one in the URL", async () => {
    const { agent, documentId: docA } = await signupAndUpload("annotations-test-19.pdf");
    const upload2 = await agent.post("/documents/upload").attach("file", pdfBuffer(), "annotations-test-20.pdf");
    const docB = upload2.body.id as string;
    const create = await agent.post(`/documents/${docA}/annotations`).send(validStroke());

    const res = await agent.delete(`/documents/${docB}/annotations/${create.body.id}`);
    expect(res.status).toBe(404);
    expect(await AnnotationModel.findById(create.body.id)).not.toBeNull();
  });

  it("returns 404 for a nonexistent document id", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app);
    await agent.post("/auth/signup").send({ email, password: "correct-horse" });

    const res = await agent.delete(
      "/documents/000000000000000000000000/annotations/000000000000000000000000"
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /documents/:id cascades to annotations", () => {
  it("deletes a document's annotations along with the document", async () => {
    const { agent, documentId } = await signupAndUpload("annotations-test-13.pdf");
    await agent.post(`/documents/${documentId}/annotations`).send(validStroke());

    await agent.delete(`/documents/${documentId}`);

    expect(await AnnotationModel.countDocuments({ documentId })).toBe(0);
  });
});
