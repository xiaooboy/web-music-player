import {
  decodeLatin1,
  decodeBytes,
  sanitizeText,
  findEncodedTextEnd,
  readUint24,
  readUint32,
  normalizeMimeType,
  formatToMimeType,
  createCoverBlob,
  CoverResult,
} from "./shared";
import type { Track } from "../../types";

// 常量

/** ID3 头部预读量：多数 MP3 标签（除大图外）可一次读完，避免逐帧切片 */
const ID3_PREFETCH_SIZE = 64 * 1024;

/** MP3 时长探测读取量：覆盖 Xing/VBRI 头所需的最大搜索范围 */
const MP3_PROBE_SIZE = 10244;

/** APIC/PIC 帧头部预读量，用于定位图片数据起始偏移 */
const COVER_PEEK_SIZE = 512;

async function readId3Range(
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

// 二进制读取

function readSynchsafe(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 21) |
      (bytes[offset + 1] << 14) |
      (bytes[offset + 2] << 7) |
      bytes[offset + 3]) >>>
    0
  );
}

function removeUnsynchronization(bytes: Uint8Array) {
  const result: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0x00) {
      result.push(0xff);
      index += 1;
      continue;
    }

    result.push(bytes[index]);
  }

  return new Uint8Array(result);
}

// 帧解码

function decodeTextFrame(frameBytes: Uint8Array) {
  if (!frameBytes.length) return "";
  const encoding = frameBytes[0];
  const content = frameBytes.subarray(1);
  return sanitizeText(decodeBytes(content, encoding));
}

function decodeLyricsFrame(frameBytes: Uint8Array, isV22 = false) {
  if (!frameBytes.length) {
    return "";
  }

  const encoding = frameBytes[0];
  let offset = 1;
  offset += 3;
  offset = findEncodedTextEnd(frameBytes, offset, encoding);

  if (isV22) {
    offset = Math.min(offset, frameBytes.length);
  }

  if (offset >= frameBytes.length) {
    return "";
  }

  return sanitizeText(decodeBytes(frameBytes.subarray(offset), encoding));
}

function decodeApicFrame(frameBytes: Uint8Array): CoverResult {
  if (frameBytes.length < 4) return {};
  const encoding = frameBytes[0];
  let offset = 1;
  const mimeEnd = frameBytes.indexOf(0, offset);
  if (mimeEnd === -1) {
    return {};
  }

  const mimeType = normalizeMimeType(
    decodeLatin1(frameBytes.subarray(offset, mimeEnd)),
  );
  if (mimeType === "-->") {
    return {};
  }

  offset = mimeEnd + 1;
  if (offset >= frameBytes.length) return {};
  const pictureType = frameBytes[offset];
  offset += 1;
  offset = findEncodedTextEnd(frameBytes, offset, encoding);

  const imageBytes = frameBytes.slice(offset);
  if (!imageBytes.length) {
    return {};
  }

  return { ...createCoverBlob(imageBytes, mimeType), pictureType };
}

/**
 * APIC 按需读取版：只预读帧头部定位图片偏移，
 * 然后通过 file.slice() 直接创建封面 Blob——图片字节不进入 JS 堆。
 * 若描述过长超出预读窗口，回退到完整帧读取。
 */
async function decodeApicFrameFromSlice(
  file: File,
  prefetch: Uint8Array,
  frameStart: number,
  frameEnd: number,
): Promise<CoverResult> {
  const peekEnd = Math.min(frameEnd, frameStart + COVER_PEEK_SIZE);
  const peek = await readId3Range(file, prefetch, frameStart, peekEnd);
  if (peek.length < 4) return {};

  const encoding = peek[0];
  let offset = 1;

  const mimeEnd = peek.indexOf(0, offset);
  if (mimeEnd === -1) return {};

  const mimeType = normalizeMimeType(
    decodeLatin1(peek.subarray(offset, mimeEnd)),
  );
  if (mimeType === "-->") return {};

  offset = mimeEnd + 1;
  if (offset >= peek.length) return {};
  const pictureType = peek[offset];
  offset += 1; // picture type
  offset = findEncodedTextEnd(peek, offset, encoding);

  // 描述超出预读窗口，回退到完整帧读取
  if (offset >= peek.length && peekEnd < frameEnd) {
    const fb = await readId3Range(file, prefetch, frameStart, frameEnd);
    return decodeApicFrame(fb);
  }

  const imageFileOffset = frameStart + offset;
  const imageLength = frameEnd - imageFileOffset;
  if (imageLength <= 0) return {};

  // file.slice() 创建的 Blob 是对文件区域的懒引用，图片数据零拷贝
  const coverBlob = file.slice(imageFileOffset, frameEnd, mimeType);
  return { coverBlob, pictureType };
}

