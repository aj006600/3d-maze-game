// 狗在哪裡、朝哪裡:狗沿著主角走過的路線落後一小段,再往路線的一側偏出去,跑起來就在主角身邊。
// 狗不參與碰撞與任何規則,遊戲核心不知道狗的存在,所以這裡只讀主角的位置、朝向與這一局的牆。
//
// 狗一直待在主角的右手邊,因為主角的左手拉著登機箱。狗偏向路線的哪一側由主角的朝向決定:
// 往前跑時是行進方向的右側,倒退時是左側。主角原地轉身之後再跑,狗會落在路線的另一側,
// 這時狗從主角的前方繞到右手邊,不從主角背後繞過去,因為主角的左後方是登機箱。
//
// 狗不會穿牆,靠的是三件事:
// - 主角走過的路線本身不會穿牆。
// - 狗從路線上往旁邊偏出去時,以一個圓沿著牆滑動,碰到牆就停在牆前。
// - 狗追向該在的位置時,同樣以圓沿著牆滑動。
// 推離牆面的做法與遊戲核心推主角的做法相同,但用的是狗的半徑與世界座標。
// 遊戲核心對外只提供規則與狀態,碰撞是核心內部的實作,所以這裡自己做一份。
import { DOG_RADIUS } from './dogFigure.js'
import { MIN_RUN_SPEED } from './lowPolyFigure.js'
import { CELL_SIZE, footprintOf } from './mazeScene.js'

// 以下距離的單位都與世界座標相同。
// 狗落後主角多遠,沿著主角走過的路線量。它要很小:主角背後有牆時鏡頭會拉近主角,
// 落後的狗離鏡頭比主角近,落後太多就會掉到畫面底下
const FOLLOW_LAG = 0.15
// 狗偏離主角的路線多遠。它要大於人的半個肩寬加上狗的半個身寬,人和狗並排跑時身體才不會重疊
const SIDE_OFFSET = 0.9
// 狗剛站到主角身邊時,比主角往前站多遠。主角背後就是牆時鏡頭會拉近,站在主角後方的狗會落到畫面底下
const START_LEAD = 0.4
// 狗那一側被牆完全擋住時,狗改成落後這麼遠,排在主角後面跑。
// 狗擠不到旁邊時若仍只落後 FOLLOW_LAG,狗的頭會插進主角的身體裡
const SQUEEZED_LAG = 1
// 狗的中心與主角的中心至少保持這個距離。它是狗的半徑加上主角背部的厚度,狗面朝主角時頭也不會插進主角的身體
const PERSONAL_SPACE = 0.6
// 沿牆滑動時每一小步的位移上限。它小於狗的半徑,圓心就不會一步跨進牆裡,往外推時也不會推錯邊
const MAX_STEP = DOG_RADIUS / 2
// 主角每走這麼遠,就在路線上記下一個點
const TRAIL_SPACING = 0.1
// 主角在狗附近的行進方向,取主角當下的位置與路線上這麼遠以前的那一點連線
const DIRECTION_SPAN = 1
// 上面那條連線短於這個長度時算不出可靠的方向,例如主角原地折返的那一下,這時沿用上一個方向
const MIN_DIRECTION_LENGTH = 0.05
// 路線只留下算狗的位置與方向用得到的那一段
const TRAIL_LENGTH = Math.max(DIRECTION_SPAN, SQUEEZED_LAG)
// 主角每跑一單位距離,狗認定的行進方向最多轉幾弧度。行進方向一下子轉太多,偏出去的狗就會被甩到很遠的地方
const SWING_PER_DISTANCE = 1.5
// 狗每一幀最多移動主角這一幀跑的距離的幾倍。它要大於狗該在的位置平常跟著主角移動的倍數,狗平常才追得上。
// 狗該在的位置偶爾會跳一下,例如繞過牆角的方式改變時;有了這個上限,狗會在接下來幾幀追上去,而不是瞬間移動
const CATCH_UP = 2.5
// 正常跑一幀只會走幾分之一格,一幀之內移動超過半格就是被傳送了。舊的路線接不上新的位置,狗重新站到主角身邊
const JUMP_DISTANCE = CELL_SIZE / 2
// 狗平常離該在的位置不到一個身長。離了半格以上,代表狗被牆卡在另一邊、直線追不回來,這時狗重新站到主角身邊
const LOST_DISTANCE = CELL_SIZE / 2
// 狗轉向的速度,這個值越大轉得越快
const TURN_RATE = 10
// 行進方向與主角朝向夾角的 cos,絕對值小於這個值時分不出主角是往前還是倒退,例如主角橫移時,這時狗留在原本那一側
const SIDE_DECISION = 0.3
// 狗換到主角右手邊時,先追向主角前方這麼遠的地方。它大於 PERSONAL_SPACE,狗才是從主角面前經過
const CROSS_LEAD = 0.9

