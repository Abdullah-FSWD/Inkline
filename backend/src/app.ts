import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", authRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  };
  app.use(errorHandler);

  return app;
}
