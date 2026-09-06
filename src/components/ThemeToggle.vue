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
      <component :is="mode.icon" :size="20" />
    </button>
  </div>
</template>

<style scoped>
.theme-toggle {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 10px;
  /*background: var(--gray-a3);*/
  border-radius: 8px;
}

.theme-toggle--collapsed {
  gap: 0;
  background: transparent;
  justify-content: center;
  width: 100%;
}

.theme-toggle__btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: var(--color-muted-text);
  border-radius: 6px;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

/* 折叠时隐藏非激活按钮 */
.theme-toggle--collapsed .theme-toggle__btn:not(.theme-toggle__btn--active) {
  display: none;
}

.theme-toggle--collapsed .theme-toggle__btn--active {
  background: transparent;
}

.theme-toggle__btn:hover {
  color: var(--color-text);
  background: var(--gray-a4);
}

.theme-toggle__btn--active {
  color: var(--accent-deep);
  /*background: var(--gray-a4);*/
}

.theme-toggle__btn--active:hover {
  color: var(--accent-deep);
}
</style>
