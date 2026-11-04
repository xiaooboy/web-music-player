<script lang="ts" setup>
import { computed, useSlots, type Component } from "vue";
import { PackageOpen } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    /** 提示文字内容 */
    content?: string;
    text?: string;
    fill?: boolean;
    icon?: Component;
    iconSize?: number;
  }>(),
  {
    content: "",
    text: "",
    fill: false,
    icon: undefined,
    iconSize: 76,
  },
);

const slots = useSlots();
const currentIcon = computed(() => props.icon || PackageOpen);
const displayContent = computed(() => props.text || props.content);
</script>

<template>
  <div :class="{ 'empty-state': true, 'empty-state--fill': fill }">
    <div class="empty-state__icon-wrap" aria-hidden="true">
      <slot name="icon">
        <component
          :is="currentIcon"
          class="empty-state__icon"
          :size="iconSize"
          :stroke-width="1.2"
        />
      </slot>
    </div>

    <div class="empty-state__body">
      <slot name="content">
        <slot>
          <p v-if="displayContent" class="empty-state__text">{{ displayContent }}</p>
        </slot>
      </slot>
    </div>

    <div v-if="slots.actions" class="empty-state__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
  margin: auto;
  box-sizing: border-box;
  user-select: none;
}

.empty-state--fill {
  width: 100%;
  height: 100%;
  min-height: 100%;
}

/* 无背景大图标，无悬停交互，完全静止无动画 */
.empty-state__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  background: transparent;
  border: 0;
  box-shadow: none;
  color: var(--color-muted-text);
  opacity: 0.6;
}

.empty-state__body {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 仅保留单行轻量提示文字 */
.empty-state__text,
.empty-state :deep(p) {
  margin: 0;
  max-width: 320px;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--color-muted-text);
}

.empty-state :deep(.tracks__source-btn) {
  display: inline;
  padding: 0;
  margin: 0;
  font-size: inherit;
  font-family: inherit;
  font-weight: 500;
  color: inherit;
  background: transparent;
  border: 0;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  transition: color 0.15s ease;
}

.empty-state :deep(.tracks__source-btn:hover) {
  color: var(--color-text);
}

.empty-state :deep(.tracks__source-btn:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
  color: var(--color-text);
}

.empty-state__actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 16px;
}
</style>
