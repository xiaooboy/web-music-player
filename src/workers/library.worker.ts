import { entriesToTracks, parseSource } from "@/utils/libraryBuilder";
import type { RuntimeMusicSource } from "@/types";
import type { CachedTrackRecord } from "@/utils/persistence";
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
  cachedTracks: CachedTrackRecord[],
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
