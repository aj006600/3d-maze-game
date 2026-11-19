// 主角的人:一位穿制服的空服員,左手一直拉著登機箱。用長方體與多面體拼成的低多邊形造型,跑步動作由程式計算,
// 不使用模型、動畫或圖片素材檔;腰帶的虎紋也是在程式裡畫出來的貼圖。
// 這裡只負責外觀、擺放與動作;主角在哪裡、朝哪裡、移動了多遠,都由呼叫端依遊戲核心的狀態告訴它。
// 鏡頭大多在主角背後,所以背影的辨識度優先:後腦的包頭、腰帶右側的蝴蝶結與兩條帶尾。
import {
  BoxGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three'

import { createFeedbackClip, hopOf } from './collectFeedback.js'
import { createCanvasTexture, createRunCycle, part, placeFigure } from './lowPolyFigure.js'
import { createSuitcaseFigure } from './suitcaseFigure.js'
import { paintTigerStripes, TIGER_ORANGE, TIGER_TILE_SIZE } from './tigerStripes.js'

const SKIN_COLOR = '#f2c7a5'
const HAIR_COLOR = '#2b1d17'
const SHIRT_COLOR = '#f5c065'
const NAME_TAG_COLOR = '#ffe03a'
const PANTS_COLOR = '#3a3c42'
const SHOE_COLOR = '#151515'
const TIGER_BLACK = '#1b1410'

// 各部位的尺寸,單位與世界座標相同。整個人含頭髮大約 1.94 高。
// 總身高是整個場景的比例尺,牆高與鏡頭都依它設定,調整部位時不要改變總身高。
// 髖關節以上的部位以髖關節為原點,臉朝 -z,右手在 +x。軀幹各段的 size 是 `[寬, 深]`
const HIP_HEIGHT = 0.9
// hem 是褲管下緣離地的高度,褲管與鞋子在這裡交接
const LEG = { width: 0.155, depth: 0.17, spacing: 0.095, hem: 0.07 }
// 骨盆下緣與兩條褲管的外緣一樣大,褲管上方才不會多出一圈像裙襬的邊
const PELVIS = { bottom: -0.1, top: 0.21, bottomSize: [LEG.spacing * 2 + LEG.width, LEG.depth], topSize: [0.31, 0.2] }
const WAIST = { y: 0.19, size: [0.3, 0.19] }
const CHEST = { y: 0.4, size: [0.36, 0.23] }
const SHOULDER = { y: 0.56, size: [0.37, 0.2] }
const BELT = { y: 0.21, width: 0.33, height: 0.07, depth: 0.22 }
// length 是肩關節到手腕的長度。七分袖是整條袖子的七成,所以 sleeve 取 length 的七成。
// splay 是右手臂往外張的角度,它讓垂下的手臂避開腰帶右側的蝴蝶結,縮小它之前要確認袖口不會插進蝴蝶結。
// 左手臂拉著登機箱,往外張的角度另外由 CARRY 決定
const ARM = { width: 0.1, depth: 0.11, sleeve: 0.36, length: 0.52, splay: 0.14 }
// 手掌中心離肩關節的距離,沿著手臂往下量
const HAND_REACH = ARM.length + 0.05
// 頭是一顆橢球,radii 是 x、y、z 三個方向的半徑,y 是中心的高度
const HEAD = { radii: [0.165, 0.19, 0.175], y: 0.83 }
// 髮蓋是一塊球殼,軸心從頭頂往後倒 tilt,從軸心往外蓋到 coverage 的角度。
// 兩者相減是前緣離頭頂的角度,停在額頭上方,所以沒有瀏海;兩者相加是後緣離頭頂的角度,蓋到後頸。
// 球殼在分線那裡留一道 partGap 寬的縫,縫裡露出頭皮,就是側分的分線;partOffset 是分線從正前方往左偏的角度。
// 縫從離軸心 partStart 的地方開到前緣,頭頂後方不開縫,從背後看才不像一道裂痕
const HAIR_CAP = { tilt: 0.95, coverage: 1.66, partStart: 0.9, partGap: 0.06, partOffset: 0.45 }

// 跑完一個完整步伐循環(左右腳各跨一次)前進的距離
const STRIDE_LENGTH = 1.8
const LEG_SWING = 0.9
const ARM_SWING = 0.8
const BOB_HEIGHT = 0.08
const FORWARD_LEAN = 0.15

// 左手一直握著登機箱的拉桿,不跟著跑步前後擺動。
// - splay 是左手臂往外張的角度。登機箱的握把在箱子正中間,手要張到半個箱寬落在左腿外側,箱子才不會插進左腿。
// - pullBack 是跑起來時左手臂往後伸的角度,登機箱因此拖在左後方。
// - tilt 是跑起來時登機箱往後倒的角度。
const CARRY = { splay: 0.32, pullBack: 0.45, tilt: (35 * Math.PI) / 180 }

// 收集成功時的歡呼:舉起右手、原地小跳一下。時間點都是整段回饋的幾分之幾。
// - armRaise 是右手臂舉起時往外張的角度,接近 π 就是舉過頭頂。
// - 右手在 raise 舉到最高,停到 lower 開始放下,回饋播完時剛好回到原位。
// - 從 hopFrom 起跳、hopTo 落地,hopHeight 是跳起來的高度,單位與世界座標相同。
// 左手仍然握著拉桿,登機箱留在地上:跳起來時拉桿跟著手的高度伸長
const CHEER = { armRaise: 2.75, raise: 0.15, lower: 0.6, hopFrom: 0.1, hopTo: 0.55, hopHeight: 0.2 }

/**
 * 建立主角的人與她左手拉著的登機箱,`object` 要由呼叫端加進場景。
 *
 * 每一幀依序呼叫兩個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`,heading 是遊戲核心的朝向。
 * - `animate(distance, dt, cameraPosition)`:distance 是這一幀在世界座標裡移動了多遠,倒退時是負的;
 *   dt 是經過幾秒;cameraPosition 是鏡頭這一幀在世界座標的位置。
 *   有在移動就播跑步動作,登機箱跟著往後倒、拖在左後方;停下後很快回到站姿並保持靜止,登機箱直立在左側。
 *   登機箱的輪子依 distance 轉動,倒退時反轉;鏡頭離登機箱太近時,登機箱會暫時藏起來。
 *
 * 收集成功時呼叫 `cheer()`:主角舉起右手、原地小跳一下,左手仍然握著登機箱,登機箱留在地上。
 * 歡呼還沒播完時又呼叫,第二次會等第一次播完再從頭播。動作由之後每一幀的 `animate` 推進。
 *
 * 只能在瀏覽器裡建立,因為虎紋貼圖要用 canvas 畫。
 * 用完必須呼叫 `dispose()` 釋放 geometry、material 與貼圖。
 */
export function createPlayerFigure() {
  // 長方體與橢球共用單位大小的 geometry,靠 scale 決定大小;上下粗細不同的部位各自有一個 geometry
  const box = new BoxGeometry(1, 1, 1)
  const ball = new IcosahedronGeometry(1, 1)
  const pelvisGeometry = taperedBox(PELVIS.top - PELVIS.bottom, PELVIS.bottomSize, PELVIS.topSize)
  const waistGeometry = taperedBox(CHEST.y - WAIST.y, WAIST.size, CHEST.size)
  const chestGeometry = taperedBox(SHOULDER.y - CHEST.y, CHEST.size, SHOULDER.size)
  const collarGeometry = taperedBox(0.06, [0.13, 0.12], [0.11, 0.105])
  const hairCapGeometries = createHairCapGeometries()
  const geometries = [box, ball, pelvisGeometry, waistGeometry, chestGeometry, collarGeometry, ...hairCapGeometries]

  const tigerTexture = createTigerTexture()
  const materials = {
    skin: new MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.9, flatShading: true }),
    // 髮蓋是沒有封口的球殼,從邊緣斜看進去會看到內面,所以兩面都要畫
    hair: new MeshStandardMaterial({ color: HAIR_COLOR, roughness: 0.7, flatShading: true, side: DoubleSide }),
    shirt: new MeshStandardMaterial({ color: SHIRT_COLOR, roughness: 0.9 }),
    // 名牌和襯衫都是暖黃色,名牌自己微微發光才不會融進襯衫裡
    nameTag: new MeshStandardMaterial({
      color: NAME_TAG_COLOR,
      emissive: NAME_TAG_COLOR,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    }),
    pants: new MeshStandardMaterial({ color: PANTS_COLOR, roughness: 0.9 }),
    shoe: new MeshStandardMaterial({ color: SHOE_COLOR, roughness: 0.5 }),
    tiger: new MeshStandardMaterial({ map: tigerTexture, roughness: 0.8 }),
  }

  // 四肢的原點在關節上,繞 x 軸轉就是前後擺動
  const joint = (x, y, ...parts) => {
    const group = new Group()
    group.position.set(x, y, 0)
    group.add(...parts)
    return group
  }

  const leftLeg = joint(-LEG.spacing, 0, ...legParts(box, materials))
  const rightLeg = joint(LEG.spacing, 0, ...legParts(box, materials))

  // 手臂往外張的角度見 ARM 與 CARRY。Euler 的順序是先繞 z 再繞 x:先往外張,前後擺動時才不會改變往外張的角度
  const shoulderX = SHOULDER.size[0] / 2 + ARM.width / 2
  const shoulderY = SHOULDER.y - 0.04
  const leftArm = joint(-shoulderX, shoulderY, ...armParts(box, materials))
  const rightArm = joint(shoulderX, shoulderY, ...armParts(box, materials))
  leftArm.rotation.z = -CARRY.splay
  rightArm.rotation.z = ARM.splay
  // 左手掌的中心,登機箱的握把就擺在這一點
  const leftHand = new Group()
  leftHand.position.y = -HAND_REACH
  leftArm.add(leftHand)

  const head = new Group()
  head.position.y = HEAD.y
  head.add(...headParts(ball, hairCapGeometries, materials))

  // 上半身的原點在髖部,前傾時繞髖部轉,腿不會跟著傾斜
  const upperBody = new Group()
  upperBody.add(
    part(pelvisGeometry, materials.pants, [1, 1, 1], [0, (PELVIS.bottom + PELVIS.top) / 2, 0]),
    // 襯衫的下襬紮進褲子,接縫藏在腰帶底下
    part(waistGeometry, materials.shirt, [1, 1, 1], [0, (WAIST.y + CHEST.y) / 2, 0]),
    part(chestGeometry, materials.shirt, [1, 1, 1], [0, (CHEST.y + SHOULDER.y) / 2, 0]),
    part(box, materials.tiger, [BELT.width, BELT.height, BELT.depth], [0, BELT.y, 0]),
    createBow(box, materials),
    // 名牌刻意不放文字與 logo
    part(box, materials.nameTag, [0.085, 0.03, 0.012], [-0.09, 0.43, -CHEST.size[1] / 2]),
    part(box, materials.skin, [0.09, 0.2, 0.085], [0, SHOULDER.y + 0.04, 0]),
    ...collarParts(box, collarGeometry, materials),
    leftArm,
    rightArm,
    head,
  )

  const hips = new Group()
  hips.position.y = HIP_HEIGHT
  hips.add(leftLeg, rightLeg, upperBody)

  const suitcase = createSuitcaseFigure()
  const object = new Group()
  object.add(hips, suitcase.object)

  const runCycle = createRunCycle(STRIDE_LENGTH)
  const cheerClip = createFeedbackClip()
  const grip = new Vector3()

  return {
    object,
    place(position, heading) {
      placeFigure(object, position, heading)
    },
    cheer() {
      cheerClip.play()
    },
    animate(distance, dt, cameraPosition) {
      const { phase, blend } = runCycle.advance(Math.abs(distance), dt)
      const cheer = cheerClip.advance(dt)
      const swing = Math.sin(phase) * blend
      leftLeg.rotation.x = swing * LEG_SWING
      rightLeg.rotation.x = -swing * LEG_SWING
      // 右手舉起來時不再跟著跑步前後擺動
      const raise = raiseOf(cheer)
      rightArm.rotation.x = swing * ARM_SWING * (1 - raise)
      rightArm.rotation.z = ARM.splay + (CHEER.armRaise - ARM.splay) * raise
      // 每跨一步身體起伏一次,所以用 |sin|;繞 x 軸轉負的角度是往前(-z)傾
      const bob = Math.abs(Math.sin(phase)) * BOB_HEIGHT * blend
      hips.position.y = HIP_HEIGHT + bob + hopOf(cheer, CHEER.hopFrom, CHEER.hopTo) * CHEER.hopHeight
      upperBody.rotation.x = -FORWARD_LEAN * blend
      // 登機箱的姿勢用緩入緩出的強度,起跑與停下時箱子才不會猛然倒下或立起來
      const carry = blend * blend * (3 - 2 * blend)
      leftArm.rotation.x = -CARRY.pullBack * carry
      // 全身擺好之後才量得到左手在哪裡,登機箱再依手的位置擺上去
      leftHand.getWorldPosition(grip)
      object.worldToLocal(grip)
      suitcase.pose(grip, CARRY.tilt * carry)
      suitcase.roll(distance)
      suitcase.hideNear(cameraPosition)
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      tigerTexture.dispose()
      suitcase.dispose()
    },
  }
}

