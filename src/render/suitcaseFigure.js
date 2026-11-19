// 主角平常用左手拉著、揮擊時雙手舉起來揮的登機箱:霧面黑色的硬殼,配上虎橘色的滾邊、拉鍊線、按鈕外框與輪框,
// 沒有任何品牌字樣。外觀用幾何體拼成,不使用模型或圖片素材檔;正面口袋面板上的虎紋浮雕是程式畫出來的貼圖。
// 登機箱不參與碰撞,遊戲核心不知道它的存在。這裡只負責外觀與姿勢:
// 握把要落在哪裡、箱子要往後倒多少、揮擊時往哪裡甩,由主角的造型依手的位置決定。
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  Vector3,
} from 'three'

import { createCanvasTexture, part } from './lowPolyFigure.js'
import { paintTigerStripes, TIGER_ORANGE, TIGER_TILE_SIZE } from './tigerStripes.js'

const SHELL_COLOR = '#1d1d20'
const BASE_COLOR = '#46484e'
// 提把、拉桿、握把與輪胎比箱殼黑一點、亮一點,和霧面的箱殼分得出來
const HARDWARE_COLOR = '#121214'
// 圓片和箱殼一樣是深色,靠光澤和霧面的箱殼分開
const BADGE_COLOR = '#2c2d33'
const RELIEF_COLOR = '#36373c'
const RELIEF_STRIPE_COLOR = '#0e0e10'
// 浮雕的條紋比腰帶上的長幾倍,面板上才是一道道長的虎紋,而不是一片片短的葉子
const RELIEF_STRIPE_STRETCH = 3

// 以下尺寸的單位與世界座標相同。登機箱自己的座標:原點在直立時箱子正下方的地面上,
// 拉桿那一面朝 -z,也就是主角面向的方向;正面的口袋面板朝 +z,跟在主角背後的鏡頭看得到它。
// 箱身依 19 吋登機箱(箱身約 48 公分)對主角的身高等比例放大,含輪子大約到主角的大腿中段
const SHELL = { width: 0.42, height: 0.58, depth: 0.25, corner: 0.06 }
// 箱身底部離地的高度,底下是輪座與輪子
const CLEARANCE = 0.095
const SHELL_TOP = CLEARANCE + SHELL.height
// 底座是箱身最底下的一截,四周比箱身多出 margin。它的高度不能小於圓角的半徑,底部的圓角才完整
const BASE = { height: 0.07, margin: 0.004 }
// 拉鍊線繞箱身側面一圈,比底座再多凸出一點。z 是它在厚度方向的位置,靠近正面一點
const ZIPPER = { thickness: 0.012, margin: 0.006, z: 0.04 }
// 正面的口袋面板。y 是面板中心離地的高度;piping 是滾邊從面板邊緣露出來的寬度
const PANEL = { width: 0.34, height: 0.44, depth: 0.022, corner: 0.04, y: 0.405, piping: 0.012 }
// 面板左上角的圓片,inset 是圓心離面板左緣與上緣的距離
const BADGE = { radius: 0.03, thickness: 0.008, inset: 0.06 }
// 提把是一根橫桿架在兩個底座上。頂部的提把沿著箱子的寬度方向,側面的提把在遠離主角的那一側、沿著厚度方向。
// lift 是橫桿中心離箱殼表面的距離
const HANDLE = { length: 0.15, bar: [0.022, 0.03], mount: 0.03, lift: 0.03, topZ: -0.015, sideY: 0.43 }
// 萬向輪:每個角落一組並排的兩個輪子。inset 是輪軸中心離箱身側面與正背面的距離,輪軸離地的高度就是輪子的半徑
const WHEEL = { radius: 0.035, width: 0.016, gap: 0.012, inset: 0.05 }
// 伸縮拉桿:兩根桿子從箱頂靠拉桿那一面的地方伸出來,每根分成粗細兩節,上面接著橫的握把。z 是桿子的位置
const BAR = { spacing: 0.26, z: -SHELL.depth / 2 + 0.035, outer: 0.026, inner: 0.018 }
const GRIP = { width: 0.3, height: 0.03, depth: 0.036 }
// 箱頂收拉桿的底座,拉桿收到底時握把就靠在它上面
const DOCK_HEIGHT = 0.014
const BAR_BOTTOM = SHELL_TOP + DOCK_HEIGHT
// 往後倒時著地的是拉桿那一面的兩個輪子,箱子繞它們的輪軸轉。輪軸沿著 x
const PIVOT = { y: WHEEL.radius, z: -SHELL.depth / 2 + WHEEL.inset }
const TILT_AXIS = new Vector3(1, 0, 0)
// 揮擊時拉桿伸出箱頂的長度。拉桿伸得越長,箱子甩出去的半徑越大,離主角的身體也越遠
const SWING_EXTENSION = 0.42

