// 遊戲核心公開介面的行為測試:一局遊戲的迷宮、起點、門與字母,主角的移動與碰撞,以及測試用的傳送 hook。
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
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function cellsOf(maze) {
  const cells = []
  for (let row = 0; row < maze.size; row += 1) {
    for (let col = 0; col < maze.size; col += 1) {
      cells.push({ col, row })
    }
  }
  return cells
}

function stepOf(cell, side) {
  return { col: cell.col + OFFSETS[side].col, row: cell.row + OFFSETS[side].row }
}

function neighborsOf(maze, cell) {
  return maze.openings(cell).map((side) => stepOf(cell, side))
}

const keyOf = (cell) => `${cell.col},${cell.row}`

// 把一局遊戲能從公開介面讀到的配置整理成純資料,方便整局比較
function layoutOf(game) {
  return {
    maze: cellsOf(game.maze).map((cell) => game.maze.openings(cell).sort()),
    start: game.start,
    door: game.door,
    letters: game.letters,
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
    for (const seed of SEEDS) {
      expect(createGame(seed).maze.size, `seed ${seed}`).toBe(10)
    }
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

  it('中央四格都可能成為起點', () => {
    const starts = new Set(SEEDS.map((seed) => keyOf(createGame(seed).start)))
    expect(starts.size).toBe(CENTER.length)
  })
})

describe('createGame 的門', () => {
  it('在外牆上', () => {
    for (const seed of SEEDS) {
      const { maze, door } = createGame(seed)
      const inside = (cell) => cell.col >= 0 && cell.col < maze.size && cell.row >= 0 && cell.row < maze.size
      expect(inside(door), `seed ${seed}`).toBe(true)
      expect(inside(stepOf(door, door.side)), `seed ${seed}`).toBe(false)
    }
  })

  it('四面外牆都可能開門', () => {
    const sides = new Set(SEEDS.map((seed) => createGame(seed).door.side))
    expect(sides).toEqual(new Set(Object.keys(OFFSETS)))
  })
})

describe('createGame 的字母', () => {
  it('A 到 Z 各一個,依字母順序列出', () => {
    for (const seed of SEEDS) {
      const letters = createGame(seed).letters.map(({ letter }) => letter)
      expect(letters.join(''), `seed ${seed}`).toBe(ALPHABET)
    }
  })

  it('每個字母都在死路裡', () => {
    for (const seed of SEEDS) {
      const { maze, letters } = createGame(seed)
      for (const { letter, col, row } of letters) {
        expect(maze.openings({ col, row }), `seed ${seed} ${letter}`).toHaveLength(1)
      }
    }
  })

  it('起點那一格沒有字母', () => {
    for (const seed of SEEDS) {
      const { start, letters } = createGame(seed)
      expect(letters.map(keyOf), `seed ${seed}`).not.toContain(keyOf(start))
    }
  })

  it('門所在的那一格沒有字母', () => {
    for (const seed of SEEDS) {
      const { door, letters } = createGame(seed)
      expect(letters.map(keyOf), `seed ${seed}`).not.toContain(keyOf(door))
    }
  })

  it('沒有兩個字母在同一格', () => {
    for (const seed of SEEDS) {
      const cells = new Set(createGame(seed).letters.map(keyOf))
      expect(cells.size, `seed ${seed}`).toBe(26)
    }
  })

  it('字母在迷宮裡的位置不照字母順序排列', () => {
    for (const seed of SEEDS) {
      const { letters } = createGame(seed)
      const byPosition = [...letters].sort((a, b) => a.row - b.row || a.col - b.col).map(({ letter }) => letter)
      expect(byPosition.join(''), `seed ${seed}`).not.toBe(ALPHABET)
    }
  })
})

describe('createGame 的牆', () => {
  // (col, row) 這一格朝 side 那一側的邊線中點,以格為單位
  const sideMidpointOf = (cell, side) => ({
    x: cell.col + 0.5 + OFFSETS[side].col / 2,
    y: cell.row + 0.5 + OFFSETS[side].row / 2,
  })
  const isCovered = (walls, { x, y }) =>
    walls.some((wall) => wall.minX <= x && x <= wall.maxX && wall.minY <= y && y <= wall.maxY)

  it('沒有通道的每一側都立著牆,外牆與鎖著的門也是;有通道的那一側沒有牆', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed)
      const { walls } = game
      for (const cell of cellsOf(game.maze)) {
        for (const side of Object.keys(OFFSETS)) {
          const isOpen = game.maze.openings(cell).includes(side)
          expect(isCovered(walls, sideMidpointOf(cell, side)), `seed ${seed} ${keyOf(cell)} ${side}`).toBe(!isOpen)
        }
      }
    }
  })
})

