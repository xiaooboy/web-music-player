<script setup lang="ts">
import { Sun, Moon, Monitor } from "@lucide/vue";
import { useTheme, type ThemeMode } from "../composables/useTheme";

const props = defineProps<{
  collapsed?: boolean;
}>();

const { themeMode, setThemeMode } = useTheme();

const modes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "系统", icon: Monitor },
];

const onModeClick = (modeValue: ThemeMode) => {
  let finalModeValue = modeValue;
  if (props.collapsed) {
    const nextIndex =
      (modes.findIndex((mode) => mode.value === modeValue) + 1) % modes.length;
    finalModeValue = modes[nextIndex].value;
  }
  setThemeMode(finalModeValue);
};
</script>

<template>
  <div
    class="theme-toggle"
    :class="{ 'theme-toggle--collapsed': collapsed }"
    role="radiogroup"
    aria-label="主题模式"
  >
    <button
      v-for="mode in modes"
      :key="mode.value"
      class="theme-toggle__btn"
      :class="{ 'theme-toggle__btn--active': themeMode === mode.value }"
      role="radio"
      :aria-checked="themeMode === mode.value"
      :aria-label="mode.label"
      :title="mode.label"
      type="button"
      @click="onModeClick(mode.value)"
    >
      <component :is="mode.icon" :size="18" />
    </button>
  </div>
</template>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 38px;
  min-height: 38px;
  max-height: 38px;
  gap: 6px;
  padding: 0 4px;
  box-sizing: border-box;
  overflow: hidden;
  flex-wrap: nowrap;
}

.theme-toggle--collapsed {
  gap: 0;
  padding: 0;
  width: 100%;
}

.theme-toggle__btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  color: var(--color-muted-text);
  border-radius: 8px;
  border: 0;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
  transition:
    width 0.24s cubic-bezier(0.4, 0, 0.2, 1),
    min-width 0.24s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.2s ease,
    background 0.15s ease,
    color 0.15s ease;
}

/* 折叠时非激活按钮平滑收缩，高度和容器绝不突变 */
.theme-toggle--collapsed .theme-toggle__btn:not(.theme-toggle__btn--active) {
  width: 0;
  min-width: 0;
  opacity: 0;
  pointer-events: none;
}

.theme-toggle--collapsed .theme-toggle__btn--active {
  background: transparent;
}

.theme-toggle__btn:hover {
  color: var(--color-text);
  background: var(--color-surface-interactive-hover);
}

.theme-toggle__btn--active {
  color: var(--accent);
  background: var(--accent-surface);
}

.theme-toggle__btn--active:hover {
  color: var(--accent);
}
</style>
