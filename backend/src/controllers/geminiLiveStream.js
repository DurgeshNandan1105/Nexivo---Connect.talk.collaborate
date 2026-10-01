/**
 * Gemini 2.0 Multimodal Live Streaming Controller.
 * Establishes a bidirectional WebSocket connection to Google's Multimodal Live API
 * for ultra-low latency real-time Speech-to-Speech translation (raw PCM in -> raw PCM out).
 */

const GEMINI_LIVE_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

export class GeminiLiveSession {
  constructor(apiKey, sourceLang = "hi", targetLang = "en", onAudioChunk = null) {
    this.apiKey = apiKey;
    this.sourceLang = sourceLang;
    this.targetLang = targetLang;
    this.onAudioChunk = onAudioChunk;
    this.ws = null;
    this.isConnected = false;
  }

  connect() {
    if (!this.apiKey) {
      console.warn("GEMINI_API_KEY is not set. Gemini Live streaming disabled.");
      return;
    }

    try {
      const url = `${GEMINI_LIVE_URL}?key=${this.apiKey}`;
      this.ws = new globalThis.WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.sendInitialConfig();
      };

      this.ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          const parts = response.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData && part.inlineData.mimeType?.startsWith("audio/pcm")) {
                const base64Audio = part.inlineData.data;
                const buffer = Buffer.from(base64Audio, "base64");
                if (typeof this.onAudioChunk === "function") {
                  this.onAudioChunk(buffer);
                }
              }
            }
          }
        } catch (e) {
          console.warn("Error parsing Gemini live message:", e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn("Gemini live WebSocket error:", err.message || err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
      };
    } catch (err) {
      console.warn("Failed to create Gemini live session:", err);
    }
  }

  sendInitialConfig() {
    if (!this.ws || this.ws.readyState !== 1) return;

    const setupMessage = {
      setup: {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              },
            },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: `You are an ultra-low latency real-time voice interpreter. The speaker is speaking in ${this.sourceLang}. Translate everything immediately into ${this.targetLang} and stream back the translated audio with no preamble, commentary, or delay.`,
            },
          ],
        },
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
  }

  sendAudioChunk(pcmChunkBuffer) {
    if (!this.ws || this.ws.readyState !== 1) return;

    const base64Audio = Buffer.from(pcmChunkBuffer).toString("base64");
    const realtimeInput = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64Audio,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(realtimeInput));
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
      this.isConnected = false;
    }
  }
}
