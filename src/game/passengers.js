// 奧客:開局時站在哪裡、怎麼遊蕩,以及他們與牆、主角、彼此之間的碰撞。
// 奧客只由每一次推進帶動,經過的時間就是推進的秒數,不讀時鐘;用到的隨機全部來自這一局的亂數產生器。
//
// 遊蕩的奧客沿著格子中央的連線一格一格走:每走到一格的中央,就從來路以外的開口隨機挑一個走出去,
// 走進死路就只能原路退出;偶爾在格子中央停下來站一會兒。奧客只穿過迷宮裡的通道,門不是通道,
// 所以門打開之後奧客也不會走出迷宮。
//
// 格子中央的連線離兩側的牆都是半個走道寬,奧客的碰撞半徑比它小,所以走在連線上的奧客碰不到牆,
// 移動時也就不檢查牆。
//
// 奧客碰到主角或另一位奧客就停在碰到之前,不會把對方推開:
// - 被主角擋住時,站在原地等主角讓開。
// - 被另一位奧客擋住時掉頭往回走,兩位才不會在走道上面對面僵住。
import { PASSENGERS } from '../config.js'
import { OFFSETS } from './maze.js'
import { moveCircle, PLAYER_RADIUS } from './movement.js'

// 一次推進剩下不到這麼多秒時就算用完,浮點誤差留下的零頭不會讓迴圈多繞一圈
const TIME_EPSILON = 1e-9

/**
 * 在一局的迷宮裡放好奧客。
 *
 * random 是這一局的亂數產生器。它必須在迷宮、起點、門與字母都產生完之後才交給這裡,
 * 奧客用掉的亂數才不會改變這一局的配置。runSpeed 是主角跑步的速度,奧客的速度以它的倍數設定。
 *
 * 回傳的物件:
 * - `snapshot()`:每一位奧客的 `{ x, y, heading, state, hits }`,每次呼叫都是新的副本。
 * - `bodies()`:每一位奧客擋路用的圓 `{ x, y, radius }`,每次呼叫都是新的副本。
 * - `step(dt, player)`:讓每一位奧客走 dt 秒。player 是主角當下的位置。
 *   奧客依序一位一位走,後走的那一位看到的是先走的那一位走完之後的位置。
 */
export function createPassengers({ maze, start, random, runSpeed }) {
  const wanderSpeed = PASSENGERS.wanderSpeed * runSpeed
  const passengers = spawnCellsOf(maze, start, random).map((cell) => ({
    x: cell.col + 0.5,
    y: cell.row + 0.5,
    heading: 0,
    state: 'wandering',
    hits: 0,
    // 正走向哪一格的中央,以及剛離開哪一格的中央。兩者相同時,奧客還沒決定下一步往哪裡走
    target: cell,
    origin: cell,
    // 還要在原地站幾秒
    pause: 0,
  }))
  for (const passenger of passengers) arrive(passenger)

  // 奧客剛好站在 target 的中央:挑下一格、決定要不要先停一下,並轉向下一格
  function arrive(passenger) {
    const { target, origin } = passenger
    const openings = maze.openings(target)
    const ahead = openings.filter((side) => !isSameCell(stepOf(target, side), origin))
    const side = random.pick(ahead.length > 0 ? ahead : openings)
    passenger.origin = target
    passenger.target = stepOf(target, side)
    passenger.heading = headingOf(OFFSETS[side])
    if (random.float() < PASSENGERS.pauseChance) {
      const [shortest, longest] = PASSENGERS.pauseSeconds
      passenger.pause = shortest + random.float() * (longest - shortest)
    }
  }

  // 往回走向剛離開的那一格。還沒走出那一格的中央時,下一步就在原地重新挑一個方向,而且不會挑回擋住它的那一邊
  function turnBack(passenger) {
    const { target, origin } = passenger
    passenger.target = origin
    passenger.origin = target
    passenger.heading = headingOf({ col: origin.col - target.col, row: origin.row - target.row })
  }

  function advance(passenger, dt, { obstacles, playerBody }) {
    let time = dt
    while (time > TIME_EPSILON) {
      if (passenger.pause > 0) {
        const waited = Math.min(passenger.pause, time)
        passenger.pause -= waited
        time -= waited
        continue
      }
      const goal = centerOf(passenger.target)
      const remaining = Math.hypot(goal.x - passenger.x, goal.y - passenger.y)
      const reaches = remaining <= wanderSpeed * time
      const distance = reaches ? remaining : wanderSpeed * time
      if (distance > 0) {
        const moved = moveCircle(
          passenger,
          ((goal.x - passenger.x) / remaining) * distance,
          ((goal.y - passenger.y) / remaining) * distance,
          { radius: PASSENGERS.radius, obstacles },
        )
        passenger.x = moved.x
        passenger.y = moved.y
        if (moved.blocker !== null) {
          if (moved.blocker !== playerBody) turnBack(passenger)
          return
        }
      }
      if (!reaches) return
      // 消掉沿路累積的浮點誤差,奧客才會剛好站在格子中央
      passenger.x = goal.x
      passenger.y = goal.y
      time -= remaining / wanderSpeed
      arrive(passenger)
    }
  }

  const bodyOf = ({ x, y }) => ({ x, y, radius: PASSENGERS.radius })

  return {
    snapshot() {
      return passengers.map(({ x, y, heading, state, hits }) => ({ x, y, heading, state, hits }))
    },
    bodies() {
      return passengers.map(bodyOf)
    },
    step(dt, player) {
      const playerBody = { x: player.x, y: player.y, radius: PLAYER_RADIUS }
      for (const passenger of passengers) {
        const others = passengers.filter((other) => other !== passenger).map(bodyOf)
        advance(passenger, dt, { obstacles: [playerBody, ...others], playerBody })
      }
    },
  }
}

// 從沿著路徑離起點夠遠的格子裡隨機挑出每一位奧客開局的格子,兩位不會挑到同一格
function spawnCellsOf(maze, start, random) {
  const distances = pathDistancesFrom(maze, start)
  const candidates = []
  for (let row = 0; row < maze.size; row += 1) {
    for (let col = 0; col < maze.size; col += 1) {
      if (distances[row * maze.size + col] >= PASSENGERS.minStartDistance) candidates.push({ col, row })
    }
  }
  return random.shuffle(candidates).slice(0, PASSENGERS.count)
}

// 從 from 沿著迷宮的通道走到每一格要幾步,依 row * size + col 的順序排列
function pathDistancesFrom(maze, from) {
  const distances = new Array(maze.size * maze.size).fill(Infinity)
  distances[from.row * maze.size + from.col] = 0
  const queue = [from]
  while (queue.length > 0) {
    const cell = queue.shift()
    const distance = distances[cell.row * maze.size + cell.col]
    for (const side of maze.openings(cell)) {
      const next = stepOf(cell, side)
      const index = next.row * maze.size + next.col
      if (distances[index] === Infinity) {
        distances[index] = distance + 1
        queue.push(next)
      }
    }
  }
  return distances
}

function stepOf(cell, side) {
  return { col: cell.col + OFFSETS[side].col, row: cell.row + OFFSETS[side].row }
}

function centerOf({ col, row }) {
  return { x: col + 0.5, y: row + 0.5 }
}

// 朝 (col, row) 這個方向的朝向,與遊戲核心的慣例相同:0 朝北,從上方俯瞰時順時針增加
function headingOf({ col, row }) {
  return Math.atan2(col, -row)
}

function isSameCell(a, b) {
  return a.col === b.col && a.row === b.row
}