// 鏡頭進到這個距離內就可能插進箱身,畫面會被黑色的箱身蓋住一大片。
// 距離是箱身含輪子的外接球半徑,再多留 0.15 涵蓋鏡頭的 near 距離。拉桿很細,蓋不住畫面,所以不算在內
const HIDE_DISTANCE = Math.hypot(SHELL.width, SHELL_TOP, SHELL.depth + PANEL.depth) / 2 + 0.15

/**
 * 建立登機箱。`object` 要由呼叫端加進主角的造型裡,跟著主角一起擺放。
 *
 * 姿勢用主角造型的座標描述:原點在主角腳下的地面上,臉朝 -z,右手在 +x。每一幀依序呼叫:
 * - `pose(grip, tilt, swing)`:grip 是手握住握把的那一點 `{ x, y, z }`,箱子會擺到握把的中心剛好在這一點。
 *   swing 是 null 時,箱子拉在地上:
 *   - tilt 是箱子往後倒的角度,0 是四輪著地的直立。
 *   - 往後倒時只有拉桿那一面的兩個輪子著地,箱頂倒向主角的前方,箱身拖在握把的後面。
 *   - 拉桿伸出的長度跟著 grip 的高度調整,輪子才剛好著地。
 *   揮擊時 swing 是 `{ direction, across, weight }`,箱子離開地面,掛在拉伸到最長的拉桿末端:
 *   - direction 是從握把往箱子的方向,也就是拉桿伸出去的方向。
 *   - across 是握把橫桿的方向,從左手指向右手。它必須與 direction 垂直,箱子的寬度也沿著這個方向。
 *   - weight 是揮擊的姿勢蓋過拉在地上的姿勢的程度,0 與 swing 是 null 時相同,1 是完全照 direction 與 across 擺。
 *   兩個方向都必須是單位向量。
 * - `roll(distance)`:輪子依這一幀移動的距離轉動,distance 是負的時反轉。
 * - `hideNear(cameraPosition)`:cameraPosition 是鏡頭在世界座標的位置。鏡頭離箱身太近時把整個登機箱藏起來,
 *   鏡頭離開後再出現。它量的是箱子擺好之後的位置,所以要在 `pose` 之後呼叫。
 *
 * 只能在瀏覽器裡建立,因為浮雕的貼圖要用 canvas 畫。
 * 用完必須呼叫 `dispose()` 釋放 geometry、material 與貼圖。
 */
