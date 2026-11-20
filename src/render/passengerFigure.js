// 奧客的人:一位猥瑣的鼠面乘客,挺著大啤酒肚,穿著花襯衫、海灘褲與拖鞋。兩位奧客長得一樣。
// 用長方體、多面體與角錐拼成的低多邊形造型,動作由程式計算,不使用模型、動畫或圖片素材檔;
// 花襯衫的花紋與爆炸星號的貼圖也在程式裡畫。
// 造型是原創的,只取鼠臉的通用特徵:尖長的臉、兩顆暴牙、兩側的鬍鬚與圓耳朵,不照著任何既有作品的角色做。
// 這裡只負責外觀、擺放、動作、被打中與倒地的樣子、什麼時候冒出對話框,以及擋在鏡頭前面時變半透明;
// 奧客在哪裡、朝哪裡、移動了多遠、處在哪個狀態,都由呼叫端依遊戲核心的快照告訴它。
import {
  BoxGeometry,
  BufferAttribute,
  ConeGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  MathUtils,
  MeshStandardMaterial,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'

import { approach, createCanvasTexture, createRunCycle, part, placeFigure, taperedBox } from './lowPolyFigure.js'
import { createSpeechBubble } from './speechBubble.js'

const FUR_COLOR = '#8d847d'
// 手、腳、耳朵內側與鼻子是老鼠的粉紅色
const SKIN_COLOR = '#eba4aa'
const DARK_COLOR = '#1c1918'
// 暴牙與眼白都偏黃,看起來不太乾淨
const IVORY_COLOR = '#fbf3d9'
const SHORTS_COLOR = '#2f6fd6'
const TRIM_COLOR = '#ffffff'
const SOLE_COLOR = '#ffd23f'
// 花襯衫的配色。鮮豔的底色在綠色的樹籬與草地前面才顯眼,葉子也比樹籬淺,才不會融進背景
const SHIRT_COLORS = { base: '#e5487d', petal: '#fff4dc', heart: '#b3123f', pollen: '#ffd23f', leaf: '#3fb37a' }

// 各部位的尺寸,單位與世界座標相同。整個人含耳朵大約 2.6 高,比主角高大一圈。
// 攤開的雙手大約和碰撞的圓一樣寬,看起來幾乎塞滿走道,撞上去時才不會像撞上一道看不見的牆;
// 改了設定模組裡奧客的碰撞半徑,要跟著調整肩膀的寬度、手臂的長度與 STAND 裡手臂往外張的角度。
// 髖關節以上的部位以髖關節為原點,臉朝 -z,右手在 +x

// 腿分成大腿、小腿與腳三節,腿的角度由腳踝要放在哪裡反推出來,膝蓋往後彎。
// - thigh 是髖關節到膝蓋的長度,shin 是膝蓋到腳踝的長度。
// - ankle 是腳底平貼地面時腳踝離地的高度。
// - stretch 是腳踩在地上時髖關節到腳踝最遠多遠。它比大腿加小腿短一點,膝蓋才不會整個打直。
const LEG = { thigh: 0.52, shin: 0.5, ankle: 0.11, spacing: 0.26, stretch: 1.01 }
// 海灘褲:褲頭是一塊蓋住兩邊髖關節的長方體,褲管從髖關節往下蓋 length,寬鬆地罩在大腿外面
const SHORTS = { width: 0.98, height: 0.32, depth: 0.66, legWidth: 0.42, legDepth: 0.46, length: 0.4 }
// 襯衫的軀幹從褲頭的中段往上到肩膀。下襬沒有紮進褲子,蓋住褲頭的上半截。size 是 `[寬, 深]`,上窄下寬
const TORSO = { bottom: 0.02, top: 0.92, bottomSize: [1.04, 0.7], topSize: [0.98, 0.58] }
// 啤酒肚是一顆橢球,被花襯衫包著,從軀幹的正面往前凸出一大截,下緣垂到褲頭前面
const BELLY = { radii: [0.5, 0.45, 0.48], y: 0.36, z: -0.22 }
// 手臂分成上臂與前臂,掛在軀幹頂端兩側的肩關節上。
// - upper 是肩關節到手肘的長度。
// - reach 是手肘到指尖的長度,其中 forearm 是前臂,其餘是手掌與手指。
const ARM = { x: 0.62, y: 0.8, upper: 0.48, forearm: 0.38, reach: 0.65 }
const NECK = { y: 0.95, z: -0.08, size: [0.26, 0.24, 0.26] }
// 頭的原點在頭殼的中心。它比軀幹的中線往前,配上往前傾的上半身,看起來就是頭往前探、微微駝背
const HEAD = { y: 1.1, z: -0.2, radii: [0.3, 0.28, 0.32] }
// 尖長的臉是一個六角錐:底面嵌在頭殼的正面,尖端往前伸出 length,往下垂 pitch 的角度。radii 是底面的寬與高的一半
const SNOUT = { y: -0.07, z: -0.2, radii: [0.21, 0.17], length: 0.46, pitch: 0.1 }
// 兩顆暴牙從尖嘴底下往下凸出,at 是它們離尖嘴底面多遠,是尖嘴長度的幾分之幾
const TEETH = { at: 0.62, width: 0.05, height: 0.09, gap: 0.006 }
// 鬍鬚從尖嘴兩側長出來:root 是根部離尖嘴底面多遠,是尖嘴長度的幾分之幾;每一根往後掃 sweep,上下散開 WHISKER_FAN 裡的角度
const WHISKER = { root: 0.72, length: 0.36, thickness: 0.012, sweep: 0.25 }
const WHISKER_FAN = [0.22, 0.02, -0.18]
// 眼睛小而靠攏,擠在尖嘴根部的上方。上眼皮往內側斜斜地壓下來,蓋住眼白的上半截,看起來在打壞主意
const EYE = { x: 0.12, y: 0.09, z: -0.265, radii: [0.06, 0.046, 0.032], pupil: 0.026, lidTilt: 0.3, glance: 0.022 }
// 圓耳朵立在頭頂兩側,往外倒 tilt、往前轉 turn,耳朵內側是粉紅色的
const EAR = { x: 0.22, y: 0.22, z: 0.05, radius: 0.17, tilt: 0.35, turn: 0.3 }
// 對話框的尾巴尖端在畫面上離頭的中心多遠。它比尖嘴連同鼻頭從頭的中心往前伸出的長度再多一點,
// 從側面看時尾巴才不會蓋到鼻頭;從正面看時它也比鬍鬚伸出去的寬度大
const BUBBLE_GAP = -SNOUT.z + SNOUT.length + 0.12

// 站著不動時的姿勢:膝蓋微彎、兩腳站開、腳尖朝外,雙手往兩側攤開、掌心朝上地聳肩。
// - reach 是髖關節到腳踝的距離,比大腿加小腿短,膝蓋因此微彎;ankleForward 是腳踝在髖關節前方多遠。
// - spread 是兩腿往外張的角度,turnout 是腳尖往外轉的角度。
// - splay 是上臂往外張的角度,forward 是整隻手臂往前轉的角度。
// - elbow 是前臂在手肘往外翻上去的角度,splay 與 elbow 相加超過 π/2 時前臂往上翹;elbowTurn 是前臂再繞著上臂往前轉的角度。
// - roll 是手掌繞著前臂翻的角度,π 是掌心朝上。shrug 是肩膀抬起的高度。
const STAND = {
  reach: 0.985,
  ankleForward: 0.03,
  spread: 0.1,
  turnout: 0.35,
  splay: 0.85,
  forward: 0.15,
  elbow: 1,
  elbowTurn: 0.35,
  roll: Math.PI,
  shrug: 0.08,
}
// 站著時髖關節比腳踝高多少,沿著腿往外張開的平面量
const STANDING_RISE = Math.sqrt(STAND.reach ** 2 - STAND.ankleForward ** 2)
// 遊蕩時走路、追趕時跑步的姿勢。
// - stride 是走完一個完整步伐循環(左右腳各跨一次)前進的距離。
// - duty 是一隻腳在一個循環裡踩在地上的比例。走路時是一半,一隻腳落地的那一刻另一隻腳正好離地;
//   跑步時不到一半,兩腳有一段時間同時離地。
// - reach 是腳踩在髖關節正下方時髖關節到腳踝的距離,越短膝蓋越彎、身體越低。lift 是往前跨的腳在跨到一半時抬多高。
// - spread 與 turnout 和 STAND 的相同。
// - splay 是手臂往外張的角度,armSwing 是手臂與同側的腳反向前後擺的角度。
// - elbow 是手肘往前彎的角度。
// - lean 是上半身往前傾的角度,bounce 是跑步時兩腳都離地的期間身體多跳起來的高度。
const WALK = {
  stride: 1.7,
  duty: 0.5,
  reach: 0.95,
  lift: 0.12,
  spread: 0.05,
  turnout: 0.15,
  splay: 0.4,
  armSwing: 0.3,
  elbow: 0.25,
  lean: 0.04,
  bounce: 0,
}
const RUN = {
  stride: 3.4,
  duty: 0.32,
  reach: 0.9,
  lift: 0.3,
  spread: 0.05,
  turnout: 0.1,
  splay: 0.6,
  armSwing: 0.6,
  elbow: 1.1,
  lean: 0.2,
  bounce: 0.04,
}
// 從走路換到跑步、或從跑步換回走路,每秒最多換多少
const GAIT_RATE = 4
// 駝背:整個上半身繞髖關節往前傾 body,頭再抬回 head,臉才大致朝前、稍微往下看
const HUNCH = { body: 0.16, head: 0.12 }
// 呼吸:每 seconds 秒一次,站著不動時才有,走動時收起來。吸氣時:
// - 肩膀、脖子與頭抬起 lift。
// - 肩膀再多聳起 shrug。
// - 胸口與肚子鼓起 swell 倍。
const BREATH = { seconds: 3.2, lift: 0.03, shrug: 0.03, swell: 0.05 }
// 賊溜溜的眼睛:眼珠依序看向每一項的方向,停留那麼多秒,播完從頭再來。方向 -1 是奧客的左邊,0 是正前方,1 是右邊
const GLANCES = [
  [0, 1.4],
  [1, 0.6],
  [-1, 0.8],
  [0, 1],
  [-1, 0.5],
  [1, 0.9],
]
const GLANCE_SECONDS = GLANCES.reduce((total, [, seconds]) => total + seconds, 0)

// 花襯衫的花紋是一塊 pixels 見方、四邊接得起來的貼圖,平鋪在襯衫上,一塊在世界座標裡是 size 見方
const SHIRT_TILE = { pixels: 256, size: 1 }
// 扶桑花的中心、半徑與旋轉,單位是貼圖的像素。葉子先畫、花後畫,花蓋在葉子上面
const HIBISCUS = [
  [44, 52, 38, 0.2],
  [172, 28, 32, 1.1],
  [118, 140, 42, 0.6],
  [232, 168, 30, 1.7],
  [40, 208, 34, 2.4],
  [178, 238, 28, 0.9],
]
// 葉子的中心、長度與朝向,單位是貼圖的像素
const LEAVES = [
  [84, 30, 52, 2.4],
  [12, 96, 46, 0.4],
  [206, 82, 54, 2.0],
  [160, 186, 48, 0.9],
  [84, 230, 50, 2.8],
  [246, 236, 44, 1.4],
]

// 從上方俯瞰,站姿攤開的雙手的指尖離身體的中線多遠,也就是整個人最寬處的一半
const HALF_SPAN = standingHandReach()
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
// 轉軸在軀幹下半截的背面,也就是整個人最後面的地方,躺平時背貼著地面,不會插進地裡
const FALL = { seconds: 0.35, pivotZ: TORSO.bottomSize[1] / 2 }
// 爆炸星號出現在奧客身上朝向主角的那一面:離奧客的中線 offset、離地 height,單位與世界座標相同。
// 它從出現到消失共 seconds 秒:先在 grow 之前從四成脹到 size 那麼大,從 fadeFrom 起淡出。grow 與 fadeFrom 都是整段的幾分之幾
const STAR = { size: 1.5, offset: 0.9, height: 1.7, seconds: 0.3, grow: 0.25, fadeFrom: 0.5 }
// 星號的兩層:外層是紅色的大爆炸,內層是黃色的小爆炸。一圈有 POINTS 個尖角,每個尖角的長短照 SPIKES 輪替,看起來才不像規則的星形
const STAR_COLORS = { outer: '#ff4b2b', inner: '#ffe23a', outline: '#1c1918' }
const STAR_POINTS = 12
const STAR_SPIKES = [1, 0.78, 0.93, 0.7, 0.98, 0.82]

/**
 * 建立一位奧客的人,`object` 要由呼叫端加進場景。
 *
 * 每一位奧客各自建立一個,material 也各自一份,改一位的外觀不會改到另一位。
 *
 * 每一幀依序呼叫四個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`,heading 是遊戲核心的朝向。
 * - `animate(distance, dt, state)`:distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒,
 *   state 是遊戲核心快照裡這位奧客的狀態。
 *   - 有在移動時,`'chasing'` 播跑步的動作,其餘狀態播走路的動作。步伐跟著移動的距離前進,腳步與地面的速度一致。
 *   - 停下後很快回到站姿:膝蓋微彎、兩腳站開,雙手往兩側攤開、掌心朝上地聳肩,胸口隨著呼吸起伏。
 *   - 眼珠不時往左右瞄。
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
 * 只能在瀏覽器裡建立,因為花襯衫、爆炸星號與對話框的貼圖要用 canvas 畫。
 * 用完必須呼叫 `dispose()` 釋放 geometry、material 與貼圖。
 */
export function createPassengerFigure() {
  // 長方體、橢球與角錐都共用單位大小的 geometry,靠 scale 決定大小。
  // 花襯衫的部位例外:它們照實際大小各自建立 geometry,花紋才不會被 scale 拉長
  const box = new BoxGeometry(1, 1, 1)
  const ball = new IcosahedronGeometry(1, 1)
  // 尖端朝 -z、底面在原點的六角錐
  const cone = new ConeGeometry(1, 1, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.5)
  const torsoGeometry = withShirtPattern(taperedBox(TORSO.top - TORSO.bottom, TORSO.bottomSize, TORSO.topSize))
  const bellyGeometry = withShirtPattern(new IcosahedronGeometry(1, 1).scale(...BELLY.radii))
  const sleeveGeometry = withShirtPattern(new BoxGeometry(0.27, 0.3, 0.27))
  const geometries = [box, ball, cone, torsoGeometry, bellyGeometry, sleeveGeometry]

  const shirtTexture = createCanvasTexture(SHIRT_TILE.pixels, SHIRT_TILE.pixels, paintShirt)
  shirtTexture.wrapS = RepeatWrapping
  shirtTexture.wrapT = RepeatWrapping
  const materials = {
    shirt: new MeshStandardMaterial({ map: shirtTexture, roughness: 0.85, flatShading: true }),
    shorts: new MeshStandardMaterial({ color: SHORTS_COLOR, roughness: 0.9 }),
    trim: new MeshStandardMaterial({ color: TRIM_COLOR, roughness: 0.9 }),
    fur: new MeshStandardMaterial({ color: FUR_COLOR, roughness: 0.9, flatShading: true }),
    skin: new MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.8, flatShading: true }),
    dark: new MeshStandardMaterial({ color: DARK_COLOR, roughness: 0.5 }),
    ivory: new MeshStandardMaterial({ color: IVORY_COLOR, roughness: 0.4 }),
    sole: new MeshStandardMaterial({ color: SOLE_COLOR, roughness: 0.7 }),
  }

  const leftLeg = createLeg(-1, box, materials)
  const rightLeg = createLeg(1, box, materials)
  const leftArm = createArm(-1, box, sleeveGeometry, materials)
  const rightArm = createArm(1, box, sleeveGeometry, materials)

  // 眼珠在眼白前面,瞄向左右時只沿 x 移動
  const pupils = [-1, 1].map((side) => {
    const pupil = part(
      ball,
      materials.dark,
      [EYE.pupil, EYE.pupil, EYE.pupil / 2],
      [side * EYE.x, EYE.y, EYE.z - 0.025],
    )
    return { mesh: pupil, restX: pupil.position.x }
  })
  const head = new Group()
  head.position.set(0, HEAD.y, HEAD.z)
  head.add(
    part(ball, materials.fur, HEAD.radii, [0, 0, 0]),
    createSnout(box, ball, cone, materials),
    ...[-1, 1].flatMap((side) => eyeParts(side, box, ball, materials)),
    ...pupils.map(({ mesh }) => mesh),
    ...[-1, 1].map((side) => createEar(side, ball, materials)),
  )
  // 對話框掛在頭的中心,跟著步伐起伏、硬直時跟著往後仰;奧客轉向時它不會跟著繞圈
  const bubble = createSpeechBubble(BUBBLE_GAP)
  head.add(bubble.object)

  // 肩膀、脖子與頭一起隨著呼吸抬起
  const shoulders = new Group()
  const neck = part(box, materials.fur, NECK.size, [0, NECK.y, NECK.z])
  neck.rotation.x = -0.3
  shoulders.add(leftArm.shoulder, rightArm.shoulder, neck, head)

  // 上半身繞髖關節往前傾,硬直時往後仰。海灘褲的褲頭不在這裡,它跟著腿留在原地
  const torso = part(torsoGeometry, materials.shirt, [1, 1, 1], [0, (TORSO.bottom + TORSO.top) / 2, 0])
  const belly = part(bellyGeometry, materials.shirt, [1, 1, 1], [0, BELLY.y, BELLY.z])
  const upperBody = new Group()
  upperBody.add(torso, belly, shoulders)

  const hips = new Group()
  hips.add(
    part(box, materials.shorts, [SHORTS.width, SHORTS.height, SHORTS.depth], [0, 0, 0]),
    leftLeg.hip,
    rightLeg.hip,
    upperBody,
  )

  // 倒地時繞著 faller 的原點往後倒。pose 把整個人往前挪回原位,faller 的原點因此落在軀幹背面的地上
  const pose = new Group()
  pose.position.z = -FALL.pivotZ
  pose.add(hips)
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

  const runCycle = createRunCycle(WALK.stride)
  const gait = { ...WALK }
  // 跑步的姿勢佔幾成,0 是走路、1 是跑步
  let running = 0
  let opacity = 1
  // 閃白與星號從被打中起已經播了幾秒,沒有在播時是 null
  let flashTime = null
  let starTime = null
  let recoil = 0
  // 倒地之後已經過了幾秒,沒有倒地時是 null
  let fallTime = null
  // 呼吸與眼珠的節奏從隨機的地方開始,兩位奧客才不會同時吸氣、同時瞄向同一邊
  let breathTime = Math.random() * BREATH.seconds
  let glanceTime = Math.random() * GLANCE_SECONDS

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

  function animateFace(dt) {
    glanceTime = (glanceTime + dt) % GLANCE_SECONDS
    let direction = 0
    let start = 0
    for (const [glance, seconds] of GLANCES) {
      direction = glance
      start += seconds
      if (glanceTime < start) break
    }
    for (const { mesh, restX } of pupils) mesh.position.x = restX + direction * EYE.glance
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
      animateFace(dt)
      body.visible = state !== 'gone'
      fallTime = state === 'down' ? (fallTime ?? 0) + dt : null
      const fall = fallTime === null ? 0 : Math.min(fallTime / FALL.seconds, 1)
      // 繞 x 軸轉正的角度是頂端往後(+z)倒
      faller.rotation.x = (Math.PI / 2) * fall * fall
      const target = state === 'staggered' ? RECOIL.angle : 0
      const rate = target > recoil ? RECOIL.rate : RECOIL.recoverRate
      recoil = approach(recoil, target, rate * dt)

      running = approach(running, state === 'chasing' ? 1 : 0, GAIT_RATE * dt)
      for (const key of Object.keys(gait)) gait[key] = MathUtils.lerp(WALK[key], RUN[key], running)
      const { phase, blend } = runCycle.advance(distance, dt, gait.stride)

      // 右腳比左腳晚半個循環落地。先算出兩隻腳踝在哪裡、髖關節多高,再讓兩條腿去搆腳踝
      const cycle = phase / (Math.PI * 2)
      const leftFoot = footOf(cycle, gait)
      const rightFoot = footOf((cycle + 0.5) % 1, gait)
      const spread = MathUtils.lerp(STAND.spread, gait.spread, blend)
      const turnout = MathUtils.lerp(STAND.turnout, gait.turnout, blend)
      // rise 是髖關節比著地的腳踝高多少,沿著腿往外張開的平面量
      const rise = MathUtils.lerp(STANDING_RISE, hipRiseOf(cycle, [leftFoot, rightFoot], gait), blend)
      hips.position.y = LEG.ankle + rise * Math.cos(spread)
      const poseLeg = (leg, foot) => {
        const forward = MathUtils.lerp(STAND.ankleForward, foot.forward, blend)
        leg.pose(forward, rise - foot.height * blend, spread, turnout)
      }
      poseLeg(leftLeg, leftFoot)
      poseLeg(rightLeg, rightFoot)

      // 呼吸在 0 到 1 之間起伏,0 是吐完氣
      breathTime = (breathTime + dt) % BREATH.seconds
      const breath = ((1 - Math.cos((breathTime / BREATH.seconds) * Math.PI * 2)) / 2) * (1 - blend)
      shoulders.position.y = breath * BREATH.lift
      torso.scale.set(1 + breath * BREATH.swell * 0.4, 1, 1 + breath * BREATH.swell)
      belly.scale.set(1, 1, 1 + breath * BREATH.swell)
      // 手臂與同側的腳反向擺動:左腳在循環的開頭往前落地,這時右手在最前面、左手在最後面
      leftArm.pose(-Math.cos(phase), blend, gait, breath)
      rightArm.pose(Math.cos(phase), blend, gait, breath)

      // 繞 x 軸轉負的角度是往前(-z)傾。頭抬回駝背與跑步前傾的大部分,臉才不會朝著地面
      const lean = HUNCH.body + gait.lean * blend
      upperBody.rotation.x = recoil - lean
      head.rotation.x = HUNCH.head + gait.lean * blend * 0.8
    },
    talk(dt, state, inSight) {
      bubble.update(dt, state === 'chasing' || state === 'staggered', inSight)
    },
    fadeIfBlocking(cameraPosition, target, dt) {
      const goal = blocksView(body.position, cameraPosition, target) ? SEE_THROUGH_OPACITY : 1
      opacity = approach(opacity, goal, FADE_RATE * dt)
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
      for (const geometry of geometries) geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      shirtTexture.dispose()
      starMaterial.dispose()
      starTexture.dispose()
      bubble.dispose()
    },
  }
}