function decodePicFrame(frameBytes: Uint8Array): CoverResult {
  if (frameBytes.length < 6) return {};
  const encoding = frameBytes[0];
  const format = decodeLatin1(frameBytes.subarray(1, 4)).toUpperCase();
  let offset = 4;

  const pictureType = frameBytes[offset];
  offset += 1;
  offset = findEncodedTextEnd(frameBytes, offset, encoding);

  const imageBytes = frameBytes.slice(offset);
  if (!imageBytes.length) {
    return {};
  }

  const mimeType = normalizeMimeType(formatToMimeType(format));
  return { ...createCoverBlob(imageBytes, mimeType), pictureType };
}

/**
 * PIC (ID3v2.2) 按需读取版：与 decodeApicFrameFromSlice 同理，
 * 通过 file.slice() 创建封面 Blob。
 */
async function decodePicFrameFromSlice(
  file: File,
  prefetch: Uint8Array,
  frameStart: number,
  frameEnd: number,
): Promise<CoverResult> {
  const peekEnd = Math.min(frameEnd, frameStart + COVER_PEEK_SIZE);
  const peek = await readId3Range(file, prefetch, frameStart, peekEnd);
  if (peek.length < 6) return {};

  const encoding = peek[0];
  const format = decodeLatin1(peek.subarray(1, 4)).toUpperCase();
  let offset = 4;

  const pictureType = peek[offset];
  offset += 1; // picture type
  offset = findEncodedTextEnd(peek, offset, encoding);

  if (offset >= peek.length && peekEnd < frameEnd) {
    const fb = await readId3Range(file, prefetch, frameStart, frameEnd);
    return decodePicFrame(fb);
  }

  const imageFileOffset = frameStart + offset;
  const imageLength = frameEnd - imageFileOffset;
  if (imageLength <= 0) return {};

  const mimeType = normalizeMimeType(formatToMimeType(format));
  const coverBlob = file.slice(imageFileOffset, frameEnd, mimeType);
  return { coverBlob, pictureType };
}

function applyCoverCandidate(
  metadata: Partial<Track>,
  cover: CoverResult,
  hasFrontCover: boolean,
): boolean {
  if (!cover.coverBlob) return hasFrontCover;
  if (cover.pictureType === 3) {
    metadata.coverBlob = cover.coverBlob;
    return true;
  }
  if (!metadata.coverBlob) {
    metadata.coverBlob = cover.coverBlob;
  }
  return hasFrontCover;
}

// 时长探测

interface MpegFrameInfo {
  sampleRate: number;
  bitrate: number;
  samplesPerFrame: number;
  offset: number;
  isMono: boolean;
  isMpeg1: boolean;
}

function parseMpegHeaderAt(bytes: Uint8Array, i: number) {
  if (i + 4 > bytes.length) return null;
  if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) return null;

  const versionBits = (bytes[i + 1] >> 3) & 0x03;
  const layerBits = (bytes[i + 1] >> 1) & 0x03;
  const bitrateIndex = (bytes[i + 2] >> 4) & 0x0f;
  const sampleRateIndex = (bytes[i + 2] >> 2) & 0x03;

  // 版本: 00=2.5, 01=reserved, 10=2, 11=1；仅处理 Layer III
  if (versionBits === 0x01 || layerBits !== 0x01) return null;
  if (bitrateIndex === 0x00 || bitrateIndex === 0x0f) return null;
  if (sampleRateIndex === 0x03) return null;

  const isMpeg1 = versionBits === 0x03;
  const sampleRates = isMpeg1
    ? [44100, 48000, 32000]
    : versionBits === 0x02
      ? [22050, 24000, 16000]
      : [11025, 12000, 8000];
  const sampleRate = sampleRates[sampleRateIndex];
  if (!sampleRate) return null;

  const bitrateTable = isMpeg1
    ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const bitrate = bitrateTable[bitrateIndex];
  if (!bitrate) return null;

  const padding = (bytes[i + 2] >> 1) & 0x01;
  const samplesPerFrame = isMpeg1 ? 1152 : 576;
  const frameLength =
    Math.floor(((isMpeg1 ? 144 : 72) * bitrate * 1000) / sampleRate) + padding;
  const isMono = ((bytes[i + 3] >> 6) & 0x03) === 0x03;

  return {
    sampleRate,
    bitrate,
    samplesPerFrame,
    offset: i,
    isMono,
    isMpeg1,
    frameLength,
  };
}