export function createSuitcaseFigure() {
  const box = new BoxGeometry(1, 1, 1)
  // 輪子的軸心轉成沿著 x,繞 x 軸轉就是滾動;圓片的軸心轉成沿著 z,正面才朝 +z
  const tire = new CylinderGeometry(WHEEL.radius, WHEEL.radius, WHEEL.width, 10).rotateZ(Math.PI / 2)
  // 輪框比輪胎寬一點,從輪子的兩側都看得到
  const rim = new CylinderGeometry(WHEEL.radius * 0.62, WHEEL.radius * 0.62, WHEEL.width + 0.004, 10).rotateZ(
    Math.PI / 2,
  )
  const badge = new CylinderGeometry(BADGE.radius, BADGE.radius, BADGE.thickness, 12).rotateX(Math.PI / 2)
  // 箱身分成上下兩截:上面那截只有頂部是圓角,底座只有底部是圓角,拼起來就是四角圓弧的箱身
  const upperHeight = SHELL.height - BASE.height
  const shell = roundedSlab(SHELL.width, upperHeight, SHELL.depth, SHELL.corner, { bottom: false })
  const base = roundedSlab(
    SHELL.width + BASE.margin * 2,
    BASE.height,
    SHELL.depth + BASE.margin * 2,
    SHELL.corner + BASE.margin,
    { top: false },
  )
  // 拉鍊線是一塊比箱身大一圈的薄板,藏在箱身裡,只有凸出箱身的那一圈邊看得到
  const zipper = roundedSlab(
    SHELL.width + ZIPPER.margin * 2,
    SHELL.height + ZIPPER.margin * 2,
    ZIPPER.thickness,
    SHELL.corner + ZIPPER.margin,
  )
  // 滾邊同樣是一塊比面板大一圈、比面板薄的板子,墊在面板底下
  const pipingDepth = PANEL.depth * 0.7
  const piping = roundedSlab(
    PANEL.width + PANEL.piping * 2,
    PANEL.height + PANEL.piping * 2,
    pipingDepth,
    PANEL.corner + PANEL.piping,
  )
  const panel = roundedSlab(PANEL.width, PANEL.height, PANEL.depth, PANEL.corner)
  const geometries = [box, tire, rim, badge, shell, base, zipper, piping, panel]

  const reliefTexture = createReliefTexture()
  // 面板正面的 UV 是正面看過去的座標,單位是世界座標的長度;換算成 0 到 1,整張貼圖剛好鋪滿面板
  reliefTexture.repeat.set(1 / PANEL.width, 1 / PANEL.height)
  reliefTexture.offset.set(0.5, 0.5)
  const materials = {
    shell: new MeshStandardMaterial({ color: SHELL_COLOR, roughness: 0.85 }),
    base: new MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.8 }),
    hardware: new MeshStandardMaterial({ color: HARDWARE_COLOR, roughness: 0.5, flatShading: true }),
    orange: new MeshStandardMaterial({ color: TIGER_ORANGE, roughness: 0.6, flatShading: true }),
    badge: new MeshStandardMaterial({ color: BADGE_COLOR, roughness: 0.3 }),
    relief: new MeshStandardMaterial({ map: reliefTexture, roughness: 0.85 }),
  }

  const front = SHELL.depth / 2
  const body = new Group()
  // 箱子繞著輪軸往後倒,所以 object 的原點放在輪軸上,箱子本身往回挪
  body.position.set(0, -PIVOT.y, -PIVOT.z)
  body.add(
    part(shell, materials.shell, [1, 1, 1], [0, CLEARANCE + BASE.height + upperHeight / 2, 0]),
    part(base, materials.base, [1, 1, 1], [0, CLEARANCE + BASE.height / 2, 0]),
    part(zipper, materials.orange, [1, 1, 1], [0, CLEARANCE + SHELL.height / 2, ZIPPER.z]),
    part(piping, materials.orange, [1, 1, 1], [0, PANEL.y, front + pipingDepth / 2]),
    // 面板的正背兩面貼浮雕的貼圖,側面和箱殼一樣
    part(panel, [materials.relief, materials.shell], [1, 1, 1], [0, PANEL.y, front + PANEL.depth / 2]),
    // 圓片刻意不放文字與 logo
    part(
      badge,
      materials.badge,
      [1, 1, 1],
      [
        -PANEL.width / 2 + BADGE.inset,
        PANEL.y + PANEL.height / 2 - BADGE.inset,
        front + PANEL.depth + BADGE.thickness / 2,
      ],
    ),
    ...handleParts(box, materials.hardware),
  )

  const axles = casterParts(box, tire, rim, materials)
  body.add(...axles.flatMap(({ housing, axle }) => [housing, axle]))

  const { trolley, setExtension } = createTrolley(box, materials)
  body.add(trolley)

  const object = new Group()
  object.add(body)

  let spin = 0
  const center = new Vector3()
  const swingQuaternion = new Quaternion()
  const basis = new Matrix4()
  const xAxis = new Vector3()
  const yAxis = new Vector3()
  const zAxis = new Vector3()
  const gripOffset = new Vector3()

  return {
    object,
    pose(grip, tilt, swing = null) {
      const cos = Math.cos(tilt)
      const sin = Math.sin(tilt)
      // 握把中心在輪軸前方 forward 的地方(往 -z 是負的),這個距離不隨拉桿伸縮改變
      const forward = BAR.z - PIVOT.z
      // 握把中心離輪軸多高,沿著箱子的上下方向量。往後倒是繞 x 軸轉負的角度,
      // 箱子座標的 (上, 前) 轉到 (上·cos + 前·sin, 前·cos − 上·sin)
      const up = (grip.y - PIVOT.y - forward * sin) / cos
      let extension = up - (BAR_BOTTOM + GRIP.height / 2 - PIVOT.y)
      object.quaternion.setFromAxisAngle(TILT_AXIS, -tilt)
      if (swing !== null) {
        // 箱子的 +y 從箱身指向握把,所以是 direction 的反方向;+x 沿著握把橫桿
        yAxis.copy(swing.direction).negate()
        xAxis.copy(swing.across)
        zAxis.crossVectors(xAxis, yAxis)
        swingQuaternion.setFromRotationMatrix(basis.makeBasis(xAxis, yAxis, zAxis))
        object.quaternion.slerp(swingQuaternion, swing.weight)
        extension += (SWING_EXTENSION - extension) * swing.weight
        // 握把還不夠高時,拉桿伸太長會讓箱子插進地面,所以伸到箱子的最低點剛好碰到地面為止。
        // 拉在地上時,上面算出來的長度本來就讓輪子剛好著地,不必再檢查
        extension = Math.min(extension, groundedExtension(grip, object.quaternion))
      }
      setExtension(extension)
      // 先轉好方向,再把整個箱子挪到握把中心剛好落在 grip 的位置
      gripOffset.set(0, BAR_BOTTOM + extension + GRIP.height / 2 - PIVOT.y, forward).applyQuaternion(object.quaternion)
      object.position.copy(grip).sub(gripOffset)
    },
    roll(distance) {
      // 往前(-z)滾的輪子繞 x 軸轉負的角度,著地的那一點才不會打滑
      spin = (spin - distance / WHEEL.radius) % (Math.PI * 2)
      for (const { axle } of axles) axle.rotation.x = spin
    },
    hideNear(cameraPosition) {
      body.localToWorld(center.set(0, SHELL_TOP / 2, 0))
      object.visible = center.distanceTo(cameraPosition) > HIDE_DISTANCE
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      reliefTexture.dispose()
    },
  }
}

