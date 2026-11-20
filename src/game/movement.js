// 主角與奧客在平面上的移動與碰撞:每個會動的身體都是一個圓,每一段牆是沿著格線立起、帶厚度的長方形。
// 座標以格為單位:x 往東、y 往南,格子 (col, row) 涵蓋 col ≤ x < col + 1;牆的中心線就是格線。
import { OFFSETS, SIDES } from './maze.js'

/** 牆的厚度,以格為單位。畫面上的牆要用同一個厚度,看起來才會與碰撞一致。 */
export const WALL_THICKNESS = 0.15
/** 主角的碰撞半徑,以格為單位。它要蓋住人的手臂,貼著牆跑時手臂才不會插進牆裡。 */
export const PLAYER_RADIUS = 0.12
// 每一小步的位移上限。它小於任何一個身體的半徑,所以:
// - 圓心不會一步跨進牆裡,往外推時也不會推錯邊。
// - 圓心不會一步跨到另一個身體的圓心上,往外推時才有方向可推。
const MAX_STEP = PLAYER_RADIUS / 2
// 兩個圓重疊不到這麼多時不算重疊。推開之後的位置帶著浮點誤差,剛好貼著的兩個圓才不會被當成重疊
const OVERLAP_TOLERANCE = 1e-9

const HALF_THICKNESS = WALL_THICKNESS / 2

/**
 * 列出迷宮裡每一段牆佔據的長方形 `{ minX, maxX, minY, maxY }`。
 *
 * 沒有通道的每一側都是牆,外牆也是。
 * openDoor 是打開的門 `{ col, row, side }`,門所在的那段外牆不算牆。門鎖著時不給 openDoor,那段外牆就算牆。
 * 每段牆的長度多出一個牆厚,相鄰兩段在轉角處互相疊住,轉角不會留下縫隙。
 */
export function wallsOf(maze, openDoor) {
  const isOpenDoor = (col, row, side) =>
    openDoor !== undefined && openDoor.col === col && openDoor.row === row && openDoor.side === side
  const walls = []
  for (let row = 0; row < maze.size; row += 1) {
    for (let col = 0; col < maze.size; col += 1) {
      const openings = maze.openings({ col, row })
      for (const side of SIDES) {
        if (!openings.includes(side) && !isOpenDoor(col, row, side)) walls.push(wallRectOf(col, row, side))
      }
    }
  }
  return walls
}

/**
 * 把半徑 radius 的圓從 position 往 (dx, dy) 推進,回傳 `{ x, y, blocker }`。
 *
 * walls 是擋住它的牆。沒有給 walls 時,它不會被任何牆擋住。
 * 碰到牆時只保留沿著牆面的那一段移動,所以正面撞牆會停下,斜向撞牆會沿牆滑動。
 * obstacles 是擋住它、但推不動的身體,各是一個圓 `{ x, y, radius }`:
 * - slide 為 true 時,碰到身體就沿著它的邊緣滑動。夾在身體與牆之間、或夾在兩個身體之間滑不過去時,停在碰到之前。
 * - slide 為 false 時,碰到身體就停在碰到之前。
 * 停在碰到之前時,blocker 是擋住它的那一個身體,也就是 obstacles 裡的同一個物件;沒有被身體擋住時是 null。
 * 一開始就與某個身體重疊時(例如剛被傳送到那裡),可以往離開它的方向移動,但不能更靠近它。
 *
 * 位移再長也不會穿牆或穿過身體:長的位移會切成好幾小步,每一步都檢查碰撞。
 */
export function moveCircle(position, dx, dy, { radius, walls = [], obstacles = [], slide = false }) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_STEP))
  let current = { x: position.x, y: position.y }
  for (let i = 0; i < steps; i += 1) {
    const next = { x: current.x + dx / steps, y: current.y + dy / steps }
    if (slide) {
      // 一開始就重疊的身體不往外推:圓心可能離它的圓心很近,推出去的方向沒有意義,還可能一口氣被推過牆
      for (const obstacle of obstacles) {
        if (!overlaps(obstacle, current, radius)) pushOutOfCircle(obstacle, next, radius)
      }
    }
    for (const wall of walls) pushOutOfWall(wall, next, radius)
    const blocker = obstacles.find(
      (obstacle) =>
        overlaps(obstacle, next, radius) && distanceBetween(obstacle, next) < distanceBetween(obstacle, current),
    )
    if (blocker !== undefined) return { ...current, blocker }
    current = next
  }
  return { ...current, blocker: null }
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function overlaps(obstacle, point, radius) {
  return distanceBetween(obstacle, point) < obstacle.radius + radius - OVERLAP_TOLERANCE
}

// 圓與另一個圓重疊時,把圓心沿著兩個圓心的連線往外推,推到剛好碰到為止
function pushOutOfCircle(obstacle, point, radius) {
  const distance = distanceBetween(obstacle, point)
  const reach = obstacle.radius + radius
  if (distance >= reach || distance === 0) return
  point.x = obstacle.x + ((point.x - obstacle.x) / distance) * reach
  point.y = obstacle.y + ((point.y - obstacle.y) / distance) * reach
}

// 圓與長方形重疊時,把圓心沿著離長方形最近的那一點往外推,推到剛好碰到為止
function pushOutOfWall(wall, point, radius) {
  // 每次移動都要對整張迷宮的牆檢查一遍,其中絕大多數離得很遠;先用擴大 radius 的外框排除,省下開根號
  if (point.x <= wall.minX - radius || point.x >= wall.maxX + radius) return
  if (point.y <= wall.minY - radius || point.y >= wall.maxY + radius) return
  const nearestX = Math.min(Math.max(point.x, wall.minX), wall.maxX)
  const nearestY = Math.min(Math.max(point.y, wall.minY), wall.maxY)
  const offsetX = point.x - nearestX
  const offsetY = point.y - nearestY
  const distance = Math.hypot(offsetX, offsetY)
  if (distance >= radius) return
  point.x = nearestX + (offsetX / distance) * radius
  point.y = nearestY + (offsetY / distance) * radius
}

function wallRectOf(col, row, side) {
  const offset = OFFSETS[side]
  const centerX = col + 0.5 + offset.col / 2
  const centerY = row + 0.5 + offset.row / 2
  // 南北兩側的牆沿著 x 方向延伸,東西兩側的牆沿著 y 方向延伸
  const alongX = offset.col === 0
  const halfX = alongX ? 0.5 + HALF_THICKNESS : HALF_THICKNESS
  const halfY = alongX ? HALF_THICKNESS : 0.5 + HALF_THICKNESS
  return { minX: centerX - halfX, maxX: centerX + halfX, minY: centerY - halfY, maxY: centerY + halfY }
}
