import { decodeLatin1, readUint16LE, readUint32LE } from "./shared";
import type { Track } from "../../types";

/**
 * 解析 WAV（RIFF）时长。
 * 优先用 fact chunk 的采样数（非 PCM），否则 data 大小 / blockAlign；
 * duration = 采样数 / 采样率（PCM 下与 dataSize / nAvgBytesPerSec 等价）。
 */
export async function parseWavMetadata(file: File): Promise<Partial<Track>> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (
    header.length < 12 ||
    decodeLatin1(header.slice(0, 4)) !== "RIFF" ||
    decodeLatin1(header.slice(8, 12)) !== "WAVE"
  ) {
    return {};
  }

  let offset = 12;
  let sampleRate = 0;
  let blockAlign = 0;
  let byteRate = 0;
  let factSamples: number | undefined;
  let dataSize: number | undefined;

  while (offset + 8 <= file.size) {
    const chunkHeader = new Uint8Array(
      await file.slice(offset, offset + 8).arrayBuffer(),
    );
    if (chunkHeader.length < 8) break;

    const chunkId = decodeLatin1(chunkHeader.slice(0, 4));
    const chunkSize = readUint32LE(chunkHeader, 4);

    if (chunkId === "fmt " && !sampleRate) {
      const fmtBytes = new Uint8Array(
        await file
          .slice(offset + 8, offset + 8 + Math.min(chunkSize, 16))
          .arrayBuffer(),
      );
      if (fmtBytes.length >= 16) {
        // WAVEFORMATEX: nSamplesPerSec(4) nAvgBytesPerSec(8) nBlockAlign(12)
        sampleRate = readUint32LE(fmtBytes, 4);
        byteRate = readUint32LE(fmtBytes, 8);
        blockAlign = readUint16LE(fmtBytes, 12);
      }
    } else if (chunkId === "fact" && factSamples === undefined) {
      const factBytes = new Uint8Array(
        await file
          .slice(offset + 8, offset + 8 + Math.min(chunkSize, 4))
          .arrayBuffer(),
      );
      if (factBytes.length >= 4) factSamples = readUint32LE(factBytes, 0);
    } else if (chunkId === "data") {
      // 0xffffffff 表示流式/未知长度，不可用于推算时长
      dataSize = chunkSize === 0xffffffff ? undefined : chunkSize;
      break;
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
    return { duration: numberOfSamples / sampleRate };
  }
  // 兜底：PCM 下 dataSize / byteRate 等价
  if (byteRate > 0 && dataSize !== undefined && dataSize > 0) {
    return { duration: dataSize / byteRate };
  }
  return {};
}
