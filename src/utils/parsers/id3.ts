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

/** MP3 时长探测读取量：覆盖 Xing/VBRI 头所需的最大搜索范围 */
const MP3_PROBE_SIZE = 10244;

/** APIC/PIC 帧头部预读量，用于定位图片数据起始偏移 */
const COVER_PEEK_SIZE = 512;

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
  const encoding = frameBytes[0];
  const content = frameBytes.slice(1);
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

  return sanitizeText(decodeBytes(frameBytes.slice(offset), encoding));
}

function decodeApicFrame(frameBytes: Uint8Array) {
  const encoding = frameBytes[0];
  let offset = 1;
  const mimeEnd = frameBytes.indexOf(0, offset);
  if (mimeEnd === -1) {
    return {};
  }

  const mimeType = normalizeMimeType(
    decodeLatin1(frameBytes.slice(offset, mimeEnd)),
  );
  if (mimeType === "-->") {
    return {};
  }

  offset = mimeEnd + 1;
  offset += 1;
  offset = findEncodedTextEnd(frameBytes, offset, encoding);

  const imageBytes = frameBytes.slice(offset);
  if (!imageBytes.length) {
    return {};
  }

  return createCoverBlob(imageBytes, mimeType);
}

/**
 * APIC 按需读取版：只预读帧头部定位图片偏移，
 * 然后通过 file.slice() 直接创建封面 Blob——图片字节不进入 JS 堆。
 * 若描述过长超出预读窗口，回退到完整帧读取。
 */
async function decodeApicFrameFromSlice(
  file: File,
  frameStart: number,
  frameEnd: number,
): Promise<CoverResult> {
  const peekEnd = Math.min(frameEnd, frameStart + COVER_PEEK_SIZE);
  const peek = new Uint8Array(
    await file.slice(frameStart, peekEnd).arrayBuffer(),
  );

  const encoding = peek[0];
  let offset = 1;

  const mimeEnd = peek.indexOf(0, offset);
  if (mimeEnd === -1) return {};

  const mimeType = normalizeMimeType(
    decodeLatin1(peek.slice(offset, mimeEnd)),
  );
  if (mimeType === "-->") return {};

  offset = mimeEnd + 1;
  offset += 1; // picture type
  offset = findEncodedTextEnd(peek, offset, encoding);

  // 描述超出预读窗口，回退到完整帧读取
  if (offset >= peek.length && peekEnd < frameEnd) {
    const fb = new Uint8Array(
      await file.slice(frameStart, frameEnd).arrayBuffer(),
    );
    return decodeApicFrame(fb);
  }

  const imageFileOffset = frameStart + offset;
  const imageLength = frameEnd - imageFileOffset;
  if (imageLength <= 0) return {};

  // file.slice() 创建的 Blob 是对文件区域的懒引用，图片数据零拷贝
  const coverBlob = file.slice(imageFileOffset, frameEnd, mimeType);
  return { coverBlob };
}

function decodePicFrame(frameBytes: Uint8Array) {
  const encoding = frameBytes[0];
  const format = decodeLatin1(frameBytes.slice(1, 4)).toUpperCase();
  let offset = 4;

  offset += 1;
  offset = findEncodedTextEnd(frameBytes, offset, encoding);

  const imageBytes = frameBytes.slice(offset);
  if (!imageBytes.length) {
    return {};
  }

  const mimeType = normalizeMimeType(formatToMimeType(format));
  return createCoverBlob(imageBytes, mimeType);
}

/**
 * PIC (ID3v2.2) 按需读取版：与 decodeApicFrameFromSlice 同理，
 * 通过 file.slice() 创建封面 Blob。
 */
async function decodePicFrameFromSlice(
  file: File,
  frameStart: number,
  frameEnd: number,
): Promise<CoverResult> {
  const peekEnd = Math.min(frameEnd, frameStart + COVER_PEEK_SIZE);
  const peek = new Uint8Array(
    await file.slice(frameStart, peekEnd).arrayBuffer(),
  );

  const encoding = peek[0];
  const format = decodeLatin1(peek.slice(1, 4)).toUpperCase();
  let offset = 4;

  offset += 1; // picture type
  offset = findEncodedTextEnd(peek, offset, encoding);

  if (offset >= peek.length && peekEnd < frameEnd) {
    const fb = new Uint8Array(
      await file.slice(frameStart, frameEnd).arrayBuffer(),
    );
    return decodePicFrame(fb);
  }

  const imageFileOffset = frameStart + offset;
  const imageLength = frameEnd - imageFileOffset;
  if (imageLength <= 0) return {};

  const mimeType = normalizeMimeType(formatToMimeType(format));
  const coverBlob = file.slice(imageFileOffset, frameEnd, mimeType);
  return { coverBlob };
}

// 时长探测

