<script setup lang="ts">
import { FolderPlus, FolderSymlink, Trash2 } from "lucide-vue-next";
import type { MusicSource } from "../types";

defineProps<{
  sourceNamesLabel: string;
  libraryHint: string;
  sources: MusicSource[];
}>();

defineEmits<{
  openFolder: [];
  openFallback: [];
  removeSource: [id: string];
}>();
</script>

<template>
  <section class="library-panel library-management-panel">
    <div class="section-head">
      <div>
        <h2>音乐库管理</h2>
      </div>
      <span class="library-status">{{
        sources.length ? `共 ${sources.length} 个音乐源` : "等待添加"
      }}</span>
    </div>

    <p class="library-management-hint">{{ libraryHint }}</p>

    <div class="library-management-actions">
      <button
        class="primary-button library-action-button"
        type="button"
        @click="$emit('openFolder')"
      >
        <FolderPlus :size="18" />
        <span>添加音乐源</span>
      </button>
      <button
        class="primary-button library-action-button"
        type="button"
        @click="$emit('openFallback')"
      >
        <FolderSymlink :size="18" />
        <span>导入临时文件夹</span>
      </button>
    </div>

    <div v-if="sources.length" class="source-list source-list--panel">
      <div v-for="source in sources" :key="source.id" class="source-item">
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
          @click="$emit('removeSource', source.id)"
        >
          <Trash2 :size="16" />
          <span>移除</span>
        </button>
      </div>
    </div>
    <div v-else class="empty-panel empty-panel--fill library-management-empty">
      <strong>还没有添加音乐源</strong>
      <p>从上方添加一个或多个本地文件夹后，播放器会合并生成统一播放列表。</p>
    </div>
  </section>
</template>
