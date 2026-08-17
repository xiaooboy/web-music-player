/**
 * 解析歌词文件：提取每行的源语言和翻译内容
 *
 * 目标格式（行内分隔）：
 *   [00:12.47]Yelling at the sky\thin-space\仰天嘶喊
 *
 * 其中源语言与翻译之间用 U+2009 窄空格（以及其他可能的空白/分隔符）分隔。
 * 元数据行（作词/作曲/编曲/制作人等）会被跳过。
 */

import { LyricsLine } from "@/types";

/** 解析 [mm:ss.xx] / [mm:ss.xxx] 时间戳，返回秒；无时间戳返回 null */
function parseTimestamp(line: string): number | null {
  const m = line.match(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?]/);
  if (!m) return null;
  const [, min, sec, ms] = m;
  return parseInt(min) * 60 + parseInt(sec) + parseInt((ms ?? '0').padEnd(3, '0'))/1000;
}

/** 去掉行首的时间戳标签 */
function stripTags(line: string): string {
  return line.replace(/\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?]/g, '').trim();
}

/**
 * 在单个时间点切分原文与翻译。
 * 本文件采用 U+2009 窄空格；同时兜底兼容全角空格、竖线等常见分隔符。
 */
function splitSourceTranslation(content: string): { source: string; translation: string } {
  const separators = [
    '\u2009',                       // THIN SPACE（本文件实际使用的分隔符）
    ' || ', ' / '
  ];
  for (const sep of separators) {
    const idx = content.indexOf(sep);
    if (idx > 0) {
      const a = content.slice(0, idx).trim();
      const b = content.slice(idx + sep.length).trim();
      if (a && b) return { source: a, translation: b };
    }
  }
  // 找不到分隔符时
  return { source: content, translation: '' };
}

/** 元数据行关键词：作词/作曲/编曲/制作人 等 */
const META_PATTERN = /^\[?[\d:.]*\]?\s*(作词|作曲|编曲|制作人|作词人|作曲人|混音|母带|录音|和声|OP|SP|词|曲)\s*[:：]/;

/** 主入口 */
export function parseLyrics(lyricsText: string): LyricsLine[] {
  if (!lyricsText.trim()) {
    return [];
  }
  const lines = lyricsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const result: LyricsLine[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const time = parseTimestamp(line);
    if (time === null) continue;

    const content = stripTags(line);
    if (!content || META_PATTERN.test(line)) continue;
    const lastLine = result.at(-1);
    // 同时间戳格式的多语言歌词
    if (lastLine?.time === time) {
      lastLine.translation = content;
      continue;
    }
    const { source, translation } = splitSourceTranslation(content);
    result.push({ time, source, translation });
  }

  return result;
}
