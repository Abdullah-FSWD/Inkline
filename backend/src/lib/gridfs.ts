import mongoose from "mongoose";
import { GridFSBucket, type ObjectId } from "mongodb";

let bucket: GridFSBucket | null = null;

function getFileBucket(): GridFSBucket {
  if (!bucket) {
    const db = mongoose.connection.db;
    if (!db) throw new Error("Database connection is not established");
    bucket = new GridFSBucket(db, { bucketName: "documentFiles" });
  }
  return bucket;
}

export function uploadFile(filename: string, contentType: string, buffer: Buffer): Promise<ObjectId> {
  return new Promise((resolve, reject) => {
    const uploadStream = getFileBucket().openUploadStream(filename, { metadata: { contentType } });
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

export async function deleteFile(fileId: ObjectId): Promise<void> {
  await getFileBucket().delete(fileId);
}
