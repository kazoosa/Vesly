import { Router } from "express";
import { listInstitutions, getInstitution } from "../services/institutionService.js";
import { Errors } from "../utils/errors.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query : undefined;
    const count = Math.min(100, Number(req.query.count ?? 50));
    const offset = Number(req.query.offset ?? 0);
    const { institutions, total } = await listInstitutions({ query, count, offset });
    res.json({ institutions, total });
  } catch (e) {
    next(e);
  }
});

router.get("/search", async (req, res, next) => {
  try {
    const query = String(req.query.query ?? "");
    if (!query) throw Errors.badRequest("query required");
    const { institutions } = await listInstitutions({ query, count: 10 });
    res.json({ institutions });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const inst = await getInstitution(req.params.id);
    if (!inst) throw Errors.notFound("Institution");
    res.json(inst);
  } catch (e) {
    next(e);
  }
});

export default router;