/**
 * 依主角走過的路線,每一幀決定狗的位置與朝向。
 *
 * 狗會避開這一局的牆。牆在建立時讀一次。牆變了之後(例如門打開)要呼叫 `refreshWalls()` 重新讀,
 * 否則狗仍會被舊的牆擋住。
 *
 * 每一幀呼叫 `follow(playerPosition, playerHeading, dt)`:
 * - playerPosition 是主角在世界座標地面上的 `{ x, z }`。
 * - playerHeading 是主角的朝向。狗待在這個朝向的右手邊,重新站到主角身邊時也用它決定站在哪裡、面向哪裡。
 * - dt 是距離上一幀經過幾秒。
 *
 * 回傳 `{ position, heading, distance }`:狗在世界座標地面上的位置、狗的朝向(與遊戲核心的朝向同一個慣例),
 * 以及這一幀狗移動了多遠。狗移動多少只看主角跑了多遠、不看時間,所以主角停下時狗也停下,主角原地轉向時狗不動。
 *
 * 第一次呼叫、主角被傳送到別處,以及狗被牆卡住追不上時,狗會直接站到主角的右前方,那一幀的 distance 是 0。
 */
export function createDogFollower(game) {
  const readWalls = () => game.walls.map((wall) => footprintOf(game.maze, wall))
  let walls = readWalls()
  // 主角走過的路線,最舊的點在前面
  let trail = []
  // 狗在路線的哪一側:1 是行進方向的右側,-1 是左側。由主角的朝向決定,狗才會在主角的右手邊
  let side = 1
  // 狗認定的行進方向,是單位向量
  let direction = { x: 0, z: -1 }
  let heading = 0
  let position = null
  let lastPlayer = null

  // 剛開始還沒有走過的路線,就當作主角是從正後方一路跑過來的。狗先站在主角的右前方,主角跑起來後再退到平常的位置
  function restart(player, playerHeading) {
    direction = forwardOf(playerHeading)
    const behind = { x: player.x - direction.x * TRAIL_LENGTH, z: player.z - direction.z * TRAIL_LENGTH }
    trail = [slide(walls, player, behind), { ...player }]
    side = 1
    heading = playerHeading
    const right = rightOf(direction)
    position = slide(walls, player, {
      x: player.x + right.x * SIDE_OFFSET + direction.x * START_LEAD,
      z: player.z + right.z * SIDE_OFFSET + direction.z * START_LEAD,
    })
    lastPlayer = { ...player }
  }

  function record(player) {
    const latest = trail.at(-1)
    if (distanceBetween(player, latest) >= TRAIL_SPACING) trail.push({ ...player })
    let total = 0
    let from = player
    for (let i = trail.length - 1; i >= 0; i -= 1) {
      total += distanceBetween(from, trail[i])
      if (total >= TRAIL_LENGTH) {
        trail.splice(0, i)
        return
      }
      from = trail[i]
    }
  }

  // 從主角當下的位置沿著走過的路線往回走 distance,路線不夠長時停在最舊的那一點
  function pointBehind(player, distance) {
    let remaining = distance
    let from = player
    for (let i = trail.length - 1; i >= 0; i -= 1) {
      const to = trail[i]
      const length = distanceBetween(from, to)
      if (length >= remaining) return stepToward(from, to, remaining)
      remaining -= length
      from = to
    }
    return { ...from }
  }

  // travelled 是主角這一幀跑了多遠,決定方向這一幀最多能轉多少
  function updateDirection(player, travelled) {
    const back = pointBehind(player, DIRECTION_SPAN)
    const dx = player.x - back.x
    const dz = player.z - back.z
    const length = Math.hypot(dx, dz)
    if (length < MIN_DIRECTION_LENGTH) return
    const target = { x: dx / length, z: dz / length }
    // 行進方向轉了超過九十度,例如主角往回跑時,把方向反過來,接著只需要轉不到九十度。
    // 方向不反過來的話,狗認定的行進方向會慢慢轉半圈,偏出去的狗會被甩到很遠的地方
    if (target.x * direction.x + target.z * direction.z < 0) direction = { x: -direction.x, z: -direction.z }
    const angle = Math.atan2(
      direction.x * target.z - direction.z * target.x,
      direction.x * target.x + direction.z * target.z,
    )
    const limit = SWING_PER_DISTANCE * travelled
    const turn = Math.min(Math.max(angle, -limit), limit)
    const cos = Math.cos(turn)
    const sin = Math.sin(turn)
    direction = { x: direction.x * cos - direction.z * sin, z: direction.x * sin + direction.z * cos }
  }

  // 行進方向與主角的朝向同向是往前跑,狗在行進方向的右側;反向是倒退,狗在左側。兩種都是主角的右手邊
  function updateSide(playerHeading) {
    const forward = forwardOf(playerHeading)
    const along = direction.x * forward.x + direction.z * forward.z
    if (Math.abs(along) > SIDE_DECISION) side = Math.sign(along)
  }

  // 狗明顯落在路線的另一側,也就是和該在的那一側隔著主角走的路線,例如主角原地轉身之後
  function isAcross(player) {
    const right = rightOf(direction)
    const offset = ((position.x - player.x) * right.x + (position.z - player.z) * right.z) * side
    return offset < -SIDE_OFFSET / 2
  }

  // 狗該在的位置:從路線上落後的那一點往旁邊偏出去,碰到牆就停在牆前。
  // 旁邊被牆擋住多少,狗就多落後多少,擋到完全偏不出去時改成排在主角後面
  function spotFor(player) {
    const right = rightOf(direction)
    const outward = { x: right.x * side, z: right.z * side }
    const spotAt = (lag) => {
      const anchor = pointBehind(player, lag)
      const spot = slide(walls, anchor, {
        x: anchor.x + outward.x * SIDE_OFFSET,
        z: anchor.z + outward.z * SIDE_OFFSET,
      })
      const reach = (spot.x - anchor.x) * outward.x + (spot.z - anchor.z) * outward.z
      return { spot, blocked: Math.min(Math.max(1 - reach / SIDE_OFFSET, 0), 1) }
    }
    const beside = spotAt(FOLLOW_LAG)
    if (beside.blocked === 0) return beside.spot
    return spotAt(FOLLOW_LAG + (SQUEEZED_LAG - FOLLOW_LAG) * beside.blocked).spot
  }

  return {
    refreshWalls() {
      walls = readWalls()
    },
    follow(player, playerHeading, dt) {
      const latest = trail.at(-1)
      if (!latest || distanceBetween(player, latest) > JUMP_DISTANCE) restart(player, playerHeading)
      record(player)
      const travelled = distanceBetween(player, lastPlayer)
      lastPlayer = { ...player }
      updateDirection(player, travelled)
      updateSide(playerHeading)

      const spot = spotFor(player)
      if (distanceBetween(position, spot) > LOST_DISTANCE) {
        restart(player, playerHeading)
        return { position: { ...position }, heading, distance: 0 }
      }
      const budget = CATCH_UP * travelled
      const ahead = forwardOf(playerHeading)
      const goal = isAcross(player) ? { x: player.x + ahead.x * CROSS_LEAD, z: player.z + ahead.z * CROSS_LEAD } : spot
      // 追的時候繞過主角的身體,不從主角身上穿過去,例如主角背貼著牆往回跑時
      const chase = keepAwayFrom(player, stepToward(position, goal, budget))
      const next = slide(walls, position, stepToward(position, chase, budget))
      const distance = distanceBetween(position, next)
      // 跑動的門檻與跑步動作相同。移動量太小時算出來的方向沒有意義
      if (dt > 0 && distance > MIN_RUN_SPEED * dt) {
        // 狗面向自己跑的方向。朝向 0 是 -z,從上方俯瞰時順時針增加
        const target = Math.atan2(next.x - position.x, -(next.z - position.z))
        heading += wrapAngle(target - heading) * (1 - Math.exp(-TURN_RATE * dt))
      }
      position = next
      return { position: { ...next }, heading, distance }
    },
  }
}

