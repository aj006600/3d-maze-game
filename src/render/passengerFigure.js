// 奧客的佔位人形:用長方體拼成的低多邊形造型,動作由程式計算,不使用模型、動畫或圖片素材檔;爆炸星號的貼圖也在程式裡畫。
// 它只負責看得出是一個人、看得出臉朝哪裡:往前凸出的尖嘴與挺在前面的肚子都在正面,從背後看不到。
// 這裡只負責外觀、擺放、動作、被打中與倒地的樣子、什麼時候冒出對話框,以及擋在鏡頭前面時變半透明;
// 奧客在哪裡、朝哪裡、移動了多遠、處在哪個狀態,都由呼叫端依遊戲核心的快照告訴它。
import { BoxGeometry, Group, MeshStandardMaterial, Sprite, SpriteMaterial } from 'three'

import { createCanvasTexture, createRunCycle, part, placeFigure } from './lowPolyFigure.js'
import { createSpeechBubble } from './speechBubble.js'

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
// 對話框的尾巴尖端在畫面上離臉的中心多遠。它要大於頭的一半寬,尾巴才不會蓋到臉上
const BUBBLE_GAP = HEAD.size / 2 + 0.12

// 跑完一個完整步伐循環(左右腳各跨一次)前進的距離。奧客用走的,步伐比主角跑步時小
const STRIDE_LENGTH = 1.8
const LEG_SWING = 0.5
const ARM_SWING = 0.4
const BOB_HEIGHT = 0.04

// 從上方俯瞰,攤開的雙手從身體中線往外伸出多遠,也就是整個人最寬處的一半
const HALF_SPAN = ARM.x + ARM.length * Math.sin(ARM.splay) + ARM.width / 2
// 主角的身體從中線往外大約多寬。奧客的身體與主角的身體在畫面上有重疊時,才算遮住主角
const PLAYER_HALF_WIDTH = 0.45
// 擋住主角時的不透明度:看得到後面的主角,也看得出背後有人
const SEE_THROUGH_OPACITY = 0.35
// 每秒最多改變多少不透明度。變淡與恢復都是一下子完成,但不是一幀就跳過去,奧客在擋與不擋的邊界上時才不會閃爍
const FADE_RATE = 5

// 被打中時全身閃白,在這麼多秒內從全白退回原本的顏色
const FLASH_SECONDS = 0.18
// 硬直時上半身繞髖關節往後仰的角度。被打中時一下子仰過去,硬直結束後慢一點回正。
// 兩個 rate 是每秒最多轉多少弧度
const RECOIL = { angle: 0.45, rate: 10, recoverRate: 3 }
// 倒地時整個人繞著背後貼地的那條線往後倒,倒下去越來越快,在 seconds 秒內躺平。
// 轉軸在軀幹的背面,躺平時背貼著地面,不會插進地裡
const FALL = { seconds: 0.35, pivotZ: TORSO.depth / 2 }
// 爆炸星號出現在奧客身上朝向主角的那一面:離奧客的中線 offset、離地 height,單位與世界座標相同。
// 它從出現到消失共 seconds 秒:先在 grow 之前從四成脹到 size 那麼大,從 fadeFrom 起淡出。grow 與 fadeFrom 都是整段的幾分之幾
const STAR = { size: 1.5, offset: 0.9, height: 1.7, seconds: 0.3, grow: 0.25, fadeFrom: 0.5 }
// 星號的兩層:外層是紅色的大爆炸,內層是黃色的小爆炸。一圈有 POINTS 個尖角,每個尖角的長短照 SPIKES 輪替,看起來才不像規則的星形
const STAR_COLORS = { outer: '#ff4b2b', inner: '#ffe23a', outline: '#1c1918' }
const STAR_POINTS = 12
const STAR_SPIKES = [1, 0.78, 0.93, 0.7, 0.98, 0.82]

