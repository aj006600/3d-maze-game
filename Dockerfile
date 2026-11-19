FROM node:22-slim AS base
# 專案 label:make clean 只清帶它的 image;dev 與 build 從 base 繼承
LABEL org.opencontainers.image.title="3d-maze-game"
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci 預設連 devDependencies 一起裝:build 要用 vite,dev 要用 vitest、eslint 與 prettier
RUN npm ci

# dev:本機開發、測試與檢查用。
# CMD 是 make local 的 Vite dev server;--host 讓它聽所有介面,容器外才連得到。
# 容器內的埠固定 3000,與 make local 預設的對外埠相同,Vite 啟動時印的網址才點得開
FROM base AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "--port", "3000"]

FROM base AS build
COPY . .
RUN npm run build

# site:只放 build 出來的靜態檔,不當 image 跑。
# CI 用 docker build --output 把這個 stage 的內容匯出成目錄,再發佈到 GitHub Pages
FROM scratch AS site
COPY --from=build /app/dist /
