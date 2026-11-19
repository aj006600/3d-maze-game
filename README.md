# 3d-maze-game

生日迷宮:一個在瀏覽器裡玩的 3D 迷宮遊戲,主角帶著狗在迷宮裡依序收集拼出 HAPPY BIRTHDAY 的字母,打開門走出去。

## How to Play

**目標**:迷宮的死路裡放著 A 到 Z 的字母。照 HAPPY BIRTHDAY 的順序收集字母(空格不算,共 13 個),
集滿最後一個時門就打開,從門走出去就破關。站在不是下一個要收的字母那裡按 F,這一下不算數,進度也不會倒退。

**操作**:按開始畫面的「開始」鎖定游標,進入迷宮。

| 按鍵 | 動作 |
|------|------|
| `W` `A` `S` `D` | W 前進、S 倒退、A 與 D 橫移 |
| 滑鼠 | 左右移動轉向,上下移動調整俯仰角 |
| `F` | 站進有字母的死路時收集字母 |
| `Esc` | 放開游標,點一下畫面就能繼續 |

## Quick Start

開發機只需要 Docker 與 make,不必裝 Node。

```bash
make local   # http://localhost:3000,改了原始碼存檔畫面就更新(前景執行,Ctrl+C 停止)
make test    # 跑測試(Vitest,與 CI 同一套環境)
make help    # 其餘指令
```

## Docs

| 想做的事 | 看這份 |
|----------|--------|
| **本機開發**(hot reload、測試、lint、清理、worktree) | [docs/development.md](docs/development.md) |
| **CI/CD 與部署**(Release、promote、rollback、GitHub 設定) | [docs/deployment.md](docs/deployment.md) |
| **用詞**(迷宮、字母、收集、主角……) | [GLOSSARY.md](GLOSSARY.md) |

## Structure

```
.
├── src/
│   ├── App.jsx             # 首頁就是遊戲:把介面層疊在畫布上,並決定目前停在哪個畫面
│   ├── config.js           # 試玩後要調整的設定:seed、通關字串、祝福文字、場景比例(牆高、走道寬度)、鏡頭距離與俯仰角
│   ├── game/               # 遊戲核心:不依賴 Three.js、React 與瀏覽器 API 的純模組
│   ├── render/             # 渲染層:用 Three.js 把遊戲核心的狀態畫成 3D 場景,另外負責鏡頭、鍵鼠輸入與跟著主角跑的狗,不持有規則
│   └── ui/                 # 介面層:疊在畫布上的開始畫面、遊戲中的提示與破關畫面(React),不持有規則
├── tests/                  # Vitest,鏡射 src/ 的結構
├── index.html · vite.config.js · package.json · package-lock.json
├── eslint.config.js        # ESLint:recommended 加 react-hooks
├── prettier.config.js      # Prettier:不加分號、單引號、行寬 120
├── Dockerfile              # 多階段:dev 跑 Vite dev server 與測試工具、build 出靜態檔、nginx 出貨
├── nginx.conf              # 出貨 image 供靜態檔
├── compose.yaml            # base:只定義服務
├── compose.local.yaml      # 本機開發覆寫:掛載原始碼、開 localhost 埠
├── compose.deploy.yaml     # 部署覆寫:綁主機 HTTP_PORT + log 輪替
├── .env.example            # 主機上 .env.<env> 的範本(進版控)
├── Makefile                # local·compose / test·lint·format / clean / deploy·down / ps / worktree
├── GLOSSARY.md             # 遊戲的用詞
├── CLAUDE.md · .claude/    # coding agent 的規則與 guard hooks
├── .github/workflows/ci-cd.yml  # test → Release tag(vX.Y.Z)才 build 推 GHCR
└── docs/                   # development.md · deployment.md · adr/ · agents/(agent skills 的 issue tracker / label / domain 設定)
```
