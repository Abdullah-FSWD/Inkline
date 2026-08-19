import { describe, expect, it, afterEach } from "vitest";
import { Types } from "mongoose";
import { DocumentModel } from "./Document.js";

const createdIds: Types.ObjectId[] = [];

afterEach(async () => {
  await DocumentModel.deleteMany({ _id: { $in: createdIds } });
  createdIds.length = 0;
});

describe("Document model", () => {
  it("creates a document with defaults applied", async () => {
    const ownerId = new Types.ObjectId();
    const doc = await DocumentModel.create({ ownerId, title: "My Article", sourceType: "html" });
    createdIds.push(doc._id);

    expect(doc.status).toBe("processing");
    expect(doc.pageCount).toBe(0);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects an invalid sourceType", async () => {
    const ownerId = new Types.ObjectId();
    await expect(DocumentModel.create({ ownerId, title: "Bad", sourceType: "docx" })).rejects.toThrow();
  });

  it("rejects an invalid status", async () => {
    const ownerId = new Types.ObjectId();
    await expect(
      DocumentModel.create({ ownerId, title: "Bad", sourceType: "pdf", status: "uploading" })
    ).rejects.toThrow();
  });

  it("requires ownerId, title, and sourceType", async () => {
    await expect(DocumentModel.create({})).rejects.toThrow();
  });
});
