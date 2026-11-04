import type { Track } from "@/types";

const COVERS_DIR = "covers";

/** 正在进行的 OPFS 文件写入 Promise，防止相同封面并发写入产生写锁冲突 */
const pendingWrites = new Map<string, Promise<string | null>>();

/** 内存中的封面缓存：key (hash.ext) -> File，消除重复 I/O 并保证同步复用 */
const coverMemoryCache = new Map<string, File>();

async function getCoversDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(COVERS_DIR, { create: true });
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

/**
 * 将封面写入 OPFS（按内容 SHA-256 去重），返回文件名（hash.ext）。
 * 支持并发调用去重合并，防止多曲目相同封面引发 createWritable 锁冲突。
 */
export async function saveCover(blob: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;

  try {
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const ext = coverExtension(blob);
    const name = `${hash}.${ext}`;

    // 如果该文件已存在内存缓存，直接复用
    if (coverMemoryCache.has(name)) {
      return name;
    }

    // 如果该文件正在被其他任务并发写入，合并等待同一个 Promise，避免同时调用 createWritable 报错
    const existingWrite = pendingWrites.get(name);
    if (existingWrite) {
      return await existingWrite;
    }

    const writePromise = (async () => {
      try {
        const dir = await getCoversDir();
        try {
          const fileHandle = await dir.getFileHandle(name, { create: false });
          const file = await fileHandle.getFile();
          coverMemoryCache.set(name, file);
          return name; // 已存在，去重跳过写入
        } catch {
          // 不存在，继续写入
        }

        const fileHandle = await dir.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        // 写入完成，缓存入内存
        const file = await fileHandle.getFile();
        coverMemoryCache.set(name, file);
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
  } catch (err) {
    console.warn("计算封面哈希失败:", err);
    return null;
  }
}

/** 从 OPFS 读取封面文件，自动纠正空 MIME 类型并享受内存单例缓存 */
export async function loadCover(name: string): Promise<File | null> {
  if (coverMemoryCache.has(name)) {
    return coverMemoryCache.get(name)!;
  }

  try {
    const dir = await getCoversDir();
    const fileHandle = await dir.getFileHandle(name, { create: false });
    const rawFile = await fileHandle.getFile();

    // 部分浏览器平台从 OPFS 读取的 File.type 为空字符串，根据后缀名纠正 MIME 类型
    let finalFile = rawFile;
    if (!rawFile.type) {
      const ext = name.split(".").pop() || "jpg";
      const mime = getMimeTypeFromExtension(ext);
      finalFile = new File([rawFile], rawFile.name, { type: mime });
    }

    coverMemoryCache.set(name, finalFile);
    return finalFile;
  } catch {
    return null;
  }
}

/**
 * 为曲目补齐封面：
 * 1. 同专辑互相借用补齐缺失的 coverKey（同专辑歌曲 99.9% 共享同一封面）
 * 2. 按需从内存/OPFS 补齐 coverBlob
 */
export async function hydrateCovers(tracks: Track[]): Promise<Track[]> {
  // 1. 同专辑互相借用补齐缺失的 coverKey
  const albumCoverKeyMap = new Map<string, string>();
  for (const track of tracks) {
    if (track.coverKey && track.album && track.album !== "未知专辑") {
      albumCoverKeyMap.set(track.album.trim(), track.coverKey);
    }
  }

  // 补齐同专辑下缺失 coverKey 的曲目
  const patchedTracks = tracks.map((track) => {
    if (!track.coverKey && track.album && track.album !== "未知专辑") {
      const inheritedKey = albumCoverKeyMap.get(track.album.trim());
      if (inheritedKey) {
        return { ...track, coverKey: inheritedKey };
      }
    }
    return track;
  });

  // 2. 收集需要加载封面的 keys
  const keys = [
    ...new Set(
      patchedTracks
        .filter((track) => track.coverKey && !track.coverBlob)
        .map((track) => track.coverKey as string),
    ),
  ];

  if (!keys.length) return patchedTracks;

  // 3. 并行从内存或 OPFS 加载
  const fileByKey = new Map<string, File | null>();
  await Promise.all(
    keys.map(async (key) => {
      fileByKey.set(key, await loadCover(key));
    }),
  );

  return patchedTracks.map((track) => {
    if (track.coverKey && !track.coverBlob) {
      const file = fileByKey.get(track.coverKey);
      if (file) return { ...track, coverBlob: file };
    }
    return track;
  });
}
