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
  /** 是否已完成封面解析（区分"未解析"与"已解析但无内嵌封面"） */
  coverChecked?: boolean;
  duration: number;
  /** 时长是否为粗略估算值（如无 Xing/VBRI 头的 MP3 或 ADTS AAC），播放时可由 audio.duration 校准 */
  durationEstimated?: boolean;
  format: string;
  lyricsText: string;
  /** 关联外部 .lrc 文件的修改时间，用于缓存失效判断 */
  lyricsLastModified?: number;
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