// 站姿的右手指尖離身體中線多遠。肩關節與手肘的轉動照 createArm 裡站姿的擺法,左手與右手對稱
function standingHandReach() {
  const shoulder = new Euler(0, STAND.forward, STAND.splay)
  const elbow = new Euler(0, STAND.elbowTurn, STAND.elbow)
  const upperArm = new Vector3(0, -ARM.upper, 0).applyEuler(shoulder)
  const forearm = new Vector3(0, -ARM.reach, 0).applyEuler(elbow).applyEuler(shoulder)
  return ARM.x + upperArm.x + forearm.x
}

/**
 * 一隻腳在步伐循環的 cycle 這一刻(0 到 1),腳踝在髖關節前方多遠、離地多高,回傳 `{ forward, height }`。
 *
 * 循環的開頭是這隻腳往前落地的那一刻。從開頭到 duty 踩在地上,腳踝從前方等速往後移到後方,
 * 往後移的速度正好等於往前走的速度,所以腳不會在地上滑。其餘的時間往前跨回前方,中途抬起 lift。
 * 往前跨的開頭與結尾和踩在地上時一樣往後移,腳離地與落地時才不會突然停住。
 */
function footOf(cycle, gait) {
  const half = (gait.stride * gait.duty) / 2
  if (cycle < gait.duty) return { forward: half - (2 * half * cycle) / gait.duty, height: 0 }
  const t = (cycle - gait.duty) / (1 - gait.duty)
  // 從後方到前方的三次 Hermite 曲線,頭尾的斜率與踩在地上時相同
  const slope = (-2 * half * (1 - gait.duty)) / gait.duty
  const forward = -half + 2 * half * (3 * t ** 2 - 2 * t ** 3) + slope * (2 * t ** 3 - 3 * t ** 2 + t)
  return { forward, height: gait.lift * Math.sin(Math.PI * t) }
}

