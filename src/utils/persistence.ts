const DB_NAME = "cloudbeat-player";
const DB_VERSION = 2;
const STORE_NAME = "settings";
const SOURCES_KEY = "music-sources";
const TRACK_CACHE_KEY = "track-cache";
const LAST_FOLDER_NAME_KEY = "cloudbeat:last-folder-name";
const LIKED_TRACK_IDS_KEY = "cloudbeat:liked-track-ids";

export interface PersistedMusicSource {
  id: string;
  handle: FileSystemDirectoryHandle;
  name: string;
}

export interface CachedTrackRecord {
  id: string;
  relativePath: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number;
  format: string;
  lyricsText: string;
}

export interface PersistedTrackCache {
  sourceKey: string;
  tracks: CachedTrackRecord[];
}

type LegacyPersistedMusicSource = {
  handle?: FileSystemDirectoryHandle;
  name?: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB open failed")));
  });
}

async function withStore<T>(mode: IDBTransactionMode, runner: (store: IDBObjectStore) => Promise<T>) {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await runner(store);

    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error || new Error("IndexedDB transaction failed")));
      transaction.addEventListener("abort", () => reject(transaction.error || new Error("IndexedDB transaction aborted")));
    });

    return result;
  } finally {
    database.close();
  }
}

function requestToPromise<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error || new Error("IndexedDB request failed")));
  });
}

export async function savePersistedMusicSources(sources: PersistedMusicSource[]) {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.put(sources, SOURCES_KEY));
  });
}

export async function loadPersistedMusicSources() {
  const record = await withStore("readonly", async (store) => {
    const multi = await requestToPromise<PersistedMusicSource[] | undefined>(store.get(SOURCES_KEY));
    if (multi?.length) {
      return multi;
    }

    const legacy = await requestToPromise<LegacyPersistedMusicSource | undefined>(store.get("music-source"));
    if (!legacy?.handle || !legacy?.name) {
      return [];
    }

    return [{ id: crypto.randomUUID(), handle: legacy.handle, name: legacy.name }] satisfies PersistedMusicSource[];
  });

  return (record || []).filter((source) => source?.handle && source?.name && source?.id);
}

export async function clearPersistedMusicSources() {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.delete(SOURCES_KEY));
    await requestToPromise(store.delete("music-source"));
  });
}

export async function saveTrackCache(cache: PersistedTrackCache) {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.put(cache, TRACK_CACHE_KEY));
  });
}

export async function loadTrackCache() {
  return withStore("readonly", async (store) =>
    requestToPromise<PersistedTrackCache | undefined>(store.get(TRACK_CACHE_KEY)),
  );
}

export async function clearTrackCache() {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.delete(TRACK_CACHE_KEY));
  });
}

export function saveLastFolderName(name: string) {
  localStorage.setItem(LAST_FOLDER_NAME_KEY, name);
}

export function loadLastFolderName() {
  return localStorage.getItem(LAST_FOLDER_NAME_KEY) || "";
}

export function saveLikedTrackIds(trackIds: string[]) {
  localStorage.setItem(LIKED_TRACK_IDS_KEY, JSON.stringify(trackIds));
}

export function loadLikedTrackIds() {
  try {
    const raw = localStorage.getItem(LIKED_TRACK_IDS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
