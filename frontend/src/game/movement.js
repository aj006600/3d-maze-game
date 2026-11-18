// 主角在平面上的移動與碰撞:主角是一個圓,每一段牆是沿著格線立起、帶厚度的長方形。
// 座標以格為單位:x 往東、y 往南,格子 (col, row) 涵蓋 col ≤ x < col + 1;牆的中心線就是格線。
import { OFFSETS, SIDES } from './maze.js'

/** 牆的厚度,以格為單位。畫面上的牆要用同一個厚度,看起來才會與碰撞一致。 */
export const WALL_THICKNESS = 0.15
// 主角的半徑要蓋住人的手臂,貼著牆跑時手臂才不會插進牆裡
const PLAYER_RADIUS = 0.12
// 每一小步的位移上限。它小於主角半徑,圓心就不會一步跨進牆裡,往外推時也不會推錯邊
const MAX_STEP = PLAYER_RADIUS / 2

const HALF_THICKNESS = WALL_THICKNESS / 2

/**
 * 列出迷宮裡每一段牆佔據的長方形 `{ minX, maxX, minY, maxY }`。
 *
 * 沒有通道的每一側都是牆,外牆也是。門鎖著時等同於牆,所以門所在的那段外牆也在裡面。
 * 每段牆的長度多出一個牆厚,相鄰兩段在轉角處互相疊住,轉角不會留下縫隙。
 */
export function wallsOf(maze) {
  const walls = []
  for (let row = 0; row < maze.size; row += 1) {
    for (let col = 0; col < maze.size; col += 1) {
      const openings = maze.openings({ col, row })
      for (const side of SIDES) {
        if (!openings.includes(side)) walls.push(wallRectOf(col, row, side))
      }
    }
  }
  return walls
}

/**
 * 把位置 position 往 (dx, dy) 推進,回傳推進後的位置。
 *
 * 碰到牆時只保留沿著牆面的那一段移動,所以正面撞牆會停下,斜向撞牆會沿牆滑動。
 * 位移再長也不會穿牆:長的位移會切成好幾小步,每一步都檢查碰撞。
 */
export function moveAgainstWalls(walls, position, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / MAX_STEP))
  const next = { x: position.x, y: position.y }
  for (let i = 0; i < steps; i += 1) {
    next.x += dx / steps
    next.y += dy / steps
    for (const wall of walls) pushOutOf(wall, next)
  }
  return next
}

// 圓與長方形重疊時,把圓心沿著離長方形最近的那一點往外推,推到剛好碰到為止
function pushOutOf(wall, point) {
  const nearestX = Math.min(Math.max(point.x, wall.minX), wall.maxX)
  const nearestY = Math.min(Math.max(point.y, wall.minY), wall.maxY)
  const offsetX = point.x - nearestX
  const offsetY = point.y - nearestY
  const distance = Math.hypot(offsetX, offsetY)
  if (distance >= PLAYER_RADIUS) return
  point.x = nearestX + (offsetX / distance) * PLAYER_RADIUS
  point.y = nearestY + (offsetY / distance) * PLAYER_RADIUS
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
