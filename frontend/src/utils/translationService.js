import axios from "axios";
import server from "../environment";

export const INDIAN_LANGUAGES = [
  { code: "hi", speechCode: "hi-IN", name: "Hindi (हिन्दी)" },
  { code: "bn", speechCode: "bn-IN", name: "Bengali (বাংলা)" },
  { code: "te", speechCode: "te-IN", name: "Telugu (తెలుగు)" },
  { code: "mr", speechCode: "mr-IN", name: "Marathi (मराठी)" },
  { code: "ta", speechCode: "ta-IN", name: "Tamil (தமிழ்)" },
  { code: "ur", speechCode: "ur-IN", name: "Urdu (اردو)" },
  { code: "gu", speechCode: "gu-IN", name: "Gujarati (ગુજરાતી)" },
  { code: "kn", speechCode: "kn-IN", name: "Kannada (ಕನ್ನಡ)" },
  { code: "ml", speechCode: "ml-IN", name: "Malayalam (മലയാളം)" },
  { code: "pa", speechCode: "pa-IN", name: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "or", speechCode: "or-IN", name: "Odia (ଓଡ଼ିଆ)" },
  { code: "as", speechCode: "as-IN", name: "Assamese (অসমীয়া)" },
  { code: "bho", speechCode: "bho-IN", name: "Bhojpuri (भोजपुरी)" },
  { code: "mai", speechCode: "mai-IN", name: "Maithili (मैथिली)" },
  { code: "sa", speechCode: "sa-IN", name: "Sanskrit (संस्कृतम्)" },
  { code: "kok", speechCode: "kok-IN", name: "Konkani (कोंकणी)" },
  { code: "doi", speechCode: "doi-IN", name: "Dogri (डोगरी)" },
  { code: "sd", speechCode: "sd-IN", name: "Sindhi (سنڌي)" },
  { code: "ne", speechCode: "ne-IN", name: "Nepali (नेपाली)" },
  { code: "mni-Mtei", speechCode: "mni-IN", name: "Manipuri / Meitei (মৈতৈ)" },
  { code: "lus", speechCode: "lus-IN", name: "Mizo (Lushai)" },
];

export const INTERNATIONAL_LANGUAGES = [
  { code: "en", speechCode: "en-US", name: "English" },
  { code: "es", speechCode: "es-ES", name: "Spanish (Español)" },
  { code: "fr", speechCode: "fr-FR", name: "French (Français)" },
  { code: "de", speechCode: "de-DE", name: "German (Deutsch)" },
  { code: "zh-CN", speechCode: "zh-CN", name: "Chinese (Mandarin)" },
  { code: "ja", speechCode: "ja-JP", name: "Japanese (日本語)" },
  { code: "ar", speechCode: "ar-SA", name: "Arabic (العربية)" },
  { code: "ru", speechCode: "ru-RU", name: "Russian (Русский)" },
  { code: "pt", speechCode: "pt-BR", name: "Portuguese (Português)" },
  { code: "it", speechCode: "it-IT", name: "Italian (Italiano)" },
  { code: "ko", speechCode: "ko-KR", name: "Korean (한국어)" },
  { code: "tr", speechCode: "tr-TR", name: "Turkish (Türkçe)" },
];

export const SUPPORTED_LANGUAGES = [
  ...INDIAN_LANGUAGES,
  ...INTERNATIONAL_LANGUAGES,
];

const translationCache = new Map();

/**
 * Direct browser-side translation using Google's unblocked dict-chrome-ex API.
 * Has Access-Control-Allow-Origin: * built-in, avoiding server proxies, 
 * cold starts, and datacenter IP rate limits.
 */
