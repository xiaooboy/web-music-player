import { revokeCoverUrls } from "./coverCache";

import type { FileEntry, LyricsLine, Track } from "../types";

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "flac",
  "m4a",
  "aac",
  "ogg",
  "opus",
  "webm",
]);
export type DirectoryPickerOptions = {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: string;
};

type WindowWithDirectoryPicker = Window &
  typeof globalThis & {
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions,
    ) => Promise<FileSystemDirectoryHandle>;
  };

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};

type DirectoryPermissionDescriptor = {
  mode?: "read" | "readwrite";
};

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (
    descriptor?: DirectoryPermissionDescriptor,
  ) => Promise<PermissionState>;
  requestPermission?: (
    descriptor?: DirectoryPermissionDescriptor,
  ) => Promise<PermissionState>;
};

export function supportsDirectoryPicker() {
  const pickerWindow = window as WindowWithDirectoryPicker;
  return Boolean(pickerWindow.showDirectoryPicker) && window.isSecureContext;
}

export async function pickDirectory(options?: DirectoryPickerOptions) {
  const pickerWindow = window as WindowWithDirectoryPicker;
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error("showDirectoryPicker is not supported");
  }

  return pickerWindow.showDirectoryPicker(options);
}

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded = false,
) {
  const permissionHandle = handle as PermissionAwareDirectoryHandle;
  const options = { mode: "read" as const };

  if (typeof permissionHandle.queryPermission === "function") {
    const currentPermission = await permissionHandle.queryPermission(options);
    if (currentPermission === "granted" || !requestIfNeeded) {
      return currentPermission;
    }
  }

  if (typeof permissionHandle.requestPermission === "function") {
    try {
      // requestPermission must be called during a user activation (e.g., click).
      // If it's invoked without activation some browsers throw a SecurityError.
      const requested = await permissionHandle.requestPermission(options);
      return requested;
    } catch (e) {
      // Treat failures (like SecurityError due to missing user activation) as "prompt"
      // so callers can retry from a user gesture instead of crashing.
      // Log at debug level to help troubleshooting.
      // eslint-disable-next-line no-console
      console.warn("ensureDirectoryPermission: requestPermission failed", e);
      return "prompt" as PermissionState;
    }
  }

  return "prompt" as PermissionState;
}

export async function collectAudioFiles(
  handle: FileSystemDirectoryHandle,
  parentPath = "",
): Promise<FileEntry[]> {
  return collectDirectoryFiles(handle, parentPath).then((entries) =>
    entries.filter(({ file }) => isAudioFile(file.name, file.type)),
  );
}

export async function collectDirectoryFiles(
  handle: FileSystemDirectoryHandle,
  parentPath = "",
): Promise<FileEntry[]> {
  const directory = handle as IterableDirectoryHandle;
  const filePromises: Promise<FileEntry>[] = [];
  const dirPromises: Promise<FileEntry[]>[] = [];

  for await (const [, entry] of directory.entries()) {
    const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      dirPromises.push(
        collectDirectoryFiles(entry as FileSystemDirectoryHandle, currentPath),
      );
    } else {
      filePromises.push(
        (entry as FileSystemFileHandle)
          .getFile()
          .then((file) => ({ file, relativePath: currentPath })),
      );
    }
  }

  const [fileEntries, ...dirEntries] = await Promise.all([
    Promise.all(filePromises),
    ...dirPromises,
  ]);

  return [...fileEntries, ...dirEntries.flat()];
}
/**
 * FileList -> FileEntry[]
 */
export function entriesFromInput(files: FileList | null) {
  return Array.from(files || []).map((file) => ({
    file,
    relativePath: normalizeSlashes(file.webkitRelativePath || file.name),
  }));
}

export function generateTrackId(path: string, file: File) {
  return `${normalizeSlashes(path)}::${file.lastModified}`;
}

