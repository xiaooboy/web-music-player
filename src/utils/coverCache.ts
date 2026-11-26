/**
 * 封面 Blob URL 缓存管理
 *
 * 构建阶段只存储 coverBlob，不创建 Blob URL。
 * UI 渲染时通过 ensureCoverUrl 按需创建并缓存 URL，
 * 同一 Blob 对象全局只创建一次 URL（去重 + 引用计数），
 * 并支持同一 key 更换 coverBlob 时自动失效旧 URL。
 */

interface UrlEntry {
  url: string;
  blob: Blob;
}

/** key → { url, blob }（key 为 trackId 或 albumName） */
const urlMap = new Map<string, UrlEntry>();

/** Blob → URL 去重映射，同一 Blob 只创建一个 URL */
const blobMap = new WeakMap<Blob, string>();

/** Blob URL → 引用计数，仅当归零时才真正 revokeObjectURL */
const urlRefCount = new Map<string, number>();

function releaseUrl(url: string) {
  const count = urlRefCount.get(url) ?? 0;
  if (count <= 1) {
    urlRefCount.delete(url);
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  } else {
    urlRefCount.set(url, count - 1);
  }
}

/**
 * 确保封面 URL 可用 — 如已缓存且 Blob 未变化则直接返回；
 * 若同一 key 的 coverBlob 发生替换，自动释放旧引用并生成新 URL。
 */
export function ensureCoverUrl(key: string, coverBlob?: Blob): string {
  const cached = urlMap.get(key);
  if (cached) {
    if (coverBlob && cached.blob === coverBlob) {
      return cached.url;
    }
    // coverBlob 已移除或更换为新实例，先释放旧 key 引用
    urlMap.delete(key);
    releaseUrl(cached.url);
  }

  if (!coverBlob) {
    return "";
  }

  // 同一 Blob 对象复用 URL（同专辑多曲共享同一 coverBlob 时生效）
  let url = blobMap.get(coverBlob);
  if (!url) {
    url = URL.createObjectURL(coverBlob);
    blobMap.set(coverBlob, url);
  }

  urlMap.set(key, { url, blob: coverBlob });
  urlRefCount.set(url, (urlRefCount.get(url) ?? 0) + 1);
  return url;
}

/** 批量撤销指定 key 的封面 URL（按引用计数安全释放） */
export function revokeCoverUrls(keys: Iterable<string>) {
  for (const key of keys) {
    const cached = urlMap.get(key);
    if (!cached) continue;
    urlMap.delete(key);
    releaseUrl(cached.url);
  }
}

/** 撤销全部封面 URL */
export function revokeAllCoverUrls() {
  for (const url of urlRefCount.keys()) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
  urlMap.clear();
  urlRefCount.clear();
}
