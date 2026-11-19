// 奧客的佔位人形:用長方體拼成的低多邊形造型,走路動作由程式計算,不使用模型、動畫或圖片素材檔。
// 它只負責看得出是一個人、看得出臉朝哪裡:往前凸出的尖嘴與挺在前面的肚子都在正面,從背後看不到。
// 這裡只負責外觀、擺放與動作;奧客在哪裡、朝哪裡、移動了多遠,都由呼叫端依遊戲核心的快照告訴它。
import { BoxGeometry, Group, MeshStandardMaterial } from 'three'

import { createRunCycle, part, placeFigure } from './lowPolyFigure.js'

// 鮮豔的襯衫在綠色的樹籬與草地前面才顯眼
const SHIRT_COLOR = '#e8578a'
const SHORTS_COLOR = '#3a6fd8'
const FUR_COLOR = '#9d948c'
const DARK_COLOR = '#1c1918'

// 各部位的尺寸,單位與世界座標相同。整個人含耳朵大約 2.6 高,比主角高大一圈。
// 攤開的雙手大約和碰撞的圓一樣寬,看起來幾乎塞滿走道,撞上去時才不會像撞上一道看不見的牆;
// 改了設定模組裡奧客的碰撞半徑,要跟著調整軀幹的寬度與手臂往外張的角度。
// 髖關節以上的部位以髖關節為原點,臉朝 -z,右手在 +x
const HIP_HEIGHT = 1.05
// length 是髖關節到地面的長度;shorts 是褲管從髖關節往下蓋多長
const LEG = { width: 0.34, depth: 0.34, length: HIP_HEIGHT, spacing: 0.32, shorts: 0.55 }
const TORSO = { width: 1.3, height: 0.9, depth: 0.85 }
// 肚子從軀幹的正面往前凸出 depth
const BELLY = { width: 1.1, height: 0.6, depth: 0.45, y: 0.3 }
// splay 是手臂往外張的角度
const ARM = { width: 0.24, length: 0.9, x: 0.77, y: 0.8, splay: 0.85 }
// 頭是一個方塊,尖嘴從臉的正面往前凸出
const HEAD = { size: 0.5, y: TORSO.height + 0.3 }
const SNOUT = { width: 0.22, height: 0.18, depth: 0.3, y: -0.08 }

// 跑完一個完整步伐循環(左右腳各跨一次)前進的距離。奧客用走的,步伐比主角跑步時小
const STRIDE_LENGTH = 1.8
const LEG_SWING = 0.5
const ARM_SWING = 0.4
const BOB_HEIGHT = 0.04

/**
 * 建立一位奧客的佔位人形,`object` 要由呼叫端加進場景。
 *
 * 每一位奧客各自建立一個,material 也各自一份,改一位的外觀不會改到另一位。
 *
 * 每一幀依序呼叫兩個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`,heading 是遊戲核心的朝向。
 * - `animate(distance, dt)`:distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒。
 *   有在移動就播走路動作,停下後很快回到站姿並保持靜止。
 *
 * 用完必須呼叫 `dispose()` 釋放 geometry 與 material。
 */
