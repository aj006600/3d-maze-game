// 第三人稱鏡頭:置中在主角的正後方、盯著主角的胸口跟隨,水平朝向永遠與主角的朝向一致,俯仰角可以調整。
// 主角與鏡頭之間有牆時,鏡頭沿視線拉近到牆的內側。牆比鏡頭能到達的最高點還高,
// 所以只要鏡頭本身不碰到牆,任何視角都看不到牆的另一邊。
// 它也回答鏡頭看不看得到迷宮裡的某一點:畫在所有東西前面、牆擋不住的東西,靠它判斷該不該畫。
import { PerspectiveCamera } from 'three'

import { CAMERA, SCENE } from '../config.js'
import { footprintOf } from './mazeScene.js'

// 鏡頭盯著的那一點離地多高,大約是主角的胸口
const TARGET_HEIGHT = 1.4
const FIELD_OF_VIEW = 60
// 近裁切面要很近:主角背貼著牆時鏡頭只能停在主角背後一點點的地方,裁切面遠了會切進主角的身體
const NEAR = 0.05
// 鏡頭與牆面至少保持的距離,有三個限制:
// - 要大於近裁切面的半對角線,近裁切面才不會插進牆裡、露出牆的另一邊。
// - 要小於主角的碰撞半徑,主角貼牆站著時,視線的起點才不會已經落在這個距離內。
// - 在前兩個限制內越小越好。主角背貼著牆時,鏡頭離主角中心只剩碰撞半徑減去這個值,這個值太大鏡頭就會進到身體裡。
const CLEARANCE = 0.15
// 障礙消失後鏡頭不會一下子跳回去,而是逐漸退回原本的距離;這個值越大退得越快
const RETURN_RATE = 5

/**
 * 建立跟隨主角的鏡頭,會避開這一局的牆。
 *
 * 每一幀呼叫 `follow(position, heading, pitch, dt)`:
 * - position 是主角在世界座標地面上的 `{ x, z }`。
 * - heading 是遊戲核心的朝向(0 朝北也就是 -z,從上方俯瞰時順時針增加)。
 * - pitch 是往下看的角度,單位是弧度,必須在設定的上下限之間。
 * - dt 是距離上一幀經過幾秒,決定鏡頭在障礙消失後退回去的速度。
 *
 * `sees({ x, z })` 回答鏡頭這一幀看不看得到世界座標地面上的那一點,也就是兩者的連線沒有穿過任何一段牆。
 * 牆比鏡頭與人都高,所以只看連線在地面上的投影。要在這一幀的 `follow` 之後呼叫,看的才是這一幀鏡頭的位置。
 *
 * 牆在建立時讀一次。牆變了之後(例如門打開)要呼叫 `refreshWalls()` 重新讀,否則鏡頭仍會避開舊的牆,
 * `sees` 也仍會被舊的牆擋住。
 * 設定的牆高沒有高過鏡頭能到達的最高點時會丟出錯誤。
 */
export function createFollowCamera(game) {
  const highest = TARGET_HEIGHT + CAMERA.distance * Math.sin(CAMERA.maxPitch)
  if (highest + CLEARANCE >= SCENE.wallHeight) {
    throw new Error(
      `wallHeight ${SCENE.wallHeight} must exceed the highest camera point ${highest.toFixed(2)} by more than ${CLEARANCE}`,
    )
  }

  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, NEAR, 500)
  // 鏡頭要避開的範圍是牆往外擴 CLEARANCE。牆角擴成直角而不是圓角,只會讓鏡頭在牆角附近多拉近一點點。
  // 判斷看不看得到則用牆本身的範圍:鏡頭可能正好停在擴大的範圍邊上,用擴大的範圍會以為自己被擋住
  let obstacles
  let walls
  const readWalls = () => {
    obstacles = game.walls.map((wall) => footprintOf(game.maze, wall, CLEARANCE))
    walls = game.walls.map((wall) => footprintOf(game.maze, wall))
  }
  readWalls()
  let currentDistance = CAMERA.distance

  return {
    camera,
    refreshWalls: readWalls,
    sees({ x, z }) {
      const dx = x - camera.position.x
      const dz = z - camera.position.z
      const length = Math.hypot(dx, dz)
      if (length === 0) return true
      return clearDistance(walls, camera.position, { x: dx / length, z: dz / length }, length) >= length
    },
    follow({ x, z }, heading, pitch, dt) {
      // 主角面向 (sin, -cos),鏡頭放在它的反方向
      const back = { x: -Math.sin(heading), z: Math.cos(heading) }
      // 視線每走一單位長度,在地面上的投影走多遠
      const horizontalRatio = Math.cos(pitch)
      // 牆比視線經過的每一點都高,所以視線會不會碰到牆,只要看它在地面上的投影
      const reach = clearDistance(obstacles, { x, z }, back, CAMERA.distance * horizontalRatio) / horizontalRatio
      // 被擋住時立刻拉近,畫面才不會有任何一幀穿牆;障礙消失後才逐漸退回去
      currentDistance =
        reach < currentDistance
          ? reach
          : currentDistance + (reach - currentDistance) * (1 - Math.exp(-RETURN_RATE * dt))
      const behind = currentDistance * horizontalRatio
      camera.position.set(x + back.x * behind, TARGET_HEIGHT + currentDistance * Math.sin(pitch), z + back.z * behind)
      camera.lookAt(x, TARGET_HEIGHT, z)
    },
  }
}

// 從 origin 沿著單位向量 direction 走,碰到任何一個長方形之前能走多遠,最多走 limit
function clearDistance(rects, origin, direction, limit) {
  let nearest = limit
  for (const rect of rects) nearest = Math.min(nearest, entryDistance(rect, origin, direction))
  return nearest
}

// 從 origin 沿著 direction 走進長方形要走多遠。永遠走不進去是 Infinity,起點已經在裡面是 0
function entryDistance(rect, origin, direction) {
  let enter = 0
  let exit = Infinity
  for (const [start, step, min, max] of [
    [origin.x, direction.x, rect.minX, rect.maxX],
    [origin.z, direction.z, rect.minZ, rect.maxZ],
  ]) {
    if (step === 0) {
      if (start < min || start > max) return Infinity
      continue
    }
    const first = (min - start) / step
    const second = (max - start) / step
    enter = Math.max(enter, Math.min(first, second))
    exit = Math.min(exit, Math.max(first, second))
  }
  return enter <= exit ? enter : Infinity
}
