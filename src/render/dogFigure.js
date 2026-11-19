// 主角的狗:一隻奶油色的法國鬥牛犬,用長方體與多面體拼成的低多邊形造型,跑步動作由程式計算,不使用模型或動畫素材檔。
// 這裡只負責外觀、擺放與動作;狗在哪裡、朝哪裡、移動了多遠,都由呼叫端告訴它。
import { BoxGeometry, Group, IcosahedronGeometry, MeshStandardMaterial } from 'three'

import { createFeedbackClip, hopOf } from './collectFeedback.js'
import { createRunCycle, part, placeFigure } from './lowPolyFigure.js'

// 草地的綠色會從底下反光到狗身上,毛色要偏暖一點,在場景裡看起來才是奶油色而不是黃綠色
const FUR_COLOR = '#f6d2b0'
const MUZZLE_COLOR = '#3b3634'
// 鼻子與眼睛比口鼻再深一點,深色的口鼻上才看得出鼻子
const DARK_COLOR = '#1c1918'
const TONGUE_COLOR = '#f08a9c'

/**
 * 狗的整個身體都在原點這個距離以內,包括鼻尖、耳朵、舌頭與擺動中的腳,單位與世界座標相同。
 *
 * 讓狗避開牆的邏輯以這個半徑為準,所以加大下面任何一個部位時都要確認身體仍在這個半徑內。
 * 鼻尖離這個半徑最近:口鼻在頭的轉軸下方,頭往上抬時口鼻會再往前一點。
 */
export const DOG_RADIUS = 0.45

// 各部位的尺寸,單位與世界座標相同。狗的原點在身體正下方的地面上,臉朝 -z。
// 法國鬥牛犬的體型是頭大、胸寬、身體短、腿短粗,所以前半身的胸比後半身寬也高,前腿也站得比後腿開
const LEG = { width: 0.12, length: 0.2, frontX: 0.13, backX: 0.09, frontZ: -0.12, backZ: 0.13 }
const CHEST = { width: 0.38, height: 0.3, length: 0.24, z: -0.07 }
const HIPS = { width: 0.28, height: 0.25, length: 0.2, z: 0.12 }
// 頭坐在胸的前上方,下半截擋在胸前,正面看得到頭兩側與底下露出來的寬胸
const HEAD = { width: 0.32, height: 0.28, depth: 0.24, y: 0.54, z: -0.22 }
// 法國鬥牛犬是扁臉短吻,所以口鼻只比臉往前凸出一點
const MUZZLE = { width: 0.17, height: 0.1, depth: 0.05, y: -0.07 }
// 蝙蝠耳的下半截埋在頭裡,露在頭頂上的上半截就是寬底、頂端圓的大耳朵。tilt 是耳朵往外張開的角度
const EAR = { width: 0.08, height: 0.18, thickness: 0.025, x: 0.095, z: 0.02, tilt: 0.3 }
const TONGUE = { width: 0.06, length: 0.09, thickness: 0.015 }

// 跑完一個完整步伐循環前進的距離。狗的腿比人短,步伐也短,同樣的速度下腳步比人快
const STRIDE_LENGTH = 1.2
const LEG_SWING = 0.7
const BOB_HEIGHT = 0.04
const HEAD_NOD = 0.08

// 收集成功時原地跳一下。從 from 起跳、to 落地,兩者都是整段回饋的幾分之幾;height 是跳起來的高度。
// 跳在空中時前腳往前伸、後腳往後蹬,頭往上抬。腳伸出的角度比跑步時小,整個身體仍然落在 DOG_RADIUS 以內
const HOP = { from: 0.1, to: 0.5, height: 0.18, legReach: 0.5, headLift: 0.25 }

/**
 * 建立主角的狗,`object` 要由呼叫端加進場景。
 *
 * 每一幀呼叫兩個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`;heading 是狗的朝向,與遊戲核心的朝向同一個慣例。
 * - `animate(distance, dt)`:distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒。
 *   有在移動就播跑步動作並吐出舌頭,停下後很快回到站姿並保持靜止。
 *
 * 收集成功時呼叫 `hop()`:狗原地跳一下。還沒跳完時又呼叫,第二次會等第一次跳完再從頭跳。
 * 動作由之後每一幀的 `animate` 推進。
 *
 * 用完必須呼叫 `dispose()` 釋放 geometry 與 material。
 */