// 主角所在的格子:x 往東、y 往南,以格為單位,格子 (col, row) 涵蓋 col ≤ x < col + 1
const cellOf = (player) => ({ col: Math.floor(player.x), row: Math.floor(player.y) })

// 朝向的契約:弧度,0 朝北,從上方俯瞰時順時針增加
const HEADINGS = { north: 0, east: Math.PI / 2, south: Math.PI, west: (3 * Math.PI) / 2 }

const FRAME = 1 / 60

// 以每個時間步 dt 推進 seconds 秒,每一步都給同樣的輸入;沒給的欄位是朝北站著不動
function run(game, input, seconds, dt = FRAME) {
  const frames = Math.round(seconds / dt)
  for (let i = 0; i < frames; i += 1) game.step({ forward: 0, right: 0, heading: 0, ...input, dt })
}

// 從 before 到 after 移動的距離與單位方向
function movementOf(before, after) {
  const x = after.x - before.x
  const y = after.y - before.y
  const distance = Math.hypot(x, y)
  return { distance, direction: { col: x / distance, row: y / distance } }
}

// 從起點格的中央以每個時間步 dt 跑 seconds 秒,回傳跑了多遠。時間要短到碰不到牆
function distanceRun(input, seconds, dt = FRAME) {
  const game = createGame(1)
  const before = game.player
  run(game, input, seconds, dt)
  return movementOf(before, game.player).distance
}

// 主角每秒跑幾格。測試跑多久由它換算,不綁死在某個速度數值上
const RUN_SPEED = distanceRun({ forward: 1 }, 0.1) / 0.1

describe('主角', () => {
  it('從起點出發', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed)
      expect(cellOf(game.player), `seed ${seed}`).toEqual(game.start)
    }
  })

  it('前進時朝著朝向跑', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed)
      const side = game.maze.openings(game.start)[0]
      const before = game.player
      run(game, { forward: 1, heading: HEADINGS[side] }, 0.2)
      const { direction } = movementOf(before, game.player)
      expect(direction.col, `seed ${seed}`).toBeCloseTo(OFFSETS[side].col)
      expect(direction.row, `seed ${seed}`).toBeCloseTo(OFFSETS[side].row)
    }
  })

  it('倒退與橫移的方向以朝向為準', () => {
    // 面向 facing 時,每一種輸入應該跑向哪一側
    const expected = {
      north: { back: 'south', right: 'east', left: 'west' },
      east: { back: 'west', right: 'south', left: 'north' },
      south: { back: 'north', right: 'west', left: 'east' },
      west: { back: 'east', right: 'north', left: 'south' },
    }
    const inputs = { back: { forward: -1 }, right: { right: 1 }, left: { right: -1 } }
    for (const [facing, sides] of Object.entries(expected)) {
      for (const [name, input] of Object.entries(inputs)) {
        const game = createGame(1)
        const before = game.player
        // 從格子中央只跑一小段,不論往哪個方向都還碰不到牆
        run(game, { ...input, heading: HEADINGS[facing] }, 0.1)
        const { direction } = movementOf(before, game.player)
        const side = sides[name]
        expect(direction.col, `${facing} ${name}`).toBeCloseTo(OFFSETS[side].col)
        expect(direction.row, `${facing} ${name}`).toBeCloseTo(OFFSETS[side].row)
      }
    }
  })

  it('以固定速度跑', () => {
    expect(distanceRun({ forward: 1 }, 0.2) / 0.2, '跑兩倍的時間').toBeCloseTo(RUN_SPEED)
    expect(distanceRun({ forward: 1 }, 0.2, 0.2) / 0.2, '一個長的時間步').toBeCloseTo(RUN_SPEED)
    expect(distanceRun({ forward: 1, right: 1 }, 0.1) / 0.1, '斜向').toBeCloseTo(RUN_SPEED)
    expect(distanceRun({ forward: -1, right: -1 }, 0.1) / 0.1, '斜向倒退').toBeCloseTo(RUN_SPEED)
    expect(distanceRun({ forward: 0.3 }, 0.1) / 0.1, '輸入小於 1').toBeCloseTo(RUN_SPEED)
  })

  it('移動的輸入歸零就立刻停下,沒有慣性', () => {
    const game = createGame(1)
    run(game, { forward: 1, right: 1 }, 0.1)
    const running = game.player
    game.step({ forward: 0, right: 0, heading: 0, dt: FRAME })
    expect(game.player).toEqual(running)
  })

  it('朝向是最後一次輸入的朝向,站著不動時也一樣', () => {
    const game = createGame(1)
    run(game, { forward: 1, heading: 1.2 }, 0.1)
    expect(game.player.heading).toBe(1.2)
    game.step({ forward: 0, right: 0, heading: -2.5, dt: FRAME })
    expect(game.player.heading).toBe(-2.5)
  })
})

