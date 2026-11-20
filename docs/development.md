# Development

本機開發的日常操作。所有指令在 repo 根目錄執行,都跑在容器裡:開發機只需要 Docker 與 make,不必裝 Node。

## Quickstart

```bash
make local       # Vite dev server(前景執行,Ctrl+C 停止)
make local-down  # 停止並清理:container、network、anonymous volume,以及不會再用到的舊 image
```

打開 <http://localhost:3000>,點一下禮物盒進到開始畫面,玩法與按鍵都寫在開始畫面上。

埠只發佈到 loopback(`127.0.0.1`),同一個網路上的別台機器連不到。在遠端主機上開發時,用 SSH 或 VS Code 把埠轉接到自己的電腦。

撞埠(例如另一個 worktree 也在跑 `make local`)時從 shell 換埠:

```bash
PORT=3001 make local
```

## Structure

```
.
├── src/
│   ├── App.jsx                # 首頁就是遊戲:把介面層疊在畫布上,並決定目前停在哪個畫面
│   ├── config.js              # 試玩後要調整的數值,改設定不必動程式
│   ├── game/                  # 遊戲核心:規則與狀態,不依賴 Three.js、React 與瀏覽器 API
│   ├── render/                # 渲染層:用 Three.js 把遊戲核心的狀態畫成 3D 場景,不持有規則
│   ├── ui/                    # 介面層:疊在畫布上的畫面與提示(React),不持有規則
│   └── audio/                 # 音樂與音效(Web Audio API)
├── tests/                     # Vitest,鏡射 src/ 的結構
├── Dockerfile · compose.yaml  # 本機開發、測試與 CI 共用的容器環境
├── Makefile                   # 本機指令的入口,make help 列出全部
├── .github/workflows/         # 每次都跑測試與 build 檢查,打 vX.Y.Z tag 才發佈到 GitHub Pages
├── GLOSSARY.md                # 遊戲的用詞
├── CLAUDE.md · .claude/       # coding agent 的規則與 guard hooks
└── docs/                      # 開發與發佈的說明、ADR、agent 的設定,以及 README 用的 GIF
```

## Hot Reload

`make local` 在 dev stage 的容器裡跑 Vite dev server,並把整個 checkout 掛進容器。
改了 `src/` 底下的檔案,存檔後畫面就更新,不必重新 build;改 `index.html` 或 `vite.config.js` 也一樣即時生效。

相依例外:`package.json` 與 `package-lock.json` 由 build 時的 `npm ci` 裝進 image,掛載蓋不到。
**改了相依要重跑 `make local`**。它每次都先收掉舊的 container 再重新 build,容器裡的 `node_modules` 才會換成新的。

## Testing and Linting

```bash
make test                     # 完整套 Vitest,跟 CI 一樣
make test ARGS="tests/game"   # 只跑路徑符合的測試檔
make test ARGS="-t 角落"      # 只跑名字符合的測試
make lint                     # ESLint(recommended 加 react-hooks)
make format                   # Prettier(就地改檔)
```

都跑在 dev stage 的容器裡,跟 CI 的 `test` job 同一個 stage——本機過了 CI 就會過。CI 另外用 `prettier --check`
檢查格式,所以 commit 前改過程式碼就跑一次 `make format`。

`make test` 與 `make lint` 讀的是烤在 image 裡的原始碼,所以每次都會先重新 build,有 build cache 時只多幾秒。
`make format` 要改到你的檔案,另外把 checkout 掛進容器。

`tests/` 鏡射 `src/` 的結構。遊戲核心(`src/game/`)的測試只透過它的公開介面 `createGame` 給輸入、讀狀態,
不測內部的部件。渲染層(`src/render/`)與介面層(`src/ui/`)沒有自動化測試,畫面的驗證是開實際頁面截圖、
檢查 console 沒有錯誤。音訊(`src/audio/`)也沒有自動化測試:容易出錯的是瀏覽器的行為(擋自動播放、循環的接縫、
淡出),假的播放器測不到,所以以真人在桌機瀏覽器(Chrome 或 Edge)實際試玩、聽過為準。

驗證畫面時不必每次真的走過整張迷宮:開 `http://localhost:3000/?teleport`,在 console 呼叫
`window.teleport(col, row)`,主角就會被移到那一格的中央(col 往東、row 往南,從 0 數起)。
這個傳送 hook 預設關閉,網址沒帶 `?teleport` 時 `window.teleport` 不存在,正常遊玩碰不到它。

驗證最後 30 秒的提醒與挑戰失敗時也不必等滿 5 分鐘:在本機暫時把 `src/config.js` 裡 `TIME_LIMITS` 最短的那個時限改短(例如 60 秒),
驗完改回,不要提交。

### Testing workflow

本機跑一次、CI 再跑一次是刻意的,兩次回答的問題不同:本機答「我剛改的有沒有弄壞」,
CI 在乾淨的機器上對**合併後的結果**跑完整套,答「合進 main 能不能用」——CI 不信任本機的結果,那次不能省。
能省的是本機那次的**範圍**:

1. **開發中**只跑跟改動相關的測試,幾秒一輪。改 `src/game/x.js` 就跑 `make test ARGS="tests/game"`;
   修一個紅的測試就 `ARGS="-t <測試名>"`。
