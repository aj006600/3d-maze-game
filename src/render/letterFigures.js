// 死路裡飄浮的立體字母:每個字母依點陣字形用小方塊拼成,不使用字型檔或任何素材檔。
// 目標字母與干擾字母用完全相同的外觀;字母在哪一格由遊戲核心決定,這裡只負責外觀、擺放、飄浮動作與收集的回饋。
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D } from 'three'

import { COLLECT_FEEDBACK_SECONDS } from '../config.js'
import { createFeedbackClip, easeInOut } from './collectFeedback.js'
import { toWorld } from './mazeScene.js'

// 5×7 的點陣字形,由上而下每列一個字串,`#` 是實心的方塊
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
}

const LETTER_COLOR = '#ff5fa2'
// 字母平常微微發光的強度,在暗一點的死路裡也看得清楚
const LETTER_GLOW = 0.25
// 一個方塊的邊長與字母的厚度,單位與世界座標相同
const PIXEL_SIZE = 0.24
const DEPTH = 0.36
// 字母中心離地的高度。字母飄到最低時,底部仍高過主角跑步時的頭頂,主角走進死路時不會穿過字母
const FLOAT_HEIGHT = 3
const BOB_HEIGHT = 0.12
const BOB_SECONDS = 2.4
// 字母以正面朝向開口為中心左右擺動,擺到斜角時看得出厚度
const SWAY_ANGLE = 0.35
const SWAY_SECONDS = 4
// 鏡頭進到這個距離內就可能插進字母裡,畫面會被字母的方塊蓋住一大片。
// 距離是字母的外接球半徑,再多留 0.15 涵蓋鏡頭的 near 距離
const HIDE_DISTANCE = Math.hypot(GLYPHS.A[0].length * PIXEL_SIZE, GLYPHS.A.length * PIXEL_SIZE, DEPTH) / 2 + 0.15

// 收集的回饋裡的時間點都是整段回饋的幾分之幾。
// 字母先閃一下白光,同時快速轉一圈並噴出一圈小方塊;轉完一圈之後,小方塊還在往下掉,掉完就消失。
// 白光在 peak 最亮,這時的發光強度是 intensity,到 end 退回平常的顏色
const FLASH = { peak: 0.08, end: 0.45, intensity: 1.2 }
const SPIN_END = 0.7
const letterColor = new Color(LETTER_COLOR)
const flashColor = new Color('#ffffff')
// 噴出來的小方塊。小方塊在字母正面的平面上往四周噴出一圈,同時被往上拋一點,之後被重力拉著往下掉。
// - size、speed、lift 與 gravity 的單位與世界座標相同,速度與重力以秒計。
// - 每個小方塊的方向會在一圈裡平均分配的位置上往後偏,最多偏 angleJitter 個間隔;
//   速度在 speed 上下 speedJitter 的比例內變化;depthSpread 是往字母前後散開的最大速度。
// - tumble 是小方塊翻滾的速度,每秒最多轉幾弧度。
// - 播到 shrinkFrom 之後小方塊開始縮小,播完時縮到看不見。
const SPARK = {
  count: 18,
  size: 0.12,
  color: '#ffa3c8',
  speed: 2.4,
  lift: 1.4,
  gravity: 7,
  angleJitter: 0.6,
  speedJitter: 0.25,
  depthSpread: 0.4,
  tumble: 4.5,
  shrinkFrom: 0.6,
}
const sparkPose = new Object3D()

// 字母的正面預設朝 +z(南方)。死路的開口在哪一側,就繞 y 軸轉到正面朝向那一側,從走道上看到的才是正面
const FACING = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }

