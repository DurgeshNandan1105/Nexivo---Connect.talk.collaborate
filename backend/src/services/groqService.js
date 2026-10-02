import { translateText } from "../controllers/translate.controller.js";

let rateLimitedUntil = 0;
let lastWarningTime = 0;

/**
 * Transcribe or translate an audio slice using Groq Whisper Cloud API
 * - Primary: whisper-large-v3 (/audio/translations or /audio/transcriptions)
 * - Fallback: whisper-large-v3-turbo (/audio/transcriptions + text translation)
 * - Built-in Circuit Breaker to prevent 429 rate limit spamming
 */
export const processAudioWithGroqWhisper = async ({
  audioBuffer,
  mimeType = "audio/webm",
  spokenLang = "hi",
  targetLang = "en",
}) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("GROQ_API_KEY_NOT_CONFIGURED");
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return null;
  }

  // Circuit breaker: if we hit a rate limit recently, cool down without hammering Groq
  if (Date.now() < rateLimitedUntil) {
    return { rateLimited: true, retryAfter: Math.max(1000, rateLimitedUntil - Date.now()) };
  }

  const isDirectTranslateToEnglish = (targetLang || "en").toLowerCase() === "en";
  let endpoint = isDirectTranslateToEnglish
    ? "https://api.groq.com/openai/v1/audio/translations"
    : "https://api.groq.com/openai/v1/audio/transcriptions";
  let model = "whisper-large-v3";

  let ext = "webm";
  if (mimeType.includes("wav")) ext = "wav";
  else if (mimeType.includes("mp3")) ext = "mp3";
  else if (mimeType.includes("ogg")) ext = "ogg";

  const blob = new Blob([audioBuffer], { type: mimeType });

  const buildFormData = (chosenModel, chosenLang) => {
    const fd = new FormData();
    fd.append("model", chosenModel);
    fd.append("response_format", "json");
    fd.append("temperature", "0");
    fd.append("prompt", "Live multilingual video call speech in Hindi or English");
    if (chosenLang && chosenLang !== "auto") {
      fd.append("language", chosenLang.toLowerCase().split("-")[0]);
    }
    fd.append("file", blob, `audio_chunk.${ext}`);
    return fd;
  };

  let formData = buildFormData(
    model,
    !isDirectTranslateToEnglish && spokenLang ? spokenLang : null
  );

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: formData,
    });
  } catch (netErr) {
    console.warn("Groq network error:", netErr.message);
    return null;
  }

  // Handle 429 Rate Limit with fallback to whisper-large-v3-turbo
  if (response.status === 429) {
    // Try whisper-large-v3-turbo for transcription as fallback
    try {
      const turboFormData = buildFormData(
        "whisper-large-v3-turbo",
        spokenLang && spokenLang !== "auto" ? spokenLang : null
      );
      const turboRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: turboFormData,
      });

      if (turboRes.ok) {
        response = turboRes;
        model = "whisper-large-v3-turbo";
      } else {
        // Both models rate limited; engage circuit breaker
        rateLimitedUntil = Date.now() + 5000;
        if (Date.now() - lastWarningTime > 15000) {
          console.warn("[Groq Whisper] Rate limit reached (20 RPM limit). Cooling down for 5s (Web Speech API handling speech).");
          lastWarningTime = Date.now();
        }
        return { rateLimited: true, retryAfter: 5000 };
      }
    } catch (fallbackErr) {
      rateLimitedUntil = Date.now() + 5000;
      return { rateLimited: true, retryAfter: 5000 };
    }
  } else if (!response.ok) {
    const errorBody = await response.text();
    console.warn(`Groq Whisper API responded with ${response.status}: ${errorBody}`);
    return null;
  }

  const result = await response.json();
  const text = (result.text || "").trim();

  // Known Whisper silence hallucinations on background noise/breathing
  const SILENCE_HALLUCINATIONS = new Set([
    "झाल", "झाला", "झाली", "झाले",
    "अब यह अब", "अब यह", "अब", "यह", "अब ई", "अब ई अब ई",
    "thank you", "thank you.", "thank you very much.",
    "thanks for watching", "thanks for watching.", "thanks for watching!",
    "subtitles by", "bye", "bye bye", "you", "...", "mbc", "amara.org",
  ]);

  const isWhisperHallucination = (rawText) => {
    if (!rawText) return true;
    const clean = rawText.trim().replace(/[.,!?;:\"\'।]/g, "").trim();
    if (clean.length <= 1) return true;

    const cleanLower = clean.toLowerCase();
    if (SILENCE_HALLUCINATIONS.has(cleanLower) || SILENCE_HALLUCINATIONS.has(clean)) {
      return true;
    }

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const counts = {};
      words.forEach((w) => {
        counts[w] = (counts[w] || 0) + 1;
      });
      const maxCount = Math.max(...Object.values(counts));
      // Detect repetition loops common in Whisper on silence (e.g. "अब यह अब", "bye bye", "you you")
      if (words.length === 2 && words[0] === words[1]) return true;
      if (words.length === 3 && (words[0] === words[2] || words[0] === words[1] || words[1] === words[2])) return true;
      if (words.length === 4 && maxCount >= 2 && words[0] === words[2] && words[1] === words[3]) return true;
      if (words.length <= 6 && maxCount / words.length >= 0.5) return true;
    }
    return false;
  };

  if (isWhisperHallucination(text)) {
    return null;
  }

  if (isDirectTranslateToEnglish && model !== "whisper-large-v3-turbo") {
    return {
      translatedText: text,
      originalText: "",
      from: spokenLang || "hi",
      to: "en",
    };
  } else {
    let translated = text;
    if (targetLang && targetLang !== spokenLang) {
      try {
        const transRes = await translateText(text, targetLang, spokenLang);
        if (transRes && transRes.translatedText) {
          translated = transRes.translatedText;
        }
      } catch (e) {
        console.warn("Translation after Groq Whisper transcription error:", e);
      }
    }

    return {
      translatedText: translated,
      originalText: text,
      from: spokenLang,
      to: targetLang,
    };
  }
};
