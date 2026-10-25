import type { RuntimeMusicSource, Track, TrackRecord } from "@/types";

/** 主线程 → worker */
export type LibraryWorkerRequest =
  | {
      type: "build";
      token: number;
      sources: RuntimeMusicSource[];
      cachedTracks: TrackRecord[];
    }
  | {
      type: "cancel";
      token: number;
    };

/** worker → 主线程 */
export type LibraryWorkerResponse =
  | { type: "progress"; token: number; done: number; total: number }
  | { type: "result"; token: number; tracks: Track[] }
  | { type: "error"; token: number; message: string };
