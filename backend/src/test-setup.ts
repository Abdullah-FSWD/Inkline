import "dotenv/config";
import { beforeAll, afterAll } from "vitest";
import { connectDb, disconnectDb } from "./db.js";

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await connectDb(uri);
});

afterAll(async () => {
  await disconnectDb();
});
