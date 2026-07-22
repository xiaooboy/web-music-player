import {
  decodeLatin1,
  sanitizeText,
  readUint32,
  readUint64,
  detectImageMimeType,
  createCoverBlob,
} from "./shared";
import type { Track } from "../../types";

// ─── MP4 辅助函数 ───

function isMp4ContainerAtom(atomType: string) {
  return (
    atomType === "moov" ||
    atomType === "udta" ||
    atomType === "ilst" ||
    atomType === "trak" ||
    atomType === "mdia" ||
    atomType === "minf" ||
    atomType === "stbl" ||
    atomType === "meta"
  );
}

function decodeMp4Cover(payload: Uint8Array) {
  if (!payload.length) {
    return {};
  }

  const mimeType = detectImageMimeType(payload);
  return createCoverBlob(payload, mimeType);
}

function decodeMp4Text(payload: Uint8Array) {
  if (!payload.length) {
    return "";
  }

  try {
    return sanitizeText(new TextDecoder("utf-8").decode(payload));
  } catch {
    return sanitizeText(decodeLatin1(payload));
  }
}

// ─── MP4 atom 遍历 ───

function walkMp4Atoms(
  bytes: Uint8Array,
  start: number,
  end: number,
  path: string[],
  metadata: Partial<Track>,
) {
  let offset = start;

  while (offset + 8 <= end) {
    let atomSize = readUint32(bytes, offset);
    const atomType = decodeLatin1(bytes.slice(offset + 4, offset + 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > end) {
        break;
      }

      atomSize = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) {
      break;
    }

    const atomEnd = offset + atomSize;
    if (atomEnd > end) {
      break;
    }

    const nextPath = [...path, atomType];
    if (isMp4ContainerAtom(atomType)) {
      const childStart =
        atomType === "meta" ? offset + headerSize + 4 : offset + headerSize;
      if (childStart <= atomEnd) {
        walkMp4Atoms(bytes, childStart, atomEnd, nextPath, metadata);
      }
    } else if (atomType === "mdhd" && !metadata.duration) {
      // Media Header Box: 提取时长
      const payloadStart = offset + headerSize;
      if (payloadStart + 8 <= atomEnd) {
        const version = bytes[payloadStart];
        const needed = version === 0 ? 20 : 32;
        if (payloadStart + needed <= atomEnd) {
          const timescale =
            version === 0
              ? readUint32(bytes, payloadStart + 12)
              : readUint32(bytes, payloadStart + 20);
          const durationValue =
            version === 0
              ? readUint32(bytes, payloadStart + 16)
              : readUint64(bytes, payloadStart + 24);
          if (timescale > 0) {
            metadata.duration = durationValue / timescale;
          }
        }
      }
    } else if (path[path.length - 1] === "ilst") {
      parseMp4MetadataAtom(
        atomType,
        bytes,
        offset + headerSize,
        atomEnd,
        metadata,
      );
    }

    offset = atomEnd;
  }
}

function parseMp4MetadataAtom(
  atomType: string,
  bytes: Uint8Array,
  start: number,
  end: number,
  metadata: Partial<Track>,
) {
  let offset = start;

  while (offset + 8 <= end) {
    let atomSize = readUint32(bytes, offset);
    const childType = decodeLatin1(bytes.slice(offset + 4, offset + 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > end) {
        break;
      }

      atomSize = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) {
      break;
    }

    const atomEnd = offset + atomSize;
    if (atomEnd > end) {
      break;
    }

    if (childType === "data" && atomEnd >= offset + headerSize + 8) {
      const payload = bytes.slice(offset + headerSize + 8, atomEnd);
      if (atomType === "covr" && !metadata.coverBlob) {
        const cover = decodeMp4Cover(payload);
            if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
      }

      if ((atomType === "\u00a9nam" || atomType === "nam") && !metadata.title) {
        metadata.title = decodeMp4Text(payload);
      }

      if (
        (atomType === "\u00a9ART" || atomType === "aART") &&
        !metadata.artist
      ) {
        metadata.artist = decodeMp4Text(payload);
      }

      if ((atomType === "\u00a9alb" || atomType === "alb") && !metadata.album) {
        metadata.album = decodeMp4Text(payload);
      }

      if (
        (atomType === "\u00a9lyr" || atomType === "lyr") &&
        !metadata.lyricsText
      ) {
        metadata.lyricsText = decodeMp4Text(payload);
      }
    }

    offset = atomEnd;
  }
}

// ─── moov atom 定位 ───

async function findMp4MoovAtom(
  file: File,
): Promise<{ offset: number; size: number } | null> {
  let fileOffset = 0;

  while (fileOffset + 8 <= file.size) {
    // 读取 atom 头部（最多 16 字节以支持扩展大小）
    const headerReadEnd = Math.min(file.size, fileOffset + 16);
    const headerBytes = new Uint8Array(
      await file.slice(fileOffset, headerReadEnd).arrayBuffer(),
    );
    if (headerBytes.length < 8) break;

    let atomSize = readUint32(headerBytes, 0);
    const atomType = decodeLatin1(headerBytes.slice(4, 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (headerBytes.length < 16) break;
      atomSize = readUint64(headerBytes, 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = file.size - fileOffset;
    }

    if (atomSize < headerSize) break;

    if (atomType === "moov") {
      return { offset: fileOffset, size: atomSize };
    }

    fileOffset += atomSize;
  }

  return null;
}

// ─── MP4 解析入口 ───

export async function parseMp4Metadata(file: File) {
  const MAX_MOOV_READ = 10 * 1024 * 1024;

  // 定位 moov atom，仅读取该部分而非整个文件前 16 MB
  const moov = await findMp4MoovAtom(file);
  if (!moov || moov.size > MAX_MOOV_READ) return {};

  const moovBytes = new Uint8Array(
    await file.slice(moov.offset, moov.offset + moov.size).arrayBuffer(),
  );
  const metadata: Partial<Track> = {};

  walkMp4Atoms(moovBytes, 0, moovBytes.length, [], metadata);
  return metadata;
}
