import {
  decodeLatin1,
  readUint32LE,
  decodeVorbisCommentBlock,
} from "./shared";
import type { Track } from "../../types";

// ─── OGG 页面结构 ───
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

// ─── OGG/OPUS 公共解析逻辑 ───

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

// ─── 解析入口 ───

/** 解析 OGG Vorbis 元信息 */
export async function parseOggMetadata(file: File) {
  // Vorbis Comment 前缀: 0x03 + "vorbis" = 7 字节
  return parseOggVorbisComment(file, 7);
}

/** 解析 OGG Opus 元信息 */
export async function parseOpusMetadata(file: File) {
  // Opus Comment 前缀: "OpusTags" = 8 字节
  return parseOggVorbisComment(file, 8);
}
