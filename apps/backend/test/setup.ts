import { execSync } from "node:child_process";

// Runs before all test files.
process.env.NODE_ENV = "test";
process.env.ENVIRONMENT = process.env.ENVIRONMENT ?? "sandbox";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://finlink:finlink@localhost:5433/finlink_test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test_jwt_secret_test_jwt_secret_test";
process.env.LINK_TOKEN_SECRET = process.env.LINK_TOKEN_SECRET ?? "test_link_secret_test_link_secret";
process.env.WEBHOOK_SIGNING_SECRET =
  process.env.WEBHOOK_SIGNING_SECRET ?? "test_webhook_secret_test_webhook_secret";

try {
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env },
  });
} catch {
  // eslint-disable-next-line no-console
  console.warn("[test setup] prisma migrate deploy failed — is postgres running?");
}
