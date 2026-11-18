---
status: accepted
date: 2026-11-18
---

# Plain Three.js instead of React Three Fiber

前端是 React 18 + Vite,3D 迷宮卻不用 React 生態的 React Three Fiber,而是直接用 Three.js(r187、`WebGLRenderer`),包成一個 React component 掛進現有前端。HUD、開始畫面與破關畫面仍是一般的 React/HTML,疊在畫布上面。

這樣選是因為 React Three Fiber 目前的穩定版要求 React 19,採用它等於先做一次與遊戲無關的 React 升級;而這個遊戲的場景很小,宣告式場景帶來的好處抵不過這個代價。

## Considered Options

- **React Three Fiber 9 + drei 10**:穩定版是為 React 19 做的相容版本,drei 10 與 `@react-three/rapier` 2 都宣告 `react ^19`。本專案是 React 18.3.1,要用就得先升級 React。不採用。
- **React Three Fiber 8**:支援 React 18,但已是舊版線,新功能與周邊套件都往 9 之後走。不採用。
- **`WebGPURenderer`**:Three.js 官方文件把 `WebGLRenderer` 列為預設且成熟的選擇,`WebGPURenderer` 留給需要 TSL 或 compute 的場景,本遊戲兩者都用不到。另外查到的資料指出,無頭瀏覽器擷取 WebGPU 畫布可能得到全黑畫面,會讓自動化截圖驗證失效;這一點沒有實測過。不採用。
- **物理引擎(rapier 等)**:迷宮是格狀的,主角對牆的碰撞可以簡化成平面上的圓對格子,不需要通用物理引擎。不採用。

## Consequences

- 場景物件的建立、更新與釋放要自己管理,React 不會代勞;component 卸載時必須釋放 renderer、geometry 與 material。
- 第三人稱鏡頭、游標鎖定與鏡頭避牆沒有現成元件可用,要自己實作。
- 迷宮生成、碰撞與收集順序寫成不依賴 Three.js 的純模組,渲染層只負責把狀態畫出來。這讓遊戲邏輯可以脫離瀏覽器單獨測試,日後若要換渲染層,要改的也只有渲染層。
- 重新評估的時機:前端因為其他理由升級到 React 19,或場景複雜到手動管理物件成為主要負擔。

## References

- Three.js 官方給語言模型的文件:<https://threejs.org/docs/llms.txt>
- React Three Fiber v9 遷移指南:<https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide>
- 各套件的 peer dependency 取自 npm registry 上 `@react-three/fiber`、`@react-three/drei`、`@react-three/rapier` 的版本資訊。