export async function buildTrack(
  entry: FileEntry,
  externalLyricsText = "",
): Promise<Track> {
  const { file, relativePath } = entry;
  const fallback = inferTrackInfoFromFile(file.name);
  const extension = getFileExtension(file.name);
  const format = extension.toUpperCase() || "AUDIO";

  let metadata: Partial<Track> = {};
  try {
    if (extension === "mp3") metadata = await parseId3Tags(file);
    else if (extension === "flac") metadata = await parseFlacMetadata(file);
    else if (extension === "m4a" || extension === "mp4")
      metadata = await parseMp4Metadata(file);
  } catch {
    // 解析失败时使用空元信息
  }
  const duration = metadata.duration || (await probeDuration(file));

  return {
    id: generateTrackId(relativePath, file),
    file,
    lastModified: file.lastModified,
    relativePath: normalizeSlashes(relativePath),
    title: metadata.title || fallback.title,
    artist: metadata.artist || fallback.artist,
    album: metadata.album || fallback.album,
    coverBlob: metadata.coverBlob,
    duration,
    format,
    lyricsText: externalLyricsText || metadata.lyricsText || "",
    isPlayable: true,
  };
}


export function revokeTrackResources(tracks: Track[]) {
  revokeCoverUrls(tracks.map((t) => t.id));
}

export function isAudioFile(fileName: string, mimeType = "") {
  if (mimeType.startsWith("audio/")) {
    return true;
  }

  return AUDIO_EXTENSIONS.has(getFileExtension(fileName));
}

export function isLyricsFile(fileName: string) {
  return getFileExtension(fileName) === "lrc";
}

export function getFileExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}

export function normalizeSlashes(value: string) {
  return value.replace(/\\/g, "/");
}

export function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00";
  }

  const safeSeconds = Math.floor(seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
}

export async function buildLyricsLookup(entries: FileEntry[]) {
  const lookup = new Map<string, string>();

  await Promise.all(
    entries
      .filter((entry) => isLyricsFile(entry.file.name))
      .map(async (entry) => {
        const stem = getLyricsLookupKey(entry.relativePath);
        try {
          lookup.set(stem, await entry.file.text());
        } catch {
          lookup.set(stem, "");
        }
      }),
  );

  return lookup;
}

export function getLyricsLookupKey(relativePath: string) {
  return normalizeSlashes(relativePath)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}

export function parseLyricsText(lyricsText: string): LyricsLine[] {
  if (!lyricsText.trim()) {
    return [];
  }

  const lines = lyricsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: LyricsLine[] = [];
  let hasTimestamp = false;

  for (const line of lines) {
    const matches = [
      ...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g),
    ];
    const text = line
      .replace(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, "")
      .replace(/\[[a-zA-Z]+:[^\]]*\]/g, "")
      .trim();

    if (!matches.length) {
      if (text) {
        parsed.push({ time: null, text });
      }
      continue;
    }

    hasTimestamp = true;
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractionRaw = match[3] || "0";
      const fraction =
        fractionRaw.length >= 3
          ? Number(fractionRaw) / 1000
          : Number(fractionRaw) / 100;
      parsed.push({
        time: minutes * 60 + seconds + fraction,
        text: text || "…",
      });
    }
  }

  return hasTimestamp
    ? parsed.sort((left, right) => (left.time || 0) - (right.time || 0))
    : parsed.map((line) => ({ ...line, time: null }));
}

function inferTrackInfoFromFile(fileName: string) {
  const rawName = stripExtension(fileName);
  const nameParts = rawName
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (nameParts.length >= 2) {
    return {
      artist: nameParts[0],
      title: nameParts.slice(1).join(" - "),
      album: "本地专辑",
    };
  }

  return {
    artist: "未知艺术家",
    title: rawName,
    album: "本地专辑",
  };
}

export async function probeDuration(file: File) {
  return new Promise<number>((resolve) => {
    const probe = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (duration = 0) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      probe.removeAttribute("src");
      resolve(Number.isFinite(duration) ? duration : 0);
    };

    const timeout = setTimeout(() => finish(0), 10_000);

    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => finish(probe.duration), {
      once: true,
    });
    probe.addEventListener("error", () => finish(0), { once: true });
    probe.src = url;
  });
}

