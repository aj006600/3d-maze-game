// 第三人稱鏡頭:置中在主角的正後上方跟隨,水平朝向永遠與主角的朝向一致,俯仰角固定。
// 鏡頭不會避開牆,主角背後有牆時畫面會被牆擋住。
import { PerspectiveCamera } from 'three'

// 鏡頭盯著的那一點離地多高,大約是主角的胸口
const TARGET_HEIGHT = 1.4
// 鏡頭到盯著的那一點的距離
const DISTANCE = 4.5
// 鏡頭往下看的角度,單位是弧度
const PITCH = 0.35
const FIELD_OF_VIEW = 60

/**
 * 建立跟隨主角的鏡頭。
 *
 * 每一幀呼叫 `follow(position, heading)`:position 是主角在世界座標地面上的 `{ x, z }`,
 * heading 是遊戲核心的朝向(0 朝北也就是 -z,從上方俯瞰時順時針增加)。
 */
export function createFollowCamera() {
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 500)
  const behind = DISTANCE * Math.cos(PITCH)
  const above = DISTANCE * Math.sin(PITCH)

  return {
    camera,
    follow({ x, z }, heading) {
      // 主角面向 (sin, -cos),鏡頭放在它的反方向
      camera.position.set(x - Math.sin(heading) * behind, TARGET_HEIGHT + above, z + Math.cos(heading) * behind)
      camera.lookAt(x, TARGET_HEIGHT, z)
    },
  }
}