/**
 * 走動時髖關節比著地的腳踝高多少,feet 是兩隻腳踝在 cycle 這一刻的位置。
 *
 * 有腳踩在地上時,髖關節要低到每一隻腳都搆得到它的腳踝:
 * - 踩在地上的腳在髖關節正下方時,髖關節最高,比腳踝高 reach。
 * - 腳往前或往後移到步幅的盡頭時最低,這時腿伸到 LEG.stretch。中間沿著拋物線變化,身體才平順地起伏。
 * - 往前跨的腳也算在內,它離地多高,髖關節就能多高。快落地的腳因此一路把髖關節往下帶,落地的那一刻高度才不會突然跳一下。
 *
 * 兩腳都離地時,身體從上一隻腳離地到下一隻腳落地之間跳起來 bounce 再落下。
 */
function hipRiseOf(cycle, feet, gait) {
  const half = (gait.stride * gait.duty) / 2
  // 拋物線在步幅的盡頭剛好碰到腿伸到 LEG.stretch 的高度,中間都比那條曲線低,所以踩在地上的腳一定搆得到。
  // 往前跨的腳在起步與落地前會比步幅的盡頭再往外伸一點,這一段照盡頭算,髖關節才不會被它多拉低一下
  const dip = gait.reach - Math.sqrt(LEG.stretch ** 2 - half ** 2)
  const highestOver = ({ forward, height }) => gait.reach - dip * MathUtils.clamp(forward / half, -1, 1) ** 2 + height
  if (feet.some((foot) => foot.height === 0)) return Math.min(...feet.map(highestOver))
  const flight = ((cycle % 0.5) - gait.duty) / (0.5 - gait.duty)
  return gait.reach - dip + gait.bounce * Math.sin(Math.PI * flight)
}

