// 遊戲核心公開介面的行為測試:一局遊戲的迷宮、起點、門與字母,主角的移動與碰撞,
// 依通關字串收集字母,開門與破關,時限與挑戰失敗,揮擊,測試用的傳送 hook,以及奧客的出現、遊蕩、發現、追趕、碰撞與擋路。
// 只透過 createGame 與它回傳的物件讀狀態,不碰核心內部的資料結構或演算法步驟。
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PASSENGERS, SWING_SECONDS, TIME_LIMITS } from '../../src/config.js'
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

// 從 from 沿著迷宮的通道走到每一格要幾步。回傳以 keyOf 為 key 的 Map,走不到的格子不在裡面
function pathDistancesFrom(maze, from) {
  const distances = new Map([[keyOf(from), 0]])
  const queue = [from]
  while (queue.length > 0) {
    const cell = queue.shift()
    for (const next of neighborsOf(maze, cell)) {
      if (!distances.has(keyOf(next))) {
        distances.set(keyOf(next), distances.get(keyOf(cell)) + 1)
        queue.push(next)
      }
    }
  }
  return distances
}

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
      expect(pathDistancesFrom(maze, cells[0]).size, `seed ${seed}`).toBe(cells.length)
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

// 格子 `{ col, row }` 在不在迷宮裡
const isCellInside = (maze, { col, row }) => col >= 0 && col < maze.size && row >= 0 && row < maze.size

describe('createGame 的門', () => {
  it('在外牆上', () => {
    for (const seed of SEEDS) {
      const { maze, door } = createGame(seed)
      expect(isCellInside(maze, door), `seed ${seed}`).toBe(true)
      expect(isCellInside(maze, stepOf(door, door.side)), `seed ${seed}`).toBe(false)
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

// (col, row) 這一格朝 side 那一側的邊線中點,以格為單位
const sideMidpointOf = (cell, side) => ({
  x: cell.col + 0.5 + OFFSETS[side].col / 2,
  y: cell.row + 0.5 + OFFSETS[side].row / 2,
})
const isCovered = (walls, { x, y }) =>
  walls.some((wall) => wall.minX <= x && x <= wall.maxX && wall.minY <= y && y <= wall.maxY)

describe('createGame 的牆', () => {
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
const OPPOSITE = { north: 'south', east: 'west', south: 'north', west: 'east' }
// 從上方俯瞰,順時針轉九十度的那一側。面向某一側時,右手邊就是這一側
const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' }

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

// 有奧客離 cell 的中央不到 3.5 格。等奧客走開的那幾條測試,在檢查主角的位置之前只讓主角跑不到一秒,
// 主角離 cell 的中央不超過一格。奧客就算立刻發現主角、全速追趕,一秒也走不到一格半;
// 再加上兩者碰到時圓心之間的距離,只有離 cell 的中央不到 3.5 格的奧客可能擋到主角
const isPassengerNear = (game, cell) =>
  game.passengers.some((passenger) => Math.hypot(passenger.x - cell.col - 0.5, passenger.y - cell.row - 0.5) < 3.5)

// 只看主角的測試用它先把奧客請開:主角躲起來推進一會兒,直到沒有奧客在 cell 附近。
// 主角躲起來時擋不到任何一位奧客,也不會被發現,遊蕩的奧客遲早會走開,但可能在死路多的地方繞上一兩分鐘。
// 發現過主角的奧客會一直追趕、不會走開,所以 game 要是還沒有奧客發現主角的一局
function waitForPassengersToLeave(game, cell) {
  for (let i = 0; i < 10 * 60; i += 1) {
    if (!isPassengerNear(game, cell)) return
    hidePlayer(game)
  }
  throw new Error(`奧客一直待在 ${keyOf(cell)} 附近`)
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
    // 面向牆時往右斜跑,就是往 CLOCKWISE 的那一側滑
    for (const seed of COLLISION_SEEDS) {
      for (const wall of wallSidesOf(createGame(seed))) {
        // 這裡只看牆:主角沿著牆滑動時可能撞上附近的奧客,所以先等奧客走開。
        // 同一局裡發現過主角的奧客不會走開,所以每一段牆都開新的一局
        const game = createGame(seed, { allowTeleport: true })
        waitForPassengersToLeave(game, wall)
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

  it('朝有通道的那一側跑,會跑進隔壁那一格', () => {
    for (const seed of COLLISION_SEEDS) {
      const { maze } = createGame(seed)
      for (const cell of cellsOf(maze)) {
        for (const side of maze.openings(cell)) {
          // 這裡只看牆:主角跑進隔壁那一格時可能撞上附近的奧客,所以先等奧客走開。
          // 同一局裡發現過主角的奧客不會走開,所以每一次都開新的一局
          const game = createGame(seed, { allowTeleport: true })
          waitForPassengersToLeave(game, cell)
          game.teleport(cell)
          // 從格子中央跑一格的距離,停在隔壁那一格的中央
          run(game, { forward: 1, heading: HEADINGS[side] }, 1 / RUN_SPEED)
          expect(cellOf(game.player), `seed ${seed} ${keyOf(cell)} ${side}`).toEqual(stepOf(cell, side))
        }
      }
    }
  })
})

describe('通關字串', () => {
  it('固定是 HAPPY BIRTHDAY 去掉空格的 13 個字母,換 seed 也不變', () => {
    for (const seed of SEEDS) {
      expect(createGame(seed).phrase, `seed ${seed}`).toBe('HAPPYBIRTHDAY')
    }
  })
})

describe('可互動', () => {
  it('主角站在有字母的死路格內時可以互動,其他格子都不行', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const game = createGame(seed, { allowTeleport: true })
      const letterCells = new Set(game.letters.map(keyOf))
      for (const cell of cellsOf(game.maze)) {
        game.teleport(cell)
        expect(game.canInteract, `seed ${seed} ${keyOf(cell)}`).toBe(letterCells.has(keyOf(cell)))
      }
    }
  })
})

// 先把主角傳送到該字母所在的格子,再按一次互動鍵
function interactAt(game, letter) {
  game.teleport(game.letters.find((placed) => placed.letter === letter))
  return game.interact()
}

describe('收集', () => {
  it('在當下輪到的字母上互動,進度加一,字母留在原地', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const before = layoutOf(game).letters
      expect(game.progress, `seed ${seed}`).toBe(0)
      expect(interactAt(game, 'H'), `seed ${seed}`).toBe('collected')
      expect(game.progress, `seed ${seed}`).toBe(1)
      expect(layoutOf(game).letters, `seed ${seed}`).toEqual(before)
      expect(game.canInteract, `seed ${seed}`).toBe(true)
    }
  })

  it('在干擾字母或還沒輪到的字母上互動,進度不變,並回報 wrong(不是這個)', () => {
    const game = createGame(1, { allowTeleport: true })
    // 開局時輪到 H;收集 H 之後輪到 A,剛收集過的 H 也變成還沒輪到
    for (const [collectedBefore, next] of [
      ['', 'H'],
      ['H', 'A'],
    ]) {
      for (const letter of collectedBefore) interactAt(game, letter)
      const progress = game.progress
      for (const letter of ALPHABET.replace(next, '')) {
        expect(interactAt(game, letter), `${next} 輪到時互動 ${letter}`).toBe('wrong')
        expect(game.progress, `${next} 輪到時互動 ${letter}`).toBe(progress)
      }
    }
  })

  it('不在字母所在的死路格內時互動,沒有任何效果', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const game = createGame(seed, { allowTeleport: true })
      interactAt(game, 'H')
      const letterCells = new Set(game.letters.map(keyOf))
      for (const cell of cellsOf(game.maze).filter((cell) => !letterCells.has(keyOf(cell)))) {
        game.teleport(cell)
        expect(game.interact(), `seed ${seed} ${keyOf(cell)}`).toBeNull()
        expect(game.progress, `seed ${seed} ${keyOf(cell)}`).toBe(1)
      }
    }
  })

  it('只是走進字母所在的死路再走出來,沒有互動就沒有任何效果', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const h = game.letters.find(({ letter }) => letter === 'H')
      // 這裡只看收集:主角跑進死路時可能撞上附近的奧客,所以先等奧客走開
      waitForPassengersToLeave(game, h)
      const [opening] = game.maze.openings(h)
      // 從死路開口外的那一格出發,跑進字母那一格的中央再跑回來
      game.teleport(stepOf(h, opening))
      run(game, { forward: 1, heading: HEADINGS[OPPOSITE[opening]] }, 1 / RUN_SPEED)
      expect(cellOf(game.player), `seed ${seed}`).toEqual({ col: h.col, row: h.row })
      run(game, { forward: 1, heading: HEADINGS[opening] }, 1 / RUN_SPEED)
      expect(game.progress, `seed ${seed}`).toBe(0)
    }
  })

  it('站在 P 上原地連續互動兩次,進度加二', () => {
    const game = createGame(1, { allowTeleport: true })
    interactAt(game, 'H')
    interactAt(game, 'A')
    expect(interactAt(game, 'P')).toBe('collected')
    expect(game.interact()).toBe('collected')
    expect(game.progress).toBe(4)
  })

  it('依序到每個字母互動就收集完 13 個,H、A、P、Y 第二次輪到時回到同一個位置再收集', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      for (const [i, letter] of [...'HAPPYBIRTHDAY'].entries()) {
        expect(interactAt(game, letter), `seed ${seed} 第 ${i + 1} 個 ${letter}`).toBe('collected')
      }
      expect(game.progress, `seed ${seed}`).toBe(13)
    }
  })
})

