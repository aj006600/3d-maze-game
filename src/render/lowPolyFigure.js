// 用幾何體拼成的低多邊形角色的共同做法:拼裝部件、畫貼圖、擺到地面上,以及跑步動作的節奏。
// 角色不使用模型、動畫或圖片素材檔,外觀、貼圖與動作都在程式裡算出來。
import { CanvasTexture, Mesh, SRGBColorSpace } from 'three'

// 跑步動作在起跑與停下時漸強與漸弱的速度:每秒從靜止到全速幾次
const BLEND_RATE = 8

/**
 * 每秒移動距離低於這個值就當作沒在跑,單位與世界座標相同。
 *
 * 正面頂著牆時位置只有浮點誤差等級的變化,這時不該原地跑步,算出來的移動方向也沒有意義。
 */
export const MIN_RUN_SPEED = 0.5

/** 用 geometry 與 material 建立一個部件,先依 size 縮放,再放到 position。 */
export function part(geometry, material, [width, height, depth], [x, y, z]) {
  const mesh = new Mesh(geometry, material)
  mesh.scale.set(width, height, depth)
  mesh.position.set(x, y, z)
  return mesh
}

/**
 * 建立一張寬 width、高 height 像素的貼圖,內容由 `paint(context)` 畫在 canvas 上。
 *
 * 只能在瀏覽器裡呼叫,因為要用 canvas 畫。用完必須由呼叫端 dispose。
 */
export function createCanvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  paint(canvas.getContext('2d'))
  const texture = new CanvasTexture(canvas)
  // canvas 的顏色是 sRGB,不標明的話貼圖會偏淡
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * 把角色擺到世界座標地面上的 `{ x, z }`,並轉向 heading。
 *
 * 角色的臉必須朝 -z。heading 用遊戲核心的慣例:0 朝北也就是 -z,從上方俯瞰時順時針增加。
 */
export function placeFigure(object, { x, z }, heading) {
  object.position.set(x, 0, z)
  // 核心的朝向從上方俯瞰是順時針增加,Three.js 繞 y 軸是逆時針,所以取負號
  object.rotation.y = -heading
}

/**
 * 跑完 strideLength 的距離就走完一個完整的步伐循環。
 *
 * 每一幀呼叫 `advance(distance, dt)`,distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒。
 * 回傳 `{ phase, blend }`:
 * - phase 是步伐的相位,在 0 到 2π 之間。它跟著移動的距離前進,腳步才會與地面的速度一致。
 * - blend 是跑步動作的強度,0 是站姿、1 是全速。起跑時漸強,停下後很快回到 0 並保持靜止。
 */
export function createRunCycle(strideLength) {
  let phase = 0
  let blend = 0
  return {
    advance(distance, dt) {
      const running = dt > 0 && distance > MIN_RUN_SPEED * dt
      phase = (phase + (distance / strideLength) * Math.PI * 2) % (Math.PI * 2)
      const target = running ? 1 : 0
      blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), BLEND_RATE * dt)
      return { phase, blend }
    },
  }
}
