import { describe, expect, it, afterEach } from "vitest";
import { Types } from "mongoose";
import { DocumentModel } from "./Document.js";

const createdIds: Types.ObjectId[] = [];

function baseFields() {
  return {
    ownerId: new Types.ObjectId(),
    fileId: new Types.ObjectId(),
    originalFilename: "test.pdf",
    mimeType: "application/pdf",
  };
}

afterEach(async () => {
  await DocumentModel.deleteMany({ _id: { $in: createdIds } });
  createdIds.length = 0;
});

describe("Document model", () => {
  it("creates a document with defaults applied", async () => {
    const doc = await DocumentModel.create({ ...baseFields(), title: "My Article", sourceType: "html" });
    createdIds.push(doc._id);

    expect(doc.status).toBe("processing");
    expect(doc.pageCount).toBe(0);
    expect(doc.lastReadPage).toBe(1);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a lastReadPage below 1", async () => {
    await expect(
      DocumentModel.create({ ...baseFields(), title: "Bad", sourceType: "pdf", lastReadPage: 0 })
    ).rejects.toThrow();
  });

  it("rejects an invalid sourceType", async () => {
    await expect(DocumentModel.create({ ...baseFields(), title: "Bad", sourceType: "docx" })).rejects.toThrow();
  });

  it("rejects an invalid status", async () => {
    await expect(
      DocumentModel.create({ ...baseFields(), title: "Bad", sourceType: "pdf", status: "uploading" })
    ).rejects.toThrow();
  });

  it("requires ownerId, title, sourceType, fileId, originalFilename, and mimeType", async () => {
    await expect(DocumentModel.create({})).rejects.toThrow();
  });
});
