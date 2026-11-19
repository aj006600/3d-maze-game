---
status: accepted
date: 2026-11-19
---

# Static site on GitHub Pages instead of the container deploy

這個遊戲是一份送給壽星的禮物,要做到的是:把一個網址傳給壽星,點開就能在瀏覽器裡玩。遊戲的規則、狀態與畫面全部在瀏覽器裡跑,不需要任何伺服器端的程式。所以專案改成純靜態的網頁:打 `vX.Y.Z` tag 時,CI 把 build 出來的靜態檔發佈到 GitHub Pages。不再 build 容器 image,也不再到主機上部署。

## Why remove the backend

repo 是從一個 fullstack 模板開始的,帶著一個後端與它的設定。遊戲從來沒有用到它:迷宮的生成、碰撞與收集都在瀏覽器裡的遊戲核心完成,沒有存檔,也沒有任何要送到伺服器的資料。留著它,接手的人得先弄懂一個遊戲沒在用的系統,CI 也要多跑一組與遊戲無關的測試。所以整個移除。

## Why GitHub Pages

- 沒有後端之後,要出貨的東西只剩一包靜態檔。主機上的容器部署是為了跑伺服器端程式準備的:要有一台一直開著的主機,要管埠與 HTTPS,要維護 nginx 與多環境的 compose 設定,CI 還要把 image 推到 registry。這些成本對一包靜態檔沒有回報。
- GitHub Pages 與程式碼、CI 在同一個地方。workflow 用內建的 token 就能發佈,不必設 secret,也不必另外申請帳號。網址本身有 HTTPS,壽星不需要知道主機或埠。
- 發版仍然只有一個動作:打 `vX.Y.Z` tag。PR 與 `main` 只跑測試、lint 與 build 檢查,壽星手上的網址只在刻意發版時才變。

## Considered Options

- **保留主機上的容器部署**(nginx 出貨的 image、多環境的 compose、`make deploy`):能用,但要一台持續維護的主機。遊戲沒有伺服器端的需求,這些維護換不到任何東西。不採用。
- **包成 Windows 執行檔**:考慮過,延到遊戲完成之後再另外評估。現在點網址就能玩,已經滿足送禮的需求。為了不把這條路堵死,build 出來的靜態檔用相對路徑引用資源,同一份 build 放在 Pages 的子路徑或日後包進桌面程式都能用。

## Consequences

- Vite 的 `base` 設成 `./`。之後新增的圖片或音檔要經過 Vite 的 import,或用相對路徑引用,不能寫成 `/` 開頭的絕對路徑:Pages 把網站放在 `/<repo>/` 子路徑底下,絕對路徑會指到網域的根目錄而載不到。
- 退回舊版是對舊的 tag 重跑一次發佈的 workflow,從那個 tag 的原始碼重新 build 再發佈。以前「同一顆 image 一路往上推」的保證不在了。相依由 `package-lock.json` 固定,但 Node 的 base image 可能已經更新,所以重新 build 出來的檔案不保證與當初逐位元相同。
- 只有一個環境,沒有 dev、qas、prd 之分。發版前的驗證在本機做,包括 build 出來的靜態檔放在子路徑底下打得開。
- 網址是公開的,任何拿到網址的人都能玩,破關畫面的祝福文字也看得到。
- repo 擁有者要做一次性的設定:Pages 的來源選 GitHub Actions,並讓 `github-pages` environment 接受 `v*` 的 tag。步驟在 `docs/deployment.md`。
- Docker 仍是本機指令的唯一入口,CI 也在同一個 dev stage 裡跑測試。Dockerfile 只留開發與 build 用的 stage,外加一個只放靜態檔的 stage,讓 CI 把 build 的結果匯出給 Pages。
- 遊戲的設定仍然集中在設定模組裡,是 build 時就固定的常數。沒有任何值要從環境變數讀,所以 `.env` 這套機制一併移除。
- 重新評估的時機:遊戲需要伺服器端的功能(例如存檔或排行榜),或決定要包成桌面程式的時候。

## References

- 用自訂的 workflow 發佈 Pages(deploy job 需要的權限與 `github-pages` environment):<https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>
- 把 Pages 的來源設成 GitHub Actions:<https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site>
- `actions/deploy-pages` 的使用方式與安全考量:<https://github.com/actions/deploy-pages>
