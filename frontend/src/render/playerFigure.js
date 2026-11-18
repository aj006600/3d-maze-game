// 主角的人:用長方體與多面體拼成的低多邊形造型,跑步動作由程式計算,不使用模型或動畫素材檔。
// 這裡只負責外觀、擺放與動作;主角在哪裡、朝哪裡、移動了多遠,都由呼叫端依遊戲核心的狀態告訴它。
import { BoxGeometry, Group, IcosahedronGeometry, MeshStandardMaterial } from 'three'

import { createRunCycle, part, placeFigure } from './lowPolyFigure.js'

const SKIN_COLOR = '#f2c7a5'
const HAIR_COLOR = '#4a2f1d'
const SHIRT_COLOR = '#ff7a59'
const PANTS_COLOR = '#3d5a99'
const SHOE_COLOR = '#3a3a3a'

// 各部位的尺寸,單位與世界座標相同;整個人大約 1.85 高
const HIP_HEIGHT = 0.85
const LEG = { width: 0.2, length: 0.8, depth: 0.22, spacing: 0.14 }
const TORSO = { width: 0.56, height: 0.62, depth: 0.3 }
const ARM = { width: 0.15, length: 0.6, depth: 0.16 }
const HEAD_RADIUS = 0.21

// 跑完一個完整步伐循環(左右腳各跨一次)前進的距離
const STRIDE_LENGTH = 1.8
const LEG_SWING = 0.9
const ARM_SWING = 0.8
const BOB_HEIGHT = 0.08
const FORWARD_LEAN = 0.15

/**
 * 建立主角的人,`object` 要由呼叫端加進場景。
 *
 * 每一幀呼叫兩個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`,heading 是遊戲核心的朝向。
 * - `animate(distance, dt)`:distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒。
 *   有在移動就播跑步動作,停下後很快回到站姿並保持靜止。
 *
 * 用完必須呼叫 `dispose()` 釋放 geometry 與 material。
 */
export function createPlayerFigure() {
  // 所有長方體共用一個單位立方體,靠 scale 決定大小
  const box = new BoxGeometry(1, 1, 1)
  const ball = new IcosahedronGeometry(1, 1)
  const materials = {
    skin: new MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.9, flatShading: true }),
    hair: new MeshStandardMaterial({ color: HAIR_COLOR, roughness: 0.9, flatShading: true }),
    shirt: new MeshStandardMaterial({ color: SHIRT_COLOR, roughness: 0.9 }),
    pants: new MeshStandardMaterial({ color: PANTS_COLOR, roughness: 0.9 }),
    shoe: new MeshStandardMaterial({ color: SHOE_COLOR, roughness: 0.9 }),
  }

  // 四肢的原點在關節上,繞 x 軸轉就是前後擺動
  const limb = (x, y, size, material, extra) => {
    const joint = new Group()
    joint.position.set(x, y, 0)
    joint.add(part(box, material, size, [0, -size[1] / 2, 0]), ...extra)
    return joint
  }

  const legSize = [LEG.width, LEG.length, LEG.depth]
  const shoe = () => part(box, materials.shoe, [LEG.width + 0.02, 0.1, LEG.depth + 0.12], [0, -LEG.length, -0.05])
  const leftLeg = limb(-LEG.spacing, 0, legSize, materials.pants, [shoe()])
  const rightLeg = limb(LEG.spacing, 0, legSize, materials.pants, [shoe()])

  const shoulderY = TORSO.height - 0.06
  const shoulderX = TORSO.width / 2 + ARM.width / 2
  const armSize = [ARM.width, ARM.length, ARM.depth]
  const hand = () => part(box, materials.skin, [ARM.width, 0.14, ARM.depth], [0, -ARM.length - 0.05, 0])
  const leftArm = limb(-shoulderX, shoulderY, armSize, materials.skin, [hand()])
  const rightArm = limb(shoulderX, shoulderY, armSize, materials.skin, [hand()])

  // 上半身的原點在髖部,前傾時繞髖部轉,腿不會跟著傾斜
  const upperBody = new Group()
  const headY = TORSO.height + HEAD_RADIUS + 0.02
  upperBody.add(
    part(box, materials.shirt, [TORSO.width, TORSO.height, TORSO.depth], [0, TORSO.height / 2, 0]),
    leftArm,
    rightArm,
    part(ball, materials.skin, [HEAD_RADIUS, HEAD_RADIUS * 1.05, HEAD_RADIUS], [0, headY, 0]),
    // 頭髮是稍大一圈、往後上方偏的多面體,從背後看得出後腦勺
    part(ball, materials.hair, [HEAD_RADIUS * 1.08, HEAD_RADIUS, HEAD_RADIUS * 1.08], [0, headY + 0.05, 0.04]),
  )

  const hips = new Group()
  hips.position.y = HIP_HEIGHT
  hips.add(leftLeg, rightLeg, upperBody)

  const object = new Group()
  object.add(hips)

  const runCycle = createRunCycle(STRIDE_LENGTH)

  return {
    object,
    place(position, heading) {
      placeFigure(object, position, heading)
    },
    animate(distance, dt) {
      const { phase, blend } = runCycle.advance(distance, dt)
      const swing = Math.sin(phase) * blend
      leftLeg.rotation.x = swing * LEG_SWING
      rightLeg.rotation.x = -swing * LEG_SWING
      leftArm.rotation.x = -swing * ARM_SWING
      rightArm.rotation.x = swing * ARM_SWING
      // 每跨一步身體起伏一次,所以用 |sin|;繞 x 軸轉負的角度是往前(-z)傾
      hips.position.y = HIP_HEIGHT + Math.abs(Math.sin(phase)) * BOB_HEIGHT * blend
      upperBody.rotation.x = -FORWARD_LEAN * blend
    },
    dispose() {
      box.dispose()
      ball.dispose()
      for (const material of Object.values(materials)) material.dispose()
    },
  }
}