// 箱子最先碰到地面的那些點,用登機箱 object 的座標描述(原點在輪軸上),拉桿伸出的長度是 0。
// 輪子取輪軸的中心,碰地時要再減掉輪子的半徑;箱身取含底座與正面面板的外框的八個角
const LOW_POINTS = (() => {
  const shift = (x, y, z) => new Vector3(x, y - PIVOT.y, z - PIVOT.z)
  const wheels = [-1, 1].flatMap((x) =>
    [-1, 1].map((z) => shift(x * (SHELL.width / 2 - WHEEL.inset), WHEEL.radius, z * (SHELL.depth / 2 - WHEEL.inset))),
  )
  const halfWidth = SHELL.width / 2 + BASE.margin
  const corners = [-1, 1].flatMap((x) =>
    [CLEARANCE, SHELL_TOP].flatMap((y) =>
      [-SHELL.depth / 2 - BASE.margin, SHELL.depth / 2 + PANEL.depth].map((z) => shift(x * halfWidth, y, z)),
    ),
  )
  return [
    ...wheels.map((point) => ({ point, radius: WHEEL.radius })),
    ...corners.map((point) => ({ point, radius: 0 })),
  ]
})()

/**
 * 箱子轉成 quaternion 的方向、握把中心在 grip 時,拉桿最多能伸多長,箱子才不會插進地面。
 *
 * 箱子在握把上方時,拉桿伸得再長都碰不到地面,回傳 Infinity。
 */
