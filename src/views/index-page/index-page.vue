<script setup lang="ts">
import PtButton from "../../components/pt-button.vue"
import { useRouter } from "../../routes/pt-router"
import images from "../../images"
import { onActivated, ref } from "vue"
import share from "../../utils/share"
import { useTheme } from "../../hooks/useTheme"

const githubLinks = [
  { name: "我的 GitHub", url: "https://github.com/styleliyu" },
  { name: "yenche123/podcast-together", url: "https://github.com/yenche123/podcast-together" },
  { name: "metowolf/Meting", url: "https://github.com/metowolf/Meting" },
  { name: "copws/qq-music-api", url: "https://github.com/copws/qq-music-api" },
  { name: "listen1/listen1_desktop", url: "https://github.com/listen1/listen1_desktop" }
]

const { theme } = useTheme()
const router = useRouter()
const showGithubMenu = ref(false)
const showTutorial = ref(false)

const usageTutorial = `1. 点击“创建房间”。
2. 粘贴网易云、QQ、酷狗、酷我、百度/千千音乐的单曲或歌单链接，或点击“导入本地歌曲”选择本地文件。
3. 本地文件支持 mp3、m4a、aac、flac、wav、ogg，以及 ncm、qmc、kgm、kwm 等常见加密音乐格式。
4. 创建成功后，把房间链接发给朋友；同一房间内会同步播放、暂停、进度拖动、上一首、下一首和播放模式。
5. 房间内可以继续添加单曲或歌单。导入大歌单时可在进度面板查看已解析、已加入和失败数量，也可以取消导入。`

onActivated(() => {
  share.configShare()
})

const onTapCreateBtn = () => {
  router.push({ name: "create" })
}

const toggleGithubMenu = () => {
  showGithubMenu.value = !showGithubMenu.value
  showTutorial.value = false
}

const openTutorial = () => {
  showTutorial.value = true
  showGithubMenu.value = false
}

const closeTutorial = () => {
  showTutorial.value = false
}
</script>

<template>
  <div class="page index-page">
    <div class="index-actions">
      <button class="index-action-text" type="button" @click="openTutorial">教程</button>
      <button
        class="index-action-icon"
        type="button"
        aria-label="GitHub 项目"
        title="GitHub 项目"
        @click="toggleGithubMenu"
      >
        <img :src="theme === 'light' ? images.GITHUB : images.GITHUB_DM" class="index-github-icon"/>
      </button>

      <div v-if="showGithubMenu" class="index-dropdown index-github-menu">
        <a v-for="link in githubLinks" :key="link.url" :href="link.url" target="_blank">
          {{ link.name }}
        </a>
      </div>
    </div>

    <div class="page-container index-container">
      <h1>一起听</h1>
      <p>和朋友实时同步听音乐、播客和本地音频。</p>
      <div class="index-btns">
        <pt-button text="创建房间" @click="onTapCreateBtn"></pt-button>
        <pt-button text="查看教程" type="other" @click="openTutorial"></pt-button>
      </div>
    </div>
  </div>

  <div v-if="showTutorial" class="index-doc-modal">
    <div class="index-doc-bg" @click="closeTutorial"></div>
    <article class="index-doc-panel">
      <header>
        <h2>使用教程</h2>
        <button type="button" @click="closeTutorial">关闭</button>
      </header>
      <pre>{{ usageTutorial }}</pre>
    </article>
  </div>
</template>

<style scoped lang="scss">
.index-page {
  min-height: 100vh;
}

.index-container {
  min-height: calc(100vh - 180px);
  justify-content: center;
  padding-top: 40px;
  overflow: visible;

  h1 {
    margin: 0;
    font-size: 48px;
    line-height: 60px;
    color: var(--text-color);
    letter-spacing: 0;
    font-weight: 700;
  }

  p {
    margin: 18px 0 0;
    max-width: 360px;
    color: var(--desc-color);
    font-size: 17px;
    line-height: 28px;
  }
}

.index-btns {
  width: 100%;
  margin-top: 52px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.index-actions {
  position: fixed;
  top: 18px;
  right: max(18px, calc((100vw - var(--standard-max-px)) / 2));
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 100;
}

.index-action-text,
.index-action-icon {
  height: 38px;
  border: 0;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  opacity: .82;
  transition: opacity .15s, background-color .15s;

  &:hover {
    opacity: 1;
  }
}

.index-action-text {
  padding: 0 8px;
  font-size: 16px;
}

.index-action-icon {
  width: 38px;
  padding: 7px;
  border-radius: 50%;

  &:hover {
    background-color: var(--other-btn-hover);
  }
}

.index-github-icon {
  width: 100%;
  height: 100%;
  display: block;
}

.index-dropdown {
  position: absolute;
  top: 48px;
  right: 0;
  width: min(320px, calc(100vw - 40px));
  border-radius: 8px;
  padding: 14px;
  background-color: var(--other-btn-bg);
  color: var(--text-color);
  box-shadow: 0 18px 42px rgba(0, 0, 0, .22);
  text-align: left;
}

.index-github-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;

  a {
    padding: 10px 8px;
    border-radius: 6px;
    color: var(--text-color);
    font-size: 15px;
    line-height: 20px;

    &:hover {
      background-color: var(--other-btn-hover);
    }
  }
}

.index-doc-modal {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
}

.index-doc-bg {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .72);
}

.index-doc-panel {
  position: relative;
  z-index: 1;
  width: min(760px, 100%);
  max-height: min(760px, calc(100vh - 56px));
  box-sizing: border-box;
  border-radius: 8px;
  background: var(--bg-color);
  color: var(--text-color);
  box-shadow: 0 24px 70px rgba(0, 0, 0, .32);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  header {
    height: 58px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--card-color);
  }

  h2 {
    margin: 0;
    font-size: 20px;
    line-height: 28px;
  }

  button {
    height: 34px;
    border: 0;
    border-radius: 6px;
    padding: 0 14px;
    background: var(--other-btn-bg);
    color: var(--other-btn-text);
    cursor: pointer;
  }

  pre {
    margin: 0;
    padding: 20px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
    color: var(--desc-color);
    font-family: inherit;
    font-size: 14px;
    line-height: 24px;
  }
}
</style>
