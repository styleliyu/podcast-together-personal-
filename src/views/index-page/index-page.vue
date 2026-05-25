<script setup lang="ts">
import PtButton from "../../components/pt-button.vue"
import { useRouter } from "../../routes/pt-router"
import images from "../../images"
import { onActivated, ref } from "vue"
import share from "../../utils/share"
import { useTheme } from "../../hooks/useTheme"
import { useAddToHomeScreen } from "./tools/useAddToHomeScreen"

const githubLinks = [
  { name: "我的 GitHub", url: "https://github.com/styleliyu" },
  { name: "copws/qq-music-api", url: "https://github.com/copws/qq-music-api" },
  { name: "listen1/listen1_desktop", url: "https://github.com/listen1/listen1_desktop" },
  { name: "metowolf/Meting", url: "https://github.com/metowolf/Meting" },
  { name: "yenche123/podcast-together", url: "https://github.com/yenche123/podcast-together" }
]

const tutorialSections = [
  {
    title: "创建房间",
    items: [
      "粘贴播客、mp3/m4a/aac、网易云、QQ、酷狗、酷我、百度/千千音乐链接即可创建。",
      "单曲会直接创建单曲房间；歌单会导入队列，房间内可切换顺序、随机、单曲循环。",
      "本地歌曲可多选上传，上传后会生成本地队列房间。"
    ]
  },
  {
    title: "复制链接",
    items: [
      "打开歌曲或歌单详情页，复制浏览器地址栏里的前端页面链接。",
      "不要复制歌手页、专辑页或无法公开访问的临时链接。",
      "受会员、版权、下架或地区限制的歌曲，需要平台接口实际返回播放地址。"
    ]
  },
  {
    title: "房间使用",
    items: [
      "把房间链接发给朋友即可同步播放、暂停、进度和倍速。",
      "房主可以限制其他成员操作播放器；开启后切歌和播放模式也只允许房主操作。",
      "常驻房间不会因为同一用户创建新房间而被自动替换。"
    ]
  }
]

const { showInstallPwaBtn, onTapInstall } = useAddToHomeScreen()
const { theme } = useTheme()
const router = useRouter()
const showGithubMenu = ref(false)
const showTutorial = ref(false)

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

const toggleTutorial = () => {
  showTutorial.value = !showTutorial.value
  showGithubMenu.value = false
}
</script>

<template>
  <div class="page">
    <div class="page-container">
      <div class="index-actions">
        <button class="index-action-text" type="button" @click="toggleTutorial">教程</button>
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

        <div v-if="showTutorial" class="index-dropdown index-tutorial">
          <section v-for="section in tutorialSections" :key="section.title">
            <h2>{{ section.title }}</h2>
            <p v-for="item in section.items" :key="item">{{ item }}</p>
          </section>
        </div>
      </div>

      <h1>一起听</h1>
    </div>
  </div>

  <div class="page-btns-container">
    <div class="page-btns">
      <pt-button class="index-main-btn" text="创建房间" @click="onTapCreateBtn"></pt-button>

      <div v-if="!showInstallPwaBtn" class="index-other-btn" @click="toggleTutorial">
        <span>查看教程</span>
      </div>
      <div v-else class="index-other-btn" @click="onTapInstall">
        <img :src="theme === 'light' ? images.IC_DOWNLOAD : images.IC_DOWNLOAD_DM" class="index-btn-icon"/>
        <span>安装应用</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.page {
  min-height: calc(100vh - 190px);

  .page-container {
    h1 {
      font-size: 40px;
      line-height: 54px;
      color: var(--text-color);
      letter-spacing: 0;
      font-weight: 700;
    }

    .index-actions {
      position: absolute;
      top: 14px;
      right: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 2;
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

    .index-tutorial {
      max-height: min(560px, calc(100vh - 90px));
      overflow: auto;

      section + section {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid rgba(128, 128, 128, .22);
      }

      h2 {
        margin: 0 0 8px;
        font-size: 16px;
        line-height: 22px;
        color: var(--text-color);
      }

      p {
        margin: 0 0 8px;
        font-size: 14px;
        line-height: 22px;
        color: var(--other-btn-text);
      }
    }
  }
}

.page-btns-container {
  min-height: 170px;
  padding-bottom: 20px;

  .page-btns {
    .index-main-btn {
      margin-bottom: 20px;
    }

    .index-other-btn {
      height: 50px;
      width: 100%;
      border-radius: 50px;
      font-size: var(--btn-font);
      background-color: var(--other-btn-bg);
      color: var(--other-btn-text);
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      margin-bottom: 20px;

      .index-btn-icon {
        width: 22px;
        height: 22px;
        margin-right: 10px;
        opacity: .72;
      }
    }

    .index-other-btn:hover {
      background-color: var(--other-btn-hover);
    }
  }
}
</style>
