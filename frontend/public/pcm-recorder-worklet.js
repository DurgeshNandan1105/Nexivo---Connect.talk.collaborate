/**
 * AudioWorkletProcessor that captures continuous microphone audio
 * and converts Float32 audio samples into 16,000Hz 16-bit Mono Linear PCM chunks.
 */
class PCMRecorderWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    // 2048 samples = ~128ms at 16kHz
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bytesWritten = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bytesWritten++] = channelData[i];

      if (this.bytesWritten >= this.bufferSize) {
        // Convert Float32 [-1.0, 1.0] to 16-bit Signed Linear PCM
        const pcm16 = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Send binary buffer to main thread
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this.bytesWritten = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder-worklet", PCMRecorderWorklet);
