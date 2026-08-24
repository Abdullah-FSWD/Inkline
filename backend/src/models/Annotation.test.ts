import { describe, expect, it, afterEach } from "vitest";
import { Types } from "mongoose";
import { AnnotationModel } from "./Annotation.js";

const createdIds: Types.ObjectId[] = [];

function baseFields() {
  return {
    documentId: new Types.ObjectId(),
    ownerId: new Types.ObjectId(),
    pageNumber: 1,
    tool: "pencil",
    color: "#1c1a17",
    width: 2,
    opacity: 1,
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
  };
}

afterEach(async () => {
  await AnnotationModel.deleteMany({ _id: { $in: createdIds } });
  createdIds.length = 0;
});

describe("Annotation model", () => {
  it("creates an annotation with all fields", async () => {
    const annotation = await AnnotationModel.create(baseFields());
    createdIds.push(annotation._id);

    expect(annotation.tool).toBe("pencil");
    expect(annotation.points).toHaveLength(2);
    expect(annotation.createdAt).toBeInstanceOf(Date);
    expect(annotation.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects an invalid tool", async () => {
    await expect(AnnotationModel.create({ ...baseFields(), tool: "marker" })).rejects.toThrow();
  });

  it("rejects fewer than 2 points", async () => {
    await expect(AnnotationModel.create({ ...baseFields(), points: [{ x: 0, y: 0 }] })).rejects.toThrow();
  });

  it("rejects zero points", async () => {
    await expect(AnnotationModel.create({ ...baseFields(), points: [] })).rejects.toThrow();
  });

  it("rejects an opacity outside 0-1", async () => {
    await expect(AnnotationModel.create({ ...baseFields(), opacity: 1.5 })).rejects.toThrow();
  });

  it("rejects a pageNumber below 1", async () => {
    await expect(AnnotationModel.create({ ...baseFields(), pageNumber: 0 })).rejects.toThrow();
  });

  it("requires documentId, ownerId, pageNumber, tool, color, width, opacity, and points", async () => {
    await expect(AnnotationModel.create({})).rejects.toThrow();
  });
});
