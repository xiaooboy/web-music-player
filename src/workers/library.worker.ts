import { entriesToTracks, parseSource } from "@/utils/libraryBuilder";
import { saveCover } from "@/utils/coverStore";
import type { RuntimeMusicSource, TrackRecord } from "@/types";
import type { LibraryWorkerRequest, LibraryWorkerResponse } from "./protocol";

/** 当前正在执行的 build token，-1 表示无活动任务 */
let currentToken = -1;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<LibraryWorkerRequest>) => void) | null;
  postMessage: (message: LibraryWorkerResponse) => void;
};

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "build") {
    currentToken = message.token;
    void runBuild(message.token, message.sources, message.cachedTracks);
  } else if (message.type === "cancel" && message.token === currentToken) {
    currentToken = -1;
  }
};

async function runBuild(
  token: number,
  sources: RuntimeMusicSource[],
  cachedTracks: TrackRecord[],
): Promise<void> {
  const isStale = () => token !== currentToken;

  try {
    const entries = await parseSource(sources);
    if (isStale()) return;

    if (!entries.length) {
      scope.postMessage({ type: "result", token, tracks: [] });
      return;
    }

    const cache = new Map(cachedTracks.map((track) => [track.id, track]));
    const tracks = await entriesToTracks(entries, isStale, {
      cache,
      revokeOnStale: false,
      onProgress: ({ done, total }) => {
        scope.postMessage({ type: "progress", token, done, total });
      },
    });

    if (tracks === undefined) return; // 已过期（stale）

    // 封面落盘：hash 去重写 OPFS（分批限流，避免大库全量并发导致内存尖峰）
    const COVER_SAVE_BATCH = 8;
    for (let start = 0; start < tracks.length; start += COVER_SAVE_BATCH) {
      if (isStale()) return;
      await Promise.all(
        tracks.slice(start, start + COVER_SAVE_BATCH).map(async (track) => {
          if (!track.coverBlob || track.coverKey) return;
          const key = await saveCover(track.coverBlob);
          if (key) track.coverKey = key;
        }),
      );
    }

    if (isStale()) return;
    scope.postMessage({ type: "result", token, tracks });
  } catch (error) {
    if (isStale()) return;
    scope.postMessage({
      type: "error",
      token,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
