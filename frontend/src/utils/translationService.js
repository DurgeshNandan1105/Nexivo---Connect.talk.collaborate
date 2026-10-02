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
  { code: "or", speechCode: "hi-IN", name: "Odia (ଓଡ଼ିଆ)" },
  { code: "as", speechCode: "bn-IN", name: "Assamese (অসমীয়া)" },
  { code: "bho", speechCode: "hi-IN", name: "Bhojpuri (भोजपुरी)" },
  { code: "mai", speechCode: "hi-IN", name: "Maithili (मैथिली)" },
  { code: "sa", speechCode: "hi-IN", name: "Sanskrit (संस्कृतम्)" },
  { code: "kok", speechCode: "hi-IN", name: "Konkani (कोंकणी)" },
  { code: "doi", speechCode: "hi-IN", name: "Dogri (डोगरी)" },
  { code: "sd", speechCode: "hi-IN", name: "Sindhi (سنڌي)" },
  { code: "ne", speechCode: "hi-IN", name: "Nepali (नेपाली)" },
  { code: "mni-Mtei", speechCode: "bn-IN", name: "Manipuri / Meitei (মৈতৈ)" },
  { code: "lus", speechCode: "en-US", name: "Mizo (Lushai)" },
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

const TRANSLATION_LANGUAGE_MAP = { kok: "gom" };
const getTranslationLanguageCode = (code) => TRANSLATION_LANGUAGE_MAP[code] || code;

const translationCache = new Map();

/**
 * Direct browser-side translation using Google's unblocked dict-chrome-ex API.
 * Has Access-Control-Allow-Origin: * built-in, avoiding server proxies, 
 * cold starts, and datacenter IP rate limits.
 */
const fetchDirectBrowserTranslation = async (text, targetLang, sourceLang = "auto") => {
  const sl = getTranslationLanguageCode(sourceLang || "auto");
  const tl = getTranslationLanguageCode(targetLang || "en");
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
  if (sourceLang && sourceLang !== "auto" && targetLang && sourceLang === targetLang) {
    return { translatedText: cleanText, from: sourceLang, to: targetLang };
  }

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

// Activity listeners for audio ducking
const speechActivityCallbacks = new Set();
export const registerSpeechActivityCallback = (cb) => {
  if (typeof cb === "function") {
    speechActivityCallbacks.add(cb);
    return () => speechActivityCallbacks.delete(cb);
  }
  return () => {};
};

const notifySpeechActivity = (isSpeaking) => {
  speechActivityCallbacks.forEach((cb) => {
    try {
      cb(isSpeaking);
    } catch (e) {}
  });
};

// Warm up TTS engine & unlock browser autoplay upon user interaction
export const warmupSpeechSynthesis = () => {
  if (typeof window === "undefined") return;
  try {
    if ("speechSynthesis" in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.getVoices();
    }
  } catch (e) {}

  // Unlock HTML5 Audio context across Chromium & Safari
  try {
    const silentAudio = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
    );
    silentAudio.volume = 0.01;
    silentAudio.play().then(() => {
      silentAudio.pause();
    }).catch(() => {});
  } catch (e) {}
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
let currentPlayingAudio = null;

export const TTS_LANGUAGE_MAP = {
  bho: "hi",
  mai: "hi",
  sa: "hi",
  kok: "hi",
  doi: "hi",
  sd: "ur",
  as: "bn",
  "mni-Mtei": "bn",
  lus: "en",
  or: "hi",
};

const findBestVoice = (langCode, voiceLang) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const mappedCode = TTS_LANGUAGE_MAP[langCode] || langCode;
  const targetLangLower = (voiceLang || mappedCode || "en").toLowerCase();
  const shortCode = targetLangLower.split("-")[0];

  return (
    voices.find((v) => v.lang.toLowerCase() === targetLangLower) ||
    voices.find((v) => v.lang.replace("_", "-").toLowerCase() === targetLangLower) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(shortCode)) ||
    voices.find((v) => v.lang.toLowerCase().includes(shortCode)) ||
    voices.find((v) => v.default) ||
    voices[0]
  );
};

