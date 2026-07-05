<script setup lang="ts">
import { useSlots } from "vue";

defineProps<{
  title?: string;
}>();
const slots = useSlots();
</script>

<template>
  <div class="section-head">
    <div class="section-head-left" v-if="slots.left">
      <slot name="left" />
    </div>
    <div class="section-head-title">
      <slot name="title">
        <h2>{{ title }}</h2>
      </slot>
    </div>
    <div class="section-head-right">
      <slot name="right" />
    </div>
  </div>
</template>

<style>
.section-head {
  display: flex;
  align-items: center;
  height: 42px;
  /*justify-content: space-between;*/
  align-items: center;
  /*gap: 18px;*/
}
.section-head-left {
  margin-right: 20px;
}
.section-head h2 {
  margin: 0;
  color: var(--accent);
  font-size: 1.08rem;
  font-weight: 700;
  line-height: 1.2;
}
.section-head-title {
  flex: 1;
}
</style>
