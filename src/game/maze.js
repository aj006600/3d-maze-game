// 迷宮的產生與查詢。
// 用 growing tree 演算法、每一步隨機挑一個進行中的格子往外挖;這樣挖出來的死路比例高,
// 才放得下 A 到 Z 各一個字母。

/** 往每一側走一格時 col 與 row 的變化。方向的契約:row 往南遞增,col 往東遞增。 */
export const OFFSETS = {
  north: { col: 0, row: -1 },
  east: { col: 1, row: 0 },
  south: { col: 0, row: 1 },
  west: { col: -1, row: 0 },
}
/** 一格的四側。 */
export const SIDES = Object.keys(OFFSETS)
const OPPOSITE = { north: 'south', east: 'west', south: 'north', west: 'east' }

/**
 * 用給定的亂數產生器挖出一張每邊 size 格的正方形迷宮。
 *
 * 回傳的 maze 只提供查詢:
 * - `size`:每邊的格數。
 * - `openings(cell)`:該格有通道的那幾側。外牆一律不算開口,門由呼叫端另外放。
 *   cell 必須在迷宮內;界外的座標不會報錯,而是讀到別格的資料。
 */
export function generateMaze(size, random) {
  const openSides = Array.from({ length: size * size }, () => new Set())
  const indexOf = (cell) => cell.row * size + cell.col
  const inside = (cell) => cell.col >= 0 && cell.col < size && cell.row >= 0 && cell.row < size

  const first = { col: random.int(size), row: random.int(size) }
  const visited = new Set([indexOf(first)])
  const active = [first]

  while (active.length > 0) {
    const activeIndex = random.int(active.length)
    const cell = active[activeIndex]
    const choices = SIDES.filter((side) => {
      const next = stepOf(cell, side)
      return inside(next) && !visited.has(indexOf(next))
    })

    if (choices.length === 0) {
      // 與最後一個交換後移除:順序會變,但變法是固定的,不影響決定性
      active[activeIndex] = active[active.length - 1]
      active.pop()
      continue
    }

    const side = random.pick(choices)
    const next = stepOf(cell, side)
    openSides[indexOf(cell)].add(side)
    openSides[indexOf(next)].add(OPPOSITE[side])
    visited.add(indexOf(next))
    active.push(next)
  }

  return {
    size,
    openings: (cell) => [...openSides[indexOf(cell)]],
  }
}

/** 列出迷宮裡所有的死路,也就是只有一個開口的格子。 */
export function deadEndsOf(maze) {
  const deadEnds = []
  for (let row = 0; row < maze.size; row += 1) {
    for (let col = 0; col < maze.size; col += 1) {
      if (maze.openings({ col, row }).length === 1) deadEnds.push({ col, row })
    }
  }
  return deadEnds
}

/** 從 cell 往 side 那一側走一格到達的格子。不檢查那一側有沒有通道,也不檢查到達的格子在不在迷宮內。 */
export function stepOf(cell, side) {
  return { col: cell.col + OFFSETS[side].col, row: cell.row + OFFSETS[side].row }
}

/** 兩個 `{ col, row }` 是不是同一格。 */
export function isSameCell(a, b) {
  return a.col === b.col && a.row === b.row
}