const fetchDirectBrowserTranslation = async (text, targetLang, sourceLang = "auto") => {
  const sl = sourceLang || "auto";
  const tl = targetLang || "en";
  const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Direct Google API returned status ${response.status}`);
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

  throw new Error("Unexpected format from direct translation");
};

/**
 * Translate a piece of text to target language using Direct Browser API, Socket, or HTTP fallback
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

  // 1. Direct browser translation (fastest, ~30ms, no server dependency, 100% reliable)
  try {
    const directRes = await fetchDirectBrowserTranslation(cleanText, targetLang, sourceLang);
    if (directRes && directRes.translatedText) {
      translationCache.set(cacheKey, directRes);
      return directRes;
    }
  } catch (directErr) {
    // Proceed to Socket and HTTP fallback
  }

  // 2. Try via Socket if connected
  if (socket && socket.connected) {
    try {
      const socketPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Socket translation timeout")), 3000);
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
      if (result && result.translatedText && result.translatedText !== cleanText) {
        translationCache.set(cacheKey, result);
        return result;
      }
    } catch (e) {
      // Fallback to HTTP API
    }
  }

  // 3. HTTP Fallback via REST API
  try {
    const response = await axios.post(`${server}/api/v1/translate`, {
      text: cleanText,
      to: targetLang,
      from: sourceLang,
    });
    if (response.data && response.data.translatedText) {
      const result = {
        translatedText: response.data.translatedText,
        from: response.data.from || sourceLang,
        to: targetLang,
      };
      translationCache.set(cacheKey, result);
      return result;
    }
  } catch (error) {
    console.warn("Translation request failed:", error);
  }

  return {
    translatedText: cleanText,
    from: sourceLang,
    to: targetLang,
  };
};

// Preload available voices on browser startup
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    try {
      window.speechSynthesis.getVoices();
    } catch (e) {}
  };
}

const speechQueue = [];
let isProcessingQueue = false;

const processNextInQueue = () => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (speechQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const item = speechQueue.shift();
  if (!item || !item.text || !item.text.trim()) {
    processNextInQueue();
    return;
  }

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(item.text.trim());
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === item.langCode);
    const voiceLang = langObj ? langObj.speechCode : item.langCode;

    utterance.lang = voiceLang;
    utterance.volume = 1.0;
    utterance.rate = 1.08; // slightly brisk natural speech pace
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const matchedVoice =
        voices.find((v) => v.lang === voiceLang) ||
        voices.find((v) => v.lang.replace("_", "-").toLowerCase() === voiceLang.toLowerCase()) ||
        voices.find((v) => v.lang.startsWith(item.langCode)) ||
        voices.find((v) => v.lang.startsWith("hi")) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
    }

    utterance.onend = () => {
      setTimeout(processNextInQueue, 15);
    };

    utterance.onerror = (e) => {
      if (e.error !== "canceled" && e.error !== "interrupted") {
        console.warn("Speech queue utterance error:", e.error || e);
      }
      setTimeout(processNextInQueue, 15);
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Queue processing error:", err);
    processNextInQueue();
  }
};

/**
 * Queue translated continuous clauses to speak back-to-back without pauses or cuts
 */
export const queueTranslatedAudio = (text, langCode = "en") => {
  if (!text || !text.trim()) return;
  speechQueue.push({ text: text.trim(), langCode });
  if (!isProcessingQueue) {
    processNextInQueue();
  }
};

export const clearAudioQueue = () => {
  speechQueue.length = 0;
  isProcessingQueue = false;
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};

/**
 * Immediate one-off Text-to-Speech (for button clicks, tests, and alerts)
 */
export const speakTranslatedAudio = (text, langCode = "en") => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("SpeechSynthesis not supported in this browser");
    return;
  }

  if (!text || !text.trim()) return;

  clearAudioQueue();

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

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

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const matchedVoice =
            voices.find((v) => v.lang === voiceLang) ||
            voices.find((v) => v.lang.replace("_", "-").toLowerCase() === voiceLang.toLowerCase()) ||
            voices.find((v) => v.lang.startsWith(langCode)) ||
            voices.find((v) => v.lang.startsWith("hi")) ||
            voices.find((v) => v.lang.startsWith("en"));
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
        }

        utterance.onerror = (e) => {
          if (e.error !== "canceled" && e.error !== "interrupted") {
            console.warn("SpeechSynthesis utterance error:", e.error || e);
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch (innerErr) {
        console.warn("Error inside speakTranslatedAudio timeout:", innerErr);
      }
    }, 35);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
  }
};
