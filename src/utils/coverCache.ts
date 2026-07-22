/**
 * 封面 Blob URL 缓存管理
 *
 * 构建阶段只存储 coverBlob，不创建 Blob URL。
 * UI 渲染时通过 ensureCoverUrl 按需创建并缓存 URL，
 * 同一 Blob 对象全局只创建一次 URL（去重）。
 */

/** key → Blob URL（key 为 trackId 或 albumName） */
const urlMap = new Map<string, string>();

/** Blob → URL 去重映射，同一 Blob 只创建一个 URL */
const blobMap = new WeakMap<Blob, string>();

/**
 * 确保封面 URL 可用 — 如已缓存直接返回，否则从 coverBlob 创建
 * UI 组件获取封面 URL 的唯一入口
 */
export function ensureCoverUrl(key: string, coverBlob?: Blob): string {
  const cached = urlMap.get(key);
  if (cached) return cached;

  if (!coverBlob) {
    urlMap.set(key, "");
    return "";
  }

  // 同一 Blob 对象复用 URL（同专辑多曲共享同一 coverBlob 时生效）
  const shared = blobMap.get(coverBlob);
  if (shared) {
    urlMap.set(key, shared);
    return shared;
  }

  const url = URL.createObjectURL(coverBlob);
  urlMap.set(key, url);
  blobMap.set(coverBlob, url);
  return url;
}

/** 批量撤销指定 key 的封面 URL */
export function revokeCoverUrls(keys: Iterable<string>) {
  for (const key of keys) {
    const url = urlMap.get(key);
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    urlMap.delete(key);
  }
}

/** 撤销全部封面 URL */
export function revokeAllCoverUrls() {
  for (const url of urlMap.values()) {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  }
  urlMap.clear();
}
