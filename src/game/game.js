// 遊戲核心的公開介面:從一個 seed 建立一局遊戲,再以時間步推進主角、以互動鍵收集字母,收集完就能從門走出去破關。
// 有時限的一局,倒數歸零時還沒破關就是挑戰失敗。迷宮裡有奧客在遊蕩,發現主角之後就一直追趕,他們的身體會擋住主角。
// 主角可以揮擊登機箱,揮擊不影響移動與收集。
// 核心不依賴 Three.js、React 與瀏覽器 API;渲染層與介面層只透過這裡讀狀態。
import { PHRASE, SWING_SECONDS } from '../config.js'
import { cellOf, deadEndsOf, generateMaze, isInside, isSameCell } from './maze.js'
import { moveCircle, PLAYER_RADIUS, wallsOf } from './movement.js'
import { createPassengers } from './passengers.js'
import { createRandom } from './random.js'

export { WALL_THICKNESS } from './movement.js'

const MAZE_SIZE = 10
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
// 依收集順序排列的字母:通關字串去掉空格
const PHRASE_LETTERS = PHRASE.replaceAll(' ', '')
// 主角跑步的速度,單位是每秒幾格
const RUN_SPEED = 1.25

/**
 * 從 seed 建立一局遊戲,同一個 seed 永遠得到同一局。
 *
 * seed 是整數。`allowTeleport` 為 true 時才能呼叫 `teleport`。傳送是給畫面驗證用的,正常遊玩不要開啟。
 * `timeLimit` 是這一局的時限,單位是秒。不給或給 null 就是不限時。
 *
 * 平面座標以格為單位:x 往東、y 往南,格子 `(col, row)` 涵蓋 `col ≤ x < col + 1`、`row ≤ y < row + 1`。
 * 朝向是弧度:0 朝北,從上方俯瞰時順時針增加,所以 π/2 朝東。
 *
 * 回傳的物件:
 * - `maze.size`:迷宮每邊的格數。
 * - `maze.openings({ col, row })`:該格有通道的那幾側,值為 `'north'`、`'east'`、`'south'`、`'west'`。
 *   row 往南遞增,col 往東遞增;外牆不會出現在這裡。格子必須在迷宮內,界外的座標會讀到別格的資料。
 * - `start`:起點的格子 `{ col, row }`,是迷宮中央四格之一。
 * - `door`:門的位置 `{ col, row, side }`,也就是 `(col, row)` 這一格朝 `side` 那一側的外牆。
 * - `letters`:A 到 Z 各一個字母所在的格子 `{ letter, col, row }`,依字母順序排列。
 *   每個字母在不同的死路裡,起點與門所在的格子不放字母,多出來的死路也沒有字母。
 *   字母被收集後仍留在原地,所以這份配置整局不變。
 * - `phrase`:通關字串去掉空格後的字母,依收集的順序排列。
 * - `progress`:已收集的字母數,從 0 開始,收集完時等於 `phrase` 的長度。
 * - `doorOpen`:門是不是打開了。收集完最後一個字母的那一次 `interact()` 就打開,之後不會再鎖上。
 * - `atDoor`:主角所在的格子是不是門所在的那一格。只看位置,與門開了沒有無關。
 * - `finished`:是不是已經破關。門打開後,主角跑出門、離開迷宮的那一步就破關,之後一直是 true。
 * - `countdown`:倒數,也就是還剩幾秒。不限時的一局是 null。
 *   它只由 `step` 的 dt 扣除,不讀系統時鐘。歸零後停在 0,破關之後也停住不再減少。
 * - `failed`:是不是已經挑戰失敗。倒數歸零的那一步還沒破關,就挑戰失敗,之後一直是 true。
 *   同一步裡先判定破關,所以走出門的那一步剛好用完時間時算破關;破關之後也不會再變成挑戰失敗。
 * - `canInteract`:主角所在的格子是不是放著字母的死路。只看位置,與進度無關。
 * - `interact()`:按下一次互動鍵,回傳這次互動的結果。挑戰失敗之後一律回傳 null,進度不變。
 *   - `'collected'`:主角所在的字母正是當下輪到的那一個,進度加一。字母留在原地,之後輪到時可以再收集。
 *   - `'wrong'`:主角所在的字母不是當下輪到的那一個,進度不變。全部收集完之後,每個字母都不是當下輪到的那一個。
 *   - `null`:主角不在有字母的死路格內,這次互動沒有任何效果。
 * - `walls`:擋住主角的每一段牆,各是一個 `{ minX, maxX, minY, maxY }` 的長方形,單位是格。
 *   外牆在裡面。門鎖著時門那段外牆也在裡面,門打開後就不在了。
 *   每次讀取都是一份新的副本,改了它不會改到碰撞,門打開後也要重新讀取。
 * - `player`:主角當下的 `{ x, y, heading }`。每次讀取都是一份新的快照,之後的推進不會改到它。
 * - `passengers`:每一位奧客當下的 `{ x, y, heading, state, hits }`,一局裡的人數固定。
 *   每次讀取都是一份新的副本,改了它不會改到奧客,之後的推進也不會改到它。
 *   - `x`、`y`、`heading`:位置與朝向,座標與朝向的慣例與主角相同。開局時每一位都站在一格的中央。
 *   - `state`:`'wandering'` 是遊蕩,`'chasing'` 是追趕。
 *     遊蕩的奧客與主角的直線距離在設定模組的 `PASSENGERS.discoverDistance` 以內、兩者中心的連線又沒有被牆擋住時,
 *     就發現主角,從這一步起追趕。奧客面向哪裡都一樣。追趕的奧客不會回到遊蕩,主角跑得再遠、躲到牆後面也一樣。
 *   - `hits`:被打中的次數。
 * - `step({ forward, right, heading, dt })`:推進 dt 秒。先把朝向設成 heading,再朝輸入的方向跑,然後奧客走 dt 秒。
 *   forward 為正是前進、為負是倒退;right 為正是往右橫移、為負是往左。方向以 heading 為準。
 *   兩者都是 0 就站著不動,否則不論大小都以同一個速度跑。主角碰到牆會被擋住,斜向撞牆時沿牆滑動。
 *   主角撞上奧客也會被擋住,斜向撞上時沿著奧客的邊緣滑動,但推不動他;奧客碰到主角就停下,不會把主角推開。
 *   奧客在主角跑完之後才走,所以這一步的發現與追趕看的是主角跑完之後的位置。
 *   有時限的一局在破關之前,每一步都從倒數扣掉 dt 秒,站著不動的那一步也一樣。
 *   破關之後奧客不再動。挑戰失敗之後呼叫沒有任何效果:主角與奧客都不動,主角的朝向也不變。
 * - `swing()`:按下一次揮擊鍵,主角從頭揮擊一次。下列時候呼叫沒有效果,也不會排到之後才揮:
 *   - 正在揮的時候。
 *   - 破關或挑戰失敗之後。
 * - `swingProgress`:這次揮擊揮到哪裡。剛呼叫 `swing()` 時是 0,越接近 1 越接近揮完,揮完時回到 null。
 *   沒有在揮時是 null。它只由 `step` 的 dt 累加,不讀系統時鐘,所以不推進時停在原處。
 *   揮完一次的秒數是設定模組的 `SWING_SECONDS`。
 *   挑戰失敗之後 `step` 沒有效果,所以揮到一半時挑戰失敗,它就停在那裡,不會回到 null。
 * - `teleport({ col, row })`:把主角移到該格的中央,朝向不變。沒有開啟 `allowTeleport` 時會丟出錯誤。
 *   傳送到與奧客重疊的地方時,主角與那位奧客都只能往離開對方的方向移動。
 */