/**
 * 依遊戲核心的字母配置,在每個字母所屬的死路裡建立一個飄浮的立體字母。`object` 要由呼叫端加進場景。
 *
 * 每一幀呼叫 `animate(seconds, cameraPosition)`:
 * - seconds 是單調遞增的時間,單位是秒;字母的飄浮動作與收集的回饋都由它推進。
 * - cameraPosition 是鏡頭在世界座標的位置。離鏡頭太近的字母會暫時藏起來,鏡頭離開後再出現。
 *
 * 收集成功時呼叫 `playCollect(letter)`,letter 是被收集的那個字母,例如 `'P'`。
 * 那個字母閃一下白光、快速轉一圈,並噴出一圈粉色的小方塊,小方塊落下後消失。字母本身一直留在原地。
 * 回饋還沒播完時又收集同一個字母,第二次會等第一次播完再從頭播。
 *
 * 用完必須呼叫 `dispose()` 釋放 geometry 與 material。
 */
export function createLetterFigures(game) {
  const { maze, letters } = game
  // 平常所有字母共用同一個方塊與同一個材質,目標字母與干擾字母不會有任何一處外觀不同。
  // 播收集回饋的字母要自己閃白光,所以暫時換成它自己的一份材質,播完就換回來
  const box = new BoxGeometry(PIXEL_SIZE, PIXEL_SIZE, DEPTH)
  const material = new MeshStandardMaterial({
    color: LETTER_COLOR,
    emissive: LETTER_COLOR,
    emissiveIntensity: LETTER_GLOW,
    roughness: 0.5,
  })
  const sparkBox = new BoxGeometry(SPARK.size, SPARK.size, SPARK.size)
  const sparkMaterial = new MeshStandardMaterial({
    color: SPARK.color,
    emissive: SPARK.color,
    emissiveIntensity: 0.5,
    roughness: 0.5,
  })
  const object = new Group()

  const figures = letters.map(({ letter, col, row }) => {
    const pixels = pixelsOf(GLYPHS[letter])
    const mesh = new InstancedMesh(box, material, pixels.length)
    pixels.forEach(({ x, y }, i) => mesh.setMatrixAt(i, new Matrix4().makeTranslation(x, y, 0)))

    const figure = new Group()
    figure.add(mesh)
    const center = toWorld(maze, { x: col + 0.5, y: row + 0.5 })
    figure.position.set(center.x, FLOAT_HEIGHT, center.z)
    // 死路只有一個開口
    const [opening] = maze.openings({ col, row })
    object.add(figure)
    // 收集回饋要用的材質與小方塊,到第一次被收集時才建立
    return {
      letter,
      figure,
      mesh,
      facing: FACING[opening],
      clip: createFeedbackClip(),
      flashMaterial: null,
      sparks: null,
    }
  })

  let lastSeconds = null

  return {
    object,
    playCollect(letter) {
      const entry = figures.find((candidate) => candidate.letter === letter)
      entry.flashMaterial ??= material.clone()
      if (entry.sparks === null) {
        entry.sparks = createSparks(sparkBox, sparkMaterial, entry)
        object.add(entry.sparks.mesh)
      }
      entry.clip.play()
    },
    animate(seconds, cameraPosition) {
      const dt = lastSeconds === null ? 0 : seconds - lastSeconds
      lastSeconds = seconds
      figures.forEach((entry, index) => {
        const { figure, mesh, facing } = entry
        // 每個字母的動作錯開一點,整座迷宮的字母不會整齊劃一地上下動
        const bob = Math.sin((seconds / BOB_SECONDS) * Math.PI * 2 + index)
        const sway = Math.sin((seconds / SWAY_SECONDS) * Math.PI * 2 + index)
        const feedback = entry.clip.advance(dt)
        figure.position.y = FLOAT_HEIGHT + bob * BOB_HEIGHT
        figure.rotation.y = facing + sway * SWAY_ANGLE + spinOf(feedback)
        mesh.material = feedback === null ? material : entry.flashMaterial
        if (feedback !== null) paintFlash(entry.flashMaterial, flashOf(feedback))
        if (entry.sparks !== null) placeSparks(entry.sparks, feedback)
        // 主角從死路往外走時,跟在背後的鏡頭會穿過字母;穿過的那一下不藏起來,畫面會閃過一整片字母的顏色
        figure.visible = figure.position.distanceTo(cameraPosition) > HIDE_DISTANCE
      })
    },
    dispose() {
      for (const { mesh, flashMaterial, sparks } of figures) {
        mesh.dispose()
        flashMaterial?.dispose()
        sparks?.mesh.dispose()
      }
      box.dispose()
      material.dispose()
      sparkBox.dispose()
      sparkMaterial.dispose()
    },
  }
}

