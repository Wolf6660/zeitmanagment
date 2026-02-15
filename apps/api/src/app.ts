import cors from "cors";
import express from "express";
import morgan from "morgan";
import { authRouter } from "./modules/auth/routes.js";
import { healthRouter } from "./modules/health/routes.js";
import { timeRouter } from "./modules/time/routes.js";
import { leaveRouter } from "./modules/leave/routes.js";
import { employeesRouter } from "./modules/employees/routes.js";
import { adminRouter } from "./modules/admin/routes.js";
import { terminalRouter } from "./modules/terminal/routes.js";
import { env } from "./config/env.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(express.json());
  app.use(morgan("dev"));

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/time", timeRouter);
  app.use("/api/leave", leaveRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/terminal", terminalRouter);

  return app;
}