/**
 * 从 MPEG 音频帧的 Xing/VBRI 信息头提取时长
 * @param bytes 文件头部字节数组
 * @param searchStart 开始搜索的偏移量（ID3 标签之后为 10+declaredSize，无 ID3 时为 0）
 */
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

async function parseId3Tags(file: File) {
  const headerBuffer = await file
    .slice(0, Math.min(file.size, 2 * 1024 * 1024))
    .arrayBuffer();
  let bytes = new Uint8Array(headerBuffer);
  const metadata: Partial<Track> = {};
  let id3End = 0;

  if (decodeLatin1(bytes.slice(0, 3)) !== "ID3") {
    const duration = parseMp3FrameDuration(bytes, id3End);
    if (duration > 0) metadata.duration = duration;
    return metadata;
  }

  const version = bytes[3];
  const flags = bytes[5];
  const declaredSize = readSynchsafe(bytes, 6);
  id3End = 10 + declaredSize;
  let offset = 10;

  if (flags & 0x80) {
    bytes = removeUnsynchronization(bytes);
  }

  if (flags & 0x40) {
    const extSize =
      version === 4 ? readSynchsafe(bytes, offset) : readUint32(bytes, offset);
    offset += version === 3 ? extSize + 4 : extSize;
  }

  const tagLimit = Math.min(bytes.length, 10 + declaredSize);

  if (version === 2) {
    while (offset + 6 <= tagLimit) {
      const frameId = decodeLatin1(bytes.slice(offset, offset + 3)).replace(
        /\0/g,
        "",
      );
      if (!/^[A-Z0-9]{3}$/.test(frameId)) {
        break;
      }

      const frameSize = readUint24(bytes, offset + 3);
      if (!frameSize) {
        break;
      }

      const frameStart = offset + 6;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > tagLimit) {
        break;
      }

      const frameBytes = bytes.slice(frameStart, frameEnd);

      if (frameId === "TT2") {
        metadata.title = decodeTextFrame(frameBytes);
      }

      if (frameId === "TP1") {
        metadata.artist = decodeTextFrame(frameBytes);
      }

      if (frameId === "TAL") {
        metadata.album = decodeTextFrame(frameBytes);
      }

      if (frameId === "ULT" && !metadata.lyricsText) {
        metadata.lyricsText = decodeLyricsFrame(frameBytes, true);
      }

      if (frameId === "PIC" && !metadata.coverBlob) {
        const cover = decodePicFrame(frameBytes);
        if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
      }

      offset = frameEnd;
    }

    const duration = parseMp3FrameDuration(bytes, id3End);
    if (duration > 0) metadata.duration = duration;
    return metadata;
  }

  while (offset + 10 <= tagLimit) {
    const frameId = decodeLatin1(bytes.slice(offset, offset + 4)).replace(
      /\0/g,
      "",
    );
    if (!/^[A-Z0-9]{4}$/.test(frameId)) {
      break;
    }

    const frameSize =
      version === 4
        ? readSynchsafe(bytes, offset + 4)
        : readUint32(bytes, offset + 4);
    if (!frameSize) {
      break;
    }

    const frameStart = offset + 10;
    const frameEnd = frameStart + frameSize;
    if (frameEnd > tagLimit) {
      break;
    }

    const frameBytes = bytes.slice(frameStart, frameEnd);

    if (frameId === "TIT2") {
      metadata.title = decodeTextFrame(frameBytes);
    }

    if (frameId === "TPE1") {
      metadata.artist = decodeTextFrame(frameBytes);
    }

    if (frameId === "TALB") {
      metadata.album = decodeTextFrame(frameBytes);
    }

    if (frameId === "USLT" && !metadata.lyricsText) {
      metadata.lyricsText = decodeLyricsFrame(frameBytes);
    }

    if (frameId === "APIC" && !metadata.coverBlob) {
      const cover = decodeApicFrame(frameBytes);
      if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
    }

    offset = frameEnd;
  }

  const duration = parseMp3FrameDuration(bytes, id3End);
  if (duration > 0) metadata.duration = duration;
  return metadata;
}

/**
 * 解析单个 FLAC 元数据块并更新 metadata
 */
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