export function createGame(seed, { allowTeleport = false, timeLimit = null } = {}) {
  const random = createRandom(seed)
  const { maze, start, door, letters } = generateLayout(random)
  let walls = wallsOf(maze)
  const player = { x: start.col + 0.5, y: start.row + 0.5, heading: 0 }
  const passengers = createPassengers({ maze, start, random, runSpeed: RUN_SPEED })
  let progress = 0
  let doorOpen = false
  let finished = false
  let countdown = timeLimit
  let failed = false
  // 這次揮擊已經揮了幾秒,沒有在揮時是 null
  let swingElapsed = null
  return {
    maze,
    start,
    door,
    letters,
    phrase: PHRASE_LETTERS,
    get walls() {
      return walls.map((wall) => ({ ...wall }))
    },
    get player() {
      return { ...player }
    },
    get passengers() {
      return passengers.snapshot()
    },
    get progress() {
      return progress
    },
    get doorOpen() {
      return doorOpen
    },
    get finished() {
      return finished
    },
    get countdown() {
      return countdown
    },
    get failed() {
      return failed
    },
    get canInteract() {
      return letterAt(letters, player) !== undefined
    },
    get atDoor() {
      return isSameCell(cellOf(player), door)
    },
    get swingProgress() {
      return swingElapsed === null ? null : swingElapsed / SWING_SECONDS
    },
    swing() {
      // 正在揮的時候再按不排隊:直接丟掉,揮完之後不會補揮
      if (failed || finished || swingElapsed !== null) return
      swingElapsed = 0
    },
    interact() {
      if (failed) return null
      const placed = letterAt(letters, player)
      if (placed === undefined) return null
      if (placed.letter !== PHRASE_LETTERS[progress]) return 'wrong'
      progress += 1
      if (progress === PHRASE_LETTERS.length) {
        doorOpen = true
        walls = wallsOf(maze, door)
      }
      return 'collected'
    },
    step({ forward, right, heading, dt }) {
      if (failed) return
      // 破關之後倒數停住。破關的那一步仍然要從倒數扣掉 dt 秒
      if (countdown !== null && !finished) countdown = Math.max(countdown - dt, 0)
      if (swingElapsed !== null) {
        swingElapsed += dt
        if (swingElapsed >= SWING_SECONDS) swingElapsed = null
      }
      player.heading = heading
      const length = Math.hypot(forward, right)
      if (length > 0) {
        // 不論輸入的大小,只要有方向就以同一個速度跑:沒有走路,斜向也不會比較快
        const distance = RUN_SPEED * dt
        const sin = Math.sin(heading)
        const cos = Math.cos(heading)
        const dx = ((sin * forward + cos * right) / length) * distance
        const dy = ((-cos * forward + sin * right) / length) * distance
        const moved = moveCircle(player, dx, dy, {
          radius: PLAYER_RADIUS,
          walls,
          obstacles: passengers.bodies(),
          slide: true,
        })
        player.x = moved.x
        player.y = moved.y
        // 門是外牆上唯一能打開的缺口,所以主角離開迷宮的格子,就是從打開的門走出去了
        if (!isInside(maze, player)) finished = true
      }
      // 挑戰失敗之後,這個方法一開始就回傳了,所以這裡只需要擋破關
      if (!finished) passengers.step(dt, player, walls)
      // 移動並判定破關之後才判定倒數歸零:走出門的那一步剛好用完時間時算破關
      if (countdown === 0 && !finished) failed = true
    },
    teleport({ col, row }) {
      if (!allowTeleport) throw new Error('teleport is disabled; create the game with { allowTeleport: true }')
      player.x = col + 0.5
      player.y = row + 0.5
    },
  }
}

