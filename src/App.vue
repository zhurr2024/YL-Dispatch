<script setup lang="ts">
import { ref } from 'vue'
const storageError = ref(false)
window.addEventListener('yili-storage-error', () => { storageError.value = true })
</script>
<template>
  <div class="public-demo-banner" role="note">公开演示：全部线索、组织、人员及业务结果均为虚构，不代表真实业务。请勿录入敏感信息。</div>
  <div v-if="storageError" class="persistence-warning">浏览器本地存储空间不足，最新操作未持久化。请导出重要记录或重置演示。</div>
  <router-view />
</template>