function findFirstMpegFrame(
  bytes: Uint8Array,
  searchStart: number,
): MpegFrameInfo | null {
  if (searchStart >= bytes.length - 4) return null;
  const limit = Math.min(searchStart + 10240, bytes.length - 4);
  let fallback: MpegFrameInfo | null = null;

  for (let i = searchStart; i < limit; i++) {
    const info = parseMpegHeaderAt(bytes, i);
    if (!info) continue;

    // 校验计算出的下一帧位置是否也是合法 MPEG 帧，过滤垃圾字节误命中
    const nextOffset = i + info.frameLength;
    if (nextOffset + 4 <= bytes.length) {
      if (parseMpegHeaderAt(bytes, nextOffset)) {
        return info;
      }
      if (!fallback) fallback = info;
      continue;
    }

    return info;
  }

  return fallback;
}

async function parseMp3Duration(
  file: File,
  prefetch: Uint8Array,
  audioStart: number,
): Promise<{ duration: number; estimated: boolean }> {
  const probeEnd = Math.min(file.size, audioStart + MP3_PROBE_SIZE);
  if (probeEnd <= audioStart) return { duration: 0, estimated: false };

  const probeBytes = await readId3Range(file, prefetch, audioStart, probeEnd);
  const frame = findFirstMpegFrame(probeBytes, 0);
  if (!frame) return { duration: 0, estimated: false };

  // Xing/Info 头偏移取决于 side info 大小
  const xingOffset =
    frame.offset +
    (frame.isMpeg1 ? (frame.isMono ? 21 : 36) : frame.isMono ? 13 : 21);

  // 检查 Xing/Info 头
  if (xingOffset + 12 <= probeBytes.length) {
    const headerId = decodeLatin1(probeBytes.subarray(xingOffset, xingOffset + 4));
    if (headerId === "Xing" || headerId === "Info") {
      const flags = readUint32(probeBytes, xingOffset + 4);
      if (flags & 0x01) {
        const frameCount = readUint32(probeBytes, xingOffset + 8);
        if (frameCount > 0) {
          return {
            duration: (frameCount * frame.samplesPerFrame) / frame.sampleRate,
            estimated: false,
          };
        }
      }
    }
  }

  // 检查 VBRI 头（Fraunhofer 编码器，固定在帧起始偏移 36 字节处）
  const vbriOffset = frame.offset + 36;
  if (vbriOffset + 18 <= probeBytes.length) {
    const headerId = decodeLatin1(probeBytes.subarray(vbriOffset, vbriOffset + 4));
    if (headerId === "VBRI") {
      const frameCount = readUint32(probeBytes, vbriOffset + 14);
      if (frameCount > 0) {
        return {
          duration: (frameCount * frame.samplesPerFrame) / frame.sampleRate,
          estimated: false,
        };
      }
    }
  }

  // 无 Xing/VBRI 头：按 CBR 估算（标记为 estimated，播放时可由 audio.duration 校准）
  const audioBytes = Math.max(0, file.size - audioStart);
  if (frame.bitrate > 0 && audioBytes > 0) {
    return {
      duration: (audioBytes * 8) / (frame.bitrate * 1000),
      estimated: true,
    };
  }

  return { duration: 0, estimated: false };
}

/** 仅当 ID3v2 缺失基础标签时，回退读取文件末尾 128 字节的 ID3v1 标签 */
async function readId3v1Fallback(file: File, metadata: Partial<Track>) {
  if (file.size < 128) return;
  if (metadata.title && metadata.artist && metadata.album) return;

  const tail = new Uint8Array(
    await file.slice(file.size - 128, file.size).arrayBuffer(),
  );
  if (tail.length < 128 || decodeLatin1(tail.subarray(0, 3)) !== "TAG") return;

  if (!metadata.title) {
    const title = sanitizeText(decodeBytes(tail.subarray(3, 33), 0));
    if (title) metadata.title = title;
  }
  if (!metadata.artist) {
    const artist = sanitizeText(decodeBytes(tail.subarray(33, 63), 0));
    if (artist) metadata.artist = artist;
  }
  if (!metadata.album) {
    const album = sanitizeText(decodeBytes(tail.subarray(63, 93), 0));
    if (album) metadata.album = album;
  }
}

// ID3 解析入口

/**
 * 解析 ID3 标签（预读缓冲 + 零拷贝封面优化版）
 *
 * 一次预读文件头部（默认 64KB），小标签与时长探测零额外切片；
 * APIC 封面通过 file.slice() 直接创建 Blob，优先挑选 Front Cover (type === 3)。
 * 全局 unsynchronization 标记时回退到批量读取。
 */