// 依通關字串的順序,到前 count 個字母各互動一次
function collectFirst(game, count) {
  for (const letter of 'HAPPYBIRTHDAY'.slice(0, count)) interactAt(game, letter)
}

describe('門與破關', () => {
  it('主角在門所在的那一格時算走到門前,其他格子都不算', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const game = createGame(seed, { allowTeleport: true })
      for (const cell of cellsOf(game.maze)) {
        game.teleport(cell)
        expect(game.atDoor, `seed ${seed} ${keyOf(cell)}`).toBe(keyOf(cell) === keyOf(game.door))
      }
    }
  })

  it('進度未滿 13 時門鎖著,主角走不出去', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      collectFirst(game, 12)
      game.teleport(game.door)
      run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 1.5 / RUN_SPEED)
      expect(cellOf(game.player), `seed ${seed}`).toEqual({ col: game.door.col, row: game.door.row })
    }
  })

  it('收集第 13 個字母的那一次互動,門就打開', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      collectFirst(game, 12)
      expect(game.doorOpen, `seed ${seed} 收集第 13 個之前`).toBe(false)
      interactAt(game, 'Y')
      expect(game.doorOpen, `seed ${seed}`).toBe(true)
    }
  })

  it('門打開後,主角跑出門的那一刻就破關,不需要按互動鍵', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      collectFirst(game, 13)
      game.teleport(game.door)
      // 從門所在那一格的中央往門跑,跑不到半格還在迷宮裡,再跑一格就出了門
      run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 0.4 / RUN_SPEED)
      expect(game.finished, `seed ${seed} 還沒走出門`).toBe(false)
      run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 1 / RUN_SPEED)
      expect(cellOf(game.player), `seed ${seed}`).toEqual(stepOf(game.door, game.door.side))
      expect(game.finished, `seed ${seed}`).toBe(true)
    }
  })

  it('門打開後,walls 裡只少了門那一段牆', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      collectFirst(game, 13)
      const { walls, door } = game
      expect(isCovered(walls, sideMidpointOf(door, door.side)), `seed ${seed}`).toBe(false)
      for (const wall of wallSidesOf(game)) {
        expect(isCovered(walls, sideMidpointOf(wall, wall.side)), `seed ${seed} ${keyOf(wall)} ${wall.side}`).toBe(true)
      }
    }
  })
})

