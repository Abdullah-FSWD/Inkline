import { describe, expect, it, vi, afterEach } from "vitest";
import { Types } from "mongoose";
import { DocumentModel } from "../models/Document.js";

vi.mock("./htmlToPdf.js", () => ({
  convertHtmlToPdf: vi.fn(),
}));
vi.mock("./gridfs.js", () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

const { convertAndStoreHtml } = await import("./htmlConversionJob.js");
const { convertHtmlToPdf } = await import("./htmlToPdf.js");
const { uploadFile, deleteFile } = await import("./gridfs.js");

const mockedConvert = vi.mocked(convertHtmlToPdf);
const mockedUpload = vi.mocked(uploadFile);
const mockedDelete = vi.mocked(deleteFile);

function baseDocFields() {
  return {
    ownerId: new Types.ObjectId(),
    title: "Test",
    sourceType: "html" as const,
    status: "processing" as const,
    fileId: new Types.ObjectId(),
    originalFilename: "test.html",
    mimeType: "text/html",
  };
}

const createdIds: Types.ObjectId[] = [];

afterEach(async () => {
  await DocumentModel.deleteMany({ _id: { $in: createdIds } });
  createdIds.length = 0;
  vi.resetAllMocks();
});

describe("convertAndStoreHtml", () => {
  it("swaps the document over to the converted PDF and marks it ready", async () => {
    const doc = await DocumentModel.create(baseDocFields());
    createdIds.push(doc._id);
    const oldFileId = doc.fileId;

    const newFileId = new Types.ObjectId();
    mockedConvert.mockResolvedValue(Buffer.from("%PDF-fake"));
    mockedUpload.mockResolvedValue(newFileId);
    mockedDelete.mockResolvedValue(undefined);

    await convertAndStoreHtml(doc._id, Buffer.from("<html></html>"));

    const updated = await DocumentModel.findById(doc._id);
    expect(updated!.status).toBe("ready");
    expect(updated!.mimeType).toBe("application/pdf");
    expect(updated!.fileId.toString()).toBe(newFileId.toString());
    expect(mockedDelete).toHaveBeenCalledWith(oldFileId);
  });

  it("marks the document failed, leaving the original file untouched, when conversion throws", async () => {
    const doc = await DocumentModel.create(baseDocFields());
    createdIds.push(doc._id);
    const oldFileId = doc.fileId;

    mockedConvert.mockRejectedValue(new Error("puppeteer exploded"));

    await convertAndStoreHtml(doc._id, Buffer.from("<html></html>"));

    const updated = await DocumentModel.findById(doc._id);
    expect(updated!.status).toBe("failed");
    expect(updated!.fileId.toString()).toBe(oldFileId.toString());
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("marks the document failed when the GridFS upload of the converted PDF fails", async () => {
    const doc = await DocumentModel.create(baseDocFields());
    createdIds.push(doc._id);

    mockedConvert.mockResolvedValue(Buffer.from("%PDF-fake"));
    mockedUpload.mockRejectedValue(new Error("gridfs exploded"));

    await convertAndStoreHtml(doc._id, Buffer.from("<html></html>"));

    const updated = await DocumentModel.findById(doc._id);
    expect(updated!.status).toBe("failed");
  });

  it("cleans up the newly-uploaded PDF if the document was deleted while conversion was running", async () => {
    const missingId = new Types.ObjectId();
    const newFileId = new Types.ObjectId();
    mockedConvert.mockResolvedValue(Buffer.from("%PDF-fake"));
    mockedUpload.mockResolvedValue(newFileId);
    mockedDelete.mockResolvedValue(undefined);

    await convertAndStoreHtml(missingId, Buffer.from("<html></html>"));

    expect(mockedDelete).toHaveBeenCalledWith(newFileId);
  });
});