/**
 * 一條腿:海灘褲的褲管罩著大腿,底下露出毛茸茸的小腿與粉紅色的腳,腳踩著夾腳拖。side 是 -1 左腳、1 右腳。
 *
 * 回傳 `{ hip, pose }`:hip 是髖關節,擺在髖部的 `(side * LEG.spacing, 0, 0)`。
 * `pose(forward, down, spread, turnout)` 讓腳踝落在髖關節前方 forward、下方 down 的地方,
 * 兩者都沿著腿往外張開的平面量;spread 是腿往外張的角度,turnout 是腳尖往外轉的角度。
 * 搆不到時腿伸直,朝那裡伸過去。腳底一直與地面平行。
 */
function createLeg(side, box, materials) {
  const hip = new Group()
  hip.position.x = side * LEG.spacing
  const shortsLeg = part(
    box,
    materials.shorts,
    [SHORTS.legWidth, SHORTS.length, SHORTS.legDepth],
    [0, 0.02 - SHORTS.length / 2, 0],
  )
  // 褲管外側的白色滾邊
  const stripe = part(
    box,
    materials.trim,
    [0.012, SHORTS.length - 0.04, 0.07],
    [side * (SHORTS.legWidth / 2 + 0.004), -SHORTS.length / 2, 0],
  )
  hip.add(shortsLeg, stripe, part(box, materials.fur, [0.2, LEG.thigh, 0.2], [0, -LEG.thigh / 2, 0]))

  const knee = new Group()
  knee.position.y = -LEG.thigh
  knee.add(part(box, materials.fur, [0.19, LEG.shin, 0.19], [0, -LEG.shin / 2, 0]))
  hip.add(knee)

  // 腳踝以下的部位以腳踝為原點。腳掌往前伸出去,腳跟只在腳踝後面一點
  const ankle = new Group()
  ankle.position.y = -LEG.shin
  const soleThickness = 0.035
  const footZ = -0.07
  ankle.add(
    part(box, materials.skin, [0.17, 0.09, 0.3], [0, -LEG.ankle + soleThickness + 0.045, footZ]),
    part(box, materials.sole, [0.22, soleThickness, 0.4], [0, -LEG.ankle + soleThickness / 2, footZ]),
    // 夾腳拖的帶子從腳趾之間往兩側斜斜地拉到腳背
    ...[-1, 1].map((strapSide) => {
      const strap = part(box, materials.shorts, [0.025, 0.02, 0.17], [strapSide * 0.045, 0.022, footZ - 0.06])
      strap.rotation.y = strapSide * 0.5
      return strap
    }),
  )
  knee.add(ankle)

  const { thigh: upper, shin: lower } = LEG
  return {
    hip,
    pose(forward, down, spread, turnout) {
      // 大腿、小腿與髖關節到腳踝的連線圍成三角形,用餘弦定理求膝蓋彎多少、大腿比連線往前多少
      const reach = Math.min(Math.hypot(forward, down), upper + lower - 1e-4)
      const bend =
        Math.PI - Math.acos(MathUtils.clamp((upper ** 2 + lower ** 2 - reach ** 2) / (2 * upper * lower), -1, 1))
      const opening = Math.acos(MathUtils.clamp((upper ** 2 + reach ** 2 - lower ** 2) / (2 * upper * reach), -1, 1))
      // 繞 x 軸轉正的角度是腳往前(-z)踢。Euler 的順序是先繞 z 往外張,再繞 x 前後擺
      const thigh = Math.atan2(forward, down) + opening
      hip.rotation.set(thigh, 0, side * spread)
      knee.rotation.x = -bend
      // 腳踝抵銷大腿與膝蓋的轉動,腳底才與地面平行
      ankle.rotation.set(bend - thigh, -side * turnout, -side * spread)
    },
  }
}

