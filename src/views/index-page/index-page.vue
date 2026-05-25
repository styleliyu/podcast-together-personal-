<script setup lang="ts">
import PtButton from "../../components/pt-button.vue"
import { useRouter } from "../../routes/pt-router"
import images from "../../images"
import { onActivated } from "vue";
import share from "../../utils/share";
import { useTheme } from "../../hooks/useTheme";
import { useAddToHomeScreen } from "./tools/useAddToHomeScreen";

const OPEN_SOURCE_URL = "https://github.com/yenche123/podcast-together"
const PERSONAL_REPO_URL = "https://github.com/styleliyu/podcast-together-personal-"
const { showInstallPwaBtn, onTapInstall } = useAddToHomeScreen()
let { theme } = useTheme()
const router = useRouter()

onActivated(() => {
  share.configShare()
})

const onTapCreateBtn = (e: Event) => {
  router.push({ name: "create" })
}

</script>

<template>

  <div class="page">
    <div class="page-container">
      <div class="div-bg-img index-icon-img"></div>
      <h1>一起听</h1>

      <div class="index-github-links">
        <a
          class="index-github-link"
          :href="OPEN_SOURCE_URL"
          target="_blank"
          title="原项目开源地址"
          aria-label="原项目开源地址"
        >
          <img :src="theme === 'light' ? images.GITHUB : images.GITHUB_DM" class="index-ou-github"/>
          <span>原</span>
        </a>
        <a
          class="index-github-link"
          :href="PERSONAL_REPO_URL"
          target="_blank"
          title="个人自用版仓库"
          aria-label="个人自用版仓库"
        >
          <img :src="theme === 'light' ? images.GITHUB : images.GITHUB_DM" class="index-ou-github"/>
          <span>自</span>
        </a>
      </div>
    </div>
  </div>

  <div class="page-btns-container">
    <div class="page-btns">
      <pt-button class="index-main-btn" text="创建房间" @click="onTapCreateBtn"></pt-button>

      <a v-if="!showInstallPwaBtn" :href="PERSONAL_REPO_URL" target="_blank">
        <div class="index-other-btn">
          <img :src="theme === 'light' ? images.GITHUB : images.GITHUB_DM" class="index-github"/>
          <span>个人仓库</span>
        </div>
      </a>
      <div v-else class="index-other-btn" @click="onTapInstall">
        <img :src="theme === 'light' ? images.IC_DOWNLOAD : images.IC_DOWNLOAD_DM" class="index-btn-icon"/>
        <span>安装应用</span>
      </div>
    </div>
  </div>

</template>

<style scoped lang="scss" >
.page {
  min-height: calc(100vh - 190px);

  .page-container {

    .index-icon {
      font-size: 50px;
      margin-bottom: 50px;
    }

    .index-icon-img {
      width: 60px;
      height: 60px;
      background-image: v-bind("'url(' + images.APP_LOGO + ')'");
      margin-bottom: 50px;
    }

    h1 {
      font-size: 38px;
      line-height: 50px;
      color: var(--text-color);
      letter-spacing: 2px;
    }

    .index-github-links {
      position: absolute;
      top: 14px;
      right: 4px;
      display: flex;
      gap: 8px;

      .index-github-link {
        width: 40px;
        height: 40px;
        position: relative;
        display: block;
        transition: opacity .15s;

        &:hover {
          opacity: .66;
        }

        span {
          width: 17px;
          height: 17px;
          border-radius: 50%;
          position: absolute;
          right: -2px;
          bottom: -2px;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 11px;
          line-height: 17px;
          color: var(--bg-color);
          background-color: var(--text-color);
        }
      }

      .index-ou-github {
        width: 100%;
        height: 100%;
        opacity: .78;
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

      .index-github {
        width: 20px;
        height: 20px;
        margin-right: 10px;
      }

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
