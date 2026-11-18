// 遊戲核心的公開介面:從一個 seed 建立一局遊戲,再以時間步推進主角。
// 核心不依賴 Three.js、React 與瀏覽器 API;渲染層與介面層只透過這裡讀狀態。
import { deadEndsOf, generateMaze } from './maze.js'
import { moveAgainstWalls, wallsOf } from './movement.js'
import { createRandom } from './random.js'

export { WALL_THICKNESS } from './movement.js'

const MAZE_SIZE = 10
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
// 主角跑步的速度,單位是每秒幾格
const RUN_SPEED = 1.25

/**
 * 從 seed 建立一局遊戲,同一個 seed 永遠得到同一局。
 *
 * seed 是整數。`allowTeleport` 為 true 時才能呼叫 `teleport`。傳送是給畫面驗證用的,正常遊玩不要開啟。
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
 * - `walls`:擋住主角的每一段牆,各是一個 `{ minX, maxX, minY, maxY }` 的長方形,單位是格。
 *   外牆在裡面,門鎖著時也在裡面。每次讀取都是一份新的副本,改了它不會改到碰撞。
 * - `player`:主角當下的 `{ x, y, heading }`。每次讀取都是一份新的快照,之後的推進不會改到它。
 * - `step({ forward, right, heading, dt })`:推進 dt 秒。先把朝向設成 heading,再朝輸入的方向跑。
 *   forward 為正是前進、為負是倒退;right 為正是往右橫移、為負是往左。方向以 heading 為準。
 *   兩者都是 0 就站著不動,否則不論大小都以同一個速度跑。主角碰到牆會被擋住,斜向撞牆時沿牆滑動。
 * - `teleport({ col, row })`:把主角移到該格的中央,朝向不變。沒有開啟 `allowTeleport` 時會丟出錯誤。
 */
export function createGame(seed, { allowTeleport = false } = {}) {
  const random = createRandom(seed)
  const { maze, start, door, letters } = generateLayout(random)
  const walls = wallsOf(maze)
  const player = { x: start.col + 0.5, y: start.row + 0.5, heading: 0 }
  return {
    maze,
    start,
    door,
    letters,
    get walls() {
      return walls.map((wall) => ({ ...wall }))
    },
    get player() {
      return { ...player }
    },
    step({ forward, right, heading, dt }) {
      player.heading = heading
      const length = Math.hypot(forward, right)
      if (length === 0) return
      // 不論輸入的大小,只要有方向就以同一個速度跑:沒有走路,斜向也不會比較快
      const distance = RUN_SPEED * dt
      const sin = Math.sin(heading)
      const cos = Math.cos(heading)
      const dx = ((sin * forward + cos * right) / length) * distance
      const dy = ((-cos * forward + sin * right) / length) * distance
      Object.assign(player, moveAgainstWalls(walls, player, dx, dy))
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

function isSameCell(a, b) {
  return a.col === b.col && a.row === b.row
}
