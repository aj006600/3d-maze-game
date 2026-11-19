// 死路裡飄浮的立體字母:每個字母依點陣字形用小方塊拼成,不使用字型檔或任何素材檔。
// 目標字母與干擾字母用完全相同的外觀;字母在哪一格由遊戲核心決定,這裡只負責外觀、擺放與飄浮動作。
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three'

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

// 字母的正面預設朝 +z(南方)。死路的開口在哪一側,就繞 y 軸轉到正面朝向那一側,從走道上看到的才是正面
const FACING = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }

/**
 * 依遊戲核心的字母配置,在每個字母所屬的死路裡建立一個飄浮的立體字母。`object` 要由呼叫端加進場景。
 *
 * 每一幀呼叫 `animate(seconds, cameraPosition)`:
 * - seconds 是單調遞增的時間,單位是秒;字母的飄浮動作只由它決定。
 * - cameraPosition 是鏡頭在世界座標的位置。離鏡頭太近的字母會暫時藏起來,鏡頭離開後再出現。
 * 用完必須呼叫 `dispose()` 釋放 geometry 與 material。
 */
export function createLetterFigures(game) {
  const { maze, letters } = game
  // 所有字母共用同一個方塊與同一個材質,目標字母與干擾字母不會有任何一處外觀不同
  const box = new BoxGeometry(PIXEL_SIZE, PIXEL_SIZE, DEPTH)
  const material = new MeshStandardMaterial({
    color: LETTER_COLOR,
    emissive: LETTER_COLOR,
    emissiveIntensity: 0.25,
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
    return { figure, mesh, facing: FACING[opening] }
  })

  return {
    object,
    animate(seconds, cameraPosition) {
      figures.forEach(({ figure, facing }, index) => {
        // 每個字母的動作錯開一點,整座迷宮的字母不會整齊劃一地上下動
        const bob = Math.sin((seconds / BOB_SECONDS) * Math.PI * 2 + index)
        const sway = Math.sin((seconds / SWAY_SECONDS) * Math.PI * 2 + index)
        figure.position.y = FLOAT_HEIGHT + bob * BOB_HEIGHT
        figure.rotation.y = facing + sway * SWAY_ANGLE
        // 主角從死路往外走時,跟在背後的鏡頭會穿過字母;穿過的那一下不藏起來,畫面會閃過一整片字母的顏色
        figure.visible = figure.position.distanceTo(cameraPosition) > HIDE_DISTANCE
      })
    },
    dispose() {
      for (const { mesh } of figures) mesh.dispose()
      box.dispose()
      material.dispose()
    },
  }
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
