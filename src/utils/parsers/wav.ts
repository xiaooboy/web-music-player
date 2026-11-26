import { decodeBytes, decodeLatin1, readUint16LE, readUint32LE, sanitizeText } from "./shared";
import type { Track } from "../../types";

const WAV_PREFETCH_SIZE = 64 * 1024;

async function readWavRange(
  file: File,
  prefetch: Uint8Array,
  start: number,
  end: number,
): Promise<Uint8Array> {
  if (end <= prefetch.length) {
    return prefetch.subarray(start, end);
  }
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

/** 解析 RIFF LIST/INFO 元数据子块 */
function parseListInfo(bytes: Uint8Array, metadata: Partial<Track>) {
  if (bytes.length < 4 || decodeLatin1(bytes.subarray(0, 4)) !== "INFO") return;
  let offset = 4;
  while (offset + 8 <= bytes.length) {
    const id = decodeLatin1(bytes.subarray(offset, offset + 4));
    const size = readUint32LE(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(bytes.length, dataStart + size);
    const value = sanitizeText(decodeBytes(bytes.subarray(dataStart, dataEnd), 3));
    if (value) {
      if (id === "INAM" && !metadata.title) metadata.title = value;
      else if (id === "IART" && !metadata.artist) metadata.artist = value;
      else if (id === "IPRD" && !metadata.album) metadata.album = value;
    }
    offset = dataStart + size + (size % 2);
  }
}

/**
 * 解析 WAV（RIFF）时长及常见 LIST/INFO 标签。
 * 优先用 fact chunk 的采样数（非 PCM），否则 data 大小 / blockAlign；
 * duration = 采样数 / 采样率（PCM 下与 dataSize / nAvgBytesPerSec 等价）。
 */
export async function parseWavMetadata(file: File): Promise<Partial<Track>> {
  const prefetch = new Uint8Array(
    await file.slice(0, Math.min(file.size, WAV_PREFETCH_SIZE)).arrayBuffer(),
  );
  if (
    prefetch.length < 12 ||
    decodeLatin1(prefetch.subarray(0, 4)) !== "RIFF" ||
    decodeLatin1(prefetch.subarray(8, 12)) !== "WAVE"
  ) {
    return {};
  }

  const metadata: Partial<Track> = {};
  let offset = 12;
  let sampleRate = 0;
  let blockAlign = 0;
  let byteRate = 0;
  let factSamples: number | undefined;
  let dataSize: number | undefined;

  while (offset + 8 <= file.size) {
    const chunkHeader = await readWavRange(file, prefetch, offset, offset + 8);
    if (chunkHeader.length < 8) break;

    const chunkId = decodeLatin1(chunkHeader.subarray(0, 4));
    const chunkSize = readUint32LE(chunkHeader, 4);

    if (chunkId === "fmt " && !sampleRate) {
      const fmtBytes = await readWavRange(
        file,
        prefetch,
        offset + 8,
        offset + 8 + Math.min(chunkSize, 16),
      );
      if (fmtBytes.length >= 16) {
        // WAVEFORMATEX: nSamplesPerSec(4) nAvgBytesPerSec(8) nBlockAlign(12)
        sampleRate = readUint32LE(fmtBytes, 4);
        byteRate = readUint32LE(fmtBytes, 8);
        blockAlign = readUint16LE(fmtBytes, 12);
      }
    } else if (chunkId === "fact" && factSamples === undefined) {
      const factBytes = await readWavRange(
        file,
        prefetch,
        offset + 8,
        offset + 8 + Math.min(chunkSize, 4),
      );
      if (factBytes.length >= 4) factSamples = readUint32LE(factBytes, 0);
    } else if (chunkId === "LIST" && chunkSize >= 4 && chunkSize <= 256 * 1024) {
      const listBytes = await readWavRange(
        file,
        prefetch,
        offset + 8,
        offset + 8 + chunkSize,
      );
      parseListInfo(listBytes, metadata);
    } else if (chunkId === "data") {
      // 0xffffffff 表示流式/未知长度，不可用于推算时长
      dataSize = chunkSize === 0xffffffff ? undefined : chunkSize;
      // 若此时已拿到基础信息则直接结束，避免扫过几百 MB 音频数据
      if (sampleRate > 0) break;
    }

    // 跳过 chunk 负载（含 word 对齐 padding）
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const numberOfSamples =
    factSamples !== undefined
      ? factSamples
      : dataSize !== undefined && blockAlign > 0
        ? dataSize / blockAlign
        : undefined;

  if (numberOfSamples !== undefined && numberOfSamples > 0 && sampleRate > 0) {
    metadata.duration = numberOfSamples / sampleRate;
  } else if (byteRate > 0 && dataSize !== undefined && dataSize > 0) {
    // 兜底：PCM 下 dataSize / byteRate 等价
    metadata.duration = dataSize / byteRate;
  }
  return metadata;
}
