# 3d-maze-game

生日迷宮:一個在瀏覽器裡玩的 3D 迷宮遊戲,主角帶著狗在迷宮裡依序收集拼出 HAPPY BIRTHDAY 的字母,打開門走出去。

## How to Play

**目標**:迷宮的死路裡放著 A 到 Z 的字母。照 HAPPY BIRTHDAY 的順序收集字母(空格不算,共 13 個),
集滿最後一個時門就打開,從門走出去就破關。站在不是下一個要收的字母那裡按 F,這一下不算數,進度也不會倒退。

**操作**:打開網頁先點一下禮物盒,音樂從這一下開始播;再按開始畫面的「開始」鎖定游標,進入迷宮。

| 按鍵 | 動作 |
|------|------|
| `W` `A` `S` `D` | W 前進、S 倒退、A 與 D 橫移 |
| 滑鼠 | 左右移動轉向,上下移動調整俯仰角 |
| `F` | 站進有字母的死路時收集字母 |
| `Esc` | 放開游標,點一下畫面就能繼續 |
| `M` | 切換靜音,畫面右上角的喇叭圖示顯示目前的狀態 |

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
| **發佈**(GitHub Pages、發版、退回舊版、第一次啟用) | [docs/deployment.md](docs/deployment.md) |
| **設計決策**(為什麼這樣選) | [docs/adr/](docs/adr/) |
| **用詞**(迷宮、字母、收集、主角……) | [GLOSSARY.md](GLOSSARY.md) |

## Structure

```
.
├── src/
│   ├── App.jsx             # 首頁就是遊戲:把介面層疊在畫布上,並決定目前停在哪個畫面
│   ├── audio/              # 音訊:依畫面播放音樂、轉場淡出與靜音(Web Audio API),音檔放在 music/
│   ├── config.js           # 試玩後要調整的設定:seed、通關字串、祝福文字、場景比例(牆高、走道寬度)、鏡頭距離與俯仰角
│   ├── game/               # 遊戲核心:不依賴 Three.js、React 與瀏覽器 API 的純模組
│   ├── render/             # 渲染層:用 Three.js 把遊戲核心的狀態畫成 3D 場景,另外負責鏡頭、鍵鼠輸入與跟著主角跑的狗,不持有規則
│   └── ui/                 # 介面層:疊在畫布上的入口畫面、開始畫面、遊戲中的提示、破關畫面與喇叭圖示(React),不持有規則
├── tests/                  # Vitest,鏡射 src/ 的結構
├── index.html · vite.config.js · package.json · package-lock.json
├── eslint.config.js        # ESLint:recommended 加 react-hooks
├── prettier.config.js      # Prettier:不加分號、單引號、行寬 120
├── Dockerfile              # 多階段:dev 跑 Vite dev server 與測試工具、build 出靜態檔、site 只放要發佈的靜態檔
├── compose.yaml            # make local:掛載原始碼、開 localhost 埠
├── Makefile                # local·compose / test·lint·format / clean / ps / worktree
├── GLOSSARY.md             # 遊戲的用詞
├── CLAUDE.md · .claude/    # coding agent 的規則與 guard hooks
├── .github/workflows/ci-cd.yml  # test、build 檢查 → Release tag(vX.Y.Z)才發佈到 GitHub Pages
└── docs/                   # development.md · deployment.md · adr/ · agents/(agent skills 的 issue tracker / label / domain 設定)
```

## Credits

音樂放在 `src/audio/music/`,只用 CC0 或 CC BY 授權的音檔。

| 畫面 | 曲名 | 作者 | 來源 | 授權 |
|------|------|------|------|------|
| 開始畫面 | Pleasant Creek(循環版) | Matthew Pablo | https://opengameart.org/content/pleasant-creek | CC BY 3.0 |
| 遊戲中 | Flowerbed Fields [Loop] | Zane Little Music | https://opengameart.org/content/flowerbed-fields-loop | CC0 |
| 破關畫面 | Happy Birthday Music Box | Percy Duke | https://freesound.org/people/Percy%20Duke/sounds/23270/ | CC BY 3.0 |

CC BY 3.0 的標註:

- "Pleasant Creek" by Matthew Pablo (http://www.matthewpablo.com), CC BY 3.0, https://opengameart.org/content/pleasant-creek
- "Happy Birthday Music Box.MP3" by Percy Duke (https://freesound.org/s/23270/), CC BY 3.0

檔案與原檔的關係(曲子本身都沒有改動):

- Pleasant Creek:循環版的原檔是 WAV,轉成 OGG 才能無縫循環。
- Flowerbed Fields [Loop]:原檔的 OGG。
- Happy Birthday Music Box:Freesound 頁面上不必登入就能下載的 HQ 預覽檔。原檔本身就是 128 kbps 的 MP3,預覽檔與它的音質相當。
