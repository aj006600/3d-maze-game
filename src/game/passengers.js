// 奧客:開局時站在哪裡、怎麼遊蕩、什麼時候發現主角、怎麼追趕,他們與牆、主角、彼此之間的碰撞,
// 以及被揮擊打中之後的硬直、擊倒與重生。
// 奧客只由每一次推進帶動,經過的時間就是推進的秒數,不讀時鐘;用到的隨機全部來自這一局的亂數產生器。
//
// 遊蕩的奧客沿著格子中央的連線一格一格走:每走到一格的中央,就從來路以外的開口隨機挑一個走出去,
// 走進角落就只能原路退出;偶爾在格子中央停下來站一會兒。奧客只穿過迷宮裡的通道,門不是通道,
// 所以門打開之後奧客也不會走出迷宮。
//
// 遊蕩的奧客看到主角就發現主角,從此一直追趕。追趕的奧客沿著迷宮裡通往主角的那條路,一格一格走向下一格的中央;
// 走到與主角同一格或隔壁那一格時,改成直接朝主角當下的位置靠過去,主角往走道的一側閃時,他也跟著偏過去。
//
// 格子中央的連線離兩側的牆都是半個走道寬,奧客的碰撞半徑比它小,所以走在連線上的奧客碰不到牆。
// 遊蕩的奧客一直走在連線上,移動時就不檢查牆。追趕的奧客朝主角靠過去時會離開連線,所以移動時要對牆做碰撞。
//
// 奧客碰到主角或另一位奧客就停在碰到之前,不會把對方推開:
// - 被主角擋住時,站在原地等主角讓開。
// - 遊蕩時被另一位奧客擋住,就掉頭往回走,兩位才不會在走道上面對面僵住。
// - 追趕時被另一位奧客擋住,就站在原地等。
//
// 被打中的奧客停在原地硬直一會兒,之後追趕主角。累計被打中的次數夠多就倒地:倒地的奧客不擋路,
// 躺一會兒就消失,等到重生的時間到了,再找一格主角看不到的地方重新出現,回到遊蕩。
import { PASSENGERS, SWING_HIT } from '../config.js'
import { cellOf, isInside, isSameCell, OFFSETS, stepOf } from './maze.js'
import { moveCircle, PLAYER_RADIUS, WALL_THICKNESS } from './movement.js'

// 一次推進剩下不到這麼多秒時就算用完,浮點誤差留下的零頭不會讓迴圈多繞一圈
const TIME_EPSILON = 1e-9
// 實際走到的位置與原本要走到的位置相差不到這麼多時,就算沒有被牆推開
const POSITION_EPSILON = 1e-9
// 奧客的身體離走道兩側的牆各還有多少空隙。偏離格子中央的連線不超過它時,沿著連線往前走也碰不到牆
const LANE_SLACK = (1 - WALL_THICKNESS) / 2 - PASSENGERS.radius

/**
 * 在一局的迷宮裡放好奧客。
 *
 * random 是這一局擺放字母用的亂數產生器,奧客開局的位置、遊蕩與重生都從它抽。
 * 它必須在字母擺好之後才交給這裡,奧客用掉的亂數才不會改變字母的擺放。
 * runSpeed 是主角跑步的速度,奧客的速度以它的倍數設定。
 *
 * 回傳的物件:
 * - `snapshot()`:每一位奧客的 `{ x, y, heading, state, hits }`,每次呼叫都是新的副本。各狀態的意思見遊戲核心的 `passengers`。
 * - `bodies()`:每一位擋路的奧客的圓 `{ x, y, radius }`,每次呼叫都是新的副本。倒地與等待重生的奧客不在裡面。
 * - `strike(player)`:主角揮擊打中的那一刻呼叫,player 是主角當下的 `{ x, y, heading }`。
 *   範圍內每一位還站著的奧客都被打中一次。
 * - `step(dt, player, walls)`:讓每一位奧客走 dt 秒。player 是主角當下的位置,walls 是當下擋路的每一段牆。
 *   奧客依序一位一位走,後走的那一位看到的是先走的那一位走完之後的位置。
 *   主角不在迷宮裡時(例如被傳送到迷宮外),追趕的奧客找不到路,就站在原地。
 *   硬直、倒地與等待重生的計時也只在這裡累加。
 */
