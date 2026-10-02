import { Router } from "express";
import { handleTranslateRequest, getLanguages, handleTtsRequest } from "../controllers/translate.controller.js";

const router = Router();

router.route("/").post(handleTranslateRequest);
router.route("/languages").get(getLanguages);
router.route("/tts").get(handleTtsRequest);

export default router;
