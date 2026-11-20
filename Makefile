# 專案名:compose project 名與本機 image 名都從這裡來
APP_NAME := 3d-maze-game

# shell 裡殘留的 COMPOSE_PROJECT_NAME 會蓋掉「project 名取目錄名」:所有 worktree 擠進同一組 container,
# worktree-rm 也收不到正確的那組。一律不帶給 compose
unexport COMPOSE_PROJECT_NAME

# 本機 build 的 image tag 帶 checkout 目錄名:多個 worktree 同時 make local / make test 才不會搶同一個名字、
# 跑到別人的程式碼。container 與 network 本來就各自分開(compose project 名取目錄名)
LOCAL_TAG := local-$(notdir $(CURDIR))

# dev stage 的 image:make local 經 compose build 出來的就是這個名字,test / lint / format 直接用 docker 跑同一顆
DEV_IMAGE := $(APP_NAME):$(LOCAL_TAG)

# 專案 label 只寫在 Dockerfile,這裡解析:清理 image 的 target 都以它劃定範圍,刪不到別的專案的東西
PROJECT_LABEL := $(shell sed -n 's/^LABEL *\(org\.opencontainers\.image\.title=[^ ]*\).*/\1/p' Dockerfile | tr -d '"' | sort -u)

# 重 build 同一個 tag 後,舊 image 失去名字變成 <none>,不會再被任何指令用到。
# 只刪帶本專案 label 的;還有 container 在用的那幾顆 docker 會自己跳過
PRUNE = docker image prune --force --filter label=$(PROJECT_LABEL)

.PHONY: help check-label local local-down compose test lint format ps clean clean-cache worktree worktree-rm

help:
	@echo "Local(在你的開發機上)"
	@echo "  make local                        Vite dev server、存檔後畫面立即更新、localhost:3000(前景執行;撞埠時 PORT 從 shell 換)"
	@echo "  make local-down                   停止並清理 make local 的 container、network 與 anonymous volume,連同本專案的 <none> image(有名字的 image 留著)"
	@echo "  make compose ARGS=\"...\"           對 make local 那組 container 下任何 compose 子命令(logs -f app、exec app sh …)"
	@echo "  make test [ARGS=\"...\"]           Vitest,跑在 dev stage 容器裡(與 CI 同一套環境);ARGS 只跑一部分,例 ARGS=\"tests/game\" 或 ARGS=\"-t 角落\""
	@echo "  make lint | format                ESLint / Prettier(就地改檔)"
	@echo "  make clean                        回收本專案的 container / volume / network 與 image"
	@echo "  make clean-cache                  清掉這台機器上所有專案共用的 Docker build cache(會先問過)"
	@echo ""
	@echo "Inspection"
	@echo "  make ps                           正在跑的 container(名稱 / 狀態 / 埠)"
	@echo ""
	@echo "Worktrees(一個 issue 一個,從主 checkout 跑)"
	@echo "  make worktree ISSUE=<n> BRANCH=<feat/slug>   開在 .claude/worktrees/<app>-issue-<n>"
	@echo "  make worktree-rm ISSUE=<n>                   刪掉該 worktree、本地 branch 與它的 container / volume / image(有未 commit 或未 push 的就拒絕)"

# ── Local ──
# 下面這些 target 清理 image 都靠專案 label。label 解析不出唯一值時先擋下:
# --filter label= 帶的是空值,會掃到全機的 <none> image
check-label:
	@[ $(words $(PROJECT_LABEL)) = 1 ] || { echo "Dockerfile 的 image.title LABEL 解析不出唯一值:'$(PROJECT_LABEL)'" >&2; exit 1; }

local local-down test lint format clean: check-label

# 先刪掉舊的 container 再 up:node_modules 的匿名 volume 跟著舊 container 一起刪掉(理由見 compose.yaml)。
# --renew-anon-volumes 也會換一個新的 volume,但舊的會留下來變成沒人用的 volume。
# 用 rm --volumes 而不是 down --volumes:rm 只刪匿名 volume,之後專案加了 named volume,裡面的資料不會被它清掉。
# 舊 container 刪掉後,上一輪 build 留下的 <none> 就沒有人在用,接著清掉:up 在前景執行,這一輪 build 完沒有機會再清
local:
	docker compose rm --force --stop --volumes
	$(PRUNE)
	APP_NAME=$(APP_NAME) TAG=$(LOCAL_TAG) docker compose up --build

# rm --volumes 連 container 帶 node_modules 的匿名 volume 一起刪;down 單獨跑不刪匿名 volume,它會留下來沒人用。
# --remove-orphans:compose 檔裡改名或拿掉的服務,它的舊 container 仍掛在同一個 project 名下,不會自己走
local-down:
	docker compose rm --force --stop --volumes
	docker compose down --remove-orphans
	$(PRUNE)

# 帶同一個 TAG:手打 docker compose 少了 TAG 會 build 成 :latest,跟 make local 用的不是同一顆 image
compose:
	APP_NAME=$(APP_NAME) TAG=$(LOCAL_TAG) docker compose $(ARGS)

# ── Tests and quality ──
# 與 CI 的 test job 同一個 dev stage。這裡不經 compose:這些 container 跑完就丟,用不到 make local 那組設定。
# 每次都 build:原始碼與 package-lock.json 都烤在 image 裡,不重建會跑到舊程式碼。
# 原始碼改過就會 build 出新的一顆,所以 build 完隨即清掉被它取代的 <none>
BUILD_DEV = docker build --target dev -t $(DEV_IMAGE) . && $(PRUNE)

