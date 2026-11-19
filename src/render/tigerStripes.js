// 主角的制服與登機箱共用的虎紋:虎橘色,以及中間粗、兩端尖的條紋。
// 腰帶與登機箱用同一組條紋與同一個橘色,看起來才是同一套。條紋在 canvas 上畫出來,不使用圖片素材檔。

/** 虎紋的橘色。制服與登機箱上的橘色都用這一個。 */
export const TIGER_ORANGE = '#ef7a1a'

/** 一塊條紋的寬與高,單位是貼圖的像素。每條紋路都沿著這塊的上下方向。 */
export const TIGER_TILE_SIZE = [128, 32]

// 每一條紋路:中心 x、上端 y、下端 y、最寬處的半寬、兩端往左右偏的量,單位是貼圖的像素。
// 有的紋路貫穿上下,有的只畫到一半,看起來才像虎紋而不是整齊的條碼
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
 * 用 context 目前的 fillStyle,畫一塊 `TIGER_TILE_SIZE` 大小的條紋。
 *
 * 條紋畫在 context 目前的座標系裡,左上角是原點。要畫在別的位置或角度,先由呼叫端轉換座標系。
 */
export function paintTigerStripes(context) {
  for (const [x, top, bottom, halfWidth, lean] of TIGER_STRIPES) {
    const middle = (top + bottom) / 2
    // 二次曲線的控制點離中心兩倍半寬,曲線最寬的地方才剛好是半寬
    context.beginPath()
    context.moveTo(x + lean, top)
    context.quadraticCurveTo(x + halfWidth * 2, middle, x - lean, bottom)
    context.quadraticCurveTo(x - halfWidth * 2, middle, x + lean, top)
    context.fill()
  }
}
