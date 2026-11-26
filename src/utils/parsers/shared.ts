import type { Track } from "../../types";

// 封面结果

interface CoverResult {
  coverBlob?: Blob;
  pictureType?: number;
}

function createCoverBlob(
  bytes: Uint8Array,
  mimeType: string,
): CoverResult {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType });
  return { coverBlob: blob };
}

// 文本解码（复用 TextDecoder 实例以减少高频分配）

const utf8Decoder = new TextDecoder("utf-8");
const win1252Decoder = new TextDecoder("windows-1252");
const utf16Decoder = new TextDecoder("utf-16");
const utf16beDecoder = new TextDecoder("utf-16be");

function decodeLatin1(bytes: Uint8Array) {
  let result = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return result;
}

function decodeBytes(bytes: Uint8Array, encoding: number) {
  try {
    if (encoding === 0) {
      return win1252Decoder.decode(bytes);
    }

    if (encoding === 1) {
      return utf16Decoder.decode(bytes);
    }

    if (encoding === 2) {
      return utf16beDecoder.decode(bytes);
    }

    return utf8Decoder.decode(bytes);
  } catch {
    return decodeLatin1(bytes);
  }
}

function sanitizeText(value: string) {
  return value
    .replace(/\0/g, "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function findEncodedTextEnd(
  bytes: Uint8Array,
  start: number,
  encoding: number,
) {
  if (encoding === 0 || encoding === 3) {
    const end = bytes.indexOf(0, start);
    return end === -1 ? bytes.length : end + 1;
  }

  for (let index = start; index + 1 < bytes.length; index += 2) {
    if (bytes[index] === 0 && bytes[index + 1] === 0) {
      return index + 2;
    }
  }

  return bytes.length;
}

// 二进制读取

function readUint24(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) >>> 0
  );
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function readUint32LE(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
}

function readUint64(bytes: Uint8Array, offset: number) {
  const high = readUint32(bytes, offset);
  const low = readUint32(bytes, offset + 4) >>> 0;
  return high * 0x1_0000_0000 + low;
}

function readUint64LE(bytes: Uint8Array, offset: number) {
  const low = readUint32LE(bytes, offset);
  const high = readUint32LE(bytes, offset + 4);
  return high * 0x1_0000_0000 + low;
}

// MIME 类型

function formatToMimeType(format: string) {
  if (format === "PNG") {
    return "image/png";
  }

  if (format === "GIF") {
    return "image/gif";
  }

  return "image/jpeg";
}

function normalizeMimeType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "image/jpeg";
  }

  if (
    normalized === "jpg" ||
    normalized === "jpeg" ||
    normalized === "image/jpg"
  ) {
    return "image/jpeg";
  }

  if (normalized === "png" || normalized === "image/png") {
    return "image/png";
  }

  if (normalized === "gif" || normalized === "image/gif") {
    return "image/gif";
  }

  return normalized;
}

function detectImageMimeType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (bytes.length >= 6) {
    const signature = decodeLatin1(bytes.slice(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") {
      return "image/gif";
    }
  }

  return "image/jpeg";
}

// Vorbis Comment 解码

/** base64 解码为 Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 解码 Vorbis Comment 块，提取标题、艺术家、专辑、歌词。
 * OGG/OPUS 中的 METADATA_BLOCK_PICTURE（base64 编码封面）也会被自动解码。
 */
function decodeVorbisCommentBlock(blockBytes: Uint8Array) {
  if (blockBytes.length < 8) return {};

  const metadata: Partial<Track> = {};
  let offset = 0;
  const vendorLength = readUint32LE(blockBytes, offset);
  offset += 4 + vendorLength;

  if (offset + 4 > blockBytes.length) return metadata;

  const commentCount = readUint32LE(blockBytes, offset);
  offset += 4;

  for (let index = 0; index < commentCount; index += 1) {
    if (offset + 4 > blockBytes.length) break;

    const commentLength = readUint32LE(blockBytes, offset);
    offset += 4;
    if (offset + commentLength > blockBytes.length) break;

    const commentBytes = blockBytes.subarray(offset, offset + commentLength);
    offset += commentLength;

    const eqPos = commentBytes.indexOf(0x3d); // '='
    if (eqPos === -1) continue;

    const key = decodeLatin1(commentBytes.subarray(0, eqPos)).toUpperCase();
    const rawValueBytes = commentBytes.subarray(eqPos + 1);

    // OGG/OPUS 通过 Vorbis Comment 中的 base64 编码嵌入封面，跳过文本正则清洗避免大字符串开销
    if (key === "METADATA_BLOCK_PICTURE") {
      if (!metadata.coverBlob && rawValueBytes.length > 0) {
        try {
          const base64 = decodeLatin1(rawValueBytes).trim();
          const pictureBytes = base64ToUint8Array(base64);
          const cover = decodeFlacPictureBlock(pictureBytes);
          if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
        } catch {
          // base64 解码失败时忽略
        }
      }
      continue;
    }

    const value = sanitizeText(utf8Decoder.decode(rawValueBytes));
    if (!value) continue;

    if (key === "TITLE" && !metadata.title) {
      metadata.title = value;
    } else if (key === "ARTIST" && !metadata.artist) {
      metadata.artist = value;
    } else if (key === "ALBUM" && !metadata.album) {
      metadata.album = value;
    } else if (
      (key === "LYRICS" || key === "UNSYNCEDLYRICS") &&
      !metadata.lyricsText
    ) {
      metadata.lyricsText = value;
    }
  }

  return metadata;
}

// FLAC Picture Block 解码

function decodeFlacPictureBlock(blockBytes: Uint8Array): CoverResult {
  let offset = 0;
  if (blockBytes.length < 32) return {};

  const pictureType = readUint32(blockBytes, offset);
  offset += 4;
  const mimeLength = readUint32(blockBytes, offset);
  offset += 4;
  if (offset + mimeLength > blockBytes.length) return {};

  const mimeType = normalizeMimeType(
    decodeLatin1(blockBytes.subarray(offset, offset + mimeLength)),
  );
  offset += mimeLength;

  if (offset + 4 > blockBytes.length) return {};
  const descriptionLength = readUint32(blockBytes, offset);
  offset += 4 + descriptionLength + 16;

  if (offset + 4 > blockBytes.length) return {};

  const imageLength = readUint32(blockBytes, offset);
  offset += 4;
  if (offset + imageLength > blockBytes.length) return {};

  const imageBytes = blockBytes.slice(offset, offset + imageLength);
  if (!imageBytes.length) return {};

  return { ...createCoverBlob(imageBytes, mimeType), pictureType };
}

export {
  CoverResult,
  createCoverBlob,
  decodeLatin1,
  decodeBytes,
  sanitizeText,
  findEncodedTextEnd,
  readUint24,
  readUint32,
  readUint32LE,
  readUint16LE,
  readUint64,
  readUint64LE,
  formatToMimeType,
  normalizeMimeType,
  detectImageMimeType,
  decodeVorbisCommentBlock,
  decodeFlacPictureBlock,
};
