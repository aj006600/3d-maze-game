// 主角的狗:用長方體與角錐拼成的低多邊形造型,跑步動作由程式計算,不使用模型或動畫素材檔。
// 這裡只負責外觀、擺放與動作;狗在哪裡、朝哪裡、移動了多遠,都由呼叫端告訴它。
import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial } from 'three'

import { createRunCycle } from './runCycle.js'

const FUR_COLOR = '#d9954a'
const CREAM_COLOR = '#f6e3c4'
const DARK_COLOR = '#2b2420'
const COLLAR_COLOR = '#3f8fd8'

// 各部位的尺寸,單位與世界座標相同。狗的原點在身體正下方的地面上,臉朝 -z。
// 鼻尖到尾巴尖都在原點 0.45 以內;跟隨的邏輯以這個半徑讓狗避開牆,改尺寸時兩邊要一起看
const LEG = { width: 0.09, length: 0.3, spacingX: 0.08, frontZ: -0.16, backZ: 0.16 }
const BODY = { width: 0.24, height: 0.24, length: 0.48 }
const HEAD = { width: 0.22, height: 0.2, depth: 0.2, y: 0.64, z: -0.24 }
const TAIL = { width: 0.06, length: 0.22, y: 0.5, z: BODY.length / 2 }
// 尾巴平常往後上方翹的角度
const TAIL_TILT = 0.7

// 跑完一個完整步伐循環前進的距離。狗的腿比人短,步伐也短,同樣的速度下腳步比人快
const STRIDE_LENGTH = 1.2
const LEG_SWING = 0.7
const BOB_HEIGHT = 0.04
const HEAD_NOD = 0.08
const TAIL_WAG = 0.5

/**
 * 建立主角的狗,`object` 要由呼叫端加進場景。
 *
 * 每一幀呼叫兩個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`;heading 是狗的朝向,與遊戲核心的朝向同一個慣例。
 * - `animate(distance, dt)`:distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒。
 *   有在移動就播跑步動作,停下後很快回到站姿並保持靜止。
 *
 * 用完必須呼叫 `dispose()` 釋放 geometry 與 material。
 */
export function createDogFigure() {
  // 所有長方體共用一個單位立方體,靠 scale 決定大小
  const box = new BoxGeometry(1, 1, 1)
  // 四個邊的角錐就是低多邊形的尖耳朵;轉 45 度讓角錐的底面與頭的邊對齊
  const ear = new ConeGeometry(0.06, 0.12, 4)
  ear.rotateY(Math.PI / 4)
  const materials = {
    fur: new MeshStandardMaterial({ color: FUR_COLOR, roughness: 0.9, flatShading: true }),
    cream: new MeshStandardMaterial({ color: CREAM_COLOR, roughness: 0.9 }),
    dark: new MeshStandardMaterial({ color: DARK_COLOR, roughness: 0.6 }),
    collar: new MeshStandardMaterial({ color: COLLAR_COLOR, roughness: 0.6 }),
  }

  const part = (geometry, material, [width, height, depth], [x, y, z]) => {
    const mesh = new Mesh(geometry, material)
    mesh.scale.set(width, height, depth)
    mesh.position.set(x, y, z)
    return mesh
  }

  // 腿的原點在與身體相接的關節上,繞 x 軸轉就是前後擺動;腳掌是淺色的一截
  const leg = (x, z) => {
    const joint = new Group()
    joint.position.set(x, LEG.length, z)
    joint.add(
      part(box, materials.fur, [LEG.width, LEG.length, LEG.width], [0, -LEG.length / 2, 0]),
      part(box, materials.cream, [LEG.width + 0.01, 0.06, LEG.width + 0.03], [0, -LEG.length + 0.03, -0.01]),
    )
    return joint
  }
  const frontLeft = leg(-LEG.spacingX, LEG.frontZ)
  const frontRight = leg(LEG.spacingX, LEG.frontZ)
  const backLeft = leg(-LEG.spacingX, LEG.backZ)
  const backRight = leg(LEG.spacingX, LEG.backZ)

  // 頭的原點在頭的中心,點頭時繞自己轉
  const head = new Group()
  head.position.set(0, HEAD.y, HEAD.z)
  const faceZ = -HEAD.depth / 2
  head.add(
    part(box, materials.fur, [HEAD.width, HEAD.height, HEAD.depth], [0, 0, 0]),
    part(box, materials.cream, [0.12, 0.09, 0.09], [0, -0.04, faceZ - 0.04]),
    part(box, materials.dark, [0.05, 0.04, 0.03], [0, -0.01, faceZ - 0.09]),
    part(box, materials.dark, [0.035, 0.035, 0.01], [-0.06, 0.03, faceZ - 0.005]),
    part(box, materials.dark, [0.035, 0.035, 0.01], [0.06, 0.03, faceZ - 0.005]),
    part(box, materials.collar, [HEAD.width + 0.015, 0.045, HEAD.depth + 0.015], [0, -HEAD.height / 2 + 0.01, 0]),
    part(ear, materials.fur, [1, 1, 1], [-0.07, HEAD.height / 2 + 0.06, 0.02]),
    part(ear, materials.fur, [1, 1, 1], [0.07, HEAD.height / 2 + 0.06, 0.02]),
  )

  // 尾巴的原點在身體後上方的根部。Euler 的順序是先繞 z 再繞 x:先在根部左右搖,再整根往後翹
  const tail = new Group()
  tail.position.set(0, TAIL.y, TAIL.z)
  tail.rotation.x = TAIL_TILT
  tail.add(part(box, materials.fur, [TAIL.width, TAIL.length, TAIL.width], [0, TAIL.length / 2, 0]))

  // 整隻狗一起起伏,跑步時四隻腳會短暫離地
  const torso = new Group()
  torso.add(
    frontLeft,
    frontRight,
    backLeft,
    backRight,
    part(box, materials.fur, [BODY.width, BODY.height, BODY.length], [0, LEG.length + BODY.height / 2, 0]),
    part(box, materials.cream, [BODY.width - 0.06, 0.12, 0.02], [0, LEG.length + 0.08, -BODY.length / 2 - 0.005]),
    head,
    tail,
  )

  const object = new Group()
  object.add(torso)

  const runCycle = createRunCycle(STRIDE_LENGTH)

  return {
    object,
    place({ x, z }, heading) {
      object.position.set(x, 0, z)
      // 核心的朝向從上方俯瞰是順時針增加,Three.js 繞 y 軸是逆時針,所以取負號
      object.rotation.y = -heading
    },
    animate(distance, dt) {
      const { phase, blend } = runCycle.advance(distance, dt)
      // 小跑步:左前腳與右後腳一起擺,右前腳與左後腳往反方向擺。繞 x 軸轉正的角度是腳往前(-z)踢
      const swing = Math.sin(phase) * blend
      frontLeft.rotation.x = swing * LEG_SWING
      backRight.rotation.x = swing * LEG_SWING
      frontRight.rotation.x = -swing * LEG_SWING
      backLeft.rotation.x = -swing * LEG_SWING
      // 每跨一步身體起伏一次,所以用 |sin|
      torso.position.y = Math.abs(Math.sin(phase)) * BOB_HEIGHT * blend
      head.rotation.x = Math.sin(phase * 2) * HEAD_NOD * blend
      tail.rotation.z = Math.sin(phase * 2) * TAIL_WAG * blend
    },
    dispose() {
      box.dispose()
      ear.dispose()
      for (const material of Object.values(materials)) material.dispose()
    },
  }
}
