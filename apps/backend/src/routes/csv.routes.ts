import { Router } from "express";
import { z } from "zod";
import { requireDeveloper } from "../middleware/authJwt.js";
import { prisma } from "../db.js";
import { Errors } from "../utils/errors.js";
import { logger } from "../logger.js";
import {
  previewCsv,
  importCsv,
  detectBroker,
  BROKER_LABELS,
  type Broker,
} from "../services/csvImportService.js";

const router = Router();
router.use(requireDeveloper);

const BROKER_ENUM = z.enum(["fidelity", "schwab", "vanguard", "robinhood"]);

const PreviewBody = z.object({
  broker: BROKER_ENUM,
  csv: z.string().min(10, "CSV content is empty"),
});

const ImportBody = z.object({
  // broker is now optional — the handler falls back to detectBroker()
  broker: BROKER_ENUM.optional(),
  csv: z.string().min(10, "CSV content is empty"),
});

const DetectBody = z.object({
  csv: z.string().min(10, "CSV content is empty"),
});

/** List supported brokers with their labels. */
router.get("/brokers", (_req, res) => {
  res.json({
    brokers: Object.entries(BROKER_LABELS).map(([key, label]) => ({
      key,
      label,
    })),
  });
});

/**
 * Detect the broker from CSV headers — used by the import UI to
 * pre-select the right parser without bothering the user. Returns
 * `{ broker: null, reason }` when detection is inconclusive; the UI
 * then falls back to a manual picker.
 */
router.post("/detect", (req, res, next) => {
  try {
    const { csv } = DetectBody.parse(req.body);
    const broker = detectBroker(csv);
    if (broker) {
      return res.json({ broker, label: BROKER_LABELS[broker] });
    }
    return res.json({
      broker: null,
      reason: "unrecognized" as const,
      message:
        "Couldn't identify this CSV format — please pick the broker manually.",
    });
  } catch (e) {
    next(e);
  }
});

/** Parse a CSV without saving — used for the preview step. */
router.post("/preview", async (req, res, next) => {
  try {
    const { broker, csv } = PreviewBody.parse(req.body);
    const groups = previewCsv(broker as Broker, csv);
    const totalHoldings = groups.reduce((s, g) => s + g.positions.length, 0);
    const totalValue = groups.reduce(
      (s, g) => s + g.positions.reduce((t, p) => t + p.quantity * p.price, 0),
      0,
    );
    res.json({
      broker,
      broker_label: BROKER_LABELS[broker as Broker],
      groups,
      total_holdings: totalHoldings,
      total_value: totalValue,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Commit the parsed CSV into the user's portfolio.
 *
 * `broker` may be omitted — the handler runs `detectBroker()` as a
 * fallback. If detection still fails, the caller gets a typed 400
 * asking them to specify it manually.
 */
router.post("/import", async (req, res, next) => {
  try {
    const parsed = ImportBody.parse(req.body);
    const csv = parsed.csv;
    let broker: Broker | undefined = parsed.broker;

    if (!broker) {
      const detected = detectBroker(csv);
      if (!detected) {
        return res.status(400).json({
          error_type: "VALIDATION_ERROR",
          error_code: "BROKER_REQUIRED",
          error_message:
            "Couldn't detect broker from this CSV — please specify manually.",
        });
      }
      broker = detected;
    }

    // Request-context log right before the heavy work begins — makes
    // the Render log a one-line record of exactly what was attempted
    // even when the subsequent import fails.
    logger.info(
      {
        developerId: req.developerId,
        broker,
        csvBytes: csv.length,
      },
      "csv import request",
    );

    const dev = await prisma.developer.findUnique({ where: { id: req.developerId! } });
    if (!dev) throw Errors.unauthorized();
    const result = await importCsv(dev, broker, csv);
    res.json({ ...result, broker, broker_label: BROKER_LABELS[broker] });
  } catch (e) {
    next(e);
  }
});

export default router;
