// 遊戲核心的公開介面:從一個 seed 建立一局遊戲。
// 核心不依賴 Three.js、React 與瀏覽器 API;渲染層與介面層只透過這裡讀狀態。
import { deadEndsOf, generateMaze } from './maze.js'
import { createRandom } from './random.js'

const MAZE_SIZE = 10
// A 到 Z 各要放進一個不同的死路
const MIN_DEAD_ENDS = 26

/**
 * 從 seed 建立一局遊戲,同一個 seed 永遠得到同一局。
 *
 * seed 是整數。回傳的物件:
 * - `maze.size`:迷宮每邊的格數。
 * - `maze.openings({ col, row })`:該格有通道的那幾側,值為 `'north'`、`'east'`、`'south'`、`'west'`。
 *   row 往南遞增,col 往東遞增;外牆不會出現在這裡。格子必須在迷宮內,界外的座標會讀到別格的資料。
 * - `start`:起點的格子 `{ col, row }`,是迷宮中央四格之一。
 * - `door`:門的位置 `{ col, row, side }`,也就是 `(col, row)` 這一格朝 `side` 那一側的外牆。
 */
export function createGame(seed) {
  const random = createRandom(seed)
  const maze = generateMazeWithEnoughDeadEnds(random)
  const start = pickStart(random)
  const door = pickDoor(random)
  return { maze, start, door }
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

function generateMazeWithEnoughDeadEnds(random) {
  // 死路不足時用同一個產生器接著再挖一張。產生器的數列由 seed 決定,所以重挖幾次、最後是哪一張都是固定的
  for (;;) {
    const maze = generateMaze(MAZE_SIZE, random)
    if (deadEndsOf(maze).length >= MIN_DEAD_ENDS) return maze
  }
}