2. **commit 前**跑 `make lint`,改過程式碼再跑 `make format`,幾秒。
3. **push、開 PR**,CI 跑完整套,不用等它,繼續做別的;紅了再回來修。

只有改到共用的東西(相依、設定、跨多個模組)或不確定影響範圍時,才在 push 前跑一次完整的 `make test`。

## Common Checks

```bash
make ps                              # 正在跑的 container(名稱 / 狀態 / 埠)
make compose ARGS="logs -f app"      # 追 dev server 的 log
make compose ARGS="exec app sh"      # 進容器
```

`make compose` 對 `make local` 那組 container 下任何 compose 子命令,帶的是同一個 image tag。

## Cleanup

Docker 留在機器上的東西分三層收,每一層動到的範圍不同:

| 指令 | 清什麼 | 範圍 |
|------|--------|------|
| `make local-down` | `make local` 的 container 與 network、裝 `node_modules` 的 anonymous volume、沒名字的舊 image(`<none>`) | 只有本專案 |
| `make clean` | 上面那些,加上有名字的 image | 只有本專案 |
| `make clean-cache` | Docker build cache | **整台機器的所有專案**,會先問過 |

```bash
make local-down    # 日常收工
make clean         # 把本專案佔的空間還回去
make clean-cache   # 磁碟還是不夠時,接在 make clean 之後跑
```

**`make local-down` 留下什麼**:有名字的 image 與 build cache,下次 `make local` 會直接重用,起得快。

**它清掉的是不會再被用到的東西**:

| 東西 | 怎麼來的 |
|------|---------|
| 沒名字的舊 image | 重 build 同一個 tag,新 image 拿走名字,舊的變成 `<none>` 卻沒被刪。原始碼烤在 image 裡,所以改一次程式再跑 `make test` 就多一顆 |
| anonymous volume | 裝 `node_modules` 的那個 volume 沒有名字。container 刪掉後它還在,下次 `make local` 卻另建一個新的 |
| 沒 down 的 container | `make local` 按 Ctrl+C 只是停下來,container 與 network 都還在 |
| 改名前的 container | compose 檔裡把服務改名或拿掉,舊 container 還掛在同一個 project 名下 |

沒名字的舊 image 不必等到收工:`make local`、`make test`、`make lint`、`make format` 每次都會順手清。
`make local` 還在跑的時候跑 `make test`,被取代的那顆 image 仍有 container 在用,會留到下一次 `make local` 或 `make local-down` 才清。

**怎麼認出這個專案的東西**:`Dockerfile` 裡有專案 label(`org.opencontainers.image.title`),
build 出來的每顆 image 都帶著它,連重 build 後沒名字(`<none>`)的舊 image 也是。清 image 的指令只刪帶這個 label 的,
不比對 image 名字——`shop` 與 `shop-admin` 這種名字相近的專案才不會互刪。

**build cache 沒有 label**,沒辦法按專案挑,所以獨立成 `make clean-cache`。它清掉整台機器上沒有 image 在用的 cache:
先跑 `make clean` 把本專案的 image 刪掉,本專案的 cache 才會落在這個範圍內。別的專案同樣沒有 image 在用的 cache
也會一起清掉——它們下次 build 要重新下載套件,慢幾分鐘,不會壞。build cache 通常是最佔空間的一塊,磁碟告警時才需要動它。

`make clean` 之後的第一次 `make local` 要重新 build image。

**想確認從乾淨狀態 build 得起來**(改完 `Dockerfile` / `package-lock.json` 之後)不必清任何東西,叫這一次 build 不用 cache 就好:

```bash
make compose ARGS="build --no-cache"
```

## Parallel Development (worktree)

一個 issue 一個 worktree,多個 worktree 可以同時開發、同時跑 `make local` / `make test`。指令都從主 checkout 跑:

```bash
make worktree ISSUE=12 BRANCH=feat/login   # 開在 .claude/worktrees/<app>-issue-12
cd .claude/worktrees/<app>-issue-12
make test                                  # 與其他 worktree 同時跑也不會互相干擾
PORT=3001 make local                       # 另一個 make local 已佔用 3000 時換埠
cd - && make worktree-rm ISSUE=12          # 收工:有未 commit 或未 push 的東西會拒絕
```

為什麼不會互相干擾:

- **container、network 與 volume**:compose project 名取目錄名,每個 worktree 一套。
- **image**:本機 build 的 tag 帶目錄名(`<app>:local-<目錄名>`),同時 build 不會搶同一個名字。

branch 從 `origin/main` 開且不追蹤它(`--no-track`),不帶參數的 `git push` 不會推進 main;第一次 push 寫明
`git push -u origin <branch>`。origin 上已有同名 branch 時,`make worktree` 接著它開。

`make worktree-rm` 連該 worktree 的 container、network、volume 與它 build 的 image 一起收。它只檢查程式碼有沒有 commit 與 push,
volume 裡的資料會直接刪掉:要留的資料在主 checkout 跑。

`make clean` 以專案 label 清 image,會連其他 worktree build 的一起清;正在跑的刪不掉,會停在那一步。
沒名字的舊 image 也是以專案 label 認,任何一個 checkout 清的時候,其他 worktree 留下的會一起清掉。
