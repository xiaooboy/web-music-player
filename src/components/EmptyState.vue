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
    <strong>{{ title }}</strong>
    <p>{{ content }}</p>
  </div>
</template>
<style>
.empty-state {
  padding: 72px 16px 82px;
  text-align: center;
}
.empty-state strong {
  display: block;
  margin-bottom: 10px;
  font-size: 1.08rem;
  color: var(--text);
}
.empty-state--fill {
  display: grid;
  place-content: center;
  min-height: 100%;
}
</style>
