<script setup lang="ts">
import { useSlots } from "vue";

defineProps<{
  title?: string;
}>();
const slots = useSlots();
</script>

<template>
  <div class="section-header">
    <div class="section-header__left" v-if="slots.left">
      <slot name="left" />
    </div>
    <div class="section-header__title">
      <slot name="title">
        <h2>{{ title }}</h2>
      </slot>
    </div>
    <div class="section-header__right" v-if="slots.right">
      <slot name="right" />
    </div>
  </div>
</template>

<style>
.section-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 44px;
  margin-bottom: 8px;
  background-color: var(--color-background);
}
.section-header__left {
  margin-right: 0;
}
.section-header h2 {
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.2;
  color: var(--accent);
}
.section-header__title {
  flex: 1;
  min-width: 0;
}
.section-header__right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