/**
 * 一隻手臂:花襯衫的短袖蓋住上臂的上半截,底下露出毛茸茸的手臂與粉紅色的手。side 是 -1 左手、1 右手。
 *
 * 回傳 `{ shoulder, pose }`:shoulder 是肩關節,擺在上半身的 `(side * ARM.x, ARM.y, 0)`。
 * `pose(swing, blend, gait, breath)` 擺好這隻手:
 * - swing 是走動時手臂前後擺到哪裡,1 是最前面、-1 是最後面。
 * - blend 是走動的程度,0 是站姿。
 * - gait 是走路或跑步的姿勢。
 * - breath 是呼吸的起伏。
 */
function createArm(side, box, sleeveGeometry, materials) {
  const shoulder = new Group()
  shoulder.position.x = side * ARM.x
  shoulder.add(
    part(sleeveGeometry, materials.shirt, [1, 1, 1], [0, -0.11, 0]),
    part(box, materials.fur, [0.18, ARM.upper, 0.18], [0, -ARM.upper / 2, 0]),
  )

  const elbow = new Group()
  elbow.position.y = -ARM.upper
  elbow.add(part(box, materials.fur, [0.16, ARM.forearm, 0.16], [0, -ARM.forearm / 2, 0]))
  shoulder.add(elbow)

  // 手的原點在手腕,手指沿 -y 伸出去。手垂在身體兩側時掌心朝內(朝 -side 那一側)、大拇指朝前;
  // 繞 y 軸翻轉 π 之後掌心朝外,手臂攤開成水平時掌心就朝上
  const wrist = new Group()
  wrist.position.y = -ARM.forearm
  const fingers = new Group()
  fingers.position.y = -0.16
  // 手指往掌心那一側微微彎起來
  fingers.rotation.z = -side * 0.45
  fingers.add(part(box, materials.skin, [0.06, 0.12, 0.17], [0, -0.06, 0]))
  const thumb = part(box, materials.skin, [0.055, 0.1, 0.055], [-side * 0.02, -0.06, -0.11])
  thumb.rotation.x = 0.6
  wrist.add(part(box, materials.skin, [0.07, 0.16, 0.19], [0, -0.08, 0]), fingers, thumb)
  elbow.add(wrist)

  return {
    shoulder,
    pose(swing, blend, gait, breath) {
      const standing = 1 - blend
      // Euler 的順序是先繞 z 往外張、再繞 y 往前轉,最後繞 x 前後擺,前後擺動時才不會改變往外張的角度。
      // 繞 x 軸轉正的角度是手往前(-z)擺
      shoulder.rotation.set(
        gait.armSwing * swing * blend,
        side * STAND.forward * standing,
        side * MathUtils.lerp(STAND.splay, gait.splay, blend),
      )
      shoulder.position.y = ARM.y + STAND.shrug * standing + BREATH.shrug * breath
      // 站著時前臂在手肘往外翻上去、再往前轉,走動時往前彎
      elbow.rotation.set(gait.elbow * blend, side * STAND.elbowTurn * standing, side * STAND.elbow * standing)
      wrist.rotation.y = side * STAND.roll * standing
    },
  }
}

