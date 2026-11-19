# Development

本機開發的日常操作。所有指令在 repo 根目錄執行,都跑在容器裡:開發機只需要 Docker 與 make,不必裝 Node。

## Quickstart

```bash
make local       # Vite dev server(前景執行,Ctrl+C 停止)
make local-down  # 停止並清理 container、network 與 volume
```

打開 http://localhost:3000,首頁先顯示入口畫面的禮物盒,點一下進到開始畫面,音樂也從這一下開始播;
按「開始」鎖定游標進入迷宮:WASD 跑、滑鼠左右移動轉向、上下移動調整俯仰角,站進有字母的死路按 F 收集,
集滿 13 個字母門就打開,走出門看到破關畫面;Esc 暫停,在暫停畫面按「繼續」接著玩或回到開始畫面,M 切換靜音。

埠只發佈到 loopback(`127.0.0.1`),同一個網路上的別台機器連不到。在遠端主機上開發時,用 SSH 或 VS Code 把埠轉接到自己的電腦。

撞埠(例如另一個 worktree 也在跑 `make local`)時從 shell 換埠:

```bash
PORT=3001 make local
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
make test ARGS="-t 死路"      # 只跑名字符合的測試
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

磁碟被 Docker 吃滿時,回收這個專案佔掉的空間:

```bash
make clean     # make local 的 container / volume / network + 本專案的 image + 沒人在用的 build cache
```

**堆積來源**:

| 堆積物 | 怎麼來的 |
|--------|---------|
| build cache | build 的中間結果(`npm ci` 裝好的套件)存起來讓下次快,通常是最大宗 |
| 沒名字的舊 image | 重 build 同一個 tag,新 image 拿走名字,舊的變成 `<none>` 卻沒被刪 |
| 沒 down 的 container | `make local` 按 Ctrl+C 只是停下來,container、network 與裝 `node_modules` 的 volume 都還在 |

**怎麼認出這個專案的東西**:`Dockerfile` 裡有專案 label(`org.opencontainers.image.title`),
build 出來的每顆 image 都帶著它,連重 build 後沒名字(`<none>`)的舊 image 也是。`make clean` 只刪帶這個 label 的,
不比對 image 名字——`shop` 與 `shop-admin` 這種名字相近的專案才不會互刪。

**build cache 沒有 label**,沒辦法按專案挑。`make clean` 先把本專案的 image 全刪掉,它的 cache 就變成沒人在用,
最後一步 `docker builder prune` 把沒人在用的 cache 丟掉。別的專案同樣沒人在用的 cache 也會一起丟——
它們下次 build 慢一點,不會壞——這是 `make clean` 唯一不限於本專案的地方。

**什麼時候跑**:磁碟告警的時候,或改完 `Dockerfile` / `package-lock.json` 想確認從乾淨狀態 build 得起來。
日常收工用 `make local-down` 就好——它只收 container、network 與 volume,留 image,下次 `make local` 才起得快;
`make clean` 之後的第一次 `make local` 要從頭 build,會等好幾分鐘。

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

`make worktree-rm` 連該 worktree 的 container、network 與 volume 一起收。它只檢查程式碼有沒有 commit 與 push,
volume 裡的資料會直接刪掉:要留的資料在主 checkout 跑。

`make clean` 以專案 label 清 image,會連其他 worktree build 的一起清;正在跑的刪不掉,會停在那一步。
