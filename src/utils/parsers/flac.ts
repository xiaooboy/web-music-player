import {
  decodeLatin1,
  readUint24,
  readUint32,
  decodeVorbisCommentBlock,
  normalizeMimeType,
} from "./shared";
import type { Track } from "../../types";

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

// FLAC PICTURE 块：只读头部，图片数据用 file.slice 零拷贝引用

async function readFlacPictureFromFile(
  file: File,
  blockDataOffset: number,
  blockLength: number,
): Promise<{ coverBlob?: Blob }> {
  const blockEnd = blockDataOffset + blockLength;
  if (blockLength < 32) return {};

  // 读 8 字节：picture type(4) + mime length(4)
  const headBytes = new Uint8Array(
    await file.slice(blockDataOffset, blockDataOffset + 8).arrayBuffer(),
  );
  if (headBytes.length < 8) return {};
  const mimeLength = readUint32(headBytes, 4);

  let cursor = blockDataOffset + 8;

  // 读 mime 字符串（必须在块内）
  if (cursor + mimeLength > blockEnd) return {};
  const mimeBytes = new Uint8Array(
    await file.slice(cursor, cursor + mimeLength).arrayBuffer(),
  );
  if (mimeBytes.length < mimeLength) return {};
  const mimeType = normalizeMimeType(decodeLatin1(mimeBytes));
  cursor += mimeLength;

  // 读 description length(4)，随后跳过 description 与 16 字节图片尺寸
  if (cursor + 4 > blockEnd) return {};
  const descLenBytes = new Uint8Array(
    await file.slice(cursor, cursor + 4).arrayBuffer(),
  );
  if (descLenBytes.length < 4) return {};
  const descriptionLength = readUint32(descLenBytes, 0);
  cursor += 4 + descriptionLength + 16;

  if (cursor + 4 > blockEnd) return {};

  // 读 image length(4)
  const imageLenBytes = new Uint8Array(
    await file.slice(cursor, cursor + 4).arrayBuffer(),
  );
  if (imageLenBytes.length < 4) return {};
  const imageLength = readUint32(imageLenBytes, 0);
  cursor += 4;

  if (imageLength <= 0 || cursor + imageLength > blockEnd) return {};

  return {
    coverBlob: file.slice(cursor, cursor + imageLength, mimeType),
  };
}

// FLAC 解析入口

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
      if (blockType === 6) {
        // PICTURE: 零拷贝，不把整块读入内存
        const cover = await readFlacPictureFromFile(
          file,
          blockDataOffset,
          blockLength,
        );
        if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
      } else {
        const blockBytes = new Uint8Array(
          await file.slice(blockDataOffset, blockDataOffset + blockLength).arrayBuffer(),
        );
        parseFlacBlock(metadata, blockType, blockBytes);
      }
    }

    // 前进到下一个块
    fileOffset = blockDataOffset + blockLength;
  }

  return metadata;
}