/**
 * 建立一位奧客的佔位人形,`object` 要由呼叫端加進場景。
 *
 * 每一位奧客各自建立一個,material 也各自一份,改一位的外觀不會改到另一位。
 *
 * 每一幀依序呼叫四個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`,heading 是遊戲核心的朝向。
 * - `animate(distance, dt, state)`:distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒,
 *   state 是遊戲核心快照裡這位奧客的狀態。
 *   - 有在移動就播走路動作,停下後很快回到站姿並保持靜止。
 *   - `'staggered'` 時上半身往後仰,狀態一變就回正。
 *   - `'down'` 時整個人往後倒、躺在地上;`'gone'` 時整個人藏起來。重生之後回到站姿。
 * - `talk(dt, state, inSight)`:dt 是遊戲這一幀推進了幾秒,遊戲停住時傳 0;state 與 `animate` 的相同;
 *   inSight 是鏡頭這一幀看不看得到這位奧客,也就是兩者之間沒有牆擋住。
 *   - 奧客在 `'chasing'` 與 `'staggered'` 時,臉的右側輪播漫畫風的對話框,其餘狀態不顯示。
 *   - 從其他狀態進入這兩個狀態的那一幀立刻冒出第一句,所以發現主角的那一刻就看得到對話框。
 *   - 對話框畫在所有東西的前面,所以 inSight 為 false 時不畫,對話框才不會透過樹籬露出來。
 * - `fadeIfBlocking(cameraPosition, target, dt)`:cameraPosition 是鏡頭這一幀在世界座標的位置,
 *   target 是主角在世界座標地面上的 `{ x, z }`。奧客夾在鏡頭與主角之間、會遮住主角時,
 *   連同對話框漸漸變成半透明,離開之後漸漸恢復不透明。
 *
 * `animate` 與 `fadeIfBlocking` 讀的是 `place` 擺好的位置,所以要在 `place` 之後呼叫。
 *
 * 奧客被打中的那一幀,在 `place` 之後呼叫 `hit(playerPosition)`,playerPosition 是主角在世界座標地面上的 `{ x, z }`。
 * 奧客全身閃一下白,朝向主角的那一面冒出一個面向鏡頭的爆炸星號,很快消失。閃白與星號由之後每一幀的 `animate` 推進。
 * 第 3 下擊倒他的那一下也要呼叫。
 *
 * 只能在瀏覽器裡建立,因為爆炸星號與對話框的貼圖要用 canvas 畫。
 * 用完必須呼叫 `dispose()` 釋放 geometry、material 與貼圖。
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
  // 對話框掛在頭的中心,跟著步伐起伏、硬直時跟著往後仰;奧客轉向時它不會跟著繞圈
  const bubble = createSpeechBubble(BUBBLE_GAP)
  head.add(bubble.object)

  // 髖關節以上的部位一起隨步伐起伏,硬直時一起往後仰
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

  // 倒地時繞著 faller 的原點往後倒。pose 把整個人往前挪回原位,faller 的原點因此落在軀幹背面的地上
  const pose = new Group()
  pose.position.z = -FALL.pivotZ
  pose.add(leftLeg, rightLeg, upperBody)
  const faller = new Group()
  faller.position.z = FALL.pivotZ
  faller.add(pose)
  const body = new Group()
  body.add(faller)

  const starTexture = createCanvasTexture(256, 256, paintStar)
  // 星號是一下子的漫畫效果,不讓主角或奧客的身體擋住它
  const starMaterial = new SpriteMaterial({ map: starTexture, depthTest: false, transparent: true })
  const star = new Sprite(starMaterial)
  star.renderOrder = 1
  star.visible = false

  // 星號直接以世界座標擺放,所以不放進跟著奧客轉向的 body 裡
  const object = new Group()
  object.add(body, star)

  const runCycle = createRunCycle(STRIDE_LENGTH)
  let opacity = 1
  // 閃白與星號從被打中起已經播了幾秒,沒有在播時是 null
  let flashTime = null
  let starTime = null
  let recoil = 0
  // 倒地之後已經過了幾秒,沒有倒地時是 null
  let fallTime = null

  function animateHit(dt) {
    if (flashTime !== null) {
      flashTime += dt
      const strength = Math.max(0, 1 - flashTime / FLASH_SECONDS)
      for (const material of Object.values(materials)) material.emissive.setScalar(strength)
      if (strength === 0) flashTime = null
    }
    if (starTime !== null) {
      starTime += dt
      const t = starTime / STAR.seconds
      const size = STAR.size * Math.min(1, 0.4 + (0.6 * t) / STAR.grow)
      star.scale.set(size, size, 1)
      starMaterial.opacity = Math.min(1, Math.max(0, (1 - t) / (1 - STAR.fadeFrom)))
      if (t >= 1) {
        starTime = null
        star.visible = false
      }
    }
  }

  return {
    object,
    place(position, heading) {
      placeFigure(body, position, heading)
    },
    hit(playerPosition) {
      flashTime = 0
      starTime = 0
      const dx = playerPosition.x - body.position.x
      const dz = playerPosition.z - body.position.z
      const length = Math.hypot(dx, dz)
      // 主角與奧客的位置重疊時看不出主角在哪一側,星號就冒在奧客的正中央
      const scale = length === 0 ? 0 : STAR.offset / length
      star.position.set(body.position.x + dx * scale, STAR.height, body.position.z + dz * scale)
      star.visible = true
    },
    animate(distance, dt, state) {
      animateHit(dt)
      body.visible = state !== 'gone'
      fallTime = state === 'down' ? (fallTime ?? 0) + dt : null
      const fall = fallTime === null ? 0 : Math.min(fallTime / FALL.seconds, 1)
      // 繞 x 軸轉正的角度是頂端往後(+z)倒
      faller.rotation.x = (Math.PI / 2) * fall * fall
      const target = state === 'staggered' ? RECOIL.angle : 0
      const rate = target > recoil ? RECOIL.rate : RECOIL.recoverRate
      recoil += Math.sign(target - recoil) * Math.min(Math.abs(target - recoil), rate * dt)
      upperBody.rotation.x = recoil

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
    talk(dt, state, inSight) {
      bubble.update(dt, state === 'chasing' || state === 'staggered', inSight)
    },
    fadeIfBlocking(cameraPosition, target, dt) {
      const goal = blocksView(body.position, cameraPosition, target) ? SEE_THROUGH_OPACITY : 1
      opacity += Math.sign(goal - opacity) * Math.min(Math.abs(goal - opacity), FADE_RATE * dt)
      // 完全不透明時關掉 transparent,奧客才會和場景裡其他東西一樣照一般的順序畫。
      // transparent 決定 shader 怎麼處理 alpha,切換時要讓 material 重新編譯
      const transparent = opacity < 1
      for (const material of Object.values(materials)) {
        if (material.transparent !== transparent) {
          material.transparent = transparent
          material.needsUpdate = true
        }
        material.opacity = opacity
      }
      bubble.setOpacity(opacity)
    },
    dispose() {
      box.dispose()
      for (const material of Object.values(materials)) material.dispose()
      starMaterial.dispose()
      starTexture.dispose()
      bubble.dispose()
    },
  }
}

// 漫畫風的爆炸星號:紅色的大爆炸裡疊著一個黃色的小爆炸,兩層都描黑邊。四周透明
function paintStar(context) {
  const { width, height } = context.canvas
  const burst = (radius, rotation) => {
    context.beginPath()
    for (let i = 0; i < STAR_POINTS * 2; i += 1) {
      const angle = rotation + (i * Math.PI) / STAR_POINTS
      // 偶數是尖角,奇數是尖角之間的凹處
      const r = i % 2 === 0 ? radius * STAR_SPIKES[(i / 2) % STAR_SPIKES.length] : radius * 0.5
      context.lineTo(width / 2 + Math.cos(angle) * r, height / 2 + Math.sin(angle) * r)
    }
    context.closePath()
  }
  context.lineJoin = 'round'
  context.lineWidth = 8
  context.strokeStyle = STAR_COLORS.outline
  burst(width * 0.46, 0)
  context.fillStyle = STAR_COLORS.outer
  context.fill()
  context.stroke()
  burst(width * 0.28, Math.PI / STAR_POINTS)
  context.fillStyle = STAR_COLORS.inner
  context.fill()
  context.lineWidth = 5
  context.stroke()
}

// 從上方俯瞰,站在 position 的奧客會不會遮住鏡頭看向 target 的視線。
// 奧客要在鏡頭與 target 之間,而且離視線夠近,近到他的身體與主角的身體在畫面上會重疊
function blocksView(position, cameraPosition, target) {
  const sightX = target.x - cameraPosition.x
  const sightZ = target.z - cameraPosition.z
  const length = Math.hypot(sightX, sightZ)
  if (length === 0) return false
  const offsetX = position.x - cameraPosition.x
  const offsetZ = position.z - cameraPosition.z
  const along = (offsetX * sightX + offsetZ * sightZ) / length
  if (along <= 0 || along >= length) return false
  const across = Math.abs(offsetX * sightZ - offsetZ * sightX) / length
  return across < HALF_SPAN + PLAYER_HALF_WIDTH
}
