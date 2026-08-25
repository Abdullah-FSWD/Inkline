import cron from "node-cron";
import mongoose from "mongoose";

// Free-tier MongoDB Atlas clusters can get flagged/paused after long stretches with no
// activity. A daily ping keeps the cluster active. This alone does NOT stop Render's free web
// service from spinning down after ~15 min idle - that requires an external pinger hitting
// /health frequently (see .github/workflows/keep-alive.yml), which is what keeps this process
// (and therefore this cron) running in the first place.
export async function pingDatabase(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    console.warn("Keep-alive: skipped, no active database connection");
    return;
  }
  await db.admin().ping();
  console.log("Keep-alive: database ping succeeded");
}

export function startKeepAliveJob(schedule = "0 3 * * *"): void {
  cron.schedule(schedule, () => {
    pingDatabase().catch((err) => {
      console.error("Keep-alive: database ping failed", err);
    });
  });
}