// 尖長的臉:六角錐的尖嘴,尖端是粉紅色的鼻頭,底下凸出兩顆暴牙,兩側各長三根鬍鬚
function createSnout(box, ball, cone, materials) {
  const snout = new Group()
  snout.position.set(0, SNOUT.y, SNOUT.z)
  // 繞 x 軸轉負的角度是尖端往下
  snout.rotation.x = -SNOUT.pitch
  const [radiusX, radiusY] = SNOUT.radii
  snout.add(
    part(cone, materials.fur, [radiusX, radiusY, SNOUT.length], [0, 0, 0]),
    part(ball, materials.skin, [0.05, 0.045, 0.045], [0, 0.01, -SNOUT.length]),
  )

  // 尖嘴越往前越細,暴牙的上緣貼著那裡的下緣,再往上嵌進去一點
  const teethTop = -radiusY * (1 - TEETH.at) + 0.01
  for (const side of [-1, 1]) {
    snout.add(
      part(
        box,
        materials.ivory,
        [TEETH.width, TEETH.height, 0.022],
        [side * (TEETH.width + TEETH.gap) * 0.5, teethTop - TEETH.height / 2, -SNOUT.length * TEETH.at],
      ),
    )
  }

  // 每一根鬍鬚的原點在根部,沿著 side 那一側的 x 伸出去。往後掃是繞 y 轉,上下散開是繞 z 轉
  const rootX = radiusX * (1 - WHISKER.root)
  for (const side of [-1, 1]) {
    for (const fan of WHISKER_FAN) {
      const whisker = new Group()
      whisker.position.set(side * rootX, 0, -SNOUT.length * WHISKER.root)
      whisker.rotation.set(0, -side * WHISKER.sweep, side * fan)
      whisker.add(
        part(
          box,
          materials.dark,
          [WHISKER.length, WHISKER.thickness, WHISKER.thickness],
          [(side * WHISKER.length) / 2, 0, 0],
        ),
      )
      snout.add(whisker)
    }
  }
  return snout
}

