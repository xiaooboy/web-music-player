import { MusicSource, Playlist, Track } from "@/types";

const DB_NAME = "local-music";
const DB_VERSION = 2;
const STORE_NAME = "settings";
const SOURCES_KEY = "music-sources";
const TRACK_CACHE_KEY = "track-cache";
const LIKED_TRACK_IDS_KEY = "liked-track-ids";
const PLAYLISTS_KEY = "playlists";
const CURRENT_TRACK_ID_KEY = "current-track-id";
const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export type PersistedMusicSource = MusicSource & {
  handle: FileSystemDirectoryHandle;
};

export type CachedTrackRecord = Omit<Track, "coverUrl" | "file">;

export interface PersistedTrackCache {
  sourceKey: string;
  tracks: CachedTrackRecord[];
}

let dbInstance: IDBDatabase | null = null;
let dbReady: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbReady) return dbReady;

  dbReady = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    });

    request.addEventListener("success", () => {
      dbInstance = request.result;
      resolve(dbInstance);
    });
    request.addEventListener("error", () =>
      reject(request.error || new Error("IndexedDB open failed")),
    );
  });

  return dbReady;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => Promise<T>,
) {
  const database = await openDatabase();

  const transaction = database.transaction(STORE_NAME, mode);
  const store = transaction.objectStore(STORE_NAME);
  const result = await runner(store);

  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () =>
      reject(transaction.error || new Error("IndexedDB transaction failed")),
    );
    transaction.addEventListener("abort", () =>
      reject(transaction.error || new Error("IndexedDB transaction aborted")),
    );
  });

  return result;
}

function requestToPromise<T = unknown>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error || new Error("IndexedDB request failed")),
    );
  });
}

export async function savePersistedMusicSources(
  sources: PersistedMusicSource[],
) {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.put(sources, SOURCES_KEY));
  });
}

export async function loadPersistedMusicSources() {
  const record = await withStore("readonly", async (store) => {
    const multi = await requestToPromise<PersistedMusicSource[] | undefined>(
      store.get(SOURCES_KEY),
    );
    if (multi?.length) return multi;
  });

  return (record || []).filter(
    (source) => source?.handle && source?.name && source?.id,
  );
}

export async function clearPersistedMusicSources() {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.delete(SOURCES_KEY));
  });
}

export async function saveTrackCache(cache: PersistedTrackCache) {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.put(cache, TRACK_CACHE_KEY));
  });
}

export async function loadTrackCache() {
  return withStore("readonly", async (store) =>
    requestToPromise<PersistedTrackCache | undefined>(
      store.get(TRACK_CACHE_KEY),
    ),
  );
}

export async function clearTrackCache() {
  await withStore("readwrite", async (store) => {
    await requestToPromise(store.delete(TRACK_CACHE_KEY));
  });
}

export function saveLikedTrackIds(trackIds: string[]) {
  localStorage.setItem(LIKED_TRACK_IDS_KEY, JSON.stringify(trackIds));
}

export function saveCurrentTrackId(trackId: string) {
  localStorage.setItem(CURRENT_TRACK_ID_KEY, trackId);
}

export function loadCurrentTrackId() {
  return localStorage.getItem(CURRENT_TRACK_ID_KEY) || "";
}

export function saveSidebarCollapsed(collapsed: boolean) {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
}

export function loadSidebarCollapsed() {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

export function loadLikedTrackIds() {
  try {
    const raw = localStorage.getItem(LIKED_TRACK_IDS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function savePlaylists(playlists: Playlist[]) {
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
