/**
 * Gapless Web Audio API streaming player.
 * Schedules incoming Int16 / Float32 PCM audio buffers seamlessly
 * on the AudioContext timeline to avoid clicking or silence between packets.
 */
export class StreamingAudioPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.audioCtx = null;
    this.nextStartTime = 0;
  }

  init() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: this.sampleRate });
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  /**
   * Schedule and play an incoming raw 16-bit PCM chunk
   * @param {ArrayBuffer} arrayBuffer
   */
  playPcmChunk(arrayBuffer) {
    this.init();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return;

    try {
      const int16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(int16.length);

      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      const audioBuffer = this.audioCtx.createBuffer(1, float32.length, this.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioCtx.destination);

      const currentTime = this.audioCtx.currentTime;
      // 40ms jitter buffer ensures smooth continuous audio playback
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime + 0.04;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    } catch (e) {
      console.warn("Error playing streaming audio chunk:", e);
    }
  }

  stop() {
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (e) {}
      this.audioCtx = null;
      this.nextStartTime = 0;
    }
  }
}

export const streamingPlayer = new StreamingAudioPlayer(24000);
