import {
  decodeLatin1,
  readUint24,
  readUint32,
  readUint32LE,
  normalizeMimeType,
  createCoverBlob,
  decodeVorbisCommentBlock,
  decodeFlacPictureBlock,
} from "./shared";
import type { Track } from "../../types";

// ─── FLAC 块解析 ───

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
  if (blockType === 6 && !metadata.coverBlob) {
    const cover = decodeFlacPictureBlock(blockBytes);
    if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
  }
}

// ─── FLAC 解析入口 ───

export async function parseFlacMetadata(file: File) {
  const MAX_BLOCK_READ = 10 * 1024 * 1024;

  // 验证 fLaC 标识
  const magicBytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (magicBytes.length < 4 || decodeLatin1(magicBytes) !== "fLaC") {
    return {};
  }

  const metadata: Partial<Track> = {};
  let fileOffset = 4; // 跳过 magic
  let lastBlock = false;

  while (!lastBlock && fileOffset + 4 <= file.size) {
    // 读取块头（4 字节）
    const headerBytes = new Uint8Array(
      await file.slice(fileOffset, fileOffset + 4).arrayBuffer(),
    );
    if (headerBytes.length < 4) break;

    lastBlock = Boolean(headerBytes[0] & 0x80);
    const blockType = headerBytes[0] & 0x7f;
    const blockLength = readUint24(headerBytes, 1);
    const blockDataOffset = fileOffset + 4;

    // 仅读取需要的块，跳过 PADDING / SEEKTABLE / APPLICATION / CUESHEET 等
    const needRead =
      (blockType === 0 || blockType === 4 || blockType === 6) &&
      blockLength <= MAX_BLOCK_READ &&
      (blockType !== 6 || !metadata.coverBlob);

    if (needRead) {
      const blockBytes = new Uint8Array(
        await file.slice(blockDataOffset, blockDataOffset + blockLength).arrayBuffer(),
      );
      parseFlacBlock(metadata, blockType, blockBytes);
    }

    // 前进到下一个块
    fileOffset = blockDataOffset + blockLength;
  }

  return metadata;
}
