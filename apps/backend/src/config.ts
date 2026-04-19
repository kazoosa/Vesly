import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16),
  LINK_TOKEN_SECRET: z.string().min(16),
  WEBHOOK_SIGNING_SECRET: z.string().min(16),
  ALPHA_VANTAGE_API_KEY: z.string().optional().default(""),
  SNAPTRADE_CLIENT_ID: z.string().optional().default(""),
  SNAPTRADE_CONSUMER_KEY: z.string().optional().default(""),
  SNAPTRADE_WEBHOOK_SECRET: z.string().optional().default(""),
  PORT: z.coerce.number().default(3001),
  DASHBOARD_URL: z.string().url().default("http://localhost:5174"),
  LINK_UI_URL: z.string().url().default("http://localhost:5175"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5174,http://localhost:5175")
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  ENVIRONMENT: z.enum(["sandbox", "development", "production"]).default("sandbox"),
  NODE_ENV: z.string().default("development"),
});

export const config = configSchema.parse(process.env);
export type AppConfig = typeof config;
