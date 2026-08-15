<script lang="ts" setup>
const {
  title = "",
  content = "",
  fill = false,
} = defineProps<{
  title?: string;
  content?: string;
  fill?: boolean;
}>();
</script>
<template>
  <div :class="{ 'empty-state': true, 'empty-state--fill': fill }">
    <slot name="title">
      <strong>{{ title }}</strong>
    </slot>
    <slot name="content">
      <p>{{ content }}</p>
    </slot>
  </div>
</template>
<style>
.empty-state {
  text-align: center;
}
.empty-state strong {
  display: block;
  margin-bottom: 10px;
  font-size: var(--text-lg);
  color: var(--text);
}
.empty-state--fill {
  display: grid;
  place-content: center;
  min-height: 100%;
}
</style>
