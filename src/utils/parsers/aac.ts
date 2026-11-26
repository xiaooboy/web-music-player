import type { Track } from "../../types";

/**
 * 解析 ADTS AAC 时长（CBR 估算）。
 * 支持跳过文件头可能存在的 ID3v2 标签，ADTS 每帧固定 1024 个采样。
 */
const ADTS_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000,
  11025, 8000, 7350,
];

interface AdtsFrame {
  sampleRate: number;
  frameLength: number;
}

function parseAdtsHeader(bytes: Uint8Array, offset = 0): AdtsFrame | null {
  if (bytes.length - offset < 7) return null;
  // 同步字 12 bits = 0xFFF
  if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xf0) !== 0xf0) return null;

  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x0f;
  const sampleRate = ADTS_SAMPLE_RATES[sampleRateIndex];
  if (!sampleRate) return null;

  // frame length: 13 bits，跨 bytes[3]..bytes[5]
  const frameLength =
    ((bytes[offset + 3] & 0x03) << 11) |
    (bytes[offset + 4] << 3) |
    ((bytes[offset + 5] >> 5) & 0x07);
  if (frameLength < 7) return null;

  return { sampleRate, frameLength };
}

export async function parseAacMetadata(file: File): Promise<Partial<Track>> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 16)).arrayBuffer());
  if (head.length < 7) return {};

  let audioStart = 0;
  // 若文件头存在 ID3v2 标签，跳过该标签再读 ADTS 头
  if (
    head.length >= 10 &&
    head[0] === 0x49 && // 'I'
    head[1] === 0x44 && // 'D'
    head[2] === 0x33    // '3'
  ) {
    const id3Size =
      ((head[6] & 0x7f) << 21) |
      ((head[7] & 0x7f) << 14) |
      ((head[8] & 0x7f) << 7) |
      (head[9] & 0x7f);
    audioStart = 10 + id3Size;
  }

  let first: AdtsFrame | null = null;
  if (audioStart === 0) {
    first = parseAdtsHeader(head, 0);
  } else if (audioStart + 7 <= file.size) {
    const adtsBytes = new Uint8Array(
      await file.slice(audioStart, audioStart + 9).arrayBuffer(),
    );
    first = parseAdtsHeader(adtsBytes, 0);
  }
  if (!first) return {};

  const audioBytes = Math.max(0, file.size - audioStart);
  const estimatedFrames = Math.floor(audioBytes / first.frameLength);
  if (estimatedFrames <= 0) return {};

  return {
    duration: (estimatedFrames * 1024) / first.sampleRate,
    durationEstimated: true,
  };
}
