<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import type { MenuItem } from "./ContextMenu.vue";
import BottomSheet from "./BottomSheet.vue";

const props = defineProps<{ menu: MenuItem[]; title?: string }>();
const emit = defineEmits<{ select: [] }>();

const sheetRef = useTemplateRef("sheetRef");
const expandedIndex = ref(-1);

function open() {
  expandedIndex.value = -1;
  sheetRef.value?.open();
}

function close() {
  sheetRef.value?.close();
}

function handleItemClick(item: MenuItem, index: number) {
  if (item.disabled) return;
  if (item.children?.length) {
    expandedIndex.value = expandedIndex.value === index ? -1 : index;
    return;
  }
  item.action?.();
  close();
  emit("select");
}

function handleSubItemClick(child: MenuItem) {
  if (child.disabled) return;
  child.action?.();
  close();
  emit("select");
}

defineExpose({ open, close });
</script>

<template>
  <BottomSheet ref="sheetRef" :title="title" :snap-points="[]">
    <div class="action-sheet-list">
      <template v-for="(item, i) in menu" :key="i">
        <button
          class="action-sheet-item"
          :class="{
            'is-disabled': item.disabled,
            'is-expanded': expandedIndex === i,
          }"
          type="button"
          @click="handleItemClick(item, i)"
        >
          <component
            v-if="item.icon"
            :is="item.icon"
            :size="20"
            class="action-sheet-icon"
          />
          <span>{{ item.label }}</span>
          <svg
            v-if="item.children?.length"
            class="action-sheet-arrow"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <div
          v-if="item.children?.length"
          class="action-sheet-submenu"
          :class="{ 'is-expanded': expandedIndex === i }"
        >
          <div class="action-sheet-submenu-inner">
            <button
              v-for="(child, ci) in item.children"
              :key="ci"
              class="action-sheet-item action-sheet-subitem"
              :class="{ 'is-disabled': child.disabled }"
              type="button"
              @click="handleSubItemClick(child)"
            >
              <component
                v-if="child.icon"
                :is="child.icon"
                :size="18"
                class="action-sheet-icon"
              />
              <span>{{ child.label }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>


  </BottomSheet>
</template>

<style>
.action-sheet-list {
  padding: 4px 8px;
}

.action-sheet-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 12px 16px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 0.95rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.action-sheet-item:hover:not(.is-disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.action-sheet-item.is-disabled {
  color: var(--muted);
  opacity: 0.5;
  cursor: default;
}

.action-sheet-icon {
  flex-shrink: 0;
  display: inline-flex;
}

.action-sheet-arrow {
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0.5;
  transition: transform 0.2s ease;
}
.action-sheet-item.is-expanded .action-sheet-arrow {
  transform: rotate(180deg);
}

/* 子菜单展开/收起动画 */
.action-sheet-submenu {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 200ms ease;
}
.action-sheet-submenu.is-expanded {
  grid-template-rows: 1fr;
}
.action-sheet-submenu-inner {
  overflow: hidden;
}

/* 子菜单项 */
.action-sheet-subitem {
  padding-left: 48px;
  color: var(--muted);
  font-size: 0.9rem;
  min-height: 44px;
}

</style>