# ARGS 原樣交給 vitest:開發中只跑跟改動相關的那幾個,完整套交給 CI(docs/development.md 的 Testing workflow)
test:
	$(BUILD_DEV)
	docker run --rm $(DEV_IMAGE) npm test -- $(ARGS)

lint:
	$(BUILD_DEV)
	docker run --rm $(DEV_IMAGE) npm run lint

# 要改到你的檔案,所以把 checkout 掛進去;node_modules 用匿名 volume 擋住掛載,留用 image 裡的那份。
# --user:root 寫掛載檔會把它變成 root 所有(Linux 上之後編輯不了)。換成你的 uid 後沒有可寫的 HOME,
# npm 的快取與 log 改寫到 /tmp
format:
	$(BUILD_DEV)
	docker run --rm --user $(shell id -u):$(shell id -g) -e npm_config_cache=/tmp/.npm \
		-v $(CURDIR):/app -v /app/node_modules $(DEV_IMAGE) npm run format

# ── Cleanup ──
# 何時該跑:docs/development.md 的 Cleanup 一節。刻意不用 docker system prune:會掃到別的專案。
# clean 只動本專案的東西:container / volume / network 以 compose project 劃定,image 以專案 label 劃定
clean:
	docker compose down --volumes --remove-orphans
	docker image ls --filter label=$(PROJECT_LABEL) --format '{{.Repository}}:{{.Tag}}' | grep -v '<none>' | xargs -r docker image rm
	$(PRUNE)

# build cache 沒有 label,沒辦法只挑本專案的。這是唯一會動到別的專案的 target,所以獨立出來,而且先問過才做。
# 清掉的是沒有 image 在用的 cache:先跑 make clean,本專案的 cache 才會落在這個範圍內。
# 沒有終端機可以回答時(CI、背景執行)read 讀不到輸入,視同回答 N
clean-cache:
	@echo "這會清掉這台機器上「所有專案」沒有 image 在用的 Docker build cache,不只本專案的。"
	@echo "不會弄壞任何東西,也不會刪到資料;各專案下次 build 要重新下載套件,會慢幾分鐘。"
	@printf "確定要清嗎?(y/N) "; read answer; \
	case "$$answer" in \
		y|Y) docker builder prune --force ;; \
		*) echo "已取消,沒有清任何東西" ;; \
	esac

# ── Inspection ──
ps:
	docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# ── Worktrees ──
# 一個 issue 一個 worktree,開在 .claude/worktrees/<APP_NAME>-issue-<n>(與 Claude Code 的 worktree 同一處,已在 .gitignore)。
# 目錄名帶 APP_NAME:compose project 名取目錄名,只叫 issue-<n> 的話,兩個專案同號 issue 的 container 會撞在一起
WORKTREE = .claude/worktrees/$(APP_NAME)-issue-$(ISSUE)

# --no-track 不能省:從 origin/main 開的 branch 預設以 origin/main 為 upstream,不帶 refspec 的 push 可能推進 main。
# origin 已有該 branch 就接著它開
worktree:
	@[ -n "$(ISSUE)" ] && [ -n "$(BRANCH)" ] || { echo "用法:make worktree ISSUE=<n> BRANCH=<feat/slug>" >&2; exit 1; }
	git fetch origin
	if git rev-parse --verify -q refs/remotes/origin/$(BRANCH) >/dev/null; then \
		git worktree add $(WORKTREE) $(BRANCH); \
	else \
		git worktree add --no-track -b $(BRANCH) $(WORKTREE) origin/main; \
	fi

# 要從主 checkout 跑:刪的若是自己的 cwd,之後的指令都會失效。
# 未 push 以「不在任何 origin ref 上」判斷:剛開還沒 commit 的、已 merge 且 origin branch 已刪的都算乾淨。
# 最後連該 worktree 的 compose project 與它 build 的 image 一起收,不留 container、network、volume 與 image。
# image 以 tag 認:local-<worktree 目錄名>,目錄名帶 APP_NAME 與 issue 編號,對不到別的 worktree 或別的專案。
# 上面只檢查程式碼:volume 裡的資料不在檢查範圍內,會直接刪掉
worktree-rm:
	@[ -n "$(ISSUE)" ] || { echo "用法:make worktree-rm ISSUE=<n>(從主 checkout 跑)" >&2; exit 1; }
	@[ -d $(WORKTREE) ] || { echo "找不到 $(WORKTREE);要從主 checkout 跑" >&2; exit 1; }
	@branch=$$(git -C $(WORKTREE) symbolic-ref --short HEAD) || exit 1; \
	if [ -n "$$(git -C $(WORKTREE) status --porcelain)" ]; then \
		echo "$(WORKTREE) 有未 commit 的改動,先 commit 並 push(或丟棄)再刪:" >&2; \
		git -C $(WORKTREE) status --short >&2; exit 1; \
	fi; \
	unpushed=$$(git rev-list --oneline $$branch --not --remotes=origin); \
	if [ -n "$$unpushed" ]; then \
		echo "$$branch 有 origin 上沒有的 commit,先 push 再刪:" >&2; \
		echo "$$unpushed" >&2; exit 1; \
	fi; \
	docker compose -p $(notdir $(WORKTREE)) down --volumes --remove-orphans && \
	docker image ls --filter reference='*:local-$(notdir $(WORKTREE))' --format '{{.Repository}}:{{.Tag}}' | xargs -r docker image rm && \
	git worktree remove $(WORKTREE) && git branch -D $$branch
