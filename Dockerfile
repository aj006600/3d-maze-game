FROM node:22-slim AS base
# 專案 label:make clean 只清帶它的 image;dev 與 build 從 base 繼承
LABEL org.opencontainers.image.title="hbd-3d-maze-game"
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

# site:只放要發佈的靜態檔,放在根目錄。它是 scratch,不能當 image 跑,
# 要用 docker build --output 把內容匯出成目錄
FROM scratch AS site
COPY --from=build /app/dist /
