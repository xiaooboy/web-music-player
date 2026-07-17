<script setup lang="ts">
import { useSlots } from "vue";

defineProps<{
  title?: string;
}>();
const slots = useSlots();
</script>

<template>
  <div class="section-header">
    <div class="section-header-left" v-if="slots.left">
      <slot name="left" />
    </div>
    <div class="section-header-title">
      <slot name="title">
        <h2>{{ title }}</h2>
      </slot>
    </div>
    <div class="section-header-right">
      <slot name="right" />
    </div>
  </div>
</template>

<style>
.section-header {
  display: flex;
  align-items: center;
  height: 42px;
  /*justify-content: space-between;*/
  align-items: center;
  /*gap: 18px;*/
}
.section-header-left {
  margin-right: 12px;
}
.section-header h2 {
  color: var(--accent);
  font-size: 1.08rem;
  font-weight: 700;
  line-height: 1.2;
}
.section-header-title {
  flex: 1;
}
</style>
