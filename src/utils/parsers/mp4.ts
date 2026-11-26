import {
  decodeLatin1,
  sanitizeText,
  readUint32,
  readUint64,
  detectImageMimeType,
} from "./shared";
import type { Track } from "../../types";

const MP4_PREFETCH_SIZE = 64 * 1024;
const SMALL_MOOV_THRESHOLD = 512 * 1024;

interface Mp4ParsedState {
  metadata: Partial<Track>;
  albumArtist?: string;
  mvhdDuration?: number;
}

// MP4 辅助函数

function isMp4ContainerAtom(atomType: string) {
  return (
    atomType === "moov" ||
    atomType === "udta" ||
    atomType === "ilst" ||
    atomType === "trak" ||
    atomType === "mdia" ||
    atomType === "meta"
  );
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

function parseDurationBox(bytes: Uint8Array, payloadStart: number, atomEnd: number): number | undefined {
  if (payloadStart + 8 > atomEnd) return undefined;
  const version = bytes[payloadStart];
  const needed = version === 0 ? 20 : 32;
  if (payloadStart + needed > atomEnd) return undefined;

  const timescale =
    version === 0
      ? readUint32(bytes, payloadStart + 12)
      : readUint32(bytes, payloadStart + 20);
  const durationOffset =
    version === 0 ? payloadStart + 16 : payloadStart + 24;
  const durationLength = version === 0 ? 4 : 8;
  const durationValue =
    version === 0
      ? readUint32(bytes, durationOffset)
      : readUint64(bytes, durationOffset);

  for (let i = 0; i < durationLength; i++) {
    if (bytes[durationOffset + i] !== 0xff) {
      return timescale > 0 ? durationValue / timescale : undefined;
    }
  }
  return undefined;
}

function applyMetadataDataPayload(
  atomType: string,
  file: File,
  coverFileOffset: number,
  payloadLength: number,
  payloadBytes: Uint8Array | null,
  imageHeadBytes: Uint8Array,
  state: Mp4ParsedState,
) {
  const { metadata } = state;
  if (atomType === "covr") {
    if (!metadata.coverBlob && payloadLength > 0) {
      const mimeType = detectImageMimeType(imageHeadBytes);
      metadata.coverBlob = file.slice(
        coverFileOffset,
        coverFileOffset + payloadLength,
        mimeType,
      );
    }
    return;
  }

  if (!payloadBytes) return;
  if (atomType === "\u00a9nam" && !metadata.title) {
    metadata.title = decodeMp4Text(payloadBytes);
  } else if (atomType === "\u00a9ART" && !metadata.artist) {
    metadata.artist = decodeMp4Text(payloadBytes);
  } else if (atomType === "aART" && !state.albumArtist) {
    state.albumArtist = decodeMp4Text(payloadBytes);
  } else if (atomType === "\u00a9alb" && !metadata.album) {
    metadata.album = decodeMp4Text(payloadBytes);
  } else if (atomType === "\u00a9lyr" && !metadata.lyricsText) {
    metadata.lyricsText = decodeMp4Text(payloadBytes);
  }
}

// 内存版 MP4 atom 遍历（用于较小 moov）

function walkMp4AtomsInMemory(
  file: File,
  baseOffset: number,
  bytes: Uint8Array,
  start: number,
  end: number,
  parentType: string,
  state: Mp4ParsedState,
) {
  let offset = start;
  let currentTrakHandler = "";

  while (offset + 8 <= end) {
    let atomSize = readUint32(bytes, offset);
    const atomType = decodeLatin1(bytes.subarray(offset + 4, offset + 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > end) break;
      atomSize = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) break;
    const atomEnd = offset + atomSize;
    if (atomEnd > end) break;

    if (isMp4ContainerAtom(atomType)) {
      const childStart =
        atomType === "meta" ? offset + headerSize + 4 : offset + headerSize;
      if (childStart <= atomEnd) {
        walkMp4AtomsInMemory(
          file,
          baseOffset,
          bytes,
          childStart,
          atomEnd,
          atomType,
          state,
        );
      }
    } else if (atomType === "mvhd" && state.mvhdDuration === undefined) {
      state.mvhdDuration = parseDurationBox(bytes, offset + headerSize, atomEnd);
    } else if (atomType === "hdlr" && parentType === "mdia") {
      const subtypeStart = offset + headerSize + 8;
      if (subtypeStart + 4 <= atomEnd) {
        currentTrakHandler = decodeLatin1(bytes.subarray(subtypeStart, subtypeStart + 4));
      }
    } else if (atomType === "mdhd" && (!state.metadata.duration || currentTrakHandler === "soun")) {
      const dur = parseDurationBox(bytes, offset + headerSize, atomEnd);
      if (dur !== undefined) {
        state.metadata.duration = dur;
      }
    } else if (parentType === "ilst") {
      parseMp4MetadataAtomInMemory(
        atomType,
        file,
        baseOffset,
        bytes,
        offset + headerSize,
        atomEnd,
        state,
      );
    }

    offset = atomEnd;
  }
}

function parseMp4MetadataAtomInMemory(
  atomType: string,
  file: File,
  baseOffset: number,
  bytes: Uint8Array,
  start: number,
  end: number,
  state: Mp4ParsedState,
) {
  let offset = start;

  while (offset + 8 <= end) {
    let atomSize = readUint32(bytes, offset);
    const childType = decodeLatin1(bytes.subarray(offset + 4, offset + 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > end) break;
      atomSize = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) break;
    const atomEnd = offset + atomSize;
    if (atomEnd > end) break;

    if (childType === "data" && atomEnd >= offset + headerSize + 8) {
      const payloadStart = offset + headerSize + 8;
      const payloadLength = atomEnd - payloadStart;
      const headEnd = Math.min(atomEnd, payloadStart + 16);
      applyMetadataDataPayload(
        atomType,
        file,
        baseOffset + payloadStart,
        payloadLength,
        atomType === "covr" ? null : bytes.subarray(payloadStart, atomEnd),
        bytes.subarray(payloadStart, headEnd),
        state,
      );
    }

    offset = atomEnd;
  }
}

// 流式切片版 MP4 atom 遍历（用于超大 moov，避免封面与 stbl 进入 JS 堆）

async function walkMp4AtomsFromFile(
  file: File,
  start: number,
  end: number,
  parentType: string,
  state: Mp4ParsedState,
): Promise<void> {
  let offset = start;
  let currentTrakHandler = "";

  while (offset + 8 <= end) {
    const headerBytes = new Uint8Array(
      await file.slice(offset, Math.min(end, offset + 16)).arrayBuffer(),
    );
    if (headerBytes.length < 8) break;

    let atomSize = readUint32(headerBytes, 0);
    const atomType = decodeLatin1(headerBytes.subarray(4, 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (headerBytes.length < 16) break;
      atomSize = readUint64(headerBytes, 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) break;
    const atomEnd = offset + atomSize;
    if (atomEnd > end) break;

    if (isMp4ContainerAtom(atomType)) {
      const childStart =
        atomType === "meta" ? offset + headerSize + 4 : offset + headerSize;
      if (childStart <= atomEnd) {
        await walkMp4AtomsFromFile(file, childStart, atomEnd, atomType, state);
      }
    } else if (atomType === "mvhd" && state.mvhdDuration === undefined) {
      const boxBytes = new Uint8Array(
        await file.slice(offset, Math.min(atomEnd, offset + 48)).arrayBuffer(),
      );
      state.mvhdDuration = parseDurationBox(boxBytes, headerSize, boxBytes.length);
    } else if (atomType === "hdlr" && parentType === "mdia") {
      const boxBytes = new Uint8Array(
        await file.slice(offset + headerSize, Math.min(atomEnd, offset + headerSize + 12)).arrayBuffer(),
      );
      if (boxBytes.length >= 12) {
        currentTrakHandler = decodeLatin1(boxBytes.subarray(8, 12));
      }
    } else if (atomType === "mdhd" && (!state.metadata.duration || currentTrakHandler === "soun")) {
      const boxBytes = new Uint8Array(
        await file.slice(offset, Math.min(atomEnd, offset + 48)).arrayBuffer(),
      );
      const dur = parseDurationBox(boxBytes, headerSize, boxBytes.length);
      if (dur !== undefined) {
        state.metadata.duration = dur;
      }
    } else if (parentType === "ilst") {
      await parseMp4MetadataAtomFromFile(
        atomType,
        file,
        offset + headerSize,
        atomEnd,
        state,
      );
    }

    offset = atomEnd;
  }
}

async function parseMp4MetadataAtomFromFile(
  atomType: string,
  file: File,
  start: number,
  end: number,
  state: Mp4ParsedState,
): Promise<void> {
  let offset = start;
  while (offset + 8 <= end) {
    const headerBytes = new Uint8Array(
      await file.slice(offset, Math.min(end, offset + 16)).arrayBuffer(),
    );
    if (headerBytes.length < 8) break;

    let atomSize = readUint32(headerBytes, 0);
    const childType = decodeLatin1(headerBytes.subarray(4, 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (headerBytes.length < 16) break;
      atomSize = readUint64(headerBytes, 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) break;
    const atomEnd = offset + atomSize;
    if (atomEnd > end) break;

    if (childType === "data" && atomEnd >= offset + headerSize + 8) {
      const payloadStart = offset + headerSize + 8;
      const payloadLength = atomEnd - payloadStart;
      if (atomType === "covr") {
        const imageHead = new Uint8Array(
          await file.slice(payloadStart, Math.min(atomEnd, payloadStart + 16)).arrayBuffer(),
        );
        applyMetadataDataPayload(
          atomType,
          file,
          payloadStart,
          payloadLength,
          null,
          imageHead,
          state,
        );
      } else {
        const payloadBytes = new Uint8Array(
          await file.slice(payloadStart, atomEnd).arrayBuffer(),
        );
        applyMetadataDataPayload(
          atomType,
          file,
          payloadStart,
          payloadLength,
          payloadBytes,
          payloadBytes,
          state,
        );
      }
    }

    offset = atomEnd;
  }
}

// moov atom 定位

async function findMp4MoovAtom(
  file: File,
): Promise<{ offset: number; size: number; prefetch: Uint8Array } | null> {
  const prefetch = new Uint8Array(
    await file.slice(0, Math.min(file.size, MP4_PREFETCH_SIZE)).arrayBuffer(),
  );
  let fileOffset = 0;

  while (fileOffset + 8 <= file.size) {
    const headerReadEnd = Math.min(file.size, fileOffset + 16);
    const headerBytes =
      headerReadEnd <= prefetch.length
        ? prefetch.subarray(fileOffset, headerReadEnd)
        : new Uint8Array(await file.slice(fileOffset, headerReadEnd).arrayBuffer());
    if (headerBytes.length < 8) break;

    let atomSize = readUint32(headerBytes, 0);
    const atomType = decodeLatin1(headerBytes.subarray(4, 8));
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
      return { offset: fileOffset, size: atomSize, prefetch };
    }

    fileOffset += atomSize;
  }

  return null;
}

// MP4 解析入口

export async function parseMp4Metadata(file: File) {
  const moov = await findMp4MoovAtom(file);
  if (!moov) return {};

  const state: Mp4ParsedState = { metadata: {} };

  if (moov.size <= SMALL_MOOV_THRESHOLD) {
    const moovEnd = moov.offset + moov.size;
    const moovBytes =
      moovEnd <= moov.prefetch.length
        ? moov.prefetch.subarray(moov.offset, moovEnd)
        : new Uint8Array(await file.slice(moov.offset, moovEnd).arrayBuffer());
    walkMp4AtomsInMemory(file, moov.offset, moovBytes, 0, moovBytes.length, "", state);
  } else {
    // 大 moov（常见于内嵌大图或长音轨 stbl）：流式遍历，避免整个 moov 进入 JS 堆
    await walkMp4AtomsFromFile(file, moov.offset, moov.offset + moov.size, "", state);
  }

  if (!state.metadata.artist && state.albumArtist) {
    state.metadata.artist = state.albumArtist;
  }
  if (!state.metadata.duration && state.mvhdDuration) {
    state.metadata.duration = state.mvhdDuration;
  }
  return state.metadata;
}
