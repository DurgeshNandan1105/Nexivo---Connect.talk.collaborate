import { Router } from "express";
import { handleTranslateRequest, getLanguages } from "../controllers/translate.controller.js";

const router = Router();

router.route("/").post(handleTranslateRequest);
router.route("/languages").get(getLanguages);

export default router;
