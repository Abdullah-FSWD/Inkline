import "dotenv/config";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { startKeepAliveJob } from "./lib/keepAlive.js";

const port = process.env.PORT ?? 4000;
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is not set");
}

await connectDb(mongoUri);
startKeepAliveJob();

const app = createApp();

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