describe('時限與挑戰失敗', () => {
  it('不限時的一局沒有倒數,推進再久也不會挑戰失敗', () => {
    const game = createGame(1)
    expect(game.countdown).toBeNull()
    expect(game.failed).toBe(false)
    run(game, {}, 24 * 60 * 60, 60)
    expect(game.countdown).toBeNull()
    expect(game.failed).toBe(false)
  })

  it('有時限的一局,倒數從時限開始,每推進一步就少掉那一步的秒數', () => {
    const game = createGame(1, { timeLimit: 300 })
    expect(game.countdown).toBe(300)
    game.step({ forward: 1, right: 0, heading: 0, dt: 0.5 })
    expect(game.countdown).toBe(299.5)
    game.step({ forward: 0, right: 1, heading: 0, dt: 0.25 })
    expect(game.countdown).toBe(299.25)
  })

  it('主角站著不動時,倒數照樣減少', () => {
    const game = createGame(1, { timeLimit: 300 })
    run(game, {}, 2, 0.5)
    expect(game.countdown).toBe(298)
  })

  it('倒數歸零的那一步挑戰失敗,倒數停在 0', () => {
    const game = createGame(1, { timeLimit: 300 })
    run(game, {}, 299, 1)
    expect(game.failed, '還剩 1 秒').toBe(false)
    // 這一步比剩下的時間還長,倒數也不會變成負的
    game.step({ forward: 0, right: 0, heading: 0, dt: 1.5 })
    expect(game.failed).toBe(true)
    expect(game.countdown).toBe(0)
  })

  it('挑戰失敗之後,推進不會移動主角,互動不會增加進度', () => {
    const game = createGame(1, { allowTeleport: true, timeLimit: 300 })
    run(game, {}, 300, 1)
    const before = game.player
    run(game, { forward: 1, heading: 1.2 }, 1)
    expect(game.player, '推進').toEqual(before)
    expect(interactAt(game, 'H'), '互動').toBeNull()
    expect(game.progress, '互動').toBe(0)
  })

  it('門打開後,主角還沒走出門時倒數歸零,是挑戰失敗而不是破關', () => {
    for (const seed of SEEDS) {
      // 時限只夠從門所在那一格的中央往門跑不到半格,時間用完時主角還在迷宮裡
      const game = createGame(seed, { allowTeleport: true, timeLimit: 0.4 / RUN_SPEED })
      collectFirst(game, 13)
      game.teleport(game.door)
      game.step({ forward: 1, right: 0, heading: HEADINGS[game.door.side], dt: 0.4 / RUN_SPEED })
      expect(game.failed, `seed ${seed}`).toBe(true)
      expect(game.finished, `seed ${seed}`).toBe(false)
    }
  })

  it('主角走出門的那一步剛好用完時間,是破關而不是挑戰失敗', () => {
    for (const seed of SEEDS) {
      // 時限剛好夠從門所在那一格的中央跑一格,這一步出了門,時間也正好用完
      const game = createGame(seed, { allowTeleport: true, timeLimit: 1 / RUN_SPEED })
      collectFirst(game, 13)
      game.teleport(game.door)
      game.step({ forward: 1, right: 0, heading: HEADINGS[game.door.side], dt: 1 / RUN_SPEED })
      expect(game.countdown, `seed ${seed}`).toBe(0)
      expect(game.finished, `seed ${seed}`).toBe(true)
      expect(game.failed, `seed ${seed}`).toBe(false)
    }
  })

  it('破關之後繼續推進,倒數不再減少,也不會變成挑戰失敗', () => {
    const game = createGame(1, { allowTeleport: true, timeLimit: 300 })
    collectFirst(game, 13)
    game.teleport(game.door)
    run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 1 / RUN_SPEED)
    expect(game.finished).toBe(true)
    const countdown = game.countdown
    run(game, {}, 600, 1)
    expect(game.countdown).toBe(countdown)
    expect(game.failed).toBe(false)
  })
})

