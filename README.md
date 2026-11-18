# 3d-maze-game

3D 迷宮遊戲。React(Vite)+ Three.js 前端 + FastAPI 後端,以 docker compose 編排,
多環境(dev / qas / prd)部署,GitHub Actions 遵循 trunk-based +「build 一次、依序 promote」。

> 核心原則(12-factor):**一份程式碼、一組 image、設定隨環境變**。設定契約一律是環境變數:
> 本機讀 `.env`(從 `.env.example` 複製,不進版控),目標主機讀自備的 `.env.<env>`。

## Quick Start

```bash
make local          # hot reload,前端 http://localhost:3000、後端 http://localhost:8000
make test           # 跑後端測試(與 CI 同一顆 image)
make test-frontend  # 跑前端測試(與 CI 同一個 dev stage)
make help           # 其餘指令
```

新增設定變數時先加進 `.env.example`(變數清單,進版控);本機實際讀的 `.env` 由 `make local` 自動建立。

## Docs

| 想做的事 | 看這份 |
|----------|--------|
| **本機開發**(quickstart、hot reload、測試、清理、worktree) | [docs/development.md](docs/development.md) |
| **CI/CD 與部署**(Release、promote、rollback、機密、GitHub 設定) | [docs/deployment.md](docs/deployment.md) |

## Structure

```
.
├── backend/                # FastAPI + uv(多階段:dev 含測試工具、runtime 出貨非 root)
│   ├── app/main.py         # /health、/api/message(回傳目前環境)
│   ├── app/config.py       # pydantic-settings:從環境變數讀設定
│   ├── app/logging_setup.py # log 格式與層級(LOG_LEVEL)
│   └── tests/ · pyproject.toml · uv.lock · Dockerfile
├── frontend/               # React + Vite(多階段:dev 含 Vitest、build 出靜態檔、nginx 出貨)
│   ├── src/App.jsx         # 首頁就是遊戲畫面
│   ├── src/config.js       # 決定玩到哪一局的設定(seed)
│   ├── src/game/           # 遊戲核心:不依賴 Three.js、React 與瀏覽器 API 的純模組
│   ├── src/render/         # 渲染層:用 Three.js 把遊戲核心的狀態畫成 3D 場景,另外負責鏡頭與鍵鼠輸入,不持有規則
│   ├── nginx.conf          # 供靜態檔 + 反向代理 /api
│   ├── tests/              # Vitest,鏡射 src/ 的結構
│   └── package.json · package-lock.json · Dockerfile
├── compose.yaml            # base:只定義服務與內部接線
├── compose.local.yaml      # 本機開發覆寫:開 localhost 埠 + 後端 hot reload
├── compose.deploy.yaml     # 部署覆寫:frontend 綁主機 HTTP_PORT + log 輪替
├── .env.example            # 本機設定範本(進版控);make local 會複製成 .env
├── Makefile                # local·compose / test·test-frontend·lint·format / clean / deploy·down / ps / worktree
├── CLAUDE.md · .claude/    # coding agent 的規則與 guard hooks
├── .github/workflows/ci-cd.yml  # test → Release tag(vX.Y.Z)才 build 推 GHCR
└── docs/                   # development.md · deployment.md · agents/(agent skills 的 issue tracker / label / domain 設定)
```
