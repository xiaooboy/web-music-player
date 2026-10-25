import type { Track } from "../../types";

/**
 * 解析 ADTS AAC 时长（CBR 估算）。
 * ADTS 每帧固定 1024 个采样（AAC-LC），按文件大小 / 帧长估算帧数。
 */
const ADTS_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000,
  11025, 8000, 7350,
];

interface AdtsFrame {
  sampleRate: number;
  frameLength: number;
}

function parseAdtsHeader(bytes: Uint8Array): AdtsFrame | null {
  if (bytes.length < 7) return null;
  // 同步字 12 bits = 0xFFF
  if (bytes[0] !== 0xff || (bytes[1] & 0xf0) !== 0xf0) return null;

  const sampleRateIndex = (bytes[2] >> 2) & 0x0f;
  const sampleRate = ADTS_SAMPLE_RATES[sampleRateIndex];
  if (!sampleRate) return null;

  // frame length: 13 bits，跨 bytes[3]..bytes[5]
  const frameLength =
    ((bytes[3] & 0x03) << 11) | (bytes[4] << 3) | ((bytes[5] >> 5) & 0x07);
  if (frameLength < 7) return null;

  return { sampleRate, frameLength };
}

export async function parseAacMetadata(file: File): Promise<Partial<Track>> {
  const head = new Uint8Array(await file.slice(0, 9).arrayBuffer());
  const first = parseAdtsHeader(head);
  if (!first) return {};

  const estimatedFrames = Math.floor(file.size / first.frameLength);
  if (estimatedFrames <= 0) return {};

  return { duration: (estimatedFrames * 1024) / first.sampleRate };
}