describe('揮擊', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('揮擊一次,進度從開頭走到結尾,揮完回到沒有在揮', () => {
    const game = createGame(1)
    expect(game.swingProgress, '還沒揮').toBeNull()
    game.swing()
    expect(game.swingProgress, '剛開始揮').toBe(0)
    run(game, {}, SWING_SECONDS / 2, SWING_SECONDS / 2)
    expect(game.swingProgress, '揮到一半').toBeCloseTo(0.5)
    run(game, {}, SWING_SECONDS * 0.4, SWING_SECONDS * 0.4)
    expect(game.swingProgress, '快揮完').toBeCloseTo(0.9)
    run(game, {}, SWING_SECONDS * 0.2, SWING_SECONDS * 0.2)
    expect(game.swingProgress, '揮完').toBeNull()
  })

  it('正在揮的時候再揮,這次揮擊不會重來,揮完之後也不會接著再揮一次', () => {
    const game = createGame(1)
    game.swing()
    run(game, {}, SWING_SECONDS / 2, SWING_SECONDS / 2)
    game.swing()
    expect(game.swingProgress, '再揮的那一刻').toBeCloseTo(0.5)
    run(game, {}, SWING_SECONDS, SWING_SECONDS / 2)
    expect(game.swingProgress, '揮完之後').toBeNull()
  })

  it('沒有推進時,不論經過多久進度都不變,再推進時從停住的地方接著揮', () => {
    vi.useFakeTimers()
    const game = createGame(1)
    game.swing()
    run(game, {}, SWING_SECONDS * 0.3, SWING_SECONDS * 0.3)
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(game.swingProgress, '一小時沒有推進').toBeCloseTo(0.3)
    run(game, {}, SWING_SECONDS * 0.2, SWING_SECONDS * 0.2)
    expect(game.swingProgress, '接著推進').toBeCloseTo(0.5)
  })

  it('揮擊時主角照樣跑與轉向,跑到的位置與沒有揮擊時相同', () => {
    for (const seed of SEEDS) {
      const swinging = createGame(seed)
      const still = createGame(seed)
      const side = swinging.maze.openings(swinging.start)[0]
      swinging.swing()
      for (const game of [swinging, still]) {
        run(game, { forward: 1, heading: HEADINGS[side] }, SWING_SECONDS / 2)
        run(game, { right: 1, heading: HEADINGS[side] + 0.3 }, 0.1)
      }
      expect(swinging.swingProgress, `seed ${seed}`).not.toBeNull()
      expect(swinging.player, `seed ${seed}`).toEqual(still.player)
    }
  })

  it('挑戰失敗之後揮擊沒有效果', () => {
    const game = createGame(1, { timeLimit: 300 })
    run(game, {}, 300, 1)
    expect(game.failed).toBe(true)
    game.swing()
    expect(game.swingProgress).toBeNull()
  })

  it('破關之後揮擊沒有效果', () => {
    const game = createGame(1, { allowTeleport: true })
    collectFirst(game, 13)
    game.teleport(game.door)
    run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 1 / RUN_SPEED)
    expect(game.finished).toBe(true)
    game.swing()
    expect(game.swingProgress).toBeNull()
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

describe('奧客的出現', () => {
  it('不論選哪個時限或不限時,每一局都有兩位奧客,開局時都在遊蕩,也還沒被打中過', () => {
    for (const timeLimit of TIME_LIMITS) {
      const { passengers } = createGame(1, { timeLimit })
      expect(passengers, `時限 ${timeLimit}`).toHaveLength(PASSENGERS.count)
      for (const [i, passenger] of passengers.entries()) {
        expect(passenger.state, `時限 ${timeLimit} 第 ${i + 1} 位`).toBe('wandering')
        expect(passenger.hits, `時限 ${timeLimit} 第 ${i + 1} 位`).toBe(0)
      }
    }
  })

  it('開局時各自站在一格的中央,沿著迷宮的路徑離起點至少 4 格,兩位不在同一格', () => {
    for (const seed of SEEDS) {
      const game = createGame(seed)
      const distances = pathDistancesFrom(game.maze, game.start)
      const cells = game.passengers.map(cellOf)
      for (const [i, passenger] of game.passengers.entries()) {
        const label = `seed ${seed} 第 ${i + 1} 位`
        expect(passenger.x, label).toBe(cells[i].col + 0.5)
        expect(passenger.y, label).toBe(cells[i].row + 0.5)
        expect(distances.get(keyOf(cells[i])), label).toBeGreaterThanOrEqual(PASSENGERS.minStartDistance)
      }
      expect(new Set(cells.map(keyOf)).size, `seed ${seed}`).toBe(PASSENGERS.count)
    }
  })

  it('同一個 seed 的迷宮、起點、門與字母,與加入奧客之前完全相同', () => {
    // 以下是加入奧客之前的版本產生的配置。迷宮依 row 再 col 的順序,每格一個十六進位數字,
    // 是該格開口的位元和:北 1、東 2、南 4、西 8。字母依 A 到 Z 的順序列出所在的格子
    const BEFORE_PASSENGERS = [
      {
        seed: 1,
        maze: '2aaeeeaaac42e917ae817a96ebc3e852ad56bc3812e9556ba86af8517ee856fc7c15781151156d782a92ed157c2aaa912911',
        start: { col: 5, row: 5 },
        door: { col: 9, row: 2, side: 'east' },
        letters:
          '6,8 9,3 1,3 9,9 0,1 9,1 3,7 3,8 8,9 9,7 0,4 4,1 1,7 6,9 4,7 0,0 0,8 6,6 3,5 0,7 1,1 1,4 9,6 9,5 0,9 9,4',
      },
      {
        seed: 20261118,
        maze: '6aaeaae8447a838416b97aaaabef847eaeec13ad57c557ee8155551553ec5517853811556d2feaac555381784111382abab8',
        start: { col: 4, row: 5 },
        door: { col: 5, row: 9, side: 'south' },
        letters:
          '2,1 4,8 1,9 9,4 4,7 8,8 5,8 8,2 9,8 3,9 7,6 9,6 4,9 6,3 2,6 8,0 4,1 8,4 4,6 8,6 9,0 6,1 5,1 0,9 7,0 7,8',
      },
    ]
    const BITS = { north: 1, east: 2, south: 4, west: 8 }
    for (const { seed, ...before } of BEFORE_PASSENGERS) {
      const game = createGame(seed)
      const maze = cellsOf(game.maze)
        .map((cell) =>
          game.maze
            .openings(cell)
            .reduce((sum, side) => sum + BITS[side], 0)
            .toString(16),
        )
        .join('')
      const letters = game.letters.map(keyOf).join(' ')
      expect({ maze, start: game.start, door: game.door, letters }, `seed ${seed}`).toEqual(before)
    }
  })

  it('同一個 seed 加同樣的推進序列,奧客的軌跡完全相同', () => {
    // 主角也照一段固定的輸入跑來跑去,奧客與主角的碰撞也在序列裡
    const script = [
      [{ forward: 1, heading: 0.3 }, 2],
      [{ right: -1, heading: 2 }, 3],
      [{}, 20],
      [{ forward: -1, right: 1, heading: 4 }, 5],
    ]
    const trajectoryOf = (seed) => {
      const game = createGame(seed)
      return script.flatMap(([input, seconds]) => trackPassengers(game, input, seconds))
    }
    for (const seed of SEEDS.slice(0, 10)) {
      expect(trajectoryOf(seed), `seed ${seed}`).toEqual(trajectoryOf(seed))
    }
  })

  it('奧客的快照每次讀取都是新的副本,改了它或之後的推進都不會改到別份', () => {
    const game = createGame(1)
    const first = game.passengers
    const original = structuredClone(first)
    first[0].x = -99
    first.pop()
    expect(game.passengers).toEqual(original)
    run(game, {}, 5)
    expect(first[0].x).toBe(-99)
    expect(game.passengers).not.toEqual(original)
  })
})

// 以每個時間步 dt 推進 seconds 秒,輸入與 run 相同;回傳開局與每一步之後的奧客快照,依時間排列
function trackPassengers(game, input, seconds, dt = FRAME) {
  const frames = [game.passengers]
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    run(game, input, dt, dt)
    frames.push(game.passengers)
  }
  return frames
}

// 主角躲到迷宮外面,站著不動推進一秒:奧客只在迷宮裡走,碰不到迷宮外的主角,所以主角擋不到任何一位奧客的路。
// 迷宮裡沒有這樣的地方:奧客幾乎塞滿走道,走進死路最裡面的那一格時,連躲在角落的主角也會碰到。
// 躲起來的主角離每一位奧客都超過發現的距離,所以遊蕩的奧客也不會發現他。
// 躲起來的主角不能移動,在迷宮外跑動會被當成走出了門
function hidePlayer(game) {
  game.teleport({ col: -10, row: -10 })
  run(game, {}, 1)
  return game
}

// 點到一段牆的最短距離,點在牆裡時是 0
const clearanceOf = (wall, { x, y }) =>
  Math.hypot(Math.max(wall.minX - x, 0, x - wall.maxX), Math.max(wall.minY - y, 0, y - wall.maxY))

// 奧客走出了迷宮,或身體插進了 walls 裡的某一段牆
const isOutOfBounds = ({ maze }, walls, passenger) =>
  !(passenger.x >= 0 && passenger.x < maze.size && passenger.y >= 0 && passenger.y < maze.size) ||
  walls.some((wall) => clearanceOf(wall, passenger) < PASSENGERS.radius - 1e-9)

// 第 i 位奧客在相鄰兩個快照之間每秒走了多遠,依時間排列。快照要以 FRAME 為時間步
function speedsOf(frames, i) {
  return frames.slice(1).map((frame, k) => movementOf(frames[k][i], frame[i]).distance / FRAME)
}

describe('奧客的遊蕩', () => {
  const WANDER_SPEED = PASSENGERS.wanderSpeed * RUN_SPEED

  it('遊蕩的奧客會走動,走路的速度是遊蕩的速度,不會更快', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      // 主角躲起來,奧客才不會發現主角、改成追趕
      const frames = trackPassengers(hidePlayer(createGame(seed, { allowTeleport: true })), {}, 30)
      for (let i = 0; i < PASSENGERS.count; i += 1) {
        const fastest = Math.max(...speedsOf(frames, i))
        expect(fastest, `seed ${seed} 第 ${i + 1} 位`).toBeCloseTo(WANDER_SPEED)
        expect(fastest, `seed ${seed} 第 ${i + 1} 位`).toBeLessThanOrEqual(WANDER_SPEED + 1e-9)
      }
    }
  })

  it('推進再久,遊蕩的奧客都留在迷宮裡,身體也不會插進牆裡;門打開之後也一樣', () => {
    let enteredDoorCell = false
    for (const seed of SEEDS.slice(0, 10)) {
      const game = createGame(seed, { allowTeleport: true })
      collectFirst(game, 13)
      // 主角躲起來,奧客才會一直遊蕩、走遍迷宮,而不是追到主角身邊停住
      hidePlayer(game)
      const { walls, door } = game
      const positions = trackPassengers(game, {}, 10 * 60, 0.1).flat()
      expect(
        positions.find((passenger) => isOutOfBounds(game, walls, passenger)),
        `seed ${seed}`,
      ).toBeUndefined()
      if (positions.some((passenger) => keyOf(cellOf(passenger)) === keyOf(door))) enteredDoorCell = true
    }
    // 至少要有奧客在門打開之後走進門所在的那一格,門那一側的規則才有被考驗到
    expect(enteredDoorCell).toBe(true)
  })

  it('遊蕩的奧客走得到迷宮的每一格,包括有字母的死路與門所在的那一格', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const game = hidePlayer(createGame(seed, { allowTeleport: true }))
      const visited = new Set(trackPassengers(game, {}, 60 * 60, 0.1).flatMap((frame) => frame.map(cellOf).map(keyOf)))
      expect(visited.size, `seed ${seed}`).toBe(game.maze.size * game.maze.size)
    }
  })

  it('遊蕩的奧客偶爾在一格的中央停下來,站幾秒再繼續走', () => {
    const [shortest, longest] = PASSENGERS.pauseSeconds
    for (const seed of SEEDS.slice(0, 5)) {
      const frames = trackPassengers(hidePlayer(createGame(seed, { allowTeleport: true })), {}, 120)
      for (let i = 0; i < PASSENGERS.count; i += 1) {
        // 每一段站著不動的時間:從停下的那一步到再走起來的前一步,最後還沒走起來的那一段不算
        const pauses = []
        let since = 0
        for (let k = 1; k < frames.length; k += 1) {
          if (movementOf(frames[k - 1][i], frames[k][i]).distance > 0) {
            if (k - 1 > since) pauses.push({ position: frames[since][i], seconds: (k - 1 - since) * FRAME })
            since = k
          }
        }
        const atCenter = ({ x, y }) => x % 1 === 0.5 && y % 1 === 0.5
        // 停下來的那一步與走起來的那一步各有一部分時間在走路,所以量到的秒數最多比實際少一步
        const paused = pauses.some(
          ({ position, seconds }) => atCenter(position) && seconds >= shortest - FRAME && seconds <= longest,
        )
        expect(paused, `seed ${seed} 第 ${i + 1} 位`).toBe(true)
      }
    }
  })

  it('遊蕩的奧客只在死路裡原路退出,沒有被擋住時不會在其他格子折返', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const game = hidePlayer(createGame(seed, { allowTeleport: true }))
      const frames = trackPassengers(game, {}, 120)
      // 兩位奧客靠得這麼近,就是被對方擋住了
      const crowded = (frame) => movementOf(frame[0], frame[1]).distance < 2 * PASSENGERS.radius + 0.01
      for (let i = 0; i < PASSENGERS.count; i += 1) {
        // 依序經過的格子,以及走進每一格的那一步
        const visits = []
        frames.forEach((frame, k) => {
          const cell = cellOf(frame[i])
          if (visits.length === 0 || keyOf(visits.at(-1).cell) !== keyOf(cell)) visits.push({ cell, k })
        })
        for (let v = 2; v < visits.length; v += 1) {
          if (keyOf(visits[v].cell) !== keyOf(visits[v - 2].cell)) continue
          const turn = visits[v - 1]
          const label = `seed ${seed} 第 ${i + 1} 位在 ${keyOf(turn.cell)} 折返`
          const blocked = frames.slice(turn.k, visits[v].k + 1).some(crowded)
          expect(game.maze.openings(turn.cell).length === 1 || blocked, label).toBe(true)
        }
      }
    }
  })
})