// 一隻眼睛的眼白與上眼皮,side 是 -1 左眼、1 右眼。眼皮的內側比外側低,壓住眼白的上半截
function eyeParts(side, box, ball, materials) {
  const white = part(ball, materials.ivory, EYE.radii, [side * EYE.x, EYE.y, EYE.z])
  const lid = part(box, materials.fur, [0.14, 0.05, 0.075], [side * EYE.x, EYE.y + 0.03, EYE.z - 0.005])
  lid.rotation.z = side * EYE.lidTilt
  return [white, lid]
}

// 一隻圓耳朵,side 是 -1 左耳、1 右耳。外圈是毛色,內側是一圈小一點的粉紅色
function createEar(side, ball, materials) {
  const ear = new Group()
  ear.position.set(side * EAR.x, EAR.y, EAR.z)
  // Euler 只用到 y 與 z:先往外倒,再往前轉,耳朵的正面才朝著斜前方
  ear.rotation.set(0, -side * EAR.turn, -side * EAR.tilt)
  ear.add(
    part(ball, materials.fur, [EAR.radius, EAR.radius, 0.035], [0, 0, 0]),
    part(ball, materials.skin, [EAR.radius * 0.65, EAR.radius * 0.65, 0.02], [0, 0, -0.02]),
  )
  return ear
}

