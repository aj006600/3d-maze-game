// 遊戲核心公開介面的行為測試:一局遊戲的迷宮、起點與門。
// 只透過 createGame 與它回傳的物件讀狀態,不碰核心內部的資料結構或演算法步驟。
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGame } from '../../src/game/game.js'

// 測試對方向的理解直接取自公開介面的契約(row 往南遞增、col 往東遞增),不沿用核心內部的對照表
const OFFSETS = {
  north: { col: 0, row: -1 },
  east: { col: 1, row: 0 },
  south: { col: 0, row: 1 },
  west: { col: -1, row: 0 },
}

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1)

function cellsOf(maze) {
  const cells = []
  for (let row = 0; row < maze.size; row += 1) {
    for (let col = 0; col < maze.size; col += 1) {
      cells.push({ col, row })
    }
  }
  return cells
}

function neighborsOf(maze, cell) {
  return maze.openings(cell).map((side) => ({
    col: cell.col + OFFSETS[side].col,
    row: cell.row + OFFSETS[side].row,
  }))
}

const keyOf = (cell) => `${cell.col},${cell.row}`

// 把一局遊戲能從公開介面讀到的配置整理成純資料,方便整局比較
function layoutOf(game) {
  return {
    maze: cellsOf(game.maze).map((cell) => game.maze.openings(cell).sort()),
    start: game.start,
    door: game.door,
  }
}

describe('createGame 的決定性', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('同一個 seed 不論何時建立,都得到完全相同的一局', () => {
    vi.useFakeTimers()
    for (const seed of SEEDS) {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const first = layoutOf(createGame(seed))
      vi.setSystemTime(new Date('2030-06-15T12:34:56Z'))
      expect(layoutOf(createGame(seed)), `seed ${seed}`).toEqual(first)
    }
  })

  it('不同的 seed 建立出不同的迷宮', () => {
    const mazes = new Set(SEEDS.map((seed) => JSON.stringify(layoutOf(createGame(seed)).maze)))
    expect(mazes.size).toBe(SEEDS.length)
  })
})

describe('createGame 的迷宮', () => {
  it('是 10×10 的正方形', () => {
    expect(createGame(1).maze.size).toBe(10)
  })

  it('任兩格之間恰有一條路', () => {
    for (const seed of SEEDS) {
      const { maze } = createGame(seed)
      const cells = cellsOf(maze)

      // 連通且通道數等於格數減一,就是一棵樹:任兩格之間恰有一條路
      const passages = cells.reduce((sum, cell) => sum + maze.openings(cell).length, 0) / 2
      expect(passages, `seed ${seed}`).toBe(cells.length - 1)

      const reached = new Set([keyOf(cells[0])])
      const queue = [cells[0]]
      while (queue.length > 0) {
        for (const next of neighborsOf(maze, queue.shift())) {
          if (!reached.has(keyOf(next))) {
            reached.add(keyOf(next))
            queue.push(next)
          }
        }
      }
      expect(reached.size, `seed ${seed}`).toBe(cells.length)
    }
  })

  it('至少有 26 個死路', () => {
    for (const seed of SEEDS) {
      const { maze } = createGame(seed)
      const deadEnds = cellsOf(maze).filter((cell) => maze.openings(cell).length === 1)
      expect(deadEnds.length, `seed ${seed}`).toBeGreaterThanOrEqual(26)
    }
  })
})

describe('createGame 的起點', () => {
  const CENTER = ['4,4', '5,4', '4,5', '5,5']

  it('是迷宮中央四格之一', () => {
    for (const seed of SEEDS) {
      expect(CENTER, `seed ${seed}`).toContain(keyOf(createGame(seed).start))
    }
  })

  it('落在中央四格的哪一格由 seed 決定', () => {
    const starts = new Set(SEEDS.map((seed) => keyOf(createGame(seed).start)))
    expect(starts).toEqual(new Set(CENTER))
  })
})

describe('createGame 的門', () => {
  it('在外牆上', () => {
    for (const seed of SEEDS) {
      const { maze, door } = createGame(seed)
      const inside = (cell) => cell.col >= 0 && cell.col < maze.size && cell.row >= 0 && cell.row < maze.size
      const beyond = { col: door.col + OFFSETS[door.side].col, row: door.row + OFFSETS[door.side].row }
      expect(inside(door), `seed ${seed}`).toBe(true)
      expect(inside(beyond), `seed ${seed}`).toBe(false)
    }
  })

  it('開在哪一面外牆由 seed 決定', () => {
    const sides = new Set(SEEDS.map((seed) => createGame(seed).door.side))
    expect(sides).toEqual(new Set(Object.keys(OFFSETS)))
  })
})
