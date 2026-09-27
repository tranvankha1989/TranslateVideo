export const convertToWav = async (file: Blob | File): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  // Khởi tạo AudioContext với sampleRate 24000 (chuẩn của OmniVoice)
  const audioContext = new (
    window.AudioContext || (window as any).webkitAudioContext
  )({ sampleRate: 24000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  return audioBufferToWav(audioBuffer);
};

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = 1; // Mono channel
  const sampleRate = buffer.sampleRate;
  
  // Tối ưu: Cắt lấy tối đa 10 giây đầu tiên
  const MAX_SECONDS = 10;
  const maxSamples = MAX_SECONDS * sampleRate;
  const actualSamples = Math.min(buffer.length, maxSamples);
  
  const dataLength = actualSamples * numOfChan * 2;
  const bufferLength = dataLength + 44;
  const bufferArr = new ArrayBuffer(bufferLength);
  const view = new DataView(bufferArr);

  let offset = 0;

  function setUint16(data: number) {
    view.setUint16(offset, data, true);
    offset += 2;
  }

  function setUint32(data: number) {
    view.setUint32(offset, data, true);
    offset += 4;
  }

  // RIFF chunk descriptor
  setUint32(0x46464952); // "RIFF"
  setUint32(bufferLength - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  // fmt sub-chunk
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded)

  // data sub-chunk
  setUint32(0x61746164); // "data" - chunk
  setUint32(dataLength); // chunk length

  // Write interleaved data (mix down to mono if multiple channels)
  const channelData = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  let pos = 0;
  while (pos < actualSamples) {
    let sample = 0;
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      sample += channelData[i][pos];
    }
    sample = sample / buffer.numberOfChannels; // average channels for mono

    // Clamp to -1..1
    sample = Math.max(-1, Math.min(1, sample));

    // Convert to 16-bit PCM
    sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
    view.setInt16(offset, sample, true);
    offset += 2;
    pos++;
  }

  return new Blob([bufferArr], { type: "audio/wav" });
}

/**
 * Phát âm thanh chuông thông báo nhẹ nhàng, vui tươi khi hoàn thành tác vụ (Success Chime).
 * Sử dụng Web Audio API không phụ thuộc file mp3 ngoài, hoạt động mượt mà trên mọi trình duyệt.
 */
export const playCompletionSound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Hợp âm 4 nốt vươn cao: G5 (784Hz) -> B5 (988Hz) -> D6 (1175Hz) -> G6 (1568Hz)
    const notes = [
      { freq: 783.99, start: 0.0, dur: 0.18, vol: 0.18 },
      { freq: 987.77, start: 0.12, dur: 0.18, vol: 0.20 },
      { freq: 1174.66, start: 0.24, dur: 0.22, vol: 0.22 },
      { freq: 1567.98, start: 0.36, dur: 0.65, vol: 0.25 },
    ];

    notes.forEach(({ freq, start, dur, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    });
  } catch (err) {
    console.debug("Không thể phát âm thanh hoàn tất:", err);
  }
};

/**
 * Phát âm thanh thông báo ngắn (ví dụ: tạo phụ đề xong, nạp file thành công).
 */
export const playNotificationSound = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const notes = [
      { freq: 880, start: 0.0, dur: 0.15, vol: 0.16 }, // A5
      { freq: 1318.51, start: 0.10, dur: 0.35, vol: 0.20 }, // E6
    ];

    notes.forEach(({ freq, start, dur, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    });
  } catch (err) {
    console.debug("Không thể phát âm thanh thông báo:", err);
  }
};