// 歡呼時右手舉起的程度,0 是平常的位置、1 是舉到最高。cheer 是歡呼播到哪裡,沒有在播時是 null。
// 舉起與放下都頭尾放慢,手才不會突然停住
function raiseOf(cheer) {
  if (cheer === null) return 0
  const t = cheer < CHEER.raise ? cheer / CHEER.raise : cheer < CHEER.lower ? 1 : (1 - cheer) / (1 - CHEER.lower)
  return t * t * (3 - 2 * t)
}

// 一條腿:從髖關節往下到腳踝的直筒褲管,加上黑色低跟鞋。原點在髖關節
function legParts(box, materials) {
  const length = HIP_HEIGHT - LEG.hem
  // 鞋身前低後高,鞋尖著地、鞋跟由底下的小方塊墊高
  const shoe = part(box, materials.shoe, [0.12, 0.06, 0.22], [0, -HIP_HEIGHT + 0.05, -0.04])
  shoe.rotation.x = -0.15
  return [
    part(box, materials.pants, [LEG.width, length, LEG.depth], [0, -length / 2, 0]),
    shoe,
    part(box, materials.shoe, [0.07, 0.045, 0.05], [0, -HIP_HEIGHT + 0.0225, 0.045]),
  ]
}

// 一隻手臂:七分袖蓋到前臂的一半,袖口往上反摺成一圈較寬的邊,底下露出前臂與手。原點在肩關節
function armParts(box, materials) {
  // 袖子從肩關節往上多蓋一點,包住肩膀的頂端
  const sleeveTop = 0.03
  const forearm = ARM.length - ARM.sleeve
  return [
    part(box, materials.shirt, [ARM.width, ARM.sleeve + sleeveTop, ARM.depth], [0, (sleeveTop - ARM.sleeve) / 2, 0]),
    part(box, materials.shirt, [ARM.width + 0.025, 0.05, ARM.depth + 0.025], [0, -ARM.sleeve + 0.02, 0]),
    part(box, materials.skin, [ARM.width - 0.025, forearm, ARM.depth - 0.025], [0, -ARM.sleeve - forearm / 2, 0]),
    part(box, materials.skin, [0.075, 0.1, 0.09], [0, -HAND_REACH, 0]),
  ]
}