async function parseFlacMetadata(file: File) {
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

/**
 * 扫描 MP4 顶层 atom 头部，定位 moov atom 的偏移与大小
 */
async function findMp4MoovAtom(
  file: File,
): Promise<{ offset: number; size: number } | null> {
  let fileOffset = 0;

  while (fileOffset + 8 <= file.size) {
    // 读取 atom 头部（最多 16 字节以支持扩展大小）
    const headerReadEnd = Math.min(file.size, fileOffset + 16);
    const headerBytes = new Uint8Array(
      await file.slice(fileOffset, headerReadEnd).arrayBuffer(),
    );
    if (headerBytes.length < 8) break;

    let atomSize = readUint32(headerBytes, 0);
    const atomType = decodeLatin1(headerBytes.slice(4, 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (headerBytes.length < 16) break;
      atomSize = readUint64(headerBytes, 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = file.size - fileOffset;
    }

    if (atomSize < headerSize) break;

    if (atomType === "moov") {
      return { offset: fileOffset, size: atomSize };
    }

    fileOffset += atomSize;
  }

  return null;
}

async function parseMp4Metadata(file: File) {
  const MAX_MOOV_READ = 10 * 1024 * 1024;

  // 定位 moov atom，仅读取该部分而非整个文件前 16MB
  const moov = await findMp4MoovAtom(file);
  if (!moov || moov.size > MAX_MOOV_READ) return {};

  const moovBytes = new Uint8Array(
    await file.slice(moov.offset, moov.offset + moov.size).arrayBuffer(),
  );
  const metadata: Partial<Track> = {};

  walkMp4Atoms(moovBytes, 0, moovBytes.length, [], metadata);
  return metadata;
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

function decodeVorbisCommentBlock(blockBytes: Uint8Array) {
  if (blockBytes.length < 8) {
    return {};
  }

  const metadata: Partial<Track> = {};
  let offset = 0;
  const vendorLength = readUint32LE(blockBytes, offset);
  offset += 4 + vendorLength;

  if (offset + 4 > blockBytes.length) {
    return metadata;
  }

  const commentCount = readUint32LE(blockBytes, offset);
  offset += 4;

  for (let index = 0; index < commentCount; index += 1) {
    if (offset + 4 > blockBytes.length) {
      break;
    }

    const commentLength = readUint32LE(blockBytes, offset);
    offset += 4;
    if (offset + commentLength > blockBytes.length) {
      break;
    }

    const comment = sanitizeText(
      new TextDecoder("utf-8").decode(
        blockBytes.slice(offset, offset + commentLength),
      ),
    );
    offset += commentLength;

    const separatorIndex = comment.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

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
  }

  return metadata;
}

function decodeFlacPictureBlock(blockBytes: Uint8Array) {
  let offset = 0;
  if (blockBytes.length < 32) {
    return {};
  }

  offset += 4;
  const mimeLength = readUint32(blockBytes, offset);
  offset += 4;
  if (offset + mimeLength > blockBytes.length) {
    return {};
  }

  const mimeType = normalizeMimeType(
    decodeLatin1(blockBytes.slice(offset, offset + mimeLength)),
  );
  offset += mimeLength;

  const descriptionLength = readUint32(blockBytes, offset);
  offset += 4 + descriptionLength;
  offset += 16;

  if (offset + 4 > blockBytes.length) {
    return {};
  }

  const imageLength = readUint32(blockBytes, offset);
  offset += 4;
  if (offset + imageLength > blockBytes.length) {
    return {};
  }

  const imageBytes = blockBytes.slice(offset, offset + imageLength);
  if (!imageBytes.length) {
    return {};
  }

  return createCoverBlob(imageBytes, mimeType);
}

function walkMp4Atoms(
  bytes: Uint8Array,
  start: number,
  end: number,
  path: string[],
  metadata: Partial<Track>,
) {
  let offset = start;

  while (offset + 8 <= end) {
    let atomSize = readUint32(bytes, offset);
    const atomType = decodeLatin1(bytes.slice(offset + 4, offset + 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > end) {
        break;
      }

      atomSize = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) {
      break;
    }

    const atomEnd = offset + atomSize;
    if (atomEnd > end) {
      break;
    }

    const nextPath = [...path, atomType];
    if (isMp4ContainerAtom(atomType)) {
      const childStart =
        atomType === "meta" ? offset + headerSize + 4 : offset + headerSize;
      if (childStart <= atomEnd) {
        walkMp4Atoms(bytes, childStart, atomEnd, nextPath, metadata);
      }
    } else if (atomType === "mdhd" && !metadata.duration) {
      // Media Header Box: 提取时长
      const payloadStart = offset + headerSize;
      if (payloadStart + 8 <= atomEnd) {
        const version = bytes[payloadStart];
        const needed = version === 0 ? 20 : 32;
        if (payloadStart + needed <= atomEnd) {
          const timescale =
            version === 0
              ? readUint32(bytes, payloadStart + 12)
              : readUint32(bytes, payloadStart + 20);
          const durationValue =
            version === 0
              ? readUint32(bytes, payloadStart + 16)
              : readUint64(bytes, payloadStart + 24);
          if (timescale > 0) {
            metadata.duration = durationValue / timescale;
          }
        }
      }
    } else if (path[path.length - 1] === "ilst") {
      parseMp4MetadataAtom(
        atomType,
        bytes,
        offset + headerSize,
        atomEnd,
        metadata,
      );
    }

    offset = atomEnd;
  }
}

function parseMp4MetadataAtom(
  atomType: string,
  bytes: Uint8Array,
  start: number,
  end: number,
  metadata: Partial<Track>,
) {
  let offset = start;

  while (offset + 8 <= end) {
    let atomSize = readUint32(bytes, offset);
    const childType = decodeLatin1(bytes.slice(offset + 4, offset + 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > end) {
        break;
      }

      atomSize = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) {
      break;
    }

    const atomEnd = offset + atomSize;
    if (atomEnd > end) {
      break;
    }

    if (childType === "data" && atomEnd >= offset + headerSize + 8) {
      const payload = bytes.slice(offset + headerSize + 8, atomEnd);
      if (atomType === "covr" && !metadata.coverBlob) {
        const cover = decodeMp4Cover(payload);
            if (cover.coverBlob) metadata.coverBlob = cover.coverBlob;
      }

      if ((atomType === "\u00a9nam" || atomType === "nam") && !metadata.title) {
        metadata.title = decodeMp4Text(payload);
      }

      if (
        (atomType === "\u00a9ART" || atomType === "aART") &&
        !metadata.artist
      ) {
        metadata.artist = decodeMp4Text(payload);
      }

      if ((atomType === "\u00a9alb" || atomType === "alb") && !metadata.album) {
        metadata.album = decodeMp4Text(payload);
      }

      if (
        (atomType === "\u00a9lyr" || atomType === "lyr") &&
        !metadata.lyricsText
      ) {
        metadata.lyricsText = decodeMp4Text(payload);
      }
    }

    offset = atomEnd;
  }
}

function decodeMp4Cover(payload: Uint8Array) {
  if (!payload.length) {
    return {};
  }

  const mimeType = detectImageMimeType(payload);
  return createCoverBlob(payload, mimeType);
}

function decodeMp4Text(payload: Uint8Array) {
  if (!payload.length) {
    return "";
  }

  try {
    return sanitizeText(new TextDecoder("utf-8").decode(payload));
  } catch {
    return sanitizeText(decodeLatin1(payload));
  }
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

function decodeLatin1(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function readSynchsafe(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 21) |
      (bytes[offset + 1] << 14) |
      (bytes[offset + 2] << 7) |
      bytes[offset + 3]) >>>
    0
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

function readUint24(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]) >>> 0
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

function isMp4ContainerAtom(atomType: string) {
  return (
    atomType === "moov" ||
    atomType === "udta" ||
    atomType === "ilst" ||
    atomType === "trak" ||
    atomType === "mdia" ||
    atomType === "minf" ||
    atomType === "stbl" ||
    atomType === "meta"
  );
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