const sideOf = (direction) =>
  Object.keys(OFFSETS).find((side) => OFFSETS[side].col === direction.col && OFFSETS[side].row === direction.row)

// 沿著走道走的奧客面向哪一側。朝向只在走道的方向上才剛好對到某一側,所以取最接近的那一側
const facingSideOf = ({ heading }) =>
  sideOf({ col: Math.round(Math.sin(heading)), row: Math.round(-Math.cos(heading)) })

// 沿著 direction `{ col, row }` 量,point 在 origin 前方多遠;在後方時是負的
const aheadAlong = (direction, origin, point) =>
  (point.x - origin.x) * direction.col + (point.y - origin.y) * direction.row

// 從 cell 往 side 那一側直直走 length 格到達的格子;途中有一側沒有通道時是 null
function straightFrom(maze, cell, side, length) {
  let current = cell
  for (let i = 0; i < length; i += 1) {
    if (!maze.openings(current).includes(side)) return null
    current = stepOf(current, side)
  }
  return current
}

// 同一條直線走道上,奧客發現得到主角的最遠格數。格子的中央相距整數格,所以取發現的距離的整數部分
const DISCOVER_CELLS = Math.floor(PASSENGERS.discoverDistance)

describe('奧客的發現', () => {
  it('主角在發現的距離以內、兩者中心的連線沒有被牆擋住時,奧客發現主角並開始追趕', () => {
    let tested = 0
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      // 開局時奧客站在格子中央,主角傳送到同一條直線走道上剛好 DISCOVER_CELLS 格遠的那一格
      const from = cellOf(game.passengers[0])
      const side = Object.keys(OFFSETS).find((side) => straightFrom(game.maze, from, side, DISCOVER_CELLS) !== null)
      if (side === undefined) continue
      tested += 1
      game.teleport(straightFrom(game.maze, from, side, DISCOVER_CELLS))
      run(game, {}, FRAME)
      expect(game.passengers[0].state, `seed ${seed}`).toBe('chasing')
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('主角在發現的距離以內但隔著牆時,奧客不會發現主角', () => {
    let tested = 0
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      // 主角傳送到與奧客隔著一道牆的隔壁那一格,兩者中心只差 1 格
      const from = cellOf(game.passengers[0])
      const side = Object.keys(OFFSETS).find(
        (side) => !game.maze.openings(from).includes(side) && isCellInside(game.maze, stepOf(from, side)),
      )
      if (side === undefined) continue
      tested += 1
      game.teleport(stepOf(from, side))
      run(game, {}, FRAME)
      expect(game.passengers[0].state, `seed ${seed}`).toBe('wandering')
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('主角在發現的距離以外時,即使兩者之間沒有牆,奧客也不會發現主角', () => {
    let tested = 0
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const from = cellOf(game.passengers[0])
      const beyond = DISCOVER_CELLS + 1
      const side = Object.keys(OFFSETS).find((side) => straightFrom(game.maze, from, side, beyond) !== null)
      if (side === undefined) continue
      tested += 1
      game.teleport(straightFrom(game.maze, from, side, beyond))
      run(game, {}, FRAME)
      expect(game.passengers[0].state, `seed ${seed}`).toBe('wandering')
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('奧客背對著主角時也會發現主角', () => {
    let tested = 0
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const [passenger] = game.passengers
      const from = cellOf(passenger)
      // 開局時奧客面向待會兒要走出去的那一側,主角傳送到他背後的那一格
      const behind = OPPOSITE[facingSideOf(passenger)]
      if (!game.maze.openings(from).includes(behind)) continue
      tested += 1
      game.teleport(stepOf(from, behind))
      run(game, {}, FRAME)
      expect(game.passengers[0].state, `seed ${seed}`).toBe('chasing')
    }
    expect(tested).toBeGreaterThan(0)
  })
})

// 奧客停在主角身邊時,兩者中心的距離小於它。主角的碰撞半徑比 0.2 格小,所以碰在一起時兩者中心的距離比奧客的碰撞半徑多不到 0.2 格
const TOUCHING_DISTANCE = PASSENGERS.radius + 0.2

// 這一個快照裡兩位奧客靠得很近,有一位被另一位擋住了。追趕時被擋住的奧客停在碰到之前,離碰到不到一步
const isCrowded = ([first, other]) => movementOf(first, other).distance < 2 * PASSENGERS.radius + 0.05

// 讓第 i 位奧客發現主角:把主角傳送到奧客所在那一格隔壁、有通道相連的那一格,推進一步。
// 奧客要在格子中央附近,兩者中心的連線才不會擦到牆角;開局時、或開局後只推進過幾步時都是這樣
function discoverPlayer(game, i = 0) {
  const from = cellOf(game.passengers[i])
  game.teleport(stepOf(from, game.maze.openings(from)[0]))
  run(game, {}, FRAME)
  expect(game.passengers[i].state).toBe('chasing')
}

// 讓第一位奧客發現主角之後,把主角傳送到沿著路徑離奧客 6 格、不在同一行也不在同一列的格子,站著推進 10 秒。
// 奧客看不到那一格,路上也至少有一個轉角。回傳這一局、主角的位置、當下的牆與每一步的奧客快照。
// 找不到那樣的格子時回傳 null;另一位奧客擋到第一位時也回傳 null,這時看不出第一位怎麼追主角
function chaseFarAway(seed) {
  const game = createGame(seed, { allowTeleport: true })
  discoverPlayer(game)
  const from = cellOf(game.passengers[0])
  const distances = pathDistancesFrom(game.maze, from)
  const far = cellsOf(game.maze).find(
    (cell) => distances.get(keyOf(cell)) === 6 && cell.col !== from.col && cell.row !== from.row,
  )
  if (far === undefined) return null
  game.teleport(far)
  const { player, walls } = game
  const frames = trackPassengers(game, {}, 10)
  if (frames.some(isCrowded)) return null
  return { game, player, walls, frames }
}

describe('奧客的追趕', () => {
  const CHASE_SPEED = PASSENGERS.chaseSpeed * RUN_SPEED

  it('發現主角的奧客以追趕的速度朝主角前進,彼此的距離一直縮短,碰到主角才停下', () => {
    let tested = 0
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const from = cellOf(game.passengers[0])
      const side = Object.keys(OFFSETS).find((side) => straightFrom(game.maze, from, side, DISCOVER_CELLS) !== null)
      if (side === undefined) continue
      // 主角站在同一條直線走道上、發現得到的地方,所以兩者之間的直線距離就是沿著走道的距離
      game.teleport(straightFrom(game.maze, from, side, DISCOVER_CELLS))
      const { player } = game
      const frames = trackPassengers(game, {}, 3)
      // 這裡只看第一位奧客怎麼追主角:另一位奧客走進這條走道擋到他的話,這個 seed 不算
      if (frames.some(isCrowded)) continue
      tested += 1
      const gaps = frames.map(([passenger]) => movementOf(passenger, player).distance)
      const closing = gaps.slice(1).map((gap, k) => (gaps[k] - gap) / FRAME)
      const label = `seed ${seed}`
      // 每一步都在靠近,直到碰到主角的那一步;那一步只走了一部分,之後就停住不動
      const stopped = closing.findIndex((speed) => speed < CHASE_SPEED - 1e-6)
      expect(stopped, label).toBeGreaterThan(0)
      for (const speed of closing.slice(0, stopped)) expect(speed, label).toBeCloseTo(CHASE_SPEED)
      for (const speed of closing.slice(stopped + 1)) expect(speed, label).toBe(0)
      expect(gaps.at(-1), label).toBeLessThan(TOUCHING_DISTANCE)
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('主角被傳送到遠處、離開奧客的視線之後,奧客仍然追趕,沿著走道繞過轉角追上主角', () => {
    let tested = 0
    for (const seed of SEEDS.slice(0, 20)) {
      const chase = chaseFarAway(seed)
      if (chase === null) continue
      tested += 1
      const { player, frames } = chase
      const label = `seed ${seed}`
      expect(
        frames.every(([passenger]) => passenger.state === 'chasing'),
        label,
      ).toBe(true)
      expect(movementOf(frames.at(-1)[0], player).distance, label).toBeLessThan(TOUCHING_DISTANCE)
    }
    expect(tested).toBeGreaterThan(5)
  })

  it('追趕的奧客繞過轉角時一路維持追趕的速度,身體也不會插進牆裡', () => {
    let tested = 0
    for (const seed of SEEDS.slice(0, 20)) {
      const chase = chaseFarAway(seed)
      if (chase === null) continue
      tested += 1
      const { game, player, walls, frames } = chase
      const label = `seed ${seed}`
      expect(
        frames.find(([passenger]) => isOutOfBounds(game, walls, passenger)),
        label,
      ).toBeUndefined()
      // 追上主角之前每一步都以追趕的速度前進,不會貼著牆角慢慢磨。
      // 在格子中央轉直角的那一步,前後兩段的位移合起來最少是走過的距離的 1/√2,所以下限取 0.7 倍
      const arrival = frames.findIndex(([passenger]) => movementOf(passenger, player).distance < TOUCHING_DISTANCE)
      expect(arrival, label).toBeGreaterThan(0)
      const speeds = speedsOf(frames.slice(0, arrival + 1), 0)
      expect(Math.min(...speeds), label).toBeGreaterThan(0.7 * CHASE_SPEED)
      expect(Math.max(...speeds), label).toBeLessThanOrEqual(CHASE_SPEED + 1e-9)
    }
    expect(tested).toBeGreaterThan(5)
  })

  it('門打開之後,追到門所在那一格的奧客也不會走出迷宮', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const game = createGame(seed, { allowTeleport: true })
      collectFirst(game, 13)
      discoverPlayer(game)
      // 主角站在門所在那一格、靠近打開的門的地方:往門跑不到半格,還在迷宮裡
      game.teleport(game.door)
      run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 0.3 / RUN_SPEED)
      const { player, walls } = game
      const frames = trackPassengers(game, {}, 30)
      const label = `seed ${seed}`
      expect(game.finished, label).toBe(false)
      expect(
        frames.flat().find((passenger) => isOutOfBounds(game, walls, passenger)),
        label,
      ).toBeUndefined()
      // 至少要有一位奧客追到主角身邊,門口這一側的規則才有被考驗到
      expect(Math.min(...frames.at(-1).map((passenger) => movementOf(passenger, player).distance)), label).toBeLessThan(
        TOUCHING_DISTANCE,
      )
    }
  })

  it('最後一段奧客直接朝主角當下的位置靠過去:主角往走道的一側閃時,奧客跟著偏過去', () => {
    let tested = 0
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const from = cellOf(game.passengers[0])
      // 主角站在同一條直線走道上 2 格遠的那一格,那一格的左右要有一側是牆,主角才閃得過去、靠得上去
      const side = Object.keys(OFFSETS).find((side) => straightFrom(game.maze, from, side, 2) !== null)
      if (side === undefined) continue
      const cell = straightFrom(game.maze, from, side, 2)
      const facing = OPPOSITE[side]
      const right = CLOCKWISE[facing]
      const dodge = [right, OPPOSITE[right]].find((dodge) => !game.maze.openings(cell).includes(dodge))
      if (dodge === undefined) continue
      // 面向奧客往那一側橫移,貼上那一側的牆,再站著等奧客過來
      game.teleport(cell)
      run(game, { right: dodge === right ? 1 : -1, heading: HEADINGS[facing] }, 0.5)
      const frames = trackPassengers(game, {}, 3)
      if (frames.some(isCrowded)) continue
      tested += 1
      // 沿著閃的那一側量,主角與奧客各偏離走道中央的連線多遠
      const lateral = ({ x, y }) =>
        (x - cell.col - 0.5) * OFFSETS[dodge].col + (y - cell.row - 0.5) * OFFSETS[dodge].row
      const label = `seed ${seed}`
      const [passenger] = frames.at(-1)
      expect(movementOf(passenger, game.player).distance, label).toBeLessThan(TOUCHING_DISTANCE)
      expect(lateral(game.player), label).toBeGreaterThan(0.2)
      expect(lateral(passenger), label).toBeGreaterThan(0.01)
    }
    expect(tested).toBeGreaterThan(0)
  })
})

// 讓第一位奧客走到主角面前停下。主角先躲起來,等奧客剛走出一格的中央,再把主角傳送到奧客正要走進的那一格的中央;
// 奧客這時發現主角、追過來,推進到他停在主角面前為止。回傳:
// - cell:主角所在的格子。
// - direction:奧客走過來的方向 `{ col, row }`。
// - facing:主角面向奧客時朝著哪一側。
function meetFirstPassenger(game) {
  hidePlayer(game)
  for (let i = 0; i < 60 / FRAME; i += 1) {
    run(game, {}, FRAME)
    const [passenger] = game.passengers
    // 走動中的奧客朝著正要走進的那一格
    const direction = OFFSETS[facingSideOf(passenger)]
    const from = cellOf(passenger)
    const progress = aheadAlong(direction, { x: from.col + 0.5, y: from.row + 0.5 }, passenger)
    if (progress > 0 && progress < 0.25) {
      const cell = stepOf(from, sideOf(direction))
      game.teleport(cell)
      // 奧客離主角還有大半格,走過來不到兩秒
      run(game, {}, 2)
      return { cell, direction, facing: OPPOSITE[sideOf(direction)] }
    }
  }
  throw new Error('第一位奧客一直沒有走出格子的中央')
}

// 讓第一位奧客停在一個轉角格子的中央。主角先躲起來,等遊蕩的奧客走進轉角的格子、在中央停下來站著;
// 另一位奧客要離那一格夠遠,才不會擋到主角。回傳那一格、奧客從哪一側走進來、待會兒要從哪一側走出去;
// 一直等不到時回傳 null
function stopFirstPassengerAtCorner(game) {
  hidePlayer(game)
  let previous = game.passengers[0]
  for (let i = 0; i < 120 / FRAME; i += 1) {
    run(game, {}, FRAME)
    const [passenger, other] = game.passengers
    const cell = cellOf(passenger)
    const openings = game.maze.openings(cell)
    // 遊蕩的奧客只有停下來站著時,一幀結束時才會剛好在格子中央;上一幀還在走,就是這一幀剛停下來
    const justStopped =
      passenger.x === cell.col + 0.5 && passenger.y === cell.row + 0.5 && movementOf(previous, passenger).distance > 0
    previous = passenger
    const isCorner = openings.length === 2 && !openings.includes(OPPOSITE[openings[0]])
    if (!justStopped || !isCorner || Math.hypot(other.x - passenger.x, other.y - passenger.y) < 3) continue
    // 奧客停下來時已經轉向待會兒要走出去的那一側
    const exit = facingSideOf(passenger)
    return { cell, entrance: openings.find((side) => side !== exit), exit }
  }
  return null
}

// 讓每一位奧客都發現主角,再把主角傳送進一個每一位奧客都還離得遠的死路,站著推進 30 秒,等奧客都追進來。
// 字母都在死路裡,所以從有字母的格子裡挑。回傳這一局、那個死路的格子與每一步的奧客快照
function chaseIntoDeadEnd(seed) {
  const game = createGame(seed, { allowTeleport: true })
  for (let i = 0; i < PASSENGERS.count; i += 1) discoverPlayer(game, i)
  const deadEnd = game.letters.find((letter) =>
    game.passengers.every(
      (passenger) => Math.hypot(passenger.x - letter.col - 0.5, passenger.y - letter.row - 0.5) > 2,
    ),
  )
  game.teleport(deadEnd)
  return { game, deadEnd, frames: trackPassengers(game, {}, 30) }
}

// 主角朝 point `{ x, y }` 直直跑過去,跑剛好到得了那一點的時間;途中被擋住就停在被擋住的地方
function runToward(game, point) {
  const { x, y } = game.player
  run(
    game,
    { forward: 1, heading: Math.atan2(point.x - x, y - point.y) },
    Math.hypot(point.x - x, point.y - y) / RUN_SPEED,
  )
}

describe('奧客的碰撞與擋路', () => {
  const COLLISION_SEEDS = SEEDS.slice(0, 10)

  it('奧客走到主角面前就停下,不會把主角推開', () => {
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const { cell } = meetFirstPassenger(game)
      const [passenger] = game.passengers
      run(game, {}, 3)
      expect(game.player, `seed ${seed}`).toMatchObject({ x: cell.col + 0.5, y: cell.row + 0.5 })
      expect(game.passengers[0], `seed ${seed}`).toEqual(passenger)
      expect(movementOf(passenger, game.player).distance, `seed ${seed}`).toBeGreaterThan(PASSENGERS.radius)
    }
  })

  it('奧客貼在主角背後時,主角背對著他往前跑,跑的速度不受影響', () => {
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const { facing } = meetFirstPassenger(game)
      const before = game.player
      // 從格子中央跑一小段,不論往哪個方向都還碰不到牆
      run(game, { forward: 1, heading: HEADINGS[OPPOSITE[facing]] }, 0.2)
      expect(movementOf(before, game.player).distance / 0.2, `seed ${seed}`).toBeCloseTo(RUN_SPEED)
    }
  })

  it('主角朝奧客跑時被擋住,推不動他', () => {
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const { direction, facing } = meetFirstPassenger(game)
      const [passenger] = game.passengers
      run(game, { forward: 1, heading: HEADINGS[facing] }, 1)
      expect(game.passengers[0], `seed ${seed}`).toEqual(passenger)
      // 沿著奧客走過來的方向量,主角還在奧客的前方,沒有穿過他
      expect(aheadAlong(direction, passenger, game.player), `seed ${seed}`).toBeGreaterThan(0)
    }
  })

  it('主角斜著撞上奧客時,沿著他的邊緣滑動', () => {
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const { direction, facing } = meetFirstPassenger(game)
      const before = game.player
      // 朝奧客再往右偏 45 度跑一小段。主角一讓開,奧客就跟著靠過來,所以這裡只看主角
      run(game, { forward: 1, heading: HEADINGS[facing] + Math.PI / 4 }, 0.3)
      const sideways = Math.abs((game.player.x - before.x) * direction.row - (game.player.y - before.y) * direction.col)
      expect(sideways, `seed ${seed}`).toBeGreaterThan(0.1)
    }
  })

  it('奧客站在走道中央時,主角貼著走道的一側也鑽不過去', () => {
    let tested = 0
    for (const seed of COLLISION_SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const { cell, direction, facing } = meetFirstPassenger(game)
      // 奧客站在主角這一格裡,走道左右兩側要有一側是牆,主角才貼得上去
      const right = CLOCKWISE[facing]
      const side = [right, OPPOSITE[right]].find((side) => !game.maze.openings(cell).includes(side))
      if (side === undefined) continue
      tested += 1
      // 先橫移貼上那一側的牆,再朝奧客跑。主角讓開時奧客會跟著靠過來,碰到主角又停下
      run(game, { right: side === right ? 1 : -1, heading: HEADINGS[facing] }, 0.5)
      run(game, { forward: 1, heading: HEADINGS[facing] }, 1)
      expect(aheadAlong(direction, game.passengers[0], game.player), `seed ${seed}`).toBeGreaterThan(0)
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('奧客在轉角的格子中央發現主角時,主角也無法從他和內側的牆角之間繞過去', () => {
    let tested = 0
    for (const seed of SEEDS) {
      const game = createGame(seed, { allowTeleport: true })
      const corner = stopFirstPassengerAtCorner(game)
      if (corner === null) continue
      tested += 1
      const { cell, entrance, exit } = corner
      const goal = stepOf(cell, exit)
      // 從奧客走進來的那一側出發,先跑向奧客與內側牆角之間的空隙中間(離格子中央約 0.4 格),再跑向另一側那一格的中央。
      // 奧客一看到主角就朝主角靠過來,所以主角要到得了那一格,只能從他旁邊繞過去
      game.teleport(stepOf(cell, entrance))
      const inward = { col: OFFSETS[entrance].col + OFFSETS[exit].col, row: OFFSETS[entrance].row + OFFSETS[exit].row }
      runToward(game, { x: cell.col + 0.5 + 0.28 * inward.col, y: cell.row + 0.5 + 0.28 * inward.row })
      runToward(game, { x: goal.col + 0.5, y: goal.row + 0.5 })
      expect(cellOf(game.player), `seed ${seed} ${keyOf(cell)}`).not.toEqual(goal)
      if (tested === 5) break
    }
    expect(tested).toBeGreaterThan(0)
  })

  it('主角走進死路之後,跟進來的奧客把死路的開口擋住,主角正面或貼著走道的一側都出不去', () => {
    for (const seed of COLLISION_SEEDS) {
      const { game, deadEnd } = chaseIntoDeadEnd(seed)
      const [opening] = game.maze.openings(deadEnd)
      for (const angle of [0, -0.6, 0.6]) {
        run(game, { forward: 1, heading: HEADINGS[opening] + angle }, 1)
        expect(cellOf(game.player), `seed ${seed} 偏 ${angle}`).toEqual({ col: deadEnd.col, row: deadEnd.row })
      }
    }
  })

  it('兩位奧客都追進死路時,在走道上排成一列,不會重疊', () => {
    for (const seed of COLLISION_SEEDS) {
      const { game, frames } = chaseIntoDeadEnd(seed)
      const label = `seed ${seed}`
      expect(Math.min(...frames.map(([a, b]) => movementOf(a, b).distance)), label).toBeGreaterThanOrEqual(
        2 * PASSENGERS.radius - 1e-9,
      )
      // 近的那一位貼著主角,遠的那一位貼著近的那一位
      const [near, far] = [...frames.at(-1)].sort(
        (a, b) => movementOf(a, game.player).distance - movementOf(b, game.player).distance,
      )
      expect(movementOf(near, game.player).distance, label).toBeLessThan(TOUCHING_DISTANCE)
      expect(isCrowded([near, far]), label).toBe(true)
    }
  })

  it('兩位奧客互相擋住,不會重疊', () => {
    let closest = Infinity
    for (const seed of COLLISION_SEEDS) {
      const distances = trackPassengers(hidePlayer(createGame(seed, { allowTeleport: true })), {}, 10 * 60, 0.1).map(
        (frame) => movementOf(frame[0], frame[1]).distance,
      )
      expect(Math.min(...distances), `seed ${seed}`).toBeGreaterThanOrEqual(2 * PASSENGERS.radius - 1e-9)
      closest = Math.min(closest, ...distances)
    }
    // 至少要有一次兩位碰在一起,這條規則才有被考驗到
    expect(closest).toBeLessThan(2 * PASSENGERS.radius + 0.01)
  })
})

describe('奧客與一局的結束', () => {
  it('挑戰失敗之後,推進不會讓奧客移動', () => {
    const game = createGame(1, { timeLimit: 300 })
    run(game, {}, 300, 1)
    expect(game.failed).toBe(true)
    const passengers = game.passengers
    run(game, {}, 60)
    expect(game.passengers).toEqual(passengers)
  })

  it('破關之後,推進不會讓奧客移動', () => {
    const game = createGame(1, { allowTeleport: true })
    collectFirst(game, 13)
    game.teleport(game.door)
    run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 1 / RUN_SPEED)
    expect(game.finished).toBe(true)
    const passengers = game.passengers
    run(game, { forward: 1, heading: HEADINGS[game.door.side] }, 60)
    expect(game.passengers).toEqual(passengers)
  })
})
