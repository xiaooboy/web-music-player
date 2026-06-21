<script setup lang="ts">
import { computed } from "vue";
import { FolderPlus, FolderSymlink, Trash2 } from "lucide-vue-next";
import { supportsDirectoryPicker } from "../utils/media";
import { openFallbackPicker, openPicker } from "../utils/folder";
import { useLibraryStore } from "../stores/libraryStore";
import TipContent from "../components/TipContent.vue";

const libraryStore = useLibraryStore();

const libraryHint = computed(() =>
  supportsDirectoryPicker()
    ? libraryStore.musicSources.some((source) => source.persistent)
      ? "已支持多个音乐源；缓存目录下次会自动恢复，失效目录会提示重新授权。"
      : "当前浏览器支持目录授权，添加后会把多个音乐源一起缓存。"
    : "当前环境将使用系统目录选择器导入；若要直接目录授权并自动恢复，请在 Chrome 或 Edge 的 localhost / HTTPS 环境打开。",
);

async function openFolder(isFallback: boolean) {
  if (libraryStore.launchedFilePlaybackActive) {
    alert("本地文件启动，不支持添加音乐源");
    return;
  }
  const nextSource = await (isFallback ? openFallbackPicker() : openPicker());
  if (!nextSource) return;
  libraryStore.addSource(nextSource);
}
</script>

<template>
  <section class="library-panel library-management-panel">
    <div class="section-head">
      <div>
        <h2>音乐库管理</h2>
      </div>
      <span class="library-status">{{
        libraryStore.musicSources.length
          ? `共 ${libraryStore.musicSources.length} 个音乐源`
          : "等待添加"
      }}</span>
    </div>

    <p class="library-management-hint">{{ libraryHint }}</p>

    <div class="library-management-actions">
      <button
        class="primary-button library-action-button"
        type="button"
        @click="openFolder(false)"
      >
        <FolderPlus :size="18" />
        <span>添加音乐源</span>
      </button>
      <button
        class="primary-button library-action-button"
        type="button"
        @click="openFolder(true)"
      >
        <FolderSymlink :size="18" />
        <span>导入临时文件夹</span>
      </button>
    </div>

    <div
      v-if="libraryStore.musicSources.length"
      class="source-list source-list--panel"
    >
      <div
        v-for="source in libraryStore.musicSources"
        :key="source.id"
        class="source-item"
      >
        <div class="source-copy">
          <strong>{{ source.name }}</strong>
          <span>{{
            source.kind === "file-launch"
              ? "系统打开文件"
              : source.persistent
                ? source.available
                  ? "已缓存"
                  : "待恢复授权"
                : "临时来源"
          }}</span>
        </div>
        <button
          class="source-remove"
          type="button"
          @click="libraryStore.removeSource(source.id)"
        >
          <Trash2 :size="16" />
          <span>移除</span>
        </button>
      </div>
    </div>
    <TipContent
      v-else
      fill
      title="还没有添加音乐源"
      content="从上方添加一个或多个本地文件夹后，播放器会合并生成统一播放列表。"
    />
  </section>
</template>
