import axios from "axios";
import server from "../environment";

export const SUPPORTED_LANGUAGES = [
  { code: "en", speechCode: "en-US", name: "English" },
  { code: "es", speechCode: "es-ES", name: "Spanish (Español)" },
  { code: "hi", speechCode: "hi-IN", name: "Hindi (हिन्दी)" },
  { code: "fr", speechCode: "fr-FR", name: "French (Français)" },
  { code: "de", speechCode: "de-DE", name: "German (Deutsch)" },
  { code: "zh-CN", speechCode: "zh-CN", name: "Chinese (Mandarin)" },
  { code: "ja", speechCode: "ja-JP", name: "Japanese (日本語)" },
  { code: "ar", speechCode: "ar-SA", name: "Arabic (العربية)" },
  { code: "ru", speechCode: "ru-RU", name: "Russian (Русский)" },
  { code: "pt", speechCode: "pt-BR", name: "Portuguese (Português)" },
  { code: "it", speechCode: "it-IT", name: "Italian (Italiano)" },
  { code: "ko", speechCode: "ko-KR", name: "Korean (한국어)" },
  { code: "bn", speechCode: "bn-IN", name: "Bengali (বাংলা)" },
  { code: "ur", speechCode: "ur-PK", name: "Urdu (اردو)" },
  { code: "tr", speechCode: "tr-TR", name: "Turkish (Türkçe)" },
];

const translationCache = new Map();

/**
 * Translate a piece of text to target language using Socket or HTTP fallback
 */
export const translateText = async (text, targetLang = "en", sourceLang = "auto", socket = null) => {
  if (!text || !text.trim()) {
    return { translatedText: text, from: sourceLang, to: targetLang };
  }

  const cleanText = text.trim();
  const cacheKey = `${sourceLang}_${targetLang}_${cleanText}`;

  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  // 1. Try via Socket if connected
  if (socket && socket.connected) {
    try {
      const socketPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Socket translation timeout")), 4000);
        socket.emit("translate-text", { text: cleanText, to: targetLang, from: sourceLang }, (err, result) => {
          clearTimeout(timer);
          if (err || !result) {
            reject(new Error(err || "Failed to translate via socket"));
          } else {
            resolve(result);
          }
        });
      });

      const result = await socketPromise;
      translationCache.set(cacheKey, result);
      return result;
    } catch (e) {
      // Fallback to HTTP API
    }
  }

  // 2. HTTP Fallback via REST API
  try {
    const response = await axios.post(`${server}/api/v1/translate`, {
      text: cleanText,
      to: targetLang,
      from: sourceLang,
    });
    const result = {
      translatedText: response.data.translatedText || cleanText,
      from: response.data.from || sourceLang,
      to: targetLang,
    };
    translationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn("Translation request failed:", error);
    return {
      translatedText: cleanText,
      from: sourceLang,
      to: targetLang,
    };
  }
};

// Preload available voices on browser startup
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    try {
      window.speechSynthesis.getVoices();
    } catch (e) {}
  };
}

/**
 * Text-to-Speech (Audio Voice Dubbing) for live translated audio
 */
export const speakTranslatedAudio = (text, langCode = "en") => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("SpeechSynthesis not supported in this browser");
    return;
  }

  if (!text || !text.trim()) return;

  try {
    // Unpause if stuck (common Chromium issue)
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Cancel ongoing speech if already speaking
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    // Micro-delay ensures Chrome voice queue is completely clean before speaking
    setTimeout(() => {
      try {
        const cleanText = text.trim();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
        const voiceLang = langObj ? langObj.speechCode : langCode;

        utterance.lang = voiceLang;
        utterance.volume = 1.0;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        // Try selecting the best matching voice
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const matchedVoice =
            voices.find((v) => v.lang === voiceLang) ||
            voices.find((v) => v.lang.startsWith(langCode)) ||
            voices.find((v) => v.lang.startsWith("en"));

          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
        }

        utterance.onerror = (e) => {
          console.warn("SpeechSynthesis utterance error:", e);
        };

        window.speechSynthesis.speak(utterance);
      } catch (innerErr) {
        console.warn("Error inside speakTranslatedAudio timeout:", innerErr);
      }
    }, 40);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
  }
};
