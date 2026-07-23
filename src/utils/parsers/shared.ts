import type { Track } from "../../types";

// 封面结果

interface CoverResult {
  coverBlob?: Blob;
}

function createCoverBlob(
  bytes: Uint8Array,
  mimeType: string,
): CoverResult {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType });
  return { coverBlob: blob };
}

// 文本解码

function decodeLatin1(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function decodeBytes(bytes: Uint8Array, encoding: number) {
  try {
    if (encoding === 0) {
      return new TextDecoder("windows-1252").decode(bytes);
    }

    if (encoding === 1) {
      return new TextDecoder("utf-16").decode(bytes);
    }

    if (encoding === 2) {
      return new TextDecoder("utf-16be").decode(bytes);
    }

    return new TextDecoder("utf-8").decode(bytes);
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

function readUint64(bytes: Uint8Array, offset: number) {
  const high = readUint32(bytes, offset);
  const low = readUint32(bytes, offset + 4) >>> 0;
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

    const comment = sanitizeText(
      new TextDecoder("utf-8").decode(
        blockBytes.slice(offset, offset + commentLength),
      ),
    );
    offset += commentLength;

    const separatorIndex = comment.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = comment.slice(0, separatorIndex).toUpperCase();
    const value = comment.slice(separatorIndex + 1).trim();

    if (key === "TITLE" && value && !metadata.title) {
      metadata.title = value;
    }
    if (key === "ARTIST" && value && !metadata.artist) {
      metadata.artist = value;
    }
    if (key === "ALBUM" && value && !metadata.album) {
      metadata.album = value;
    }
    if (
      (key === "LYRICS" || key === "UNSYNCEDLYRICS") &&
      value &&
      !metadata.lyricsText
    ) {
      metadata.lyricsText = value;
    }
    // OGG/OPUS 通过 Vorbis Comment 中的 base64 编码嵌入封面
    if (key === "METADATA_BLOCK_PICTURE" && value && !metadata.coverBlob) {
      try {
        const pictureBytes = base64ToUint8Array(value);
        const cover = decodeFlacPictureBlock(pictureBytes);
        if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
      } catch {
        // base64 解码失败时忽略
      }
    }
  }

  return metadata;
}

// FLAC Picture Block 解码

function decodeFlacPictureBlock(blockBytes: Uint8Array) {
  let offset = 0;
  if (blockBytes.length < 32) return {};

  offset += 4;
  const mimeLength = readUint32(blockBytes, offset);
  offset += 4;
  if (offset + mimeLength > blockBytes.length) return {};

  const mimeType = normalizeMimeType(
    decodeLatin1(blockBytes.slice(offset, offset + mimeLength)),
  );
  offset += mimeLength;

  const descriptionLength = readUint32(blockBytes, offset);
  offset += 4 + descriptionLength;
  offset += 16;

  if (offset + 4 > blockBytes.length) return {};

  const imageLength = readUint32(blockBytes, offset);
  offset += 4;
  if (offset + imageLength > blockBytes.length) return {};

  const imageBytes = blockBytes.slice(offset, offset + imageLength);
  if (!imageBytes.length) return {};

  return createCoverBlob(imageBytes, mimeType);
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
  readUint64,
  formatToMimeType,
  normalizeMimeType,
  detectImageMimeType,
  decodeVorbisCommentBlock,
  decodeFlacPictureBlock,
};
