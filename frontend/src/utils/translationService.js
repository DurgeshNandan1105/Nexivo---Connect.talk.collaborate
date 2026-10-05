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

const notifySpeechActivity = (isSpeaking, provider = null) => {
  speechActivityCallbacks.forEach((cb) => {
    try {
      cb(isSpeaking, provider);
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

const loadSpeechSynthesisVoices = async () => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];

  const synth = window.speechSynthesis;
  const availableVoices = synth.getVoices();
  if (availableVoices.length) return availableVoices;

  // Chromium can return an empty list until its asynchronous voiceschanged event.
  await new Promise((resolve) => {
    let finished = false;
    let timeout = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      synth.removeEventListener?.("voiceschanged", onVoicesChanged);
      resolve();
    };
    const onVoicesChanged = () => {
      if (synth.getVoices().length) finish();
    };

    synth.addEventListener?.("voiceschanged", onVoicesChanged);
    timeout = setTimeout(finish, 1200);
    if (synth.getVoices().length) finish();
  });

  return synth.getVoices();
};

const findBestVoice = async (langCode, voiceLang) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = await loadSpeechSynthesisVoices();
  if (!voices || voices.length === 0) return null;

  const mappedCode = TTS_LANGUAGE_MAP[langCode] || langCode;
  const targetLangLower = (voiceLang || mappedCode || "en").replace("_", "-").toLowerCase();
  const shortCode = targetLangLower.split("-")[0];

  const matchingVoices = voices
    .map((voice) => {
      const voiceLang = (voice.lang || "").replace("_", "-").toLowerCase();
      let languageScore = 0;
      if (voiceLang === targetLangLower) languageScore = 300;
      else if (voiceLang.startsWith(`${shortCode}-`) || voiceLang === shortCode) languageScore = 200;
      else if (voiceLang.includes(shortCode)) languageScore = 100;
      if (!languageScore) return null;

      const name = (voice.name || "").toLowerCase();
      // Google browser voices have produced beeps instead of speech on some
      // devices. Never select them explicitly; let the browser fall back to a
      // system voice when no compatible non-Google voice is listed.
      if (/google/.test(name)) return null;

      let qualityScore = 0;
      if (/natural|neural/.test(name)) qualityScore += 120;
      if (/microsoft/.test(name)) qualityScore += 80;
      if (/online/.test(name)) qualityScore += 20;
      if (voice.localService) qualityScore += 10;

      return { voice, score: languageScore + qualityScore };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return matchingVoices[0]?.voice || null;
};

/**
 * Speak through the browser's selected system voice
 */
const playWithWebSpeech = (cleanText, langCode, matchedVoice = null) => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return reject(new Error("Browser speech synthesis is unavailable"));
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

      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
      const provider = matchedVoice?.name || "Browser speech synthesis";

      window._activeSpeechUtterance = utterance;

      let hasFinished = false;
      let hasStarted = false;
      const done = (error = null) => {
        if (hasFinished) return;
        hasFinished = true;
        window._activeSpeechUtterance = null;
        notifySpeechActivity(false, error || !hasStarted ? null : provider);
        if (error) reject(error);
        else resolve();
      };

      utterance.onstart = () => {
        hasStarted = true;
        notifySpeechActivity(true, provider);
      };

      utterance.onend = () => done();
      utterance.onerror = (e) => {
        if (e.error === "canceled" || e.error === "interrupted") return done();
        const error = new Error(`Browser speech failed: ${e.error || "unknown error"}`);
        console.warn(error.message);
        done(error);
      };

      // Watchdog timer in case Chrome onend never fires
      const timeoutMs = Math.max(3000, Math.min(18000, cleanText.length * 90));
      setTimeout(() => {
        if (!hasFinished) {
          try {
            window.speechSynthesis.resume();
          } catch (e) {}
          if (hasStarted) {
            done();
          } else {
            try { window.speechSynthesis.cancel(); } catch (e) {}
            done(new Error("Browser speech did not start"));
          }
        }
      }, timeoutMs);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("playWithWebSpeech error:", err);
      reject(err);
    }
  });
};

const playItem = async (cleanText, langCode) => {
  const langObj = SUPPORTED_LANGUAGES.find((language) => language.code === langCode);
  const voiceLang = langObj ? langObj.speechCode : langCode;
  const deviceVoice = await findBestVoice(langCode, voiceLang);
  const languageName = langObj?.name || voiceLang;

  if (!deviceVoice) {
    // Some browsers can speak with their default/system voice even when their
    // voice list is empty or does not contain an exact language match. Keep the
    // requested utterance language so the browser can select the closest voice.
    console.warn(`No listed device voice for ${languageName}; trying the browser default voice.`);
  }

  try {
    // Use browser/OS speech only. Remote Google TTS returned beeps for some
    // device/language combinations instead of translated speech.
    await playWithWebSpeech(cleanText, langCode, deviceVoice);
  } catch (err) {
    notifySpeechActivity(false, `Speech unavailable for ${languageName}`);
    console.warn(`Speech unavailable for ${languageName}:`, err.message);
    throw err;
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