// 頭與頭髮,原點在頭的中心。臉不做五官
function headParts(ball, hairCapGeometries, materials) {
  // 髮蓋比頭大一圈,貼著頭皮往後梳,邊緣與頭皮之間的那一點落差就是頭髮的厚度
  const thickness = 0.015
  const capRadii = HEAD.radii.map((radius) => radius + thickness)
  const caps = hairCapGeometries.map((geometry) => part(geometry, materials.hair, capRadii, [0, 0.005, 0.005]))
  const bun = part(ball, materials.hair, [0.095, 0.09, 0.08], [0, -0.06, 0.235])
  return [part(ball, materials.skin, HEAD.radii, [0, 0, 0]), ...caps, bun]
}

/**
 * 半徑為 1 的髮蓋球殼,中心在原點,形狀由 `HAIR_CAP` 決定。
 *
 * 球殼的軸心原本朝上,往後倒之後軸心指向後上方。球殼分成兩塊:靠軸心的一塊是完整的,
 * 外圈那一塊在正前方往左偏 partOffset 的經線上留一道縫當分線。兩塊要用同樣的縮放與位置擺放。
 */
function createHairCapGeometries() {
  const { tilt, coverage, partStart, partGap, partOffset } = HAIR_CAP
  // SphereGeometry 的經度 phi 在 3π/2 是正前方(-z),往左(-x)是遞增
  const phiStart = (Math.PI * 3) / 2 + partOffset + partGap / 2
  // 兩塊的頂點在交界上對不齊,會裂出一條細縫。外圈那塊往軸心多鋪一小段,墊在稍微大一點的靠軸心那塊底下,把縫蓋住
  const overlap = 0.1
  const crown = new SphereGeometry(1.005, 12, 3, phiStart, Math.PI * 2, 0, partStart)
  const front = new SphereGeometry(
    1,
    12,
    3,
    phiStart,
    Math.PI * 2 - partGap,
    partStart - overlap,
    coverage - partStart + overlap,
  )
  // 繞 x 軸轉正的角度,朝上的軸心會倒向 +z,也就是後面
  for (const geometry of [crown, front]) geometry.rotateX(tilt)
  return [crown, front]
}