/**
 * 依 geometry 每個三角形面朝的方向,把花襯衫的花紋從正面、側面或上方投影上去,回傳鋪好花紋的 geometry。
 *
 * 一塊花紋在 geometry 的座標裡是 `SHIRT_TILE.size` 見方,所以 geometry 要照實際大小建立、擺放時不再縮放,
 * 花朵在軀幹、肚子與袖子上才一樣大。傳入的 geometry 有 index 時會換成沒有 index 的新 geometry,舊的會被釋放。
 */
function withShirtPattern(geometry) {
  // 相鄰的三角形可能投影到不同的面,所以每個三角形要有自己的頂點,不能共用
  const flat = geometry.index === null ? geometry : geometry.toNonIndexed()
  if (flat !== geometry) geometry.dispose()
  const position = flat.attributes.position
  const uv = new Float32Array(position.count * 2)
  const corner = new Vector3()
  const edge = new Vector3()
  const normal = new Vector3()
  for (let i = 0; i < position.count; i += 3) {
    // 三角形兩條邊的外積就是它面朝的方向
    corner.fromBufferAttribute(position, i)
    edge.fromBufferAttribute(position, i + 1).sub(corner)
    normal
      .fromBufferAttribute(position, i + 2)
      .sub(corner)
      .cross(edge)
    const [x, y, z] = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)]
    // 面朝哪一軸,就沿著那一軸投影,用另外兩軸的座標當貼圖座標
    const axes = x >= y && x >= z ? ['z', 'y'] : y >= z ? ['x', 'z'] : ['x', 'y']
    for (let j = i; j < i + 3; j += 1) {
      corner.fromBufferAttribute(position, j)
      uv[j * 2] = corner[axes[0]] / SHIRT_TILE.size
      uv[j * 2 + 1] = corner[axes[1]] / SHIRT_TILE.size
    }
  }
  flat.setAttribute('uv', new BufferAttribute(uv, 2))
  return flat
}

// 花襯衫的花紋:鮮豔的底色上散著葉子與大朵的扶桑花。
// 每一片葉子與每一朵花都在周圍八個方向各多畫一份,超出貼圖邊緣的部分從對邊與對角接回來,平鋪時才看不出接縫
function paintShirt(context) {
  const size = SHIRT_TILE.pixels
  context.fillStyle = SHIRT_COLORS.base
  context.fillRect(0, 0, size, size)
  const wrapped = (draw) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        context.save()
        context.translate(dx, dy)
        draw()
        context.restore()
      }
    }
  }
  for (const [x, y, length, angle] of LEAVES) wrapped(() => paintLeaf(context, x, y, length, angle))
  for (const [x, y, radius, angle] of HIBISCUS) wrapped(() => paintHibiscus(context, x, y, radius, angle))
}

// 一片尖橢圓的葉子,中間有一條深色的葉脈
function paintLeaf(context, x, y, length, angle) {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.fillStyle = SHIRT_COLORS.leaf
  context.beginPath()
  context.moveTo(-length / 2, 0)
  context.quadraticCurveTo(0, -length * 0.35, length / 2, 0)
  context.quadraticCurveTo(0, length * 0.35, -length / 2, 0)
  context.fill()
  context.strokeStyle = 'rgba(0, 0, 0, 0.25)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(-length / 2, 0)
  context.lineTo(length / 2, 0)
  context.stroke()
  context.restore()
}

// 一朵扶桑花:五片圓圓的花瓣圍著深紅色的花心,花心伸出一根帶著黃色花粉的花蕊
function paintHibiscus(context, x, y, radius, angle) {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.fillStyle = SHIRT_COLORS.petal
  for (let i = 0; i < 5; i += 1) {
    const petal = (i * Math.PI * 2) / 5
    context.beginPath()
    context.ellipse(
      Math.cos(petal) * radius * 0.5,
      Math.sin(petal) * radius * 0.5,
      radius * 0.55,
      radius * 0.42,
      petal,
      0,
      Math.PI * 2,
    )
    context.fill()
  }
  context.fillStyle = SHIRT_COLORS.heart
  context.beginPath()
  context.arc(0, 0, radius * 0.28, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = SHIRT_COLORS.heart
  context.lineWidth = radius * 0.08
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(radius * 0.7, -radius * 0.2)
  context.stroke()
  context.fillStyle = SHIRT_COLORS.pollen
  context.beginPath()
  context.arc(radius * 0.72, -radius * 0.2, radius * 0.1, 0, Math.PI * 2)
  context.fill()
  context.restore()
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