export function createPassengerFigure() {
  // 所有部位都是同一個單位立方體,靠 scale 決定大小
  const box = new BoxGeometry(1, 1, 1)
  const materials = {
    shirt: new MeshStandardMaterial({ color: SHIRT_COLOR, roughness: 0.9 }),
    shorts: new MeshStandardMaterial({ color: SHORTS_COLOR, roughness: 0.9 }),
    fur: new MeshStandardMaterial({ color: FUR_COLOR, roughness: 0.9, flatShading: true }),
    dark: new MeshStandardMaterial({ color: DARK_COLOR, roughness: 0.5 }),
  }

  // 四肢的原點在關節上,繞 x 軸轉就是前後擺動
  const leg = (x) => {
    const joint = new Group()
    joint.position.set(x, HIP_HEIGHT, 0)
    const shin = LEG.length - LEG.shorts
    joint.add(
      part(box, materials.shorts, [LEG.width + 0.03, LEG.shorts, LEG.depth + 0.03], [0, -LEG.shorts / 2, 0]),
      part(box, materials.fur, [LEG.width - 0.04, shin, LEG.depth - 0.04], [0, -LEG.shorts - shin / 2, 0]),
      // 腳掌往前伸出一點
      part(box, materials.dark, [LEG.width, 0.04, LEG.depth + 0.1], [0, -LEG.length + 0.02, -0.05]),
    )
    return joint
  }
  const leftLeg = leg(-LEG.spacing)
  const rightLeg = leg(LEG.spacing)

  // 手臂掛在肩關節上往下垂,再往外張開
  const arm = (side) => {
    const joint = new Group()
    joint.position.set(side * ARM.x, ARM.y, 0)
    joint.rotation.z = side * ARM.splay
    joint.add(part(box, materials.fur, [ARM.width, ARM.length, ARM.width], [0, -ARM.length / 2, 0]))
    return joint
  }
  const leftArm = arm(-1)
  const rightArm = arm(1)

  const faceZ = -HEAD.size / 2
  const head = new Group()
  head.position.y = HEAD.y
  head.add(
    part(box, materials.fur, [HEAD.size, HEAD.size, HEAD.size], [0, 0, 0]),
    part(box, materials.fur, [SNOUT.width, SNOUT.height, SNOUT.depth], [0, SNOUT.y, faceZ - SNOUT.depth / 2]),
    // 鼻頭在尖嘴的最前端
    part(box, materials.dark, [0.09, 0.075, 0.045], [0, SNOUT.y + 0.045, faceZ - SNOUT.depth - 0.02]),
    part(box, materials.dark, [0.075, 0.075, 0.03], [-0.12, 0.075, faceZ - 0.015]),
    part(box, materials.dark, [0.075, 0.075, 0.03], [0.12, 0.075, faceZ - 0.015]),
    part(box, materials.fur, [0.15, 0.18, 0.06], [-0.2, HEAD.size / 2 + 0.06, 0]),
    part(box, materials.fur, [0.15, 0.18, 0.06], [0.2, HEAD.size / 2 + 0.06, 0]),
  )

  // 髖關節以上的部位一起隨步伐起伏
  const upperBody = new Group()
  upperBody.position.y = HIP_HEIGHT
  upperBody.add(
    part(box, materials.shirt, [TORSO.width, TORSO.height, TORSO.depth], [0, TORSO.height / 2, 0]),
    part(
      box,
      materials.shirt,
      [BELLY.width, BELLY.height, BELLY.depth],
      [0, BELLY.y, -TORSO.depth / 2 - BELLY.depth / 2],
    ),
    leftArm,
    rightArm,
    head,
  )

  const object = new Group()
  object.add(leftLeg, rightLeg, upperBody)

  const runCycle = createRunCycle(STRIDE_LENGTH)

  return {
    object,
    place(position, heading) {
      placeFigure(object, position, heading)
    },
    animate(distance, dt) {
      const { phase, blend } = runCycle.advance(distance, dt)
      // 繞 x 軸轉正的角度是腳往前(-z)踢。手臂與同側的腳反向擺動
      const swing = Math.sin(phase) * blend
      leftLeg.rotation.x = swing * LEG_SWING
      rightLeg.rotation.x = -swing * LEG_SWING
      leftArm.rotation.x = -swing * ARM_SWING
      rightArm.rotation.x = swing * ARM_SWING
      // 每跨一步身體起伏一次,所以用 |sin|
      upperBody.position.y = HIP_HEIGHT + Math.abs(Math.sin(phase)) * BOB_HEIGHT * blend
    },
    dispose() {
      box.dispose()
      for (const material of Object.values(materials)) material.dispose()
    },
  }
}
