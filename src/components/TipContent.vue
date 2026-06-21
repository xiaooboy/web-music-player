<script lang="ts" setup>
const {
  title = "",
  content = "",
  fill = false,
} = defineProps<{
  title: string;
  content: string;
  fill?: boolean;
}>();
</script>
<template>
  <div :class="{ 'tip-content': true, 'tip-content--fill': fill }">
    <strong>{{ title }}</strong>
    <p>{{ content }}</p>
  </div>
</template>
<style>
.tip-content {
  padding: 72px 16px 82px;
  text-align: center;
}
.tip-content strong {
  display: block;
  color: var(--text);
  font-size: 1.08rem;
  margin-bottom: 10px;
}
.tip-content--fill {
  display: grid;
  place-content: center;
  min-height: 100%;
}
</style>
