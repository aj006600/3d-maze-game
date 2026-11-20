# Deployment

遊戲是一包靜態檔,發佈在 GitHub Pages:<https://aj006600.github.io/hbd-3d-maze-game/>。
只有打 `vX.Y.Z` tag 會發佈,PR 與 `main` 只跑測試、lint 與 build 檢查。為什麼這樣選,見
[docs/adr/0002-static-site-on-github-pages.md](adr/0002-static-site-on-github-pages.md)。

## Release Flow

```
本機開發 → make local 驗證 → feature branch → PR 合進 main(CI:test、build 檢查)
    → 打 Release tag:git tag v0.1.0 && git push origin v0.1.0
    → CI:test 與 build 都過了,deploy 才把靜態檔發佈到 GitHub Pages
```

CI 是 `.github/workflows/ci-cd.yml` 裡的三個 job:

| job | 什麼時候跑 | 做什麼 |
|-----|-----------|--------|
| `test` | 每次 | 在 dev stage 容器裡跑 Vitest、ESLint 與 Prettier 的檢查,與本機的 `make test` / `make lint` 同一套環境 |
| `build` | 每次 | 用 Dockerfile 的 `site` stage build 出靜態檔。只有 tag 上的 run 會把它上傳成 Pages 的 artifact |
| `deploy` | 只有 tag | `test` 與 `build` 都成功後,把 artifact 發佈到 GitHub Pages |

只認 `vX.Y.Z` 形狀的 tag,`latest`、`wip` 這類 tag 不會觸發 CI。

## Releasing

要發的 commit 先合進 `main`、CI 是綠的,再從主 checkout 打 tag:

```bash
git switch main && git pull
git tag v0.1.0
git push origin v0.1.0
```

到 GitHub 的 Actions 頁看這次 run。`deploy` job 跑完後,run 的頁面上它的方塊會附上網址;打開它、重新整理,確認是新版。

## Rollback

GitHub Pages 只留最近一次發佈的那一份。退回舊版就是對舊的 tag 重跑一次發佈的 workflow:用那個 tag 的原始碼重新 build,
通過測試後再發佈。

```bash
git tag --list 'v*'                      # 看有哪些版本
gh workflow run ci-cd.yml --ref v0.1.0   # 在 v0.1.0 上跑一次 test、build 與 deploy
gh run watch                             # 跟著看這次 run
```

也可以在 GitHub 網頁上做:Actions → CI/CD → Run workflow,在「Use workflow from」的 Tags 裡選舊的版本。

退回之後,`main` 上的新版不會自己回來。修好之後打一個新的 tag(例如 `v0.1.1`)發佈。

## First-Time Setup

repo 擁有者在第一次發版前要做一次,都在 repo 的 Settings 裡:

1. **Pages 的來源選 GitHub Actions**:Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
2. **讓 `github-pages` environment 接受 Release 的 tag**:這個 environment 預設只允許 default branch 部署,
   tag 上的 run 會在 `deploy` job 被擋下,錯誤訊息是
   `Tag "v0.1.0" is not allowed to deploy to github-pages due to environment protection rules`。
   到 Settings → Environments → `github-pages` → Deployment branches and tags,新增一條規則,Ref type 選 **Tag**,
   pattern 填 `v*.*.*`。`main` 那條規則留著。
   手動跑 workflow 時可以選任何 tag,這條規則讓不是 Release 形狀的 tag 發佈不出去。
   Environments 裡還沒有 `github-pages` 的話,先打第一個 tag,run 會建出它。`deploy` 若被上面的錯誤擋下,
   加好規則後用 Rollback 一節的 `gh workflow run ci-cd.yml --ref v0.1.0` 在同一個 tag 上重跑一次。
3. **打第一個 tag**(見 Releasing),run 跑完後打開網址,從開始畫面玩到破關畫面。

不用設任何 secret:發佈用的是 workflow 內建的 `GITHUB_TOKEN`。`deploy` job 需要的 `pages: write` 與
`id-token: write` 兩個權限已經寫在 workflow 裡。

## Checking a Build Locally

改了資源的引用方式(新增圖片、音檔)或 `vite.config.js` 時,發版前在本機確認 build 出來的靜態檔放在子路徑底下打得開:

```bash
docker build --target build -t hbd-3d-maze-game:local-site .
docker run --rm --init -p 127.0.0.1:4173:4173 hbd-3d-maze-game:local-site \
    node_modules/.bin/vite preview --host --port 4173 --base /hbd-3d-maze-game/
```

打開 <http://localhost:4173/hbd-3d-maze-game/>,玩一輪並確認 console 沒有錯誤,Ctrl+C 停止。
直接執行 vite 而不經過 `npx`:`npx` 不會把 Ctrl+C 轉給 vite,container 會停不下來。
`--base` 讓 preview 和 Pages 一樣只在 `/hbd-3d-maze-game/` 底下供檔,子路徑以外的請求都是 404,
所以有資源寫成了絕對路徑就會載不到。這顆 image 帶著專案 label,`make clean` 會一起清掉。
