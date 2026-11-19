// 主角的人:一位穿制服的空服員,用長方體與多面體拼成的低多邊形造型,跑步動作由程式計算,
// 不使用模型、動畫或圖片素材檔;腰帶的虎紋也是在程式裡畫出來的貼圖。
// 這裡只負責外觀、擺放與動作;主角在哪裡、朝哪裡、移動了多遠,都由呼叫端依遊戲核心的狀態告訴它。
// 鏡頭大多在主角背後,所以背影的辨識度優先:後腦的包頭、腰帶右側的蝴蝶結與兩條帶尾。
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three'

import { createRunCycle, part, placeFigure } from './lowPolyFigure.js'

const SKIN_COLOR = '#f2c7a5'
const HAIR_COLOR = '#2b1d17'
const SHIRT_COLOR = '#f5c065'
const NAME_TAG_COLOR = '#ffe03a'
const PANTS_COLOR = '#3a3c42'
const SHOE_COLOR = '#151515'
const TIGER_ORANGE = '#ef7a1a'
const TIGER_BLACK = '#1b1410'

// 各部位的尺寸,單位與世界座標相同。整個人含頭髮大約 1.94 高。
// 總身高是整個場景的比例尺,牆高與鏡頭都依它設定,調整部位時不要改變總身高。
// 髖關節以上的部位以髖關節為原點,臉朝 -z,右手在 +x。軀幹各段的 size 是 `[寬, 深]`
const HIP_HEIGHT = 0.9
// hem 是褲管下緣離地的高度,褲管與鞋子在這裡交接
const LEG = { width: 0.155, depth: 0.17, spacing: 0.095, hem: 0.07 }
// 骨盆下緣與兩條褲管的外緣一樣寬,褲管上方才不會多出一圈像裙襬的邊
const PELVIS = { bottom: -0.1, top: 0.21, bottomSize: [0.35, 0.18], topSize: [0.31, 0.2] }
const WAIST = { y: 0.19, size: [0.3, 0.19] }
const CHEST = { y: 0.4, size: [0.36, 0.23] }
const SHOULDER = { y: 0.56, size: [0.37, 0.2] }
const BELT = { y: 0.21, width: 0.33, height: 0.07, depth: 0.22 }
const ARM = { width: 0.1, depth: 0.11, sleeve: 0.34, length: 0.52, splay: 0.1 }
// 頭是一顆橢球,這裡是三個方向的半徑與中心的高度
const HEAD = { width: 0.165, height: 0.19, depth: 0.175, y: 0.83 }
// 髮蓋是一塊球殼,軸心從頭頂往後倒 tilt,從軸心往外蓋到 coverage 的角度。
// 兩者相減是前緣離頭頂的角度,停在額頭上方,所以沒有瀏海;兩者相加是後緣離頭頂的角度,蓋到後頸。
// 球殼在左側的分線那裡留一道 partGap 寬的縫,縫裡露出頭皮,就是側分的分線。
// 縫從離軸心 partStart 的地方開到前緣,頭頂後方不開縫,從背後看才不像一道裂痕
const HAIR_CAP = { tilt: 0.95, coverage: 1.66, partStart: 0.9, partGap: 0.06, partOffset: 0.45 }

// 跑完一個完整步伐循環(左右腳各跨一次)前進的距離
const STRIDE_LENGTH = 1.8
const LEG_SWING = 0.9
const ARM_SWING = 0.8
const BOB_HEIGHT = 0.08
const FORWARD_LEAN = 0.15

// 虎紋貼圖的每一條紋路:中心 x、上端 y、下端 y、最寬處的半寬、兩端往左右偏的量,單位是貼圖的像素。
// 有的紋路貫穿上下,有的只畫到一半,看起來才像虎紋而不是整齊的條碼
const TIGER_TEXTURE_SIZE = [128, 32]
const TIGER_STRIPES = [
  [6, 0, 32, 4, 5],
  [22, 0, 19, 3.5, -4],
  [34, 12, 32, 4, 4],
  [50, 0, 32, 5, -5],
  [66, 0, 22, 3.5, 4],
  [78, 9, 32, 4, -3],
  [94, 0, 32, 5, 5],
  [110, 0, 17, 3, -3],
  [120, 14, 32, 3.5, 4],
]