function groundedExtension(grip, quaternion) {
  // 拉桿每多伸一單位,箱子就沿著拉桿往箱子那頭多挪一單位,高度因此少掉拉桿方向的 y 分量
  const drop = groundScratch.up.set(0, 1, 0).applyQuaternion(quaternion).y
  if (drop <= 0) return Infinity
  // 拉桿長度是 0 時,握把中心在 object 座標裡的位置
  const gripAtZero = groundScratch.grip.set(0, BAR_BOTTOM + GRIP.height / 2 - PIVOT.y, BAR.z - PIVOT.z)
  let limit = Infinity
  for (const { point, radius } of LOW_POINTS) {
    const height = grip.y + groundScratch.point.subVectors(point, gripAtZero).applyQuaternion(quaternion).y - radius
    limit = Math.min(limit, height / drop)
  }
  return limit
}
const groundScratch = { up: new Vector3(), grip: new Vector3(), point: new Vector3() }

function handleParts(box, material) {
  const [thickness, width] = HANDLE.bar
  const ends = [-1, 1].map((side) => (side * (HANDLE.length - HANDLE.mount)) / 2)
  const side = -SHELL.width / 2
  return [
    part(box, material, [HANDLE.length, thickness, width], [0, SHELL_TOP + HANDLE.lift, HANDLE.topZ]),
    ...ends.map((x) =>
      part(box, material, [HANDLE.mount, HANDLE.lift, HANDLE.mount], [x, SHELL_TOP + HANDLE.lift / 2, HANDLE.topZ]),
    ),
    part(box, material, [thickness, width, HANDLE.length], [side - HANDLE.lift, HANDLE.sideY, 0]),
    ...ends.map((z) =>
      part(box, material, [HANDLE.lift, HANDLE.mount, HANDLE.mount], [side - HANDLE.lift / 2, HANDLE.sideY, z]),
    ),
  ]
}

// 四個角落的萬向輪。每組是蓋住輪子上半部的輪座,加上輪軸上並排的兩個輪子;axle 繞 x 軸轉就是輪子在滾
function casterParts(box, tire, rim, materials) {
  const housingHeight = CLEARANCE - WHEEL.radius - 0.01
  const housingSize = [WHEEL.width * 2 + WHEEL.gap + 0.008, housingHeight, 0.05]
  const corners = [-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z]))
  return corners.map(([x, z]) => {
    const cx = x * (SHELL.width / 2 - WHEEL.inset)
    const cz = z * (SHELL.depth / 2 - WHEEL.inset)
    const housing = part(box, materials.base, housingSize, [cx, CLEARANCE - housingHeight / 2, cz])
    const axle = new Group()
    axle.position.set(cx, WHEEL.radius, cz)
    for (const side of [-1, 1]) {
      const offset = (side * (WHEEL.gap + WHEEL.width)) / 2
      axle.add(
        part(tire, materials.hardware, [1, 1, 1], [offset, 0, 0]),
        part(rim, materials.orange, [1, 1, 1], [offset, 0, 0]),
      )
    }
    return { housing, axle }
  })
}

// 伸縮拉桿與握把。setExtension(length) 把拉桿伸出箱頂 length 的長度,粗細兩節各佔一半,握把接在最上面
function createTrolley(box, materials) {
  const trolley = new Group()
  trolley.add(
    part(box, materials.hardware, [BAR.spacing + 0.06, DOCK_HEIGHT, 0.05], [0, SHELL_TOP + DOCK_HEIGHT / 2, BAR.z]),
  )
  // from 是這一節的下端在整根桿子上的位置,0 是箱頂、1 是握把。長度由 setExtension 決定,這裡先放單位長度
  const stages = [-1, 1].flatMap((side) => {
    const x = (side * BAR.spacing) / 2
    return [
      { mesh: part(box, materials.hardware, [BAR.outer, 1, BAR.outer], [x, 0, BAR.z]), from: 0 },
      { mesh: part(box, materials.hardware, [BAR.inner, 1, BAR.inner], [x, 0, BAR.z]), from: 0.5 },
    ]
  })
  trolley.add(...stages.map(({ mesh }) => mesh))

  // 握把的原點在它的底面中心。握把上有一顆按鈕,外面一圈虎橘色的外框
  const grip = new Group()
  grip.position.z = BAR.z
  grip.add(
    part(box, materials.hardware, [GRIP.width, GRIP.height, GRIP.depth], [0, GRIP.height / 2, 0]),
    part(box, materials.orange, [0.06, 0.01, 0.028], [0, GRIP.height + 0.005, 0]),
    part(box, materials.hardware, [0.042, 0.014, 0.016], [0, GRIP.height + 0.007, 0]),
  )
  trolley.add(grip)

  return {
    trolley,
    setExtension(length) {
      for (const { mesh, from } of stages) {
        mesh.scale.y = length / 2
        mesh.position.y = BAR_BOTTOM + length * (from + 0.25)
      }
      grip.position.y = BAR_BOTTOM + length
    },
  }
}