// 迷宮裡所有的牆,以「哪一格的哪一側」表示;門所在的那段外牆另外測,不列在這裡
function wallSidesOf({ maze, door }) {
  return cellsOf(maze).flatMap((cell) =>
    Object.keys(OFFSETS)
      .filter((side) => !maze.openings(cell).includes(side))
      .filter((side) => !(keyOf(cell) === keyOf(door) && side === door.side))
      .map((side) => ({ ...cell, side })),
  )
}

describe('主角與牆', () => {
  const COLLISION_SEEDS = SEEDS.slice(0, 5)

  it('朝牆跑時被擋住,不會穿牆', () => {
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      for (const wall of wallSidesOf(game)) {
        game.teleport(wall)
        // 跑一格半的距離,沒有被擋住的話一定會離開這一格
        run(game, { forward: 1, heading: HEADINGS[wall.side] }, 1.5 / RUN_SPEED)
        expect(cellOf(game.player), `seed ${seed} ${keyOf(wall)} ${wall.side}`).toEqual({
          col: wall.col,
          row: wall.row,
        })
      }
    }
  })

  it('一個時間步跑得再遠也不會穿牆', () => {
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      for (const wall of wallSidesOf(game)) {
        game.teleport(wall)
        game.step({ forward: 1, right: 0, heading: HEADINGS[wall.side], dt: 3 / RUN_SPEED })
        expect(cellOf(game.player), `seed ${seed} ${keyOf(wall)} ${wall.side}`).toEqual({
          col: wall.col,
          row: wall.row,
        })
      }
    }
  })

  it('斜向撞牆時沿著牆滑動,不會整個卡住', () => {
    // 從上方俯瞰,順時針轉九十度的那一側;面向牆時往右斜跑,就是往這一側滑
    const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' }
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      for (const wall of wallSidesOf(game)) {
        game.teleport(wall)
        run(game, { forward: 1, heading: HEADINGS[wall.side] }, 1 / RUN_SPEED)
        const againstWall = game.player
        // 往右前方斜跑一小段,沿牆方向的位移短到碰不到隔壁那一側的牆
        run(game, { forward: 1, heading: HEADINGS[wall.side] + Math.PI / 4 }, 0.2 / RUN_SPEED)
        const moved = { col: game.player.x - againstWall.x, row: game.player.y - againstWall.y }
        const normal = OFFSETS[wall.side]
        const along = OFFSETS[CLOCKWISE[wall.side]]
        const label = `seed ${seed} ${keyOf(wall)} ${wall.side}`
        expect(moved.col * along.col + moved.row * along.row, label).toBeGreaterThan(0.1)
        expect(moved.col * normal.col + moved.row * normal.row, label).toBeCloseTo(0)
      }
    }
  })

  it('門鎖著時等同於牆,走不出迷宮', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      game.teleport(game.door)
      run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 1.5 / RUN_SPEED)
      expect(cellOf(game.player), `seed ${seed}`).toEqual({ col: game.door.col, row: game.door.row })
    }
  })

  it('朝有通道的那一側跑,會跑進隔壁那一格', () => {
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      for (const cell of cellsOf(game.maze)) {
        for (const side of game.maze.openings(cell)) {
          game.teleport(cell)
          // 從格子中央跑一格的距離,停在隔壁那一格的中央
          run(game, { forward: 1, heading: HEADINGS[side] }, 1 / RUN_SPEED)
          expect(cellOf(game.player), `seed ${seed} ${keyOf(cell)} ${side}`).toEqual(stepOf(cell, side))
        }
      }
    }
  })
})

describe('傳送 hook', () => {
  it('明確開啟後,可以把主角移到任何一格', () => {
    const game = createGame(1, { allowTeleport: true })
    for (const cell of cellsOf(game.maze)) {
      game.teleport(cell)
      expect(cellOf(game.player)).toEqual(cell)
    }
  })

  it('預設關閉:沒有明確開啟就呼叫會丟出錯誤,主角留在原地', () => {
    const game = createGame(1)
    const before = game.player
    const elsewhere = cellsOf(game.maze).find((cell) => keyOf(cell) !== keyOf(game.start))
    expect(() => game.teleport(elsewhere)).toThrow()
    expect(game.player).toEqual(before)
  })
})

