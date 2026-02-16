import cors from "cors";
import express from "express";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
import { authRouter } from "./modules/auth/routes.js";
import { healthRouter } from "./modules/health/routes.js";
import { timeRouter } from "./modules/time/routes.js";
import { leaveRouter } from "./modules/leave/routes.js";
import { employeesRouter } from "./modules/employees/routes.js";
import { adminRouter } from "./modules/admin/routes.js";
import { terminalRouter } from "./modules/terminal/routes.js";
import { publicRouter } from "./modules/public/routes.js";
import { env } from "./config/env.js";

export function createApp() {
  const app = express();
  const allowAnyOrigin = env.WEB_ORIGIN === "*";
  const uploadDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  app.use(cors({ origin: allowAnyOrigin ? true : env.WEB_ORIGIN }));
  app.use(express.json({ limit: "12mb" }));
  app.use(morgan("dev"));
  app.use("/uploads", express.static(uploadDir));

  app.use("/api/health", healthRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/time", timeRouter);
  app.use("/api/leave", leaveRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/terminal", terminalRouter);

  return app;
}
