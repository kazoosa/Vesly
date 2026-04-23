import express from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { config } from "./config.js";
import { requestContext } from "./middleware/requestContext.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import applicationsRoutes from "./routes/applications.routes.js";
import linkRoutes from "./routes/link.routes.js";
import institutionsRoutes from "./routes/institutions.routes.js";
import itemsRoutes from "./routes/items.routes.js";
import accountsRoutes from "./routes/accounts.routes.js";
import transactionsRoutes from "./routes/transactions.routes.js";
import investmentsRoutes from "./routes/investments.routes.js";
import identityRoutes from "./routes/identity.routes.js";
import incomeRoutes from "./routes/income.routes.js";
import sandboxRoutes from "./routes/sandbox.routes.js";
import pricesRoutes from "./routes/prices.routes.js";
import portfolioRoutes from "./routes/portfolio.routes.js";
import snaptradeRoutes from "./routes/snaptrade.routes.js";
import csvRoutes from "./routes/csv.routes.js";
import demoRoutes from "./routes/demo.routes.js";
import stocksRoutes from "./routes/stocks.routes.js";
import { swaggerSpec } from "./swagger.js";

export function createApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (config.CORS_ORIGINS.includes(origin)) return cb(null, true);
        // Allow any localhost origin in sandbox for easier development
        if (config.ENVIRONMENT === "sandbox" && /^http:\/\/localhost:\d+$/.test(origin)) {
          return cb(null, true);
        }
        // Allow Vercel preview URLs (e.g. dashboard-git-main-you.vercel.app)
        // so deploy previews work without needing to rotate CORS_ORIGINS.
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
          return cb(null, true);
        }
        return cb(new Error("Not allowed by CORS"));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);
  app.use(requestLogger);

  app.get("/health", (_req, res) => res.json({ ok: true, environment: config.ENVIRONMENT }));

  // Swagger UI
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/applications", applicationsRoutes);
  app.use("/api/link", linkRoutes);
  app.use("/api/institutions", institutionsRoutes);
  app.use("/api/items", itemsRoutes);
  app.use("/api/accounts", accountsRoutes);
  app.use("/api/transactions", transactionsRoutes);
  app.use("/api/investments", investmentsRoutes);
  app.use("/api/identity", identityRoutes);
  app.use("/api/income", incomeRoutes);
  app.use("/api/sandbox", sandboxRoutes);
  app.use("/api/prices", pricesRoutes);
  app.use("/api/portfolio", portfolioRoutes);
  app.use("/api/snaptrade", snaptradeRoutes);
  app.use("/api/csv", csvRoutes);
  // Public diagnostic — no auth required.
  app.use("/api/demo", demoRoutes);
  // Live stock data (quotes, history, news, search). Auth required.
  app.use("/api/stocks", stocksRoutes);

  app.use(errorHandler);
  return app;
}