// MAZE_SIZE 必須是偶數,正中央才剛好是四格
function pickStart(random) {
  const middle = [MAZE_SIZE / 2 - 1, MAZE_SIZE / 2]
  return { col: random.pick(middle), row: random.pick(middle) }
}

// 外牆四面各有 MAZE_SIZE 段,每段被選中的機會相同;角落的格子有兩段外牆
function pickDoor(random) {
  const last = MAZE_SIZE - 1
  const segments = []
  for (let i = 0; i < MAZE_SIZE; i += 1) {
    segments.push(
      { col: i, row: 0, side: 'north' },
      { col: last, row: i, side: 'east' },
      { col: i, row: last, side: 'south' },
      { col: 0, row: i, side: 'west' },
    )
  }
  return random.pick(segments)
}

// 起點與門所在的格子不放字母:
// - 起點放了字母的話,主角一開局就站在字母底下。
// - 門打開後,門所在的那一格有兩個開口,就不再是死路。
function generateLayout(random) {
  // 能放字母的死路不足 26 個時,用同一個產生器接著重新產生一局。
  // 產生器的數列由 seed 決定,所以重來幾次、最後是哪一局都是固定的
  for (;;) {
    const maze = generateMaze(MAZE_SIZE, random)
    const start = pickStart(random)
    const door = pickDoor(random)
    const candidates = deadEndsOf(maze).filter((cell) => !isSameCell(cell, start) && !isSameCell(cell, door))
    if (candidates.length >= LETTERS.length) return { maze, start, door, letters: placeLetters(random, candidates) }
  }
}

function placeLetters(random, candidates) {
  const shuffled = random.shuffle(candidates)
  return [...LETTERS].map((letter, i) => ({ letter, ...shuffled[i] }))
}

// 字母都在死路裡,所以主角所在的格子有字母,就等於主角站在有字母的死路裡
function letterAt(letters, position) {
  const cell = cellOf(position)
  return letters.find((placed) => isSameCell(placed, cell))
}