// 襯衫的領子:繞脖子一圈的領座,加上胸前往兩側攤開的兩片領尖
function collarParts(box, collarGeometry, materials) {
  const band = part(collarGeometry, materials.shirt, [1, 1, 1], [0, SHOULDER.y + 0.02, 0])
  const points = [-1, 1].map((side) => {
    const point = part(box, materials.shirt, [0.06, 0.05, 0.015], [side * 0.04, SHOULDER.y - 0.02, -0.1])
    point.rotation.z = side * 0.6
    return point
  })
  return [band, ...points]
}

// 腰帶右側的蝴蝶結:中間的結、往兩邊翹起的兩個環,以及兩條垂下來的帶尾。
// 原點在腰帶右後方的轉角附近,蝴蝶結的正面朝 +x。整個蝴蝶結斜斜地朝向右後方,從背後也看得到環與帶尾的正面
function createBow(box, materials) {
  const bow = new Group()
  bow.position.set(BELT.width / 2 - 0.025, BELT.y, BELT.depth / 2 - 0.035)
  bow.rotation.y = -0.6
  bow.add(part(box, materials.tiger, [0.035, 0.05, 0.045], [0.01, 0, 0]))

  for (const side of [-1, 1]) {
    // side 為 1 的在後面。兩個環都是遠離結的那一端往上翹
    const loop = part(box, materials.tiger, [0.025, 0.065, 0.085], [0.012, 0.012, side * 0.055])
    loop.rotation.x = -side * 0.35
    bow.add(loop)

    // 帶尾的貼圖紋路要橫過帶子,所以帶子沿 x 方向建立再轉成垂直
    const length = 0.28
    const strip = part(box, materials.tiger, [length, 0.012, 0.04], [0, -length / 2, 0])
    strip.rotation.z = Math.PI / 2
    // 帶尾的原點在結的下半部。先繞自己的長軸扭一下,平的那一面才有一部分朝向背後或前面,再往前後張開
    const tail = new Group()
    tail.position.set(0.012, -0.015, side * 0.015)
    tail.rotation.set(-side * 0.15, -side * 0.35, 0)
    tail.add(strip)
    bow.add(tail)
  }
  return bow
}

/**
 * 上下兩個面大小不同的長方體,原點在中心。
 *
 * bottom 與 top 都是 `[寬, 深]`,分別是 x 與 z 方向的長度。四個側面仍然是平面,低多邊形的稜角才會一致。
 */
function taperedBox(height, [bottomWidth, bottomDepth], [topWidth, topDepth]) {
  const geometry = new BoxGeometry(1, height, 1)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i += 1) {
    const [width, depth] = position.getY(i) > 0 ? [topWidth, topDepth] : [bottomWidth, bottomDepth]
    position.setX(i, position.getX(i) * width)
    position.setZ(i, position.getZ(i) * depth)
  }
  // 側面斜了,原本的法向量不再垂直於側面,光影會不對
  geometry.computeVertexNormals()
  return geometry
}

// 腰帶與蝴蝶結的橘底黑紋虎紋貼圖。貼在長方體的每一面上時,紋路都沿著貼圖的上下方向
function createTigerTexture() {
  const [width, height] = TIGER_TILE_SIZE
  return createCanvasTexture(width, height, (context) => {
    context.fillStyle = TIGER_ORANGE
    context.fillRect(0, 0, width, height)
    context.fillStyle = TIGER_BLACK
    paintTigerStripes(context)
  })
}