export function createPassengers({ maze, start, random, runSpeed }) {
  const wanderSpeed = PASSENGERS.wanderSpeed * runSpeed
  const chaseSpeed = PASSENGERS.chaseSpeed * runSpeed
  const passengers = spawnCellsOf(maze, start, random).map(standingAt)
  for (const passenger of passengers) arrive(passenger)

  // 奧客剛好站在 target 的中央時呼叫。它做三件事:
  // - 挑下一格。
  // - 轉向下一格。
  // - 決定要不要先在原地站一會兒。
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

  function wander(passenger, dt, { obstacles, playerBody }) {
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

  // 追趕的奧客接下來要直直走向哪一點。主角不在迷宮裡時沒有路可走,回傳 null。
  // 下列兩種情形可以直直走向下一格,其餘時候先回到這一格的中央,奧客才不會斜著切過轉角、貼著牆角慢慢磨:
  // - 偏離這一格到下一格的連線不超過 LANE_SLACK。
  // - 已經越過這一格的中央,往下一格走了一段。
  // 第二種情形只算越過中央超過 LANE_SLACK 的:沿著前一段連線走時,奧客可能被牆推得偏離連線這麼多,
  // 轉直角時這段偏移不能當成已經往下一格走了
  function chaseGoalOf(passenger, player, distances) {
    if (distances === null) return null
    const cell = cellOf(passenger)
    const playerCell = cellOf(player)
    if (isSameCell(cell, playerCell)) return player
    const here = distances[cellIndexOf(cell)]
    const next = maze
      .openings(cell)
      .map((side) => stepOf(cell, side))
      .find((neighbor) => distances[cellIndexOf(neighbor)] === here - 1)
    const center = centerOf(cell)
    const axis = { x: next.col - cell.col, y: next.row - cell.row }
    const offset = { x: passenger.x - center.x, y: passenger.y - center.y }
    const along = offset.x * axis.x + offset.y * axis.y
    const across = Math.abs(offset.x * axis.y - offset.y * axis.x)
    if (across > LANE_SLACK + POSITION_EPSILON && along <= LANE_SLACK + POSITION_EPSILON) return center
    return isSameCell(next, playerCell) ? player : centerOf(next)
  }

  function chase(passenger, dt, { obstacles, player, walls, distances }) {
    let time = dt
    while (time > TIME_EPSILON) {
      const goal = chaseGoalOf(passenger, player, distances)
      if (goal === null) return
      const remaining = Math.hypot(goal.x - passenger.x, goal.y - passenger.y)
      if (remaining === 0) return
      const distance = Math.min(remaining, chaseSpeed * time)
      const dx = ((goal.x - passenger.x) / remaining) * distance
      const dy = ((goal.y - passenger.y) / remaining) * distance
      const intended = { x: passenger.x + dx, y: passenger.y + dy }
      const moved = moveCircle(passenger, dx, dy, { radius: PASSENGERS.radius, walls, obstacles })
      // 朝向是最後一次真的有移動時的方向,所以被擋住、站在原地時,他仍然面向剛才走過來的方向
      if (moved.x !== passenger.x || moved.y !== passenger.y) passenger.heading = headingOf({ col: dx, row: dy })
      passenger.x = moved.x
      passenger.y = moved.y
      // 被身體擋住,或被牆推離了原本要走到的地方,這一次推進就停在這裡。
      // 被牆推開時剩下的時間直接丟掉:否則一直被同一面牆推回來的奧客會在這裡繞上無數圈
      if (moved.blocker !== null) return
      if (Math.hypot(moved.x - intended.x, moved.y - intended.y) > POSITION_EPSILON) return
      time -= distance / chaseSpeed
      if (distance === remaining) {
        // 消掉沿路累積的浮點誤差,奧客才會剛好站在格子中央
        passenger.x = goal.x
        passenger.y = goal.y
      }
    }
  }

  // 讓等待重生的奧客在一格的中央重新出現,回到遊蕩,被打中的次數歸零。那一格要同時符合三件事:
  // - 沿著迷宮的路徑離主角所在的格子夠遠。主角不在迷宮裡時,每一格都算夠遠。
  // - 主角與那一格中央的連線被牆擋住,主角當下看不到他。
  // - 他站在那裡不會與另一位奧客的身體疊在一起。另一位奧客在那一格裡的話,兩人一定會疊在一起。
  // 倒地的另一位雖然不擋路,也算在裡面,重生的奧客才不會出現在躺著的人身上。
  // 找不到這樣的格子時繼續等待,下一次推進再找
  function respawn(passenger, player, walls, distances) {
    const others = passengers.filter((other) => other !== passenger && other.state !== 'gone')
    const candidates = []
    for (let row = 0; row < maze.size; row += 1) {
      for (let col = 0; col < maze.size; col += 1) {
        const cell = { col, row }
        const center = centerOf(cell)
        if (distances !== null && distances[cellIndexOf(cell)] < PASSENGERS.minRespawnDistance) continue
        if (!walls.some((wall) => crossesRect(player, center, wall))) continue
        if (others.some((other) => Math.hypot(other.x - center.x, other.y - center.y) < 2 * PASSENGERS.radius)) continue
        candidates.push(cell)
      }
    }
    if (candidates.length === 0) return
    const cell = random.pick(candidates)
    Object.assign(passenger, standingAt(cell))
    arrive(passenger)
  }

  function cellIndexOf({ col, row }) {
    return row * maze.size + col
  }

  // 從主角所在的那一格沿著迷宮的通道走到每一格要幾步,以 cellIndexOf 為索引;主角不在迷宮裡時是 null。
  // 迷宮的通道整局不變,所以主角換到另一格時才重算
  let cachedFrom = null
  let cachedDistances = null
  function distancesToPlayer(player) {
    if (!isInside(maze, player)) return null
    const from = cellOf(player)
    if (cachedFrom === null || !isSameCell(from, cachedFrom)) {
      cachedFrom = from
      cachedDistances = []
      for (const { cell, distance } of pathDistancesFrom(maze, from)) cachedDistances[cellIndexOf(cell)] = distance
    }
    return cachedDistances
  }

  return {
    snapshot() {
      return passengers.map(({ x, y, heading, state, hits }) => ({ x, y, heading, state, hits }))
    },
    bodies() {
      return passengers.filter(isStanding).map((passenger) => bodyOf(passenger, PASSENGERS.radius))
    },
    strike(player) {
      for (const passenger of passengers) {
        if (!isStanding(passenger) || !inReach(player, passenger)) continue
        passenger.hits += 1
        passenger.state = passenger.hits >= PASSENGERS.knockDownHits ? 'down' : 'staggered'
        passenger.timer = 0
      }
    },
    step(dt, player, walls) {
      const playerBody = bodyOf(player, PLAYER_RADIUS)
      // 主角在這一次推進裡不會動,所以通往主角的路只要查一次
      const distances = distancesToPlayer(player)
      for (const passenger of passengers) {
        if (!isStanding(passenger)) {
          // 重生的秒數從倒地的那一刻算起,所以消失之後也接著累加
          passenger.timer += dt
          if (passenger.timer >= PASSENGERS.downSeconds) passenger.state = 'gone'
          if (passenger.timer >= PASSENGERS.respawnSeconds) respawn(passenger, player, walls, distances)
          continue
        }
        if (passenger.state === 'staggered') {
          passenger.timer += dt
          // 被打中就等於發現了主角,所以硬直結束後一律追趕,打中時還在遊蕩的也一樣
          if (passenger.timer >= PASSENGERS.staggerSeconds) passenger.state = 'chasing'
          continue
        }
        if (passenger.state === 'wandering' && sees(passenger, player, walls)) passenger.state = 'chasing'
        const others = passengers
          .filter((other) => other !== passenger && isStanding(other))
          .map((other) => bodyOf(other, PASSENGERS.radius))
        const obstacles = [playerBody, ...others]
        if (passenger.state === 'chasing') chase(passenger, dt, { obstacles, player, walls, distances })
        else wander(passenger, dt, { obstacles, playerBody })
      }
    },
  }
}

// 從沿著路徑離起點夠遠的格子裡隨機挑出每一位奧客開局的格子,兩位不會挑到同一格
function spawnCellsOf(maze, start, random) {
  const candidates = pathDistancesFrom(maze, start)
    .filter(({ distance }) => distance >= PASSENGERS.minStartDistance)
    .map(({ cell }) => cell)
  return random.shuffle(candidates).slice(0, PASSENGERS.count)
}

// 從 from 沿著迷宮的通道走到每一格要幾步。回傳每一格的 `{ cell, distance }`,依離 from 由近到遠排列
function pathDistancesFrom(maze, from) {
  const reached = [{ cell: from, previous: null, distance: 0 }]
  for (let i = 0; i < reached.length; i += 1) {
    const { cell, previous, distance } = reached[i]
    for (const side of maze.openings(cell)) {
      const next = stepOf(cell, side)
      // 迷宮沒有迴圈,所以只要不走回剛離開的那一格,就不會走到已經走過的格子
      if (previous === null || !isSameCell(next, previous))
        reached.push({ cell: next, previous: cell, distance: distance + 1 })
    }
  }
  return reached
}

// 奧客看不看得到主角:直線距離夠近,而且兩者中心的連線沒有碰到任何一段牆。奧客面向哪裡都一樣
function sees(passenger, player, walls) {
  if (Math.hypot(player.x - passenger.x, player.y - passenger.y) > PASSENGERS.discoverDistance) return false
  return !walls.some((wall) => crossesRect(passenger, player, wall))
}

// 剛出現在 cell 中央的奧客:在遊蕩,還沒被打中過,也還沒決定下一步往哪裡走。開局與重生都從這個樣子開始
function standingAt(cell) {
  return {
    ...centerOf(cell),
    heading: 0,
    state: 'wandering',
    hits: 0,
    // 遊蕩時正走向哪一格的中央,以及剛離開哪一格的中央。兩者相同時,奧客還沒決定下一步往哪裡走
    target: cell,
    origin: cell,
    // 遊蕩時還要在原地站幾秒
    pause: 0,
    // 硬直時是這次硬直已經過了幾秒;倒地與等待重生時是倒地之後已經過了幾秒
    timer: 0,
  }
}

// 奧客是不是站在迷宮裡。倒地與等待重生的奧客不擋路,也不會被打中
function isStanding({ state }) {
  return state !== 'down' && state !== 'gone'
}

// 主角揮擊時打不打得到奧客:兩者中心的距離夠近,而且奧客偏離主角正前方的角度夠小。
// 兩者的中心重疊時,奧客不論在哪個方向都算打得到
function inReach(player, passenger) {
  const dx = passenger.x - player.x
  const dy = passenger.y - player.y
  const distance = Math.hypot(dx, dy)
  if (distance > SWING_HIT.reach) return false
  // 沿著主角的朝向量,奧客在主角前方多遠。朝向的慣例是 0 朝北、順時針增加,所以正前方是 (sin, -cos)
  const ahead = dx * Math.sin(player.heading) - dy * Math.cos(player.heading)
  return ahead >= distance * Math.cos(SWING_HIT.halfAngle)
}

// 從 from 到 to 的線段有沒有碰到長方形,剛好擦過邊也算
function crossesRect(from, to, { minX, maxX, minY, maxY }) {
  // 線段上的點是 from + t (to - from),t 從 0 到 1;兩個軸各自算出線段落在長方形範圍內的那一段 t,兩段有交集就是碰到
  let enter = 0
  let exit = 1
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, minX, maxX],
    [from.y, to.y - from.y, minY, maxY],
  ]) {
    if (delta === 0) {
      if (start < min || start > max) return false
      continue
    }
    const first = (min - start) / delta
    const second = (max - start) / delta
    enter = Math.max(enter, Math.min(first, second))
    exit = Math.min(exit, Math.max(first, second))
  }
  return enter <= exit
}

// 擋路用的圓:圓心在 `{ x, y }`,半徑是 radius
function bodyOf({ x, y }, radius) {
  return { x, y, radius }
}

function centerOf({ col, row }) {
  return { x: col + 0.5, y: row + 0.5 }
}

// 朝 (col, row) 這個方向的朝向,與遊戲核心的慣例相同:0 朝北,從上方俯瞰時順時針增加
function headingOf({ col, row }) {
  return Math.atan2(col, -row)
}
