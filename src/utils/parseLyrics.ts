/**
 * 解析歌词文件：提取每行的源语言和翻译内容
 *
 * 目标格式（行内分隔）：
 *   [00:12.47]Yelling at the sky\thin-space\仰天嘶喊
 *
 * 其中源语言与翻译之间用 U+2009 窄空格（以及其他可能的空白/分隔符）分隔。
 * 元数据行（作词/作曲/编曲/制作人等）会正常保留显示。
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
const META_PATTERN =
  /^\[?[\d:.]*\]?\s*(作词|作曲|编曲|制作人|作词人|作曲人|混音|母带|录音|和声|OP|SP|词|曲|Lyricist|Composer|Arranger|Producer|Written by|Lyrics by)\s*[:：]/i;

/** 主入口 */
export function parseLyrics(lyricsText: string): LyricsLine[] {
  if (!lyricsText.trim()) {
    return [];
  }
  const lines = lyricsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const hasAnyTimestamp = lines.some((line) => parseTimestamp(line) !== null);
  const result: LyricsLine[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const time = parseTimestamp(line);
    // 存在时间戳的歌词中，跳过无时间戳的元标签行（如 [ti:...] 等）
    if (hasAnyTimestamp && time === null) continue;

    const content = stripTags(line).replace(/\[[a-zA-Z]+:[^\]]*\]/g, '').trim();
    if (!content) continue;

    const isMeta = META_PATTERN.test(line);
    const lastLine = result.at(-1);
    const lastIsMeta = lastLine ? META_PATTERN.test(lastLine.source) : false;

    // 同时间戳格式的多语言歌词（元数据行不作为翻译合并）
    if (
      time !== null &&
      lastLine?.time === time &&
      !isMeta &&
      !lastIsMeta &&
      !lastLine.translation
    ) {
      lastLine.translation = content;
      continue;
    }

    // 元数据行可能包含多个创作者斜杠分隔（如 Taylor Swift / Max Martin），避免误识别为翻译
    const { source, translation } = isMeta
      ? (content.includes('\u2009') || content.includes(' || ')
          ? splitSourceTranslation(content)
          : { source: content, translation: '' })
      : splitSourceTranslation(content);

    result.push({ time, source, translation });
  }

  return result;
}
