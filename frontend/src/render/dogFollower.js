// 狗在哪裡、朝哪裡:狗沿著主角走過的路線落後一小段,再往路線的一側偏出去,跑起來就在主角身邊。
// 狗不參與碰撞與任何規則,遊戲核心不知道狗的存在,所以這裡只讀主角的位置與這一局的牆。
//
// 狗不會穿牆,靠的是三件事:
// - 主角走過的路線本身不會穿牆。
// - 狗從路線上往旁邊偏出去時,以一個圓沿著牆滑動,碰到牆就停在牆前。
// - 狗追向該在的位置時,同樣以圓沿著牆滑動。
// 推離牆面的做法與遊戲核心推主角的做法相同,但半徑是狗的半徑;狗不屬於遊戲核心,所以不借用核心的碰撞。
import { CELL_SIZE, toWorld } from './mazeScene.js'

// 以下距離的單位都與世界座標相同。
// 狗落後主角多遠,沿著主角走過的路線量。落後一點,轉彎時狗才會繞著主角跑過的地方轉,而不是直接切過牆角
const FOLLOW_LAG = 0.3
// 狗偏離主角的路線多遠。它要大於人的半個肩寬加上狗的半個身寬,人和狗並排跑時身體才不會重疊
const SIDE_OFFSET = 0.9
// 狗剛站到主角身邊時,比主角往前站多遠。主角背後就是牆時鏡頭會拉近,站在主角後方的狗會落到畫面底下
const START_LEAD = 0.4
// 狗那一側被牆完全擋住時,狗改成落後這麼遠,排在主角後面跑。
// 狗擠不到旁邊時若仍只落後 FOLLOW_LAG,狗的頭會插進主角的身體裡
const SQUEEZED_LAG = 1
// 狗的鼻尖到尾巴尖都在狗的原點這個距離以內,狗的中心離牆至少這麼遠
const DOG_RADIUS = 0.45
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
// 狗轉向的速度,這個值越大轉得越快
const TURN_RATE = 10
// 狗每秒移動低於這個距離時不轉向。移動量太小時算出來的方向沒有意義
const MIN_TURN_SPEED = 0.5

/**
 * 建立跟著主角跑的狗的位置,會避開這一局的牆。牆只在建立時讀一次。
 *
 * 每一幀呼叫 `follow(playerPosition, playerHeading, dt)`:
 * - playerPosition 是主角在世界座標地面上的 `{ x, z }`。
 * - playerHeading 是主角的朝向,只在狗重新站到主角身邊時用來決定狗站在哪裡、面向哪裡。
 * - dt 是距離上一幀經過幾秒。
 *
 * 回傳 `{ position, heading, distance }`:狗在世界座標地面上的位置、狗的朝向(與遊戲核心的朝向同一個慣例),
 * 以及這一幀狗移動了多遠。狗移動多少只看主角跑了多遠、不看時間,所以主角停下時狗也停下,主角原地轉向時狗不動。
 *
 * 第一次呼叫,以及主角被傳送到別處時,狗會直接站到主角的右前方,那一幀的 distance 是 0。
 */
export function createDogFollower(game) {
  const walls = game.walls.map((wall) => footprintOf(game.maze, wall))
  // 主角走過的路線,最舊的點在前面
  let trail = []
  // 狗在路線的哪一側:1 是行進方向的右側,-1 是左側
  let side = 1
  // 狗認定的行進方向,是單位向量
  let direction = { x: 0, z: -1 }
  let heading = 0
  let position = null
  let lastPlayer = null

  // 剛開始還沒有走過的路線,就當作主角是從正後方一路跑過來的。狗先站在主角的右前方,主角跑起來後再退到平常的位置
  function restart(player, playerHeading) {
    direction = { x: Math.sin(playerHeading), z: -Math.cos(playerHeading) }
    const behind = { x: player.x - direction.x * TRAIL_LENGTH, z: player.z - direction.z * TRAIL_LENGTH }
    trail = [slide(walls, player, behind), { ...player }]
    side = 1
    heading = playerHeading
    position = slide(walls, player, {
      x: player.x - direction.z * SIDE_OFFSET + direction.x * START_LEAD,
      z: player.z + direction.x * SIDE_OFFSET + direction.z * START_LEAD,
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
    // 行進方向轉了超過九十度,例如主角往回跑時,把方向反過來並讓狗換到行進方向的另一側。
    // 兩者一起反過來,狗偏出去的位置不變,接著只需要轉不到九十度,狗在地面上仍留在路線的同一邊
    if (target.x * direction.x + target.z * direction.z < 0) {
      side = -side
      direction = { x: -direction.x, z: -direction.z }
    }
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

  // 狗該在的位置:從路線上落後的那一點往旁邊偏出去,碰到牆就停在牆前。
  // 旁邊被牆擋住多少,狗就多落後多少,擋到完全偏不出去時改成排在主角後面
  function spotFor(player) {
    // 從上方俯瞰,行進方向 (x, z) 的右側是 (-z, x)
    const outward = { x: -direction.z * side, z: direction.x * side }
    const spotAt = (lag) => {
      const anchor = pointBehind(player, lag)
      const spot = slide(walls, anchor, { x: anchor.x + outward.x * SIDE_OFFSET, z: anchor.z + outward.z * SIDE_OFFSET })
      const reach = (spot.x - anchor.x) * outward.x + (spot.z - anchor.z) * outward.z
      return { spot, blocked: Math.min(Math.max(1 - reach / SIDE_OFFSET, 0), 1) }
    }
    const beside = spotAt(FOLLOW_LAG)
    if (beside.blocked === 0) return beside.spot
    return spotAt(FOLLOW_LAG + (SQUEEZED_LAG - FOLLOW_LAG) * beside.blocked).spot
  }

  return {
    follow(player, playerHeading, dt) {
      const latest = trail.at(-1)
      if (!latest || distanceBetween(player, latest) > JUMP_DISTANCE) restart(player, playerHeading)
      record(player)
      const travelled = distanceBetween(player, lastPlayer)
      lastPlayer = { ...player }
      updateDirection(player, travelled)

      const spot = spotFor(player)
      const next = slide(walls, position, stepToward(position, spot, CATCH_UP * travelled))
      const distance = distanceBetween(position, next)
      if (dt > 0 && distance > MIN_TURN_SPEED * dt) {
        // 狗面向自己跑的方向。朝向 0 是 -z,從上方俯瞰時順時針增加
        const target = Math.atan2(next.x - position.x, -(next.z - position.z))
        heading += wrapAngle(target - heading) * (1 - Math.exp(-TURN_RATE * dt))
      }
      position = next
      return { position: { ...next }, heading, distance }
    },
  }
}

// 一段牆在世界座標地面上佔據的長方形
function footprintOf(maze, { minX, maxX, minY, maxY }) {
  const min = toWorld(maze, { x: minX, y: minY })
  const max = toWorld(maze, { x: maxX, y: maxY })
  return { minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z }
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