export function createDogFigure() {
  // 所有長方體共用一個單位立方體,靠 scale 決定大小
  const box = new BoxGeometry(1, 1, 1)
  const ball = new IcosahedronGeometry(1, 1)
  const materials = {
    fur: new MeshStandardMaterial({ color: FUR_COLOR, roughness: 0.9, flatShading: true }),
    muzzle: new MeshStandardMaterial({ color: MUZZLE_COLOR, roughness: 0.7 }),
    dark: new MeshStandardMaterial({ color: DARK_COLOR, roughness: 0.5 }),
    tongue: new MeshStandardMaterial({ color: TONGUE_COLOR, roughness: 0.6 }),
  }

  // 腿的原點在與身體相接的關節上,繞 x 軸轉就是前後擺動。腳掌比腿寬一圈,腿看起來才短粗
  const leg = (x, z) => {
    const joint = new Group()
    joint.position.set(x, LEG.length, z)
    joint.add(
      part(box, materials.fur, [LEG.width, LEG.length, LEG.width], [0, -LEG.length / 2, 0]),
      part(box, materials.fur, [LEG.width + 0.02, 0.05, LEG.width + 0.04], [0, -LEG.length + 0.025, -0.01]),
    )
    return joint
  }
  const frontLeft = leg(-LEG.frontX, LEG.frontZ)
  const frontRight = leg(LEG.frontX, LEG.frontZ)
  const backLeft = leg(-LEG.backX, LEG.backZ)
  const backRight = leg(LEG.backX, LEG.backZ)

  // 耳朵是壓扁的多面體,寬的那一面朝前。Euler 只有繞 z 一個角度,正的角度讓左耳的頂端往左倒
  const ear = (x, tilt) => {
    const mesh = part(ball, materials.fur, [EAR.width, EAR.height, EAR.thickness], [x, HEAD.height / 2, EAR.z])
    mesh.rotation.z = tilt
    return mesh
  }

  // 舌頭的原點在嘴巴下緣,往下垂。跑步時沿 y 軸伸長,停下時縮回嘴裡並藏起來
  const faceZ = -HEAD.depth / 2
  const mouthY = MUZZLE.y - MUZZLE.height / 2
  const tongue = new Group()
  tongue.position.set(0, mouthY + 0.01, faceZ - MUZZLE.depth + 0.015)
  tongue.add(part(box, materials.tongue, [TONGUE.width, TONGUE.length, TONGUE.thickness], [0, -TONGUE.length / 2, 0]))
  tongue.visible = false

  // 頭的原點在頭的中心,點頭時繞自己轉
  const head = new Group()
  head.position.set(0, HEAD.y, HEAD.z)
  head.add(
    part(box, materials.fur, [HEAD.width, HEAD.height, HEAD.depth], [0, 0, 0]),
    part(box, materials.muzzle, [MUZZLE.width, MUZZLE.height, MUZZLE.depth], [0, MUZZLE.y, faceZ - MUZZLE.depth / 2]),
    part(box, materials.dark, [0.08, 0.045, 0.025], [0, MUZZLE.y + 0.035, faceZ - MUZZLE.depth - 0.0125]),
    part(box, materials.dark, [0.045, 0.045, 0.01], [-0.085, 0.025, faceZ - 0.005]),
    part(box, materials.dark, [0.045, 0.045, 0.01], [0.085, 0.025, faceZ - 0.005]),
    ear(-EAR.x, EAR.tilt),
    ear(EAR.x, -EAR.tilt),
    tongue,
  )

  // 整隻狗一起起伏,跑步時四隻腳會短暫離地
  const torso = new Group()
  torso.add(
    frontLeft,
    frontRight,
    backLeft,
    backRight,
    part(box, materials.fur, [CHEST.width, CHEST.height, CHEST.length], [0, LEG.length + CHEST.height / 2, CHEST.z]),
    part(box, materials.fur, [HIPS.width, HIPS.height, HIPS.length], [0, LEG.length + HIPS.height / 2, HIPS.z]),
    // 幾乎看不到的短尾,只在屁股上凸出一點
    part(box, materials.fur, [0.05, 0.05, 0.03], [0, LEG.length + HIPS.height - 0.05, HIPS.z + HIPS.length / 2 + 0.01]),
    head,
  )

  const object = new Group()
  object.add(torso)

  const runCycle = createRunCycle(STRIDE_LENGTH)
  const hopClip = createFeedbackClip()

  return {
    object,
    place(position, heading) {
      placeFigure(object, position, heading)
    },
    hop() {
      hopClip.play()
    },
    animate(distance, dt) {
      const { phase, blend } = runCycle.advance(distance, dt)
      const rise = hopOf(hopClip.advance(dt), HOP.from, HOP.to)
      // 小跑步:左前腳與右後腳一起擺,右前腳與左後腳往反方向擺。繞 x 軸轉正的角度是腳往前(-z)踢。
      // 跳起來時跑步的擺動收起來,換成前腳往前伸、後腳往後蹬
      const swing = Math.sin(phase) * blend * (1 - rise)
      const reach = rise * HOP.legReach
      frontLeft.rotation.x = swing * LEG_SWING + reach
      backRight.rotation.x = swing * LEG_SWING - reach
      frontRight.rotation.x = -swing * LEG_SWING + reach
      backLeft.rotation.x = -swing * LEG_SWING - reach
      // 每跨一步身體起伏一次,所以用 |sin|
      torso.position.y = Math.abs(Math.sin(phase)) * BOB_HEIGHT * blend + rise * HOP.height
      // 繞 x 軸轉正的角度是抬頭
      head.rotation.x = Math.sin(phase * 2) * HEAD_NOD * blend + rise * HOP.headLift
      // blend 是 0 時 scale 也是 0,這時矩陣不可逆、算不出光照,所以要把舌頭藏起來不畫
      tongue.visible = blend > 0
      tongue.scale.y = blend
    },
    dispose() {
      box.dispose()
      ball.dispose()
      for (const material of Object.values(materials)) material.dispose()
    },
  }
}
