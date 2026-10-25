import {
  decodeLatin1,
  decodeVorbisCommentBlock,
  readUint16LE,
  readUint32LE,
  readUint64LE,
} from "./shared";
import type { Track } from "../../types";

// OGG 页面结构
//
// OGG 容器由一系列页面(page)组成，每个页面承载一个或多个数据包(packet)。
// 对于 Vorbis 和 Opus，元信息（Vorbis Comment）总是第二个数据包：
//   第 1 包 = 编码标识头（Vorbis: 0x01+"vorbis"，Opus: "OpusHead"）
//   第 2 包 = Vorbis Comment 头（Vorbis: 0x03+"vorbis"，Opus: "OpusTags"）
//
// 页面头部固定 27 字节 + segment table（N 字节）+ 页面数据。

const OGG_PAGE_HEADER_SIZE = 27;
const OGG_CAPTURE = "OggS";

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

/** 按需读取一个 OGG 页面 */
async function readOggPage(file: File, offset: number): Promise<OggPage | null> {
  const header = new Uint8Array(
    await file.slice(offset, offset + OGG_PAGE_HEADER_SIZE).arrayBuffer(),
  );
  if (header.length < OGG_PAGE_HEADER_SIZE) return null;
  if (decodeLatin1(header.slice(0, 4)) !== OGG_CAPTURE) return null;

  const headerType = header[5];
  const numSegments = header[26];

  const segTable = new Uint8Array(
    await file.slice(offset + OGG_PAGE_HEADER_SIZE, offset + OGG_PAGE_HEADER_SIZE + numSegments).arrayBuffer(),
  );
  if (segTable.length < numSegments) return null;

  let dataSize = 0;
  for (let i = 0; i < numSegments; i++) dataSize += segTable[i];

  const dataStart = offset + OGG_PAGE_HEADER_SIZE + numSegments;
  const data = new Uint8Array(
    await file.slice(dataStart, dataStart + dataSize).arrayBuffer(),
  );

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
      return page.data.slice(0, size);
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
 * 从 OGG 容器中提取 Vorbis Comment 数据包。
 * commentPrefixLen = Vorbis Comment 头部前缀长度（需要跳过）：
 *   Vorbis: 1(类型) + 6("vorbis") = 7
 *   Opus:   8("OpusTags")
 */
async function parseOggVorbisComment(
  file: File,
  commentPrefixLen: number,
): Promise<Partial<Track>> {
  // 1. 读取 BOS 页面（编码标识头），跳过
  const bosPage = await readOggPage(file, 0);
  if (!bosPage || !(bosPage.headerType & OGG_BOS)) return {};

  // 2. 逐页读取，组装第二个数据包（Vorbis Comment）
  let fileOffset = bosPage.nextOffset;
  const packetParts: Uint8Array[] = [];
  const MAX_PAGES = 10;
  const MAX_PACKET_SIZE = 1 * 1024 * 1024;

  for (let i = 0; i < MAX_PAGES && fileOffset + OGG_PAGE_HEADER_SIZE <= file.size; i++) {
    const page = await readOggPage(file, fileOffset);
    if (!page) break;

    const isContinuation = (page.headerType & OGG_CONT) !== 0;

    // 非延续页且还有未完成的数据包 → 数据不完整，重置
    if (!isContinuation && packetParts.length > 0) {
      packetParts.length = 0;
    }

    const packet = extractFirstPacket(page);

    if (packet !== null) {
      // 找到完整数据包
      const fullPacket =
        packetParts.length > 0
          ? concatUint8Arrays([...packetParts, packet])
          : packet;

      if (fullPacket.length > MAX_PACKET_SIZE) return {};

      const commentData = fullPacket.slice(commentPrefixLen);
      return decodeVorbisCommentBlock(commentData);
    }

    // 数据包跨越下一页，缓存当前页的全部数据
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

  // 从尾部向前扫描 "OggS" 魔数，取最后一个 page
  for (let i = tail.length - 4; i >= 0; i--) {
    if (
      tail[i] !== 0x4f ||
      tail[i + 1] !== 0x67 ||
      tail[i + 2] !== 0x67 ||
      tail[i + 3] !== 0x53
    ) {
      continue;
    }
    // version 固定为 0，用于降低数据区误命中 "OggS" 的概率
    if (tail[i + 4] !== 0 || i + 14 > tail.length) continue;
    return readUint64LE(tail, i + 6);
  }
  return 0;
}

/** 从 Vorbis 标识头读取采样率 */
async function readVorbisSampleRate(file: File): Promise<number> {
  const bosPage = await readOggPage(file, 0);
  if (!bosPage || !(bosPage.headerType & OGG_BOS) || bosPage.data.length < 16) {
    return 0;
  }
  // 标识头布局：0x01 + "vorbis"(6) + version(4) + channels(1) + sampleRate(4 LE)
  return readUint32LE(bosPage.data, 12);
}

/** 从 OpusHead 标识头读取 pre-skip */
async function readOpusPreSkip(file: File): Promise<number> {
  const bosPage = await readOggPage(file, 0);
  if (!bosPage || !(bosPage.headerType & OGG_BOS) || bosPage.data.length < 12) {
    return 0;
  }
  // OpusHead：magic(8) + version(1) + channelCount(1) + preSkip(2 LE)
  return readUint16LE(bosPage.data, 10);
}

/** 解析 OGG Vorbis 元信息 */
export async function parseOggMetadata(file: File) {
  const [comment, sampleRate, granule] = await Promise.all([
    parseOggVorbisComment(file, 7),
    readVorbisSampleRate(file),
    readLastGranulePosition(file),
  ]);
  if (sampleRate > 0 && granule > 0) comment.duration = granule / sampleRate;
  return comment;
}

/** 解析 OGG Opus 元信息 */
export async function parseOpusMetadata(file: File) {
  const [comment, granule, preSkip] = await Promise.all([
    parseOggVorbisComment(file, 8),
    readLastGranulePosition(file),
    readOpusPreSkip(file),
  ]);
  // Opus 的 granule position 固定以 48kHz 计数，并需减去 OpusHead 的 pre-skip
  if (granule > 0) {
    comment.duration = Math.max(0, granule - preSkip) / 48000;
  }
  return comment;
}