function parseMp3FrameDuration(bytes: Uint8Array, searchStart: number): number {
  if (searchStart >= bytes.length - 4) return 0;
  const limit = Math.min(searchStart + 10240, bytes.length - 4);

  for (let i = searchStart; i < limit; i++) {
    // 查找 MPEG 帧同步字: 0xFF + 0xE0+
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;

    const versionBits = (bytes[i + 1] >> 3) & 0x03;
    const layerBits = (bytes[i + 1] >> 1) & 0x03;
    const bitrateIndex = (bytes[i + 2] >> 4) & 0x0f;
    const sampleRateIndex = (bytes[i + 2] >> 2) & 0x03;

    // 版本: 00=2.5, 01=reserved, 10=2, 11=1
    if (versionBits === 0x01) continue;
    // 仅处理 Layer III
    if (layerBits !== 0x01) continue;
    // 比特率和采样率索引不能是保留值
    if (bitrateIndex === 0x00 || bitrateIndex === 0x0f) continue;
    if (sampleRateIndex === 0x03) continue;

    const isMpeg1 = versionBits === 0x03;
    const sampleRates = isMpeg1
      ? [44100, 48000, 32000]
      : versionBits === 0x02
        ? [22050, 24000, 16000]
        : [11025, 12000, 8000];
    const sampleRate = sampleRates[sampleRateIndex];
    if (!sampleRate) continue;

    const samplesPerFrame = isMpeg1 ? 1152 : 576;
    const isMono = ((bytes[i + 3] >> 6) & 0x03) === 0x03;

    // Xing/Info 头偏移取决于 side info 大小
    const xingOffset = i + (isMpeg1 ? (isMono ? 21 : 36) : isMono ? 13 : 21);

    // 检查 Xing/Info 头
    if (xingOffset + 12 <= bytes.length) {
      const headerId = decodeLatin1(bytes.slice(xingOffset, xingOffset + 4));
      if (headerId === "Xing" || headerId === "Info") {
        const flags = readUint32(bytes, xingOffset + 4);
        if (flags & 0x01) {
          const frameCount = readUint32(bytes, xingOffset + 8);
          if (frameCount > 0) {
            return (frameCount * samplesPerFrame) / sampleRate;
          }
        }
      }
    }

    // 检查 VBRI 头（Fraunhofer 编码器，固定在帧起始偏移 36 字节处）
    const vbriOffset = i + 36;
    if (vbriOffset + 18 <= bytes.length) {
      const headerId = decodeLatin1(bytes.slice(vbriOffset, vbriOffset + 4));
      if (headerId === "VBRI") {
        const frameCount = readUint32(bytes, vbriOffset + 14);
        if (frameCount > 0) {
          return (frameCount * samplesPerFrame) / sampleRate;
        }
      }
    }

    // 找到有效 MPEG 帧但无 Xing/VBRI 头，不再继续搜索
    break;
  }

  return 0;
}

// ID3 解析入口

/**
 * 解析 ID3 标签（按需读取优化版）
 *
 * 仅逐帧读取帧头，只拉取目标帧数据；
 * APIC 封面通过 file.slice() 直接创建 Blob，避免图片字节进入 JS 堆。
 * 全局 unsynchronization 标记时回退到批量读取。
 */
export async function parseId3Tags(file: File) {
  // 1. 读取 ID3 头部（10 字节）
  const headerBytes = new Uint8Array(
    await file.slice(0, 10).arrayBuffer(),
  );

  if (
    headerBytes.length < 10 ||
    decodeLatin1(headerBytes.slice(0, 3)) !== "ID3"
  ) {
    // 无 ID3 标签，直接探测时长
    const metadata: Partial<Track> = {};
    const probeBytes = new Uint8Array(
      await file.slice(0, MP3_PROBE_SIZE).arrayBuffer(),
    );
    const duration = parseMp3FrameDuration(probeBytes, 0);
    if (duration > 0) metadata.duration = duration;
    return metadata;
  }

  const version = headerBytes[3];
  const flags = headerBytes[5];
  const declaredSize = readSynchsafe(headerBytes, 6);
  const id3End = 10 + declaredSize;

  // 全局 unsynchronization：回退到批量读取
  if (flags & 0x80) {
    return parseId3TagsBulk(file, version, flags, declaredSize, id3End);
  }

  const metadata: Partial<Track> = {};
  let offset = 10;

  // 扩展头
  if (flags & 0x40) {
    const extBytes = new Uint8Array(
      await file.slice(offset, offset + 6).arrayBuffer(),
    );
    const extSize =
      version === 4 ? readSynchsafe(extBytes, 0) : readUint32(extBytes, 0);
    offset += version === 3 ? extSize + 4 : extSize;
  }

  const tagEnd = id3End;

  // 2. 逐帧迭代，只读取目标帧
  if (version === 2) {
    while (offset + 6 <= tagEnd) {
      const fh = new Uint8Array(
        await file.slice(offset, offset + 6).arrayBuffer(),
      );
      if (fh.length < 6) break;

      const frameId = decodeLatin1(fh.slice(0, 3)).replace(/\0/g, "");
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
        const fb = new Uint8Array(
          await file.slice(frameStart, frameEnd).arrayBuffer(),
        );
        if (frameId === "TT2") metadata.title = decodeTextFrame(fb);
        else if (frameId === "TP1") metadata.artist = decodeTextFrame(fb);
        else if (frameId === "TAL") metadata.album = decodeTextFrame(fb);
        else if (frameId === "ULT")
          metadata.lyricsText = decodeLyricsFrame(fb, true);
      } else if (frameId === "PIC" && !metadata.coverBlob) {
        // PIC：通过 file.slice() 直接创建封面 Blob
        const cover = await decodePicFrameFromSlice(
          file,
          frameStart,
          frameEnd,
        );
        if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
      }

      offset = frameEnd;
    }
  } else {
    // ID3v2.3 / v2.4
    while (offset + 10 <= tagEnd) {
      const fh = new Uint8Array(
        await file.slice(offset, offset + 10).arrayBuffer(),
      );
      if (fh.length < 10) break;

      const frameId = decodeLatin1(fh.slice(0, 4)).replace(/\0/g, "");
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        version === 4
          ? readSynchsafe(fh, 4)
          : readUint32(fh, 4);
      if (!frameSize) break;

      // ID3v2.4 帧级 unsynchronization 标记
      const frameUnsync = version === 4 && Boolean(fh[8] & 0x80);

      const frameStart = offset + 10;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > tagEnd) break;

      if (
        frameId === "TIT2" ||
        frameId === "TPE1" ||
        frameId === "TALB" ||
        (frameId === "USLT" && !metadata.lyricsText) ||
        (frameId === "APIC" && !metadata.coverBlob)
      ) {
        if (frameId === "APIC" && !frameUnsync) {
          // APIC 无 unsync：通过 file.slice() 直接创建封面 Blob
          const cover = await decodeApicFrameFromSlice(
            file,
            frameStart,
            frameEnd,
          );
          if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
        } else {
          let fb = new Uint8Array(
            await file.slice(frameStart, frameEnd).arrayBuffer(),
          );
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
            if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
          }
        }
      }

      offset = frameEnd;
    }
  }

  // 3. 探测时长
  const probeBytes = new Uint8Array(
    await file.slice(id3End, id3End + MP3_PROBE_SIZE).arrayBuffer(),
  );
  const duration = parseMp3FrameDuration(probeBytes, 0);
  if (duration > 0) metadata.duration = duration;
  return metadata;
}

