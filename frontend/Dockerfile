# --platform=$BUILDPLATFORM:npm ci、vite build 與 vitest 都只產出跟架構無關的結果,多架構 build 時只在 runner 原生跑一次;
# 只有最後的 nginx stage(純複製檔案)每個架構各一份
FROM --platform=$BUILDPLATFORM node:22-slim AS base
# 專案 label:make clean 只清帶它的 image;dev / build 從 base 繼承,nginx stage 自己再帶一次
LABEL org.opencontainers.image.title="3d-maze-game"
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci 預設連 devDependencies 一起裝:build 要用 vite,dev 要用 vitest
RUN npm ci

# dev:測試用(vitest),永不部署;make test-frontend 與 CI 的 test-frontend job 都跑這個 stage
FROM base AS dev
COPY . .
CMD ["npm", "test"]

FROM base AS build
COPY . .
RUN npm run build

# 出貨用的 nginx 必須留在最後:CI build 與 compose base 都沒指定 target,
# Docker 建「最後一個」stage,調換順序會把含測試工具的 dev image 推上 production
FROM nginx:alpine
LABEL org.opencontainers.image.title="3d-maze-game"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
