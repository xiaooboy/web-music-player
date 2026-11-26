import type { Track } from "@/types";

const COVERS_DIR = "covers";
const HYDRATE_CONCURRENCY = 12;

/** 正在进行的 OPFS 文件写入 Promise，防止相同封面并发写入产生写锁冲突 */
const pendingWrites = new Map<string, Promise<string | null>>();

/** 正在进行的 OPFS 文件读取 Promise，避免同一封面并发重复读取 */
const pendingReads = new Map<string, Promise<Blob | null>>();

/** 内存中的封面缓存：key (hash.ext) -> Blob（仅主线程 UI 使用），消除重复 I/O */
const coverMemoryCache = new Map<string, Blob>();

/** 已确认存在于 OPFS 的封面文件名索引（懒加载，避免重复探针与 Worker 内存驻留） */
let knownCoverKeys: Set<string> | null = null;
let knownCoverKeysPromise: Promise<Set<string>> | null = null;
let coversDirPromise: Promise<FileSystemDirectoryHandle> | null = null;

function getCoversDir(): Promise<FileSystemDirectoryHandle> {
  if (!coversDirPromise) {
    coversDirPromise = navigator.storage
      .getDirectory()
      .then((root) => root.getDirectoryHandle(COVERS_DIR, { create: true }))
      .catch((err) => {
        coversDirPromise = null;
        throw err;
      });
  }
  return coversDirPromise;
}

async function getKnownCoverKeys(): Promise<Set<string>> {
  if (knownCoverKeys) return knownCoverKeys;
  if (!knownCoverKeysPromise) {
    knownCoverKeysPromise = (async () => {
      const keys = new Set<string>();
      const dir = await getCoversDir();
      const iter = (dir as FileSystemDirectoryHandle & {
        keys?: () => AsyncIterable<string>;
      }).keys;
      if (typeof iter === "function") {
        for await (const key of iter.call(dir)) {
          keys.add(key);
        }
      }
      knownCoverKeys = keys;
      return keys;
    })().catch((err) => {
      knownCoverKeysPromise = null;
      throw err;
    });
  }
  return knownCoverKeysPromise;
}

function coverExtension(blob: Blob): string {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("gif")) return "gif";
  if (type.includes("webp")) return "webp";
  if (type.includes("avif")) return "avif";
  return "jpg";
}

function getMimeTypeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

/** 计算封面内容 SHA-256 哈希，返回文件名（hash.ext）及原始字节 */
export async function computeCoverKey(
  blob: Blob,
): Promise<{ name: string; bytes: ArrayBuffer } | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { name: `${hash}.${coverExtension(blob)}`, bytes };
  } catch (err) {
    console.warn("计算封面哈希失败:", err);
    return null;
  }
}

/**
 * 将已读取字节的封面写入 OPFS（支持并发合并与存在性索引跳过）。
 * Worker 端默认 cacheInMemory = false，避免无意义持有全部封面引用。
 */
export async function saveCoverBytes(
  name: string,
  bytes: ArrayBuffer,
  mimeType: string,
  cacheInMemory = false,
): Promise<string | null> {
  if (coverMemoryCache.has(name)) {
    return name;
  }

  const keys = await getKnownCoverKeys().catch(() => null);
  if (keys?.has(name)) {
    return name;
  }

  const existingWrite = pendingWrites.get(name);
  if (existingWrite) {
    return await existingWrite;
  }

  const writePromise = (async () => {
    try {
      const dir = await getCoversDir();
      try {
        await dir.getFileHandle(name, { create: false });
        knownCoverKeys?.add(name);
        return name; // 已存在，跳过写入且不拉取文件内容进内存
      } catch {
        // 不存在，继续写入
      }

      const fileHandle = await dir.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();

      knownCoverKeys?.add(name);
      if (cacheInMemory) {
        coverMemoryCache.set(name, new Blob([bytes], { type: mimeType }));
      }
      return name;
    } catch (err) {
      console.warn("保存封面到 OPFS 失败:", name, err);
      return null;
    } finally {
      pendingWrites.delete(name);
    }
  })();

  pendingWrites.set(name, writePromise);
  return await writePromise;
}

/**
 * 将封面写入 OPFS（按内容 SHA-256 去重），返回文件名（hash.ext）。
 */
export async function saveCover(
  blob: Blob,
  cacheInMemory = false,
): Promise<string | null> {
  const computed = await computeCoverKey(blob);
  if (!computed) return null;
  return saveCoverBytes(
    computed.name,
    computed.bytes,
    blob.type || "image/jpeg",
    cacheInMemory,
  );
}

/** 从 OPFS 读取封面文件，零拷贝纠正空 MIME 类型并享受内存缓存与并发去重 */
export async function loadCover(name: string): Promise<Blob | null> {
  const cached = coverMemoryCache.get(name);
  if (cached) return cached;

  const existingRead = pendingReads.get(name);
  if (existingRead) return await existingRead;

  const readPromise = (async () => {
    try {
      const dir = await getCoversDir();
      const fileHandle = await dir.getFileHandle(name, { create: false });
      const rawFile = await fileHandle.getFile();

      // 部分浏览器平台从 OPFS 读取的 File.type 为空字符串，用 slice 零拷贝纠正 MIME 类型
      let finalBlob: Blob = rawFile;
      if (!rawFile.type) {
        const ext = name.split(".").pop() || "jpg";
        const mime = getMimeTypeFromExtension(ext);
        finalBlob = rawFile.slice(0, rawFile.size, mime);
      }

      coverMemoryCache.set(name, finalBlob);
      knownCoverKeys?.add(name);
      return finalBlob;
    } catch {
      knownCoverKeys?.delete(name);
      return null;
    } finally {
      pendingReads.delete(name);
    }
  })();

  pendingReads.set(name, readPromise);
  return await readPromise;
}

