<script setup lang="ts">
import { computed, ref, onActivated, watch } from 'vue';
import { hasPreviousRouteInApp, goHome, useRouteAndPtRouter } from "../../routes/pt-router";
import PtButton from "../../components/pt-button.vue"
import cp from "./cp-helper"
import ListeningLoader from '../../components/listening-loader.vue'
import { LOCAL_MUSIC_ACCEPT } from "../../utils/decryptMusicFile"

const { router, route } = useRouteAndPtRouter()
const hasPrev = hasPreviousRouteInApp()
const inputValue = ref<string>("")
const inputEl = ref<HTMLInputElement | null>(null)
const fileEl = ref<HTMLInputElement | null>(null)
const isPersistent = ref(false)

const hasQuery = ref(false)
// 监听 query 的变化，更新 hasQuery
watch(() => route.query, (newV, oldV) => {
  if(route.name !== "create") return
  const { title, text, link } = newV
  const newHasQuery = Boolean(title || text || link)
  hasQuery.value = newHasQuery
})

const canSubmit = computed(() => {
  let val = inputValue.value
  let v = val.trim()
  if(v.length < 10) return false
  const reg = /^http(s)?:\/\/[\w\.-]*\w{1,32}\.\w{2,6}\S*$/g
  return reg.test(val)
})

const onInputConfirm = () => {
  inputEl?.value?.blur()
  if(!canSubmit.value) return
  cp.finishInput(inputValue.value, router, route, isPersistent.value)
}

const onTapConfirm = () => {
  if(!canSubmit.value) return
  cp.finishInput(inputValue.value, router, route, isPersistent.value)
  inputEl?.value?.blur()
}

const onTapUpload = () => {
  fileEl.value?.click()
}

const onFileChange = () => {
  const files = Array.from(fileEl.value?.files || [])
  if(!files.length) return
  cp.finishUpload(files, router, route, isPersistent.value)
  if(fileEl.value) fileEl.value.value = ""
}

const onTapBack = () => {
  if(hasPrev.value) router.go(-1)
  else goHome(router)
}

onActivated(() => {
  const { title, text, link } = route.query

  // 有从外部传来值时
  if(title || text || link) {
    hasQuery.value = true
    cp.useLinkFromQuery(router, route)
  }
  else {
    if(canSubmit.value) return
    inputEl.value?.focus()
  }
})

</script>

<template>
  <div class="page">
    <div class="page-container">
      <h1>创建房间</h1>
      <input 
        v-model="inputValue" 
        placeholder="粘贴音频或音乐链接" 
        type="url" 
        @keyup.enter="onInputConfirm" 
        maxlength="1000"
        ref="inputEl"
      />
      <p>支持播客、音乐链接、歌单链接、本地普通音频，以及 ncm/qmc/kgm/kwm 等加密音乐文件</p>
      <label class="persistent-row">
        <input v-model="isPersistent" type="checkbox" />
        <span>常驻房间</span>
      </label>
      <input
        ref="fileEl"
        class="file-input"
        type="file"
        :accept="LOCAL_MUSIC_ACCEPT"
        multiple
        @change="onFileChange"
      />
      <div class="create-actions">
        <pt-button
          text="确定"
          @click="onTapConfirm"
          :disabled="!canSubmit"
        />
        <pt-button :text="hasPrev ? '返回' : '回首页'" type="other" @click="onTapBack"></pt-button>
        <pt-button text="导入本地歌曲" type="other" @click="onTapUpload"></pt-button>
      </div>
    </div>
  </div>

  <!-- 从参数创建房间 -->
  <div v-if="hasQuery" class="page-full">
    <ListeningLoader />
    <div class="pf-text">
      <span>正在创建房间..</span>
    </div>
  </div>
</template>

<style scoped lang="scss">

.page-container {
  min-height: calc(100vh - 120px);
  justify-content: center;
  padding-top: 40px;
  padding-bottom: 60px;

  h1 {
    margin-block-start: 0;
    font-size: 34px;
    line-height: 44px;
    color: var(--text-color);
    margin-bottom: 42px;
  }

  input {
    width: min(100%, 520px);
    box-sizing: border-box;
    font-size: 26px;
    line-height: 38px;
    color: var(--desc-color);
    border: 0;
    border-bottom: 1px solid var(--note-color);
    background-color: transparent;
    outline: none;
    text-align: center;
    padding: 6px 0 16px;
  }

  input::-webkit-input-placeholder {
    color: var(--note-color);
  }

  p {
    margin-block-start: 22px;
    margin-block-end: 0;
    font-size: 14px;
    color: var(--note-color);
    text-align: center;
    line-height: 1.7;
    max-width: 360px;
    user-select: text;
  }

  .persistent-row {
    margin-top: 18px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 14px;
    cursor: pointer;

    input {
      width: 16px;
      height: 16px;
      accent-color: var(--text-color);
    }
  }

  .file-input {
    display: none;
  }

}

.create-actions {
  width: min(100%, 520px);
  margin-top: 48px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-full {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  justify-content: space-evenly;
  align-items: center;
  width: 100vw;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1500;
  background-color: var(--bg-color);

  .pf-text {
    font-size: var(--desc-font);
    color: var(--desc-color);
    line-height: 1.5;
  }
}

</style>