// 字母因為收集回饋多轉的角度。feedback 是回饋播到哪裡,0 到 1,沒有在播時是 null。
// 前 SPIN_END 轉滿一圈,頭尾放慢,接回平常的擺動時才不會頓一下
function spinOf(feedback) {
  if (feedback === null) return 0
  return Math.PI * 2 * easeInOut(Math.min(feedback / SPIN_END, 1))
}

// 白光的強度,0 是平常的顏色、1 是最白。很快亮到最白,再慢慢退回去
function flashOf(feedback) {
  if (feedback < FLASH.peak) return feedback / FLASH.peak
  return Math.max(0, 1 - (feedback - FLASH.peak) / (FLASH.end - FLASH.peak))
}

function paintFlash(material, strength) {
  material.color.lerpColors(letterColor, flashColor, strength)
  material.emissive.lerpColors(letterColor, flashColor, strength)
  material.emissiveIntensity = LETTER_GLOW + strength * (FLASH.intensity - LETTER_GLOW)
}

/**
 * 一個字母的收集回饋要噴出的那一圈小方塊,回傳 `{ mesh, trajectories }`。`mesh` 要由呼叫端加進場景。
 *
 * 噴出的位置固定在字母平常的中心,正面朝向死路的開口,不跟著字母轉,小方塊才會往四周散開。
 * 每個小方塊的方向與速度在建立時決定,之後每一次回饋都照同樣的軌跡噴。mesh 用完由呼叫端 dispose。
 */
function createSparks(geometry, material, { figure, facing }) {
  const mesh = new InstancedMesh(geometry, material, SPARK.count)
  mesh.position.set(figure.position.x, FLOAT_HEIGHT, figure.position.z)
  mesh.rotation.y = facing
  mesh.visible = false
  // 在 -1 到 1 之間均勻分布的亂數
  const spread = () => Math.random() * 2 - 1
  const trajectories = Array.from({ length: SPARK.count }, (_, i) => {
    const angle = ((i + Math.random() * SPARK.angleJitter) / SPARK.count) * Math.PI * 2
    const speed = SPARK.speed * (1 + spread() * SPARK.speedJitter)
    return {
      velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed + SPARK.lift, spread() * SPARK.depthSpread],
      tumble: [spread(), spread(), spread()].map((axis) => axis * SPARK.tumble),
    }
  })
  return { mesh, trajectories }
}

// 依回饋播到哪裡擺好每個小方塊。沒有在播時整圈藏起來;快播完時小方塊縮小到消失
function placeSparks({ mesh, trajectories }, feedback) {
  mesh.visible = feedback !== null
  if (feedback === null) return
  const time = feedback * COLLECT_FEEDBACK_SECONDS
  const size = feedback < SPARK.shrinkFrom ? 1 : (1 - feedback) / (1 - SPARK.shrinkFrom)
  trajectories.forEach(({ velocity: [vx, vy, vz], tumble: [tx, ty, tz] }, i) => {
    sparkPose.position.set(vx * time, vy * time - (SPARK.gravity * time * time) / 2, vz * time)
    sparkPose.rotation.set(tx * time, ty * time, tz * time)
    // 縮到 0 時矩陣不可逆、算不出光照,所以留一點點大小
    sparkPose.scale.setScalar(Math.max(size, 0.001))
    sparkPose.updateMatrix()
    mesh.setMatrixAt(i, sparkPose.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}

// 字形裡每個實心方塊的中心,以字母的中心為原點;x 往右、y 往上,從正面看過去字才不會左右或上下顛倒
function pixelsOf(rows) {
  const width = rows[0].length
  const height = rows.length
  return rows.flatMap((line, row) =>
    [...line].flatMap((mark, col) =>
      mark === '#' ? [{ x: (col - (width - 1) / 2) * PIXEL_SIZE, y: ((height - 1) / 2 - row) * PIXEL_SIZE }] : [],
    ),
  )
}