/**
 * 正面看過去是圓角長方形的板子,沿 z 方向有 depth 的厚度,原點在中心。
 *
 * top 與 bottom 決定上方與下方的兩個角要不要做成圓角。圓角只用幾段折線,和其他部位一樣是低多邊形的稜角。
 * geometry 分成兩個 group:正背兩面是 0,側面是 1。正背兩面的 UV 是正面看過去的 x 與 y,單位與世界座標相同。
 */
function roundedSlab(width, height, depth, radius, { top = true, bottom = true } = {}) {
  const left = -width / 2
  const right = width / 2
  const low = -height / 2
  const high = height / 2
  // absarc 會自動從目前的點畫直線接到圓弧的起點,所以每個圓角前面不必另外畫直線
  const shape = new Shape()
  if (bottom) {
    shape.moveTo(left + radius, low)
    shape.absarc(right - radius, low + radius, radius, -Math.PI / 2, 0)
  } else {
    shape.moveTo(left, low)
    shape.lineTo(right, low)
  }
  if (top) {
    shape.absarc(right - radius, high - radius, radius, 0, Math.PI / 2)
    shape.absarc(left + radius, high - radius, radius, Math.PI / 2, Math.PI)
  } else {
    shape.lineTo(right, high)
    shape.lineTo(left, high)
  }
  if (bottom) shape.absarc(left + radius, low + radius, radius, Math.PI, Math.PI * 1.5)
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 2 })
  // ExtrudeGeometry 從 z = 0 往 +z 長出厚度,移回來讓原點在中心
  return geometry.translate(0, 0, -depth / 2)
}

// 面板正面的貼圖,從正面看過去:霧面黑底,右下半部沿著對角線斜切出一塊浮雕,
// 浮雕是略淺的黑底加上深色的虎紋。貼圖的寬高比與面板相同,紋路才不會被壓扁
function createReliefTexture() {
  const [tileWidth, tileHeight] = TIGER_TILE_SIZE
  const width = tileWidth
  const height = Math.round((width * PANEL.height) / PANEL.width)
  return createCanvasTexture(width, height, (context) => {
    context.fillStyle = SHELL_COLOR
    context.fillRect(0, 0, width, height)
    // 從右上角斜切到左下角。canvas 的 y 往下,所以右下角是 (width, height)
    context.beginPath()
    context.moveTo(width, 0)
    context.lineTo(width, height)
    context.lineTo(0, height)
    context.closePath()
    context.clip()
    context.fillStyle = RELIEF_COLOR
    context.fillRect(0, 0, width, height)
    context.fillStyle = RELIEF_STRIPE_COLOR
    // 條紋拉長成一道道長紋,轉成從左上往右下,和斜切的那條對角線交叉。
    // 轉過之後要鋪滿整張貼圖,所以以中心為原點往四周鋪到對角線的長度
    context.translate(width / 2, height / 2)
    context.rotate(-Math.atan2(width, height))
    context.scale(1, RELIEF_STRIPE_STRETCH)
    const reach = Math.hypot(width, height)
    for (let y = -reach; y < reach; y += tileHeight) {
      for (let x = -reach; x < reach; x += tileWidth) {
        context.save()
        context.translate(x, y)
        paintTigerStripes(context)
        context.restore()
      }
    }
  })
}
