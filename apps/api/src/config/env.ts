import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  TERMINAL_PORT: z.coerce.number().default(4010),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  ADMIN_LOGIN_NAME: z.string().min(3).default("admin"),
  ADMIN_PASSWORD: z.string().min(8).default("Admin1234!"),
  ADMIN_NAME: z.string().min(1).default("System Admin"),
  ADMIN_EMAIL: z.string().email().default("admin@example.com")
});

export const env = schema.parse(process.env);
