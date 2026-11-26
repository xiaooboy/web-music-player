import {
  decodeLatin1,
  decodeVorbisCommentBlock,
  readUint16LE,
  readUint32LE,
  readUint64LE,
} from "./shared";
import type { Track } from "../../types";

const OGG_PAGE_HEADER_SIZE = 27;
const OGG_CAPTURE = "OggS";
const OGG_PREFETCH_SIZE = 32 * 1024;

/** BOS 标记：起始页面 */
const OGG_BOS = 0x02;
/** continuation 标记：延续上一页的数据包 */
const OGG_CONT = 0x01;

interface OggPage {
  headerType: number;
  segTable: Uint8Array;
  data: Uint8Array;
  nextOffset: number;
}

async function readOggSlice(
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

/** 按需读取一个 OGG 页面（优先命中预读缓冲） */
async function readOggPage(
  file: File,
  prefetch: Uint8Array,
  offset: number,
): Promise<OggPage | null> {
  const header = await readOggSlice(
    file,
    prefetch,
    offset,
    offset + OGG_PAGE_HEADER_SIZE,
  );
  if (header.length < OGG_PAGE_HEADER_SIZE) return null;
  if (decodeLatin1(header.subarray(0, 4)) !== OGG_CAPTURE) return null;

  const headerType = header[5];
  const numSegments = header[26];

  const segStart = offset + OGG_PAGE_HEADER_SIZE;
  const segTable = await readOggSlice(file, prefetch, segStart, segStart + numSegments);
  if (segTable.length < numSegments) return null;

  let dataSize = 0;
  for (let i = 0; i < numSegments; i++) dataSize += segTable[i];

  const dataStart = segStart + numSegments;
  const data = await readOggSlice(file, prefetch, dataStart, dataStart + dataSize);
  if (data.length < dataSize) return null;

  return {
    headerType,
    segTable,
    data,
    nextOffset: dataStart + dataSize,
  };
}

/**
 * 从页面的 segment table 中提取第一个完整数据包。
 * segment < 255 表示数据包边界；全部 255 则数据包跨越下一页。
 */
function extractFirstPacket(page: OggPage): Uint8Array | null {
  let size = 0;
  for (let i = 0; i < page.segTable.length; i++) {
    size += page.segTable[i];
    if (page.segTable[i] < 255) {
      return page.data.subarray(0, size);
    }
  }
  // 数据包尚未结束，跨越下一页
  return null;
}

/** 合并多个 Uint8Array 片段 */
function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

// OGG/OPUS 公共解析逻辑

/**
 * 从 OGG 容器中提取 Vorbis Comment 数据包（跳过已读的 BOS 页）。
 */
async function parseOggVorbisComment(
  file: File,
  prefetch: Uint8Array,
  startOffset: number,
  commentPrefixLen: number,
): Promise<Partial<Track>> {
  let fileOffset = startOffset;
  const packetParts: Uint8Array[] = [];
  const MAX_PAGES = 64;
  const MAX_PACKET_SIZE = 8 * 1024 * 1024;
  let accumulatedSize = 0;

  for (let i = 0; i < MAX_PAGES && fileOffset + OGG_PAGE_HEADER_SIZE <= file.size; i++) {
    const page = await readOggPage(file, prefetch, fileOffset);
    if (!page) break;

    const isContinuation = (page.headerType & OGG_CONT) !== 0;

    if (!isContinuation && packetParts.length > 0) {
      packetParts.length = 0;
      accumulatedSize = 0;
    }

    const packet = extractFirstPacket(page);

    if (packet !== null) {
      if (accumulatedSize + packet.length > MAX_PACKET_SIZE) return {};
      const fullPacket =
        packetParts.length > 0
          ? concatUint8Arrays([...packetParts, packet])
          : packet;

      if (fullPacket.length <= commentPrefixLen) return {};
      const commentData = fullPacket.subarray(commentPrefixLen);
      return decodeVorbisCommentBlock(commentData);
    }

    accumulatedSize += page.data.length;
    if (accumulatedSize > MAX_PACKET_SIZE) return {};
    packetParts.push(page.data);
    fileOffset = page.nextOffset;
  }

  return {};
}

// 时长解析

const OGG_TAIL_READ = 128 * 1024;

/** 读取最后一个 OGG page 的 granule position（LE uint64） */
async function readLastGranulePosition(file: File): Promise<number> {
  const tailStart = Math.max(0, file.size - OGG_TAIL_READ);
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());

  // 从尾部向前扫描 "OggS" 魔数，取最后一个合法 page
  for (let i = tail.length - OGG_PAGE_HEADER_SIZE; i >= 0; i--) {
    if (
      tail[i] !== 0x4f ||
      tail[i + 1] !== 0x67 ||
      tail[i + 2] !== 0x67 ||
      tail[i + 3] !== 0x53
    ) {
      continue;
    }
    // version 固定为 0，header_type 仅使用低 3 位，且 segment table 在边界内
    if (
      tail[i + 4] !== 0 ||
      (tail[i + 5] & ~0x07) !== 0 ||
      i + OGG_PAGE_HEADER_SIZE + tail[i + 26] > tail.length
    ) {
      continue;
    }
    return readUint64LE(tail, i + 6);
  }
  return 0;
}

/** 解析 OGG Vorbis 元信息 */
export async function parseOggMetadata(file: File) {
  const prefetch = new Uint8Array(
    await file.slice(0, Math.min(file.size, OGG_PREFETCH_SIZE)).arrayBuffer(),
  );
  const bosPage = await readOggPage(file, prefetch, 0);
  if (!bosPage || !(bosPage.headerType & OGG_BOS)) return {};

  const sampleRate =
    bosPage.data.length >= 16 ? readUint32LE(bosPage.data, 12) : 0;

  const [comment, granule] = await Promise.all([
    parseOggVorbisComment(file, prefetch, bosPage.nextOffset, 7),
    readLastGranulePosition(file),
  ]);
  if (sampleRate > 0 && granule > 0) comment.duration = granule / sampleRate;
  return comment;
}

/** 解析 OGG Opus 元信息 */
export async function parseOpusMetadata(file: File) {
  const prefetch = new Uint8Array(
    await file.slice(0, Math.min(file.size, OGG_PREFETCH_SIZE)).arrayBuffer(),
  );
  const bosPage = await readOggPage(file, prefetch, 0);
  if (!bosPage || !(bosPage.headerType & OGG_BOS)) return {};

  const preSkip =
    bosPage.data.length >= 12 ? readUint16LE(bosPage.data, 10) : 0;

  const [comment, granule] = await Promise.all([
    parseOggVorbisComment(file, prefetch, bosPage.nextOffset, 8),
    readLastGranulePosition(file),
  ]);
  // Opus 的 granule position 固定以 48kHz 计数，并需减去 OpusHead 的 pre-skip
  if (granule > 0) {
    comment.duration = Math.max(0, granule - preSkip) / 48000;
  }
  return comment;
}
