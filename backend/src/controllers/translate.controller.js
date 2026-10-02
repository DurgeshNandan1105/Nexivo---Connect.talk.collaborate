import { translate } from "@vitalets/google-translate-api";
import httpStatus from "http-status";

// In-memory cache for fast repeated translations
const translationCache = new Map();
const MAX_CACHE_SIZE = 2000;

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", speechCode: "en-US" },
  { code: "es", name: "Spanish (Español)", speechCode: "es-ES" },
  { code: "hi", name: "Hindi (हिन्दी)", speechCode: "hi-IN" },
  { code: "fr", name: "French (Français)", speechCode: "fr-FR" },
  { code: "de", name: "German (Deutsch)", speechCode: "de-DE" },
  { code: "zh-CN", name: "Chinese (Mandarin)", speechCode: "zh-CN" },
  { code: "ja", name: "Japanese (日本語)", speechCode: "ja-JP" },
  { code: "ar", name: "Arabic (العربية)", speechCode: "ar-SA" },
  { code: "ru", name: "Russian (Русский)", speechCode: "ru-RU" },
  { code: "pt", name: "Portuguese (Português)", speechCode: "pt-BR" },
  { code: "it", name: "Italian (Italiano)", speechCode: "it-IT" },
  { code: "ko", name: "Korean (한국어)", speechCode: "ko-KR" },
  { code: "bn", name: "Bengali (বাংলা)", speechCode: "bn-IN" },
  { code: "ur", name: "Urdu (اردو)", speechCode: "ur-PK" },
  { code: "tr", name: "Turkish (Türkçe)", speechCode: "tr-TR" },
];

/**
 * Fetch translation from high-speed, unblocked Google API endpoint
 */
const fetchDirectTranslation = async (text, targetLang, sourceLang = "auto") => {
  const sl = sourceLang || "auto";
  const tl = targetLang || "en";
  const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Google API returned status ${response.status}`);
  }

  const data = await response.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const translatedText = data[0].map((chunk) => chunk[0]).join("");
    const detectedSource = data[2] || sourceLang;
    return {
      translatedText,
      from: detectedSource,
      to: targetLang,
    };
  }

  throw new Error("Unexpected response structure from translation service");
};

/**
 * Core translation helper with caching & dual-engine fallback
 * @param {string} text - text to translate
 * @param {string} targetLang - target language code (e.g. 'es', 'en', 'hi')
 * @param {string} [sourceLang] - optional source language code ('auto' by default)
 * @returns {Promise<{ translatedText: string, from: string, to: string }>}
 */
export const translateText = async (text, targetLang = "en", sourceLang = "auto") => {
  if (!text || typeof text !== "string" || !text.trim()) {
    return { translatedText: "", from: sourceLang, to: targetLang };
  }

  const cleanText = text.trim();
  const cacheKey = `${sourceLang || "auto"}_${targetLang}_${cleanText}`;

  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  // 1. Primary: Direct high-speed endpoint (no 429 captcha issues)
  try {
    const result = await fetchDirectTranslation(cleanText, targetLang, sourceLang);
    if (result && result.translatedText) {
      if (translationCache.size >= MAX_CACHE_SIZE) {
        const firstKey = translationCache.keys().next().value;
        translationCache.delete(firstKey);
      }
      translationCache.set(cacheKey, result);
      return result;
    }
  } catch (directErr) {
    console.warn("Direct translation fallback triggered:", directErr.message);
  }

  // 2. Secondary: @vitalets/google-translate-api
  try {
    const options = { to: targetLang };
    if (sourceLang && sourceLang !== "auto") {
      options.from = sourceLang;
    }

    const res = await translate(cleanText, options);
    const result = {
      translatedText: res.text || cleanText,
      from: res.raw?.src || sourceLang,
      to: targetLang,
    };

    if (translationCache.size >= MAX_CACHE_SIZE) {
      const firstKey = translationCache.keys().next().value;
      translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, result);

    return result;
  } catch (err) {
    console.error("All translation providers failed:", err.message);
    // Graceful fallback to original text so app never crashes
    return {
      translatedText: cleanText,
      from: sourceLang,
      to: targetLang,
      error: err.message,
    };
  }
};

/**
 * Express REST Controller: POST /api/v1/translate
 */
export const handleTranslateRequest = async (req, res) => {
  const { text, to = "en", from = "auto" } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: "Text is required for translation",
    });
  }

  try {
    const result = await translateText(text, to, from);
    return res.status(httpStatus.OK).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      message: `Failed to translate text: ${error.message}`,
    });
  }
};

/**
 * Express REST Controller: GET /api/v1/translate/languages
 */
export const getLanguages = (req, res) => {
  return res.status(httpStatus.OK).json({
    languages: SUPPORTED_LANGUAGES,
  });
};

/**
 * Express REST Controller: GET /api/v1/translate/tts?text=...&lang=...
 * Proxies Google Translate TTS audio as audio/mpeg to bypass browser CORS & Referer checks
 */
export const handleTtsRequest = async (req, res) => {
  try {
    const text = req.query.text || req.query.q;
    const lang = req.query.lang || req.query.tl || "en";

    if (!text || !text.trim()) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: "Text parameter is required" });
    }

    const cleanText = text.trim();
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(cleanText)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ message: "Failed to fetch speech audio from TTS upstream" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("TTS Proxy error:", err);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: err.message });
  }
};
