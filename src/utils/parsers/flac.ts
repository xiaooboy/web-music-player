import {
  decodeLatin1,
  readUint24,
  readUint32,
  decodeVorbisCommentBlock,
  normalizeMimeType,
  type CoverResult,
} from "./shared";
import type { Track } from "../../types";

const FLAC_PREFETCH_SIZE = 32 * 1024;
const PICTURE_PEEK_SIZE = 512;

/** 从预读缓冲区或按需切片读取指定区间 */
async function readRange(
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

// FLAC 块解析

function parseFlacBlock(
  metadata: Partial<Track>,
  blockType: number,
  blockBytes: Uint8Array,
) {
  if (blockType === 0 && blockBytes.length >= 18) {
    // STREAMINFO: 提取时长
    const sampleRate =
      (blockBytes[10] << 12) | (blockBytes[11] << 4) | (blockBytes[12] >> 4);
    const totalSamples =
      (blockBytes[13] & 0x0f) * 0x1_0000_0000 + readUint32(blockBytes, 14);
    if (sampleRate > 0 && totalSamples > 0) {
      metadata.duration = totalSamples / sampleRate;
    }
  }
  if (blockType === 4) {
    Object.assign(metadata, decodeVorbisCommentBlock(blockBytes));
  }
}

// FLAC PICTURE 块：单次预读头部，图片数据用 file.slice 零拷贝引用

async function readFlacPictureFromFile(
  file: File,
  prefetch: Uint8Array,
  blockDataOffset: number,
  blockLength: number,
): Promise<CoverResult> {
  const blockEnd = blockDataOffset + blockLength;
  if (blockLength < 32) return {};

  const peekEnd = Math.min(blockEnd, blockDataOffset + PICTURE_PEEK_SIZE);
  let peek = await readRange(file, prefetch, blockDataOffset, peekEnd);
  if (peek.length < 8) return {};

  const pictureType = readUint32(peek, 0);
  const mimeLength = readUint32(peek, 4);

  let relOffset = 8;
  if (relOffset + mimeLength + 4 > peek.length) {
    const neededEnd = Math.min(blockEnd, blockDataOffset + relOffset + mimeLength + 256);
    if (neededEnd > peekEnd) {
      peek = await readRange(file, prefetch, blockDataOffset, neededEnd);
    }
  }
  if (relOffset + mimeLength + 4 > peek.length) return {};

  const mimeType = normalizeMimeType(
    decodeLatin1(peek.subarray(relOffset, relOffset + mimeLength)),
  );
  relOffset += mimeLength;

  const descriptionLength = readUint32(peek, relOffset);
  relOffset += 4 + descriptionLength + 16;

  // 描述过长超出预读窗口时，精确定位 imageLength（4 字节）
  let imageLength = 0;
  const imageLenFileOffset = blockDataOffset + relOffset;
  if (imageLenFileOffset + 4 > blockEnd) return {};

  if (relOffset + 4 <= peek.length) {
    imageLength = readUint32(peek, relOffset);
  } else {
    const lenBytes = await readRange(
      file,
      prefetch,
      imageLenFileOffset,
      imageLenFileOffset + 4,
    );
    if (lenBytes.length < 4) return {};
    imageLength = readUint32(lenBytes, 0);
  }

  const imageStart = imageLenFileOffset + 4;
  if (imageLength <= 0 || imageStart + imageLength > blockEnd) return {};

  return {
    coverBlob: file.slice(imageStart, imageStart + imageLength, mimeType),
    pictureType,
  };
}

// FLAC 解析入口

export async function parseFlacMetadata(file: File) {
  const MAX_BLOCK_READ = 10 * 1024 * 1024;
  const prefetch = new Uint8Array(
    await file.slice(0, Math.min(file.size, FLAC_PREFETCH_SIZE)).arrayBuffer(),
  );

  // 验证 fLaC 标识
  if (prefetch.length < 4 || decodeLatin1(prefetch.subarray(0, 4)) !== "fLaC") {
    return {};
  }

  const metadata: Partial<Track> = {};
  let fileOffset = 4; // 跳过 magic
  let lastBlock = false;
  let hasFrontCover = false;

  while (!lastBlock && fileOffset + 4 <= file.size) {
    // 读取块头（4 字节）
    const headerBytes = await readRange(file, prefetch, fileOffset, fileOffset + 4);
    if (headerBytes.length < 4) break;

    lastBlock = Boolean(headerBytes[0] & 0x80);
    const blockType = headerBytes[0] & 0x7f;
    const blockLength = readUint24(headerBytes, 1);
    const blockDataOffset = fileOffset + 4;
    if (blockDataOffset + blockLength > file.size) break;

    // 仅读取需要的块；多图时优先选择 Front Cover (type === 3)
    const needRead =
      (blockType === 0 || blockType === 4 || blockType === 6) &&
      blockLength <= MAX_BLOCK_READ &&
      (blockType !== 6 || !hasFrontCover);

    if (needRead) {
      if (blockType === 6) {
        const cover = await readFlacPictureFromFile(
          file,
          prefetch,
          blockDataOffset,
          blockLength,
        );
        if (cover.coverBlob) {
          if (cover.pictureType === 3) {
            metadata.coverBlob = cover.coverBlob;
            hasFrontCover = true;
          } else if (!metadata.coverBlob) {
            metadata.coverBlob = cover.coverBlob;
          }
        }
      } else {
        const blockBytes = await readRange(
          file,
          prefetch,
          blockDataOffset,
          blockDataOffset + blockLength,
        );
        parseFlacBlock(metadata, blockType, blockBytes);
      }
    }

    // 前进到下一个块
    fileOffset = blockDataOffset + blockLength;
  }

  return metadata;
}