/**
 * ID3 全局 unsynchronization 回退：批量读取整个标签后解析
 */
async function parseId3TagsBulk(
  file: File,
  version: number,
  flags: number,
  declaredSize: number,
  id3End: number,
): Promise<Partial<Track>> {
  const readEnd = Math.min(file.size, id3End + MP3_PROBE_SIZE);
  const bytes = removeUnsynchronization(
    new Uint8Array(await file.slice(0, readEnd).arrayBuffer()),
  );

  const metadata: Partial<Track> = {};
  let offset = 10;

  if (flags & 0x40) {
    const extSize =
      version === 4 ? readSynchsafe(bytes, offset) : readUint32(bytes, offset);
    offset += version === 3 ? extSize + 4 : extSize;
  }

  const tagLimit = Math.min(bytes.length, id3End);

  if (version === 2) {
    while (offset + 6 <= tagLimit) {
      const frameId = decodeLatin1(bytes.slice(offset, offset + 3)).replace(
        /\0/g,
        "",
      );
      if (!/^[A-Z0-9]{3}$/.test(frameId)) break;

      const frameSize = readUint24(bytes, offset + 3);
      if (!frameSize) break;

      const frameStart = offset + 6;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > tagLimit) break;

      const frameBytes = bytes.slice(frameStart, frameEnd);

      if (frameId === "TT2") metadata.title = decodeTextFrame(frameBytes);
      if (frameId === "TP1") metadata.artist = decodeTextFrame(frameBytes);
      if (frameId === "TAL") metadata.album = decodeTextFrame(frameBytes);
      if (frameId === "ULT" && !metadata.lyricsText)
        metadata.lyricsText = decodeLyricsFrame(frameBytes, true);
      if (frameId === "PIC" && !metadata.coverBlob) {
        const cover = decodePicFrame(frameBytes);
        if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
      }

      offset = frameEnd;
    }
  } else {
    while (offset + 10 <= tagLimit) {
      const frameId = decodeLatin1(bytes.slice(offset, offset + 4)).replace(
        /\0/g,
        "",
      );
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        version === 4
          ? readSynchsafe(bytes, offset + 4)
          : readUint32(bytes, offset + 4);
      if (!frameSize) break;

      const frameStart = offset + 10;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > tagLimit) break;

      const frameBytes = bytes.slice(frameStart, frameEnd);

      if (frameId === "TIT2") metadata.title = decodeTextFrame(frameBytes);
      if (frameId === "TPE1") metadata.artist = decodeTextFrame(frameBytes);
      if (frameId === "TALB") metadata.album = decodeTextFrame(frameBytes);
      if (frameId === "USLT" && !metadata.lyricsText)
        metadata.lyricsText = decodeLyricsFrame(frameBytes);
      if (frameId === "APIC" && !metadata.coverBlob) {
        const cover = decodeApicFrame(frameBytes);
        if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
      }

      offset = frameEnd;
    }
  }

  const duration = parseMp3FrameDuration(bytes, id3End);
  if (duration > 0) metadata.duration = duration;
  return metadata;
}
