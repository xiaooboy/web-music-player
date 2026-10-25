import type { Track } from "../../types";

/**
 * 解析 WebM/Matroska 的 Info/Duration（最小 EBML 遍历）。
 * 仅用于读取时长，不解析标签。
 */
const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_TIMESTAMP_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;

const HEAD_READ = 256 * 1024;

function readVintLength(firstByte: number) {
  for (let i = 0; i < 8; i++) {
    if (firstByte & (0x80 >> i)) return i + 1;
  }
  return 0;
}

function readElementId(
  bytes: Uint8Array,
  offset: number,
): { id: number; length: number } | null {
  if (offset >= bytes.length) return null;
  const length = readVintLength(bytes[offset]);
  if (!length || offset + length > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + bytes[offset + i];
  return { id, length };
}

function readElementSize(
  bytes: Uint8Array,
  offset: number,
): { value: number; length: number } | null {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  const length = readVintLength(first);
  if (!length || offset + length > bytes.length) return null;
  let value = first & ((1 << (8 - length)) - 1);
  for (let i = 1; i < length; i++) value = value * 256 + bytes[offset + i];
  return { value, length };
}

function readFloatBigEndian(bytes: Uint8Array, offset: number, size: 4 | 8) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, size);
  return size === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
}

export async function parseWebmMetadata(file: File): Promise<Partial<Track>> {
  const bytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, HEAD_READ)).arrayBuffer(),
  );
  if (bytes.length < 4) return {};

  // 定位 Segment
  let offset = 0;
  let segmentStart = -1;
  let segmentEnd = bytes.length;
  while (offset + 2 <= bytes.length) {
    const id = readElementId(bytes, offset);
    if (!id) break;
    const size = readElementSize(bytes, offset + id.length);
    if (!size) break;
    if (id.id === ID_SEGMENT) {
      segmentStart = offset + id.length + size.length;
      const end = segmentStart + size.value;
      // 未读完整文件或 unknown size 时，限制在已读范围（Info 通常在开头）
      segmentEnd =
        Number.isSafeInteger(end) && end <= bytes.length ? end : bytes.length;
      break;
    }
    offset += id.length + size.length + size.value;
  }
  if (segmentStart < 0) return {};

  // 定位 Info
  offset = segmentStart;
  let infoStart = -1;
  let infoEnd = segmentEnd;
  while (offset + 2 <= segmentEnd) {
    const id = readElementId(bytes, offset);
    if (!id) break;
    const size = readElementSize(bytes, offset + id.length);
    if (!size) break;
    if (id.id === ID_INFO) {
      infoStart = offset + id.length + size.length;
      const end = infoStart + size.value;
      infoEnd =
        Number.isSafeInteger(end) && end <= segmentEnd ? end : segmentEnd;
      break;
    }
    offset += id.length + size.length + size.value;
  }
  if (infoStart < 0) return {};

  // 在 Info 内读取 TimestampScale 与 Duration
  let timestampScale = 1_000_000; // 默认 1ms
  let durationTicks = Number.NaN;
  offset = infoStart;
  while (offset + 2 <= infoEnd) {
    const id = readElementId(bytes, offset);
    if (!id) break;
    const size = readElementSize(bytes, offset + id.length);
    if (!size) break;
    const payloadStart = offset + id.length + size.length;

    if (id.id === ID_TIMESTAMP_SCALE && size.value >= 1) {
      let value = 0;
      for (let i = 0; i < Math.min(size.value, 8); i++) {
        value = value * 256 + bytes[payloadStart + i];
      }
      timestampScale = value;
    } else if (id.id === ID_DURATION) {
      if (size.value === 4) {
        durationTicks = readFloatBigEndian(bytes, payloadStart, 4);
      } else if (size.value === 8) {
        durationTicks = readFloatBigEndian(bytes, payloadStart, 8);
      }
    }
    offset = payloadStart + size.value;
  }

  if (Number.isFinite(durationTicks) && timestampScale > 0) {
    return { duration: (durationTicks * timestampScale) / 1_000_000_000 };
  }
  return {};
}