/**
 * 建立主角的人,`object` 要由呼叫端加進場景。
 *
 * 每一幀呼叫兩個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`,heading 是遊戲核心的朝向。
 * - `animate(distance, dt)`:distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒。
 *   有在移動就播跑步動作,停下後很快回到站姿並保持靜止。
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

  // 手臂稍微往外張,垂下時才不會插進腰帶右側的蝴蝶結。
  // Euler 的順序是先繞 z 再繞 x:先往外張,前後擺動時才不會改變往外張的角度
  const shoulderX = SHOULDER.size[0] / 2 + ARM.width / 2
  const shoulderY = SHOULDER.y - 0.04
  const leftArm = joint(-shoulderX, shoulderY, ...armParts(box, materials))
  const rightArm = joint(shoulderX, shoulderY, ...armParts(box, materials))
  leftArm.rotation.z = -ARM.splay
  rightArm.rotation.z = ARM.splay

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
    bowParts(box, materials),
    // 名牌在左胸,不放文字也不放 logo
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
      for (const geometry of geometries) geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      tigerTexture.dispose()
    },
  }
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
    part(box, materials.skin, [0.075, 0.1, 0.09], [0, -ARM.length - 0.05, 0]),
  ]
}

// 頭與頭髮,原點在頭的中心。臉不做五官
function headParts(ball, hairCapGeometries, materials) {
  // 髮蓋比頭大一圈,貼著頭皮往後梳,邊緣與頭皮之間的那一點落差就是頭髮的厚度
  const thickness = 0.015
  const caps = hairCapGeometries.map((geometry) =>
    part(
      geometry,
      materials.hair,
      [HEAD.width + thickness, HEAD.height + thickness, HEAD.depth + thickness],
      [0, 0.005, 0.005],
    ),
  )
  // 後腦偏低的位置盤一個圓包頭,稍微嵌進髮蓋
  const bun = part(ball, materials.hair, [0.095, 0.09, 0.08], [0, -0.06, 0.235])
  return [part(ball, materials.skin, [HEAD.width, HEAD.height, HEAD.depth], [0, 0, 0]), ...caps, bun]
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
  // 兩塊的頂點在交界上對不齊,會裂出一條細縫。靠軸心的那塊稍微大一點、往外多蓋一小段,把縫蓋住
  const crown = new SphereGeometry(1.005, 12, 3, phiStart, Math.PI * 2, 0, partStart + 0.1)
  const front = new SphereGeometry(1, 12, 3, phiStart, Math.PI * 2 - partGap, partStart, coverage - partStart)
  // 繞 x 軸轉正的角度,朝上的軸心會倒向 +z,也就是後面
  for (const geometry of [crown, front]) geometry.rotateX(tilt)
  return [crown, front]
}

// 襯衫的領子:繞脖子一圈的領座,加上胸前往兩側攤開的兩片領尖
function collarParts(box, collarGeometry, materials) {
  const band = part(collarGeometry, materials.shirt, [1, 1, 1], [0, SHOULDER.y + 0.02, 0])
  const points = [-1, 1].map((side) => {
    const point = part(box, materials.shirt, [0.06, 0.05, 0.015], [side * 0.04, SHOULDER.y - 0.02, -0.095])
    point.rotation.z = side * 0.6
    return point
  })
  return [band, ...points]
}

// 腰帶右側的蝴蝶結:中間的結、往兩邊翹起的兩個環,以及兩條垂下來的帶尾。
// 原點在腰帶右後方的轉角,蝴蝶結的正面朝 +x。整個蝴蝶結斜斜地朝向右後方,從背後也看得到環與帶尾的正面
function bowParts(box, materials) {
  const bow = new Group()
  bow.position.set(BELT.width / 2 - 0.025, BELT.y, BELT.depth / 2 - 0.035)
  bow.rotation.y = -0.6
  bow.add(part(box, materials.tiger, [0.035, 0.05, 0.045], [0.01, 0, 0]))

  for (const side of [-1, 1]) {
    // side 為 1 的在後面。兩個環都是遠離結的那一端往上翹
    const loop = part(box, materials.tiger, [0.025, 0.065, 0.1], [0.012, 0.012, side * 0.06])
    loop.rotation.x = -side * 0.35
    bow.add(loop)

    // 帶尾的貼圖紋路要橫過帶子,所以帶子沿 x 方向建立再轉成垂直
    const length = 0.28
    const strip = part(box, materials.tiger, [length, 0.012, 0.04], [0, -length / 2, 0])
    strip.rotation.z = Math.PI / 2
    // 帶尾的原點在結的下緣。先繞自己的長軸扭一下,平的那一面才有一部分朝向背後或前面,再往前後張開
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

// 橘底黑紋的虎紋貼圖。每條紋路是中間粗、兩端尖的梭形,貼在長方體的每一面上時紋路都沿著貼圖的上下方向
function createTigerTexture() {
  const [width, height] = TIGER_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.fillStyle = TIGER_ORANGE
  context.fillRect(0, 0, width, height)
  context.fillStyle = TIGER_BLACK
  for (const [x, top, bottom, halfWidth, lean] of TIGER_STRIPES) {
    const middle = (top + bottom) / 2
    // 二次曲線的控制點離中心兩倍半寬,曲線最寬的地方才剛好是半寬
    context.beginPath()
    context.moveTo(x + lean, top)
    context.quadraticCurveTo(x + halfWidth * 2, middle, x - lean, bottom)
    context.quadraticCurveTo(x - halfWidth * 2, middle, x + lean, top)
    context.fill()
  }
  const texture = new CanvasTexture(canvas)
  // canvas 的顏色是 sRGB,不標明的話整條腰帶會偏淡
  texture.colorSpace = SRGBColorSpace
  return texture
}