export async function parseId3Tags(file: File) {
  const prefetch = new Uint8Array(
    await file.slice(0, Math.min(file.size, ID3_PREFETCH_SIZE)).arrayBuffer(),
  );

  if (
    prefetch.length < 10 ||
    decodeLatin1(prefetch.subarray(0, 3)) !== "ID3"
  ) {
    // 无 ID3v2 标签，探测时长并尝试 ID3v1 回退
    const metadata: Partial<Track> = {};
    const { duration, estimated } = await parseMp3Duration(file, prefetch, 0);
    if (duration > 0) {
      metadata.duration = duration;
      if (estimated) metadata.durationEstimated = true;
    }
    await readId3v1Fallback(file, metadata);
    return metadata;
  }

  const version = prefetch[3];
  const flags = prefetch[5];
  const declaredSize = readSynchsafe(prefetch, 6);
  const id3End = Math.min(file.size, 10 + declaredSize);

  // 全局 unsynchronization：回退到批量读取
  if (flags & 0x80) {
    const metadata = await parseId3TagsBulk(
      file,
      prefetch,
      version,
      flags,
      id3End,
    );
    await readId3v1Fallback(file, metadata);
    return metadata;
  }

  const metadata: Partial<Track> = {};
  let offset = 10;
  let hasFrontCover = false;

  // 扩展头
  if (flags & 0x40) {
    const extBytes = await readId3Range(file, prefetch, offset, offset + 6);
    if (extBytes.length >= 4) {
      const extSize =
        version === 4 ? readSynchsafe(extBytes, 0) : readUint32(extBytes, 0);
      offset += version === 3 ? extSize + 4 : extSize;
    }
  }

  const tagEnd = id3End;

  // 2. 逐帧迭代（大部分都在 prefetch 内同步完成）
  if (version === 2) {
    while (offset + 6 <= tagEnd) {
      const fh = await readId3Range(file, prefetch, offset, offset + 6);
      if (fh.length < 6) break;

      const frameId = decodeLatin1(fh.subarray(0, 3)).replace(/\0/g, "");
      if (!/^[A-Z0-9]{3}$/.test(frameId)) break;

      const frameSize = readUint24(fh, 3);
      if (!frameSize) break;

      const frameStart = offset + 6;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > tagEnd) break;

      if (
        frameId === "TT2" ||
        frameId === "TP1" ||
        frameId === "TAL" ||
        (frameId === "ULT" && !metadata.lyricsText)
      ) {
        const fb = await readId3Range(file, prefetch, frameStart, frameEnd);
        if (frameId === "TT2") metadata.title = decodeTextFrame(fb);
        else if (frameId === "TP1") metadata.artist = decodeTextFrame(fb);
        else if (frameId === "TAL") metadata.album = decodeTextFrame(fb);
        else if (frameId === "ULT")
          metadata.lyricsText = decodeLyricsFrame(fb, true);
      } else if (frameId === "PIC" && !hasFrontCover) {
        const cover = await decodePicFrameFromSlice(
          file,
          prefetch,
          frameStart,
          frameEnd,
        );
        hasFrontCover = applyCoverCandidate(metadata, cover, hasFrontCover);
      }

      offset = frameEnd;
    }
  } else {
    // ID3v2.3 / v2.4
    while (offset + 10 <= tagEnd) {
      const fh = await readId3Range(file, prefetch, offset, offset + 10);
      if (fh.length < 10) break;

      const frameId = decodeLatin1(fh.subarray(0, 4)).replace(/\0/g, "");
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        version === 4
          ? readSynchsafe(fh, 4)
          : readUint32(fh, 4);
      if (!frameSize) break;

      // ID3v2.4 Format flags 在 fh[9]：bit1 (0x02) 为 unsync，bit0 (0x01) 为 data length indicator
      const frameUnsync = version === 4 && Boolean(fh[9] & 0x02);
      const dataLengthOffset = version === 4 && Boolean(fh[9] & 0x01) ? 4 : 0;

      const frameStart = offset + 10 + dataLengthOffset;
      const frameEnd = offset + 10 + frameSize;
      if (frameEnd > tagEnd || frameStart > frameEnd) break;

      if (
        frameId === "TIT2" ||
        frameId === "TPE1" ||
        frameId === "TALB" ||
        (frameId === "USLT" && !metadata.lyricsText) ||
        (frameId === "APIC" && !hasFrontCover)
      ) {
        if (frameId === "APIC" && !frameUnsync) {
          const cover = await decodeApicFrameFromSlice(
            file,
            prefetch,
            frameStart,
            frameEnd,
          );
          hasFrontCover = applyCoverCandidate(metadata, cover, hasFrontCover);
        } else {
          let fb = await readId3Range(file, prefetch, frameStart, frameEnd);
          if (frameUnsync) fb = removeUnsynchronization(fb);

          if (frameId === "TIT2") metadata.title = decodeTextFrame(fb);
          else if (frameId === "TPE1")
            metadata.artist = decodeTextFrame(fb);
          else if (frameId === "TALB")
            metadata.album = decodeTextFrame(fb);
          else if (frameId === "USLT")
            metadata.lyricsText = decodeLyricsFrame(fb);
          else if (frameId === "APIC") {
            const cover = decodeApicFrame(fb);
            hasFrontCover = applyCoverCandidate(metadata, cover, hasFrontCover);
          }
        }
      }

      offset = frameEnd;
    }
  }

  // 3. 探测时长与 ID3v1 回退
  const { duration, estimated } = await parseMp3Duration(file, prefetch, id3End);
  if (duration > 0) {
    metadata.duration = duration;
    if (estimated) metadata.durationEstimated = true;
  }
  await readId3v1Fallback(file, metadata);
  return metadata;
}