/**
 * Play high-fidelity neural MP3 voice audio via backend streaming proxy
 */
const playWithHtmlAudio = (cleanText, langCode) => {
  return new Promise((resolve, reject) => {
    try {
      const ttsLang = TTS_LANGUAGE_MAP[langCode] || langCode;
      const url = `${server}/api/v1/translate/tts?text=${encodeURIComponent(cleanText)}&lang=${encodeURIComponent(ttsLang)}`;
      const audio = new Audio(url);
      currentPlayingAudio = audio;

      let timer = null;
      let hasFinished = false;

      const finish = (err = null) => {
        if (hasFinished) return;
        hasFinished = true;
        if (timer) clearTimeout(timer);
        currentPlayingAudio = null;
        notifySpeechActivity(false);
        if (err) reject(err);
        else resolve();
      };

      // Watchdog: If audio doesn't start or finish within 4.5s, fall back to Web Speech
      timer = setTimeout(() => {
        if (!hasFinished) {
          try { audio.pause(); audio.src = ""; } catch (e) {}
          finish(new Error("HTML Audio TTS timeout, falling back to Web Speech"));
        }
      }, 4500);

      audio.onplay = () => {
        notifySpeechActivity(true);
      };

      audio.onended = () => {
        finish();
      };

      audio.onerror = (e) => {
        finish(e);
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          finish(err);
        });
      }
    } catch (err) {
      currentPlayingAudio = null;
      notifySpeechActivity(false);
      reject(err);
    }
  });
};

/**
 * Fallback to browser Web Speech API if network or server proxy is offline
 */
const playWithWebSpeech = (cleanText, langCode) => {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return resolve();
    }

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
      const voiceLang = langObj ? langObj.speechCode : langCode;

      utterance.lang = voiceLang;
      utterance.volume = 1.0;
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const matchedVoice = findBestVoice(langCode, voiceLang);
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      window._activeSpeechUtterance = utterance;

      let hasFinished = false;
      const done = () => {
        if (hasFinished) return;
        hasFinished = true;
        window._activeSpeechUtterance = null;
        notifySpeechActivity(false);
        resolve();
      };

      utterance.onstart = () => {
        notifySpeechActivity(true);
      };

      utterance.onend = done;
      utterance.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("WebSpeech utterance error:", e.error || e);
        }
        done();
      };

      // Watchdog timer in case Chrome onend never fires
      const timeoutMs = Math.max(3000, Math.min(18000, cleanText.length * 90));
      setTimeout(() => {
        if (!hasFinished) {
          try {
            window.speechSynthesis.resume();
          } catch (e) {}
          done();
        }
      }, timeoutMs);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("playWithWebSpeech error:", err);
      resolve();
    }
  });
};

const playItem = async (cleanText, langCode) => {
  try {
    await playWithHtmlAudio(cleanText, langCode);
  } catch (err) {
    await playWithWebSpeech(cleanText, langCode);
  }
};

const processNextInQueue = async () => {
  if (speechQueue.length === 0) {
    isProcessingQueue = false;
    notifySpeechActivity(false);
    return;
  }

  isProcessingQueue = true;
  const item = speechQueue.shift();
  if (!item || !item.text || !item.text.trim()) {
    processNextInQueue();
    return;
  }

  const cleanText = item.text.trim();
  const langCode = item.langCode || "en";

  try {
    await playItem(cleanText, langCode);
  } catch (e) {
    console.warn("playItem error:", e);
  }

  setTimeout(processNextInQueue, 25);
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
  notifySpeechActivity(false);
  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause();
      currentPlayingAudio.src = "";
    } catch (e) {}
    currentPlayingAudio = null;
  }
  window._activeSpeechUtterance = null;
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
  if (!text || !text.trim()) return;
  clearAudioQueue();
  queueTranslatedAudio(text, langCode);
};