// 讓半徑為狗的半徑的圓從 from 朝 to 移動,回傳停下的位置。碰到牆時只保留沿著牆面的那一段移動
function slide(walls, from, to) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_STEP))
  const point = { x: from.x, z: from.z }
  for (let i = 0; i < steps; i += 1) {
    point.x += dx / steps
    point.z += dz / steps
    for (const wall of walls) pushOutOf(wall, point)
  }
  return point
}

// 圓與長方形重疊時,把圓心沿著離長方形最近的那一點往外推,推到剛好碰到為止
function pushOutOf(wall, point) {
  const nearestX = Math.min(Math.max(point.x, wall.minX), wall.maxX)
  const nearestZ = Math.min(Math.max(point.z, wall.minZ), wall.maxZ)
  const offsetX = point.x - nearestX
  const offsetZ = point.z - nearestZ
  const distance = Math.hypot(offsetX, offsetZ)
  // 距離是 0 代表圓心已經在牆裡,推不出方向。主角走過的路線不在牆裡,每一小步又比半徑短,所以不會走到這裡
  if (distance >= DOG_RADIUS || distance === 0) return
  point.x = nearestX + (offsetX / distance) * DOG_RADIUS
  point.z = nearestZ + (offsetZ / distance) * DOG_RADIUS
}

// point 離 center 不到 PERSONAL_SPACE 時,沿著從 center 往外的方向推到剛好 PERSONAL_SPACE
function keepAwayFrom(center, point) {
  const length = distanceBetween(center, point)
  if (length >= PERSONAL_SPACE || length === 0) return point
  const scale = PERSONAL_SPACE / length
  return { x: center.x + (point.x - center.x) * scale, z: center.z + (point.z - center.z) * scale }
}

// 朝向 heading 的單位向量。朝向 0 是 -z,從上方俯瞰時順時針增加
function forwardOf(heading) {
  return { x: Math.sin(heading), z: -Math.cos(heading) }
}

// 從上方俯瞰,方向 (x, z) 的右側是 (-z, x)
function rightOf({ x, z }) {
  return { x: -z, z: x }
}

// 從 from 朝 to 走,最多走 limit,回傳走到的位置
function stepToward(from, to, limit) {
  const length = distanceBetween(from, to)
  if (length <= limit) return { ...to }
  const t = limit / length
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t }
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

// 把角度換算到 -π 到 π 之間,轉向時才會走比較近的那一邊
function wrapAngle(angle) {
  return angle - Math.PI * 2 * Math.round(angle / (Math.PI * 2))
}