/**
 * ID3 全局 unsynchronization 回退：批量读取整个标签后解析
 */
async function parseId3TagsBulk(
  file: File,
  prefetch: Uint8Array,
  version: number,
  flags: number,
  id3End: number,
): Promise<Partial<Track>> {
  const readEnd = Math.min(file.size, id3End + MP3_PROBE_SIZE);
  const raw = await readId3Range(file, prefetch, 0, readEnd);
  const bytes = removeUnsynchronization(raw);

  const metadata: Partial<Track> = {};
  let offset = 10;
  let hasFrontCover = false;

  if (flags & 0x40) {
    const extSize =
      version === 4 ? readSynchsafe(bytes, offset) : readUint32(bytes, offset);
    offset += version === 3 ? extSize + 4 : extSize;
  }

  const tagLimit = Math.min(bytes.length, id3End);

  if (version === 2) {
    while (offset + 6 <= tagLimit) {
      const frameId = decodeLatin1(bytes.subarray(offset, offset + 3)).replace(
        /\0/g,
        "",
      );
      if (!/^[A-Z0-9]{3}$/.test(frameId)) break;

      const frameSize = readUint24(bytes, offset + 3);
      if (!frameSize) break;

      const frameStart = offset + 6;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > tagLimit) break;

      const frameBytes = bytes.subarray(frameStart, frameEnd);

      if (frameId === "TT2") metadata.title = decodeTextFrame(frameBytes);
      else if (frameId === "TP1") metadata.artist = decodeTextFrame(frameBytes);
      else if (frameId === "TAL") metadata.album = decodeTextFrame(frameBytes);
      else if (frameId === "ULT" && !metadata.lyricsText)
        metadata.lyricsText = decodeLyricsFrame(frameBytes, true);
      else if (frameId === "PIC" && !hasFrontCover) {
        const cover = decodePicFrame(frameBytes);
        hasFrontCover = applyCoverCandidate(metadata, cover, hasFrontCover);
      }

      offset = frameEnd;
    }
  } else {
    while (offset + 10 <= tagLimit) {
      const frameId = decodeLatin1(bytes.subarray(offset, offset + 4)).replace(
        /\0/g,
        "",
      );
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        version === 4
          ? readSynchsafe(bytes, offset + 4)
          : readUint32(bytes, offset + 4);
      if (!frameSize) break;

      const dataLengthOffset = version === 4 && Boolean(bytes[offset + 9] & 0x01) ? 4 : 0;
      const frameStart = offset + 10 + dataLengthOffset;
      const frameEnd = offset + 10 + frameSize;
      if (frameEnd > tagLimit || frameStart > frameEnd) break;

      const frameBytes = bytes.subarray(frameStart, frameEnd);

      if (frameId === "TIT2") metadata.title = decodeTextFrame(frameBytes);
      else if (frameId === "TPE1") metadata.artist = decodeTextFrame(frameBytes);
      else if (frameId === "TALB") metadata.album = decodeTextFrame(frameBytes);
      else if (frameId === "USLT" && !metadata.lyricsText)
        metadata.lyricsText = decodeLyricsFrame(frameBytes);
      else if (frameId === "APIC" && !hasFrontCover) {
        const cover = decodeApicFrame(frameBytes);
        hasFrontCover = applyCoverCandidate(metadata, cover, hasFrontCover);
      }

      offset = frameEnd;
    }
  }

  const { duration, estimated } = await parseMp3Duration(file, prefetch, id3End);
  if (duration > 0) {
    metadata.duration = duration;
    if (estimated) metadata.durationEstimated = true;
  }
  return metadata;
}
