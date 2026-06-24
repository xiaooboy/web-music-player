import type { RuntimeMusicSource } from "../types";
import {
  DirectoryPickerOptions,
  entriesFromInput,
  pickDirectory,
} from "./media";

/**
 * 打开文件夹选择器，添加新的音乐源
 * 支持目录授权的浏览器会请求用户授权目录访问权限
 */
export async function openPicker(options?: DirectoryPickerOptions) {
  // 弹出目录选择对话框
  const handle = await pickDirectory(options);
  const source: RuntimeMusicSource = {
    id: crypto.randomUUID(),
    name: handle.name,
    persistent: true, // 标记为持久化，关闭后下次可恢复
    available: true,
    kind: "directory",
    handle,
  };
  return source;
}

/**
 * 打开系统文件选择器，选择文件夹并返回文件条目，不支持持久化
 */
export function openWebkitDirectory() {
  const el = document.createElement("input");
  el.type = "file";
  el.webkitdirectory = true;
  return new Promise<RuntimeMusicSource>((resolve) => {
    el.addEventListener("change", () => {
      const entries = entriesFromInput(el.files);
      // 从第一个文件路径提取文件夹名作为音乐源名称
      const folderName = entries[0]?.relativePath.split("/")[0] || "本地音乐";
      const source: RuntimeMusicSource = {
        id: crypto.randomUUID(),
        name: folderName,
        persistent: false, // 临时源，关闭浏览器后需要重新导入
        available: true,
        kind: "directory",
        entries,
      };
      resolve(source);
    });

    el.addEventListener("cancel", () => {
      resolve(null);
    });
    // 触发
    el.click();
  });
}