/** 清理 OPFS 中不再被任何曲目引用的孤立封面文件 */
export async function cleanupUnusedCovers(validKeys: Set<string>): Promise<number> {
  try {
    const dir = await getCoversDir();
    const iter = (dir as FileSystemDirectoryHandle & {
      keys?: () => AsyncIterable<string>;
    }).keys;
    if (typeof iter !== "function") return 0;

    const toRemove: string[] = [];
    for await (const key of iter.call(dir)) {
      if (!validKeys.has(key) && !pendingWrites.has(key)) {
        toRemove.push(key);
      }
    }

    let removed = 0;
    for (const key of toRemove) {
      try {
        await dir.removeEntry(key);
        knownCoverKeys?.delete(key);
        coverMemoryCache.delete(key);
        removed++;
      } catch {
        // 忽略并发占用等单文件删除失败
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

function getTrackParentDir(relativePath: string): string {
  const idx = relativePath.lastIndexOf("/");
  return idx >= 0 ? relativePath.slice(0, idx).toLowerCase() : "";
}

/**
 * 为缺失封面的同专辑曲目安全借用封面（仅限同歌手同专辑，或同目录下同专辑的合辑），
 * 若同专辑存在多个不同平台的封面，优先选取体积较大者。
 */
export function inheritMissingAlbumCovers(tracks: Track[]): Track[] {
  type CoverCandidate = { blob?: Blob; key?: string; size: number };
  const artistAlbumMap = new Map<string, CoverCandidate>();
  const dirAlbumMap = new Map<string, CoverCandidate>();

  const updateBest = (
    map: Map<string, CoverCandidate>,
    mapKey: string,
    track: Track,
  ) => {
    const size = track.coverBlob?.size ?? 0;
    const existing = map.get(mapKey);
    if (!existing) {
      map.set(mapKey, { blob: track.coverBlob, key: track.coverKey, size });
      return;
    }
    // 优先保留体积更大（通常分辨率更高）且具备有效数据的候选
    const nextBlob =
      size > existing.size && track.coverBlob
        ? track.coverBlob
        : existing.blob || track.coverBlob;
    const nextKey =
      size > existing.size && track.coverKey
        ? track.coverKey
        : existing.key || track.coverKey;
    map.set(mapKey, {
      blob: nextBlob,
      key: nextKey,
      size: Math.max(existing.size, size),
    });
  };

  for (const track of tracks) {
    const album = track.album.trim().toLowerCase();
    if (!album || album === "未知专辑") continue;
    if (!track.coverBlob && !track.coverKey) continue;

    const artist = track.artist.trim().toLowerCase();
    if (artist && artist !== "未知艺术家" && artist !== "未知歌手") {
      updateBest(artistAlbumMap, `${artist}::${album}`, track);
    }
    const dir = getTrackParentDir(track.relativePath);
    if (dir) {
      updateBest(dirAlbumMap, `${dir}::${album}`, track);
    }
  }

  return tracks.map((track) => {
    if (track.coverBlob && track.coverKey) return track;
    const album = track.album.trim().toLowerCase();
    if (!album || album === "未知专辑") return track;

    const artist = track.artist.trim().toLowerCase();
    const dir = getTrackParentDir(track.relativePath);
    const shared =
      (artist && artist !== "未知艺术家" && artist !== "未知歌手"
        ? artistAlbumMap.get(`${artist}::${album}`)
        : undefined) || (dir ? dirAlbumMap.get(`${dir}::${album}`) : undefined);

    if (!shared) return track;
    const nextBlob = track.coverBlob || shared.blob;
    const nextKey = track.coverKey || shared.key;
    if (nextBlob === track.coverBlob && nextKey === track.coverKey) return track;
    return {
      ...track,
      coverBlob: nextBlob,
      coverKey: nextKey,
    };
  });
}

/**
 * 为曲目补齐封面：
 * 1. 同歌手/同目录同专辑安全借用补齐缺失的 coverKey
 * 2. 限流并发从内存/OPFS 补齐 coverBlob
 */
export async function hydrateCovers(tracks: Track[]): Promise<Track[]> {
  const patchedTracks = inheritMissingAlbumCovers(tracks);

  const keys = [
    ...new Set(
      patchedTracks
        .filter((track) => track.coverKey && !track.coverBlob)
        .map((track) => track.coverKey as string),
    ),
  ];

  if (!keys.length) return patchedTracks;

  const fileByKey = new Map<string, Blob | null>();
  for (let i = 0; i < keys.length; i += HYDRATE_CONCURRENCY) {
    const batch = keys.slice(i, i + HYDRATE_CONCURRENCY);
    await Promise.all(
      batch.map(async (key) => {
        fileByKey.set(key, await loadCover(key));
      }),
    );
  }

  return patchedTracks.map((track) => {
    if (track.coverKey && !track.coverBlob) {
      const file = fileByKey.get(track.coverKey);
      if (file) return { ...track, coverBlob: file };
    }
    return track;
  });
}
