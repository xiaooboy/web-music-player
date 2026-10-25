/**
 * 文件获取入口
 */
export interface FileEntry {
  file: File;
  relativePath: string;
}
export type TrackMap = Map<string, Track>;
export interface Track {
  id: string;
  file: File | null;
  lastModified: number;
  relativePath: string;
  title: string;
  artist: string;
  album: string;
  coverBlob?: Blob;
  /** 封面在 OPFS 中的文件名（hash.ext），持久化用 */
  coverKey?: string;
  duration: number;
  format: string;
  lyricsText: string;
  isPlayable: boolean;
}

/** 不含 File 的曲目记录：构建缓存/跨线程传递用，仍含封面 Blob 与 coverKey */
export type TrackRecord = Omit<Track, "file">;

export interface LyricsLine {
  time: number | null;
  source: string;
  translation: string;
}

export interface MusicSource {
  id: string;
  name: string;
  persistent: boolean;
  available: boolean;
  kind: "directory" | "file-launch";
}
export type RuntimeMusicSource = MusicSource & {
  handle?: FileSystemDirectoryHandle;
  entries?: FileEntry[];
};

export type PlaybackMode = "list" | "one" | "shuffle";
export type PlaybackModeLabel = "列表播放" | "单曲播放" | "随机播放";

export interface Album {
  name: string;
  artistSet: Set<string>;
  artistLabel: string;
  duration: number;
  coverBlob?: Blob;
  tracks: Track[];
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}
