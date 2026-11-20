// 奧客的對話框:漫畫風的白色氣泡,描黑邊、寫黑字,左邊伸出一條尾巴指向講話的人的臉。
// 氣泡浮在臉的右側,所以奧客貼在主角面前、臉在畫面頂端附近時也看得到。
// 文字畫在 canvas 貼圖上,貼圖用 Sprite 顯示,所以從任何角度看都是正面朝著鏡頭。
// 這裡只負責對話框的外觀與台詞的輪播;對話框掛在哪裡、什麼時候該講話,由擁有它的造型決定。
// 挑哪一句屬於呈現,不影響任何規則,所以用瀏覽器的亂數,不用一局的 seed。
import { Sprite, SpriteMaterial } from 'three'

import { SPEECH_BUBBLE } from '../config.js'
import { createCanvasTexture } from './lowPolyFigure.js'

// 貼圖上每一單位世界座標長度用幾個像素。鏡頭貼近奧客時對話框會放大到佔掉大半個畫面,像素要夠多,中文字才不會糊
const PIXELS_PER_UNIT = 400
const toPixels = (length) => Math.round(length * PIXELS_PER_UNIT)

// 以下的長度都以像素計,括號裡的數字是世界座標的長度
const FONT_SIZE = toPixels(0.2)
const LINE_HEIGHT = toPixels(0.27)
// 一行字最寬多寬,比它寬的台詞斷成兩行。它是字高的 10 倍,放得下十個中文字
const MAX_LINE_WIDTH = FONT_SIZE * 10
const PADDING = { x: toPixels(0.16), y: toPixels(0.1) }
const CORNER_RADIUS = toPixels(0.14)
const OUTLINE = toPixels(0.03)
// 尾巴從氣泡左邊的垂直中心往左伸出 length,根部的上下兩端離垂直中心 halfBase。
// 尖端與氣泡的垂直中心一樣高:奧客貼在主角面前擋路時,臉已經在畫面頂端附近,氣泡再往上就會超出畫面
const TAIL = { length: toPixels(0.2), halfBase: toPixels(0.07) }
// 黑邊一半畫在形狀外面,貼圖的四周要留這麼寬,黑邊才不會被切掉
const MARGIN = OUTLINE
const BUBBLE_LEFT = MARGIN + TAIL.length
const CANVAS_WIDTH = BUBBLE_LEFT + MAX_LINE_WIDTH + 2 * PADDING.x + MARGIN
// 高度放得下兩行字的氣泡。氣泡的垂直中心在貼圖的正中央
const CANVAS_HEIGHT = 2 * LINE_HEIGHT + 2 * PADDING.y + 2 * MARGIN
const TIP = { x: MARGIN, y: CANVAS_HEIGHT / 2 }

const FILL_COLOR = '#ffffff'
const INK_COLOR = '#1c1918'
// system-ui 沒有中文字,中文字會依序往後找:macOS 是蘋方,Windows 是微軟正黑體
const FONT = `800 ${FONT_SIZE}px system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`

// 依詞斷行,斷行才不會把「為什麼」這種詞拆到兩行
const segmenter = new Intl.Segmenter('zh-TW', { granularity: 'word' })

/**
 * 建立一個對話框,`object` 要由呼叫端掛進場景。
 *
 * object 的位置是講話的人的臉。在畫面上,尾巴的尖端停在臉的右邊 gap 遠的地方,氣泡接在尖端的右邊、與臉一樣高,
 * 所以從任何角度看,對話框都在臉的右側、不會蓋住臉。gap 的單位與世界座標相同。
 *
 * 對話框畫在所有東西的前面,牆也擋不住它:氣泡比走道的一半還寬,照一般的前後關係畫的話,會被走道兩側的樹籬切掉。
 *
 * 每一幀呼叫 `update(dt, talking, inSight)`:
 * - dt 是遊戲這一幀推進了幾秒。遊戲停住時傳 0,輪播就停在原地。
 * - talking 是講話的人這一幀該不該講話。從不該變成該講話的那一幀立刻顯示一句,
 *   之後照設定模組的秒數顯示、隱藏地輪播。不該講話時立刻隱藏,下次該講話時又從顯示一句開始。
 * - inSight 是鏡頭這一幀看不看得到講話的人。看不到時這一幀不畫,對話框才不會透過牆露出來;輪播照樣進行。
 *
 * 每次從設定模組的台詞裡隨機挑一句,不與這個對話框的上一句相同。設定的台詞少於兩句時會丟出錯誤。
 * `setOpacity(opacity)` 設定整個對話框的不透明度,1 是完全不透明。
 *
 * 只能在瀏覽器裡建立,因為貼圖要用 canvas 畫。用完必須呼叫 `dispose()` 釋放 material 與貼圖。
 */
export function createSpeechBubble(gap) {
  if (SPEECH_BUBBLE.lines.length < 2) {
    throw new Error(
      `SPEECH_BUBBLE.lines needs at least 2 lines to avoid repeating one, got ${SPEECH_BUBBLE.lines.length}`,
    )
  }
  // 貼圖的內容在換句時才畫
  const texture = createCanvasTexture(CANVAS_WIDTH, CANVAS_HEIGHT, () => {})
  const material = new SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })
  const sprite = new Sprite(material)
  // 半透明的東西照 renderOrder 由小到大畫,比其他東西大才會畫在半透明的奧客前面
  sprite.renderOrder = 1
  sprite.scale.set(CANVAS_WIDTH / PIXELS_PER_UNIT, CANVAS_HEIGHT / PIXELS_PER_UNIT, 1)
  // Sprite 的 center 是它的位置落在貼圖上的哪一點,以貼圖左下角為原點、寬高為 1;canvas 的 y 朝下,所以要翻過來。
  // 這一點在尾巴尖端的左邊 gap 遠,已經在貼圖外面
  sprite.center.set((TIP.x - gap * PIXELS_PER_UNIT) / CANVAS_WIDTH, 1 - TIP.y / CANVAS_HEIGHT)
  sprite.visible = false

  // 這一句從出現起過了幾秒,沒有在講話時是 null
  let elapsed = null
  // 最近一次挑的是第幾句,還沒講過話時是 null
  let lastLine = null

  function say() {
    lastLine = pickLine(lastLine)
    paintBubble(texture.image.getContext('2d'), SPEECH_BUBBLE.lines[lastLine])
    texture.needsUpdate = true
  }

  return {
    object: sprite,
    update(dt, talking, inSight) {
      if (!talking) {
        elapsed = null
        sprite.visible = false
        return
      }
      const cycle = SPEECH_BUBBLE.showSeconds + SPEECH_BUBBLE.hideSeconds
      if (elapsed === null) {
        elapsed = 0
        say()
      } else {
        elapsed += dt
        if (elapsed >= cycle) {
          elapsed -= cycle
          say()
        }
      }
      sprite.visible = inSight && elapsed < SPEECH_BUBBLE.showSeconds
    },
    setOpacity(opacity) {
      material.opacity = opacity
    },
    dispose() {
      material.dispose()
      texture.dispose()
    },
  }
}

// 從台詞裡隨機挑一句,回傳它是第幾句。
// 有上一句時,先在少一句的範圍裡挑,挑到上一句或它之後的就往後挪一句,上一句因此不會被挑到
function pickLine(previous) {
  const count = SPEECH_BUBBLE.lines.length
  if (previous === null) return Math.floor(Math.random() * count)
  const index = Math.floor(Math.random() * (count - 1))
  return index >= previous ? index + 1 : index
}

// 把台詞畫成氣泡,氣泡的寬高跟著字的多寡改變;貼圖其餘的部分透明
function paintBubble(context, text) {
  const { width, height } = context.canvas
  context.clearRect(0, 0, width, height)
  context.font = FONT
  const lines = layoutLines(context, text)
  const textWidth = Math.min(MAX_LINE_WIDTH, Math.max(...lines.map((line) => context.measureText(line).width)))
  const bubbleWidth = textWidth + 2 * PADDING.x
  const bubbleHeight = lines.length * LINE_HEIGHT + 2 * PADDING.y
  const centerY = height / 2
  const top = centerY - bubbleHeight / 2

  const bubble = () => {
    context.beginPath()
    context.roundRect(BUBBLE_LEFT, top, bubbleWidth, bubbleHeight, CORNER_RADIUS)
  }
  // 尾巴的根部伸進氣泡裡一點,蓋掉氣泡左邊在根部那一段的黑邊,尾巴與氣泡才看起來是同一塊
  const tail = () => {
    context.beginPath()
    context.moveTo(BUBBLE_LEFT + OUTLINE, centerY - TAIL.halfBase)
    context.lineTo(TIP.x, TIP.y)
    context.lineTo(BUBBLE_LEFT + OUTLINE, centerY + TAIL.halfBase)
    context.closePath()
  }
  // 先描兩倍粗的黑邊、再填白色,白色蓋掉黑邊內側的一半,剩下外側的一半就是輪廓;
  // 氣泡與尾巴也因此互相蓋掉對方在交界處的黑邊
  context.lineJoin = 'round'
  context.lineWidth = OUTLINE * 2
  context.strokeStyle = INK_COLOR
  context.fillStyle = FILL_COLOR
  for (const shape of [bubble, tail]) {
    shape()
    context.stroke()
  }
  for (const shape of [bubble, tail]) {
    shape()
    context.fill()
  }

  context.fillStyle = INK_COLOR
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  lines.forEach((line, i) => {
    // 給 maxWidth 時,斷了行還是太寬的字會被橫向壓窄,不會超出氣泡
    context.fillText(line, BUBBLE_LEFT + bubbleWidth / 2, top + PADDING.y + LINE_HEIGHT * (i + 0.5), MAX_LINE_WIDTH)
  })
}

// 把一句台詞排成一行或兩行,回傳每一行的文字。context 必須已經設好字型。
// 一行放得下就不斷行。要斷行時只斷在詞與詞之間,下一行不以標點開頭;
// 在兩行都放得下的斷法裡,優先挑斷在標點後面的,其次挑兩行最接近等寬的。沒有兩行都放得下的斷法時,挑最寬那一行最窄的
function layoutLines(context, text) {
  const measure = (line) => context.measureText(line).width
  if (measure(text) <= MAX_LINE_WIDTH) return [text]
  const splits = []
  for (const { index } of segmenter.segment(text)) {
    const first = text.slice(0, index).trimEnd()
    const second = text.slice(index).trimStart()
    if (first === '' || second === '' || /^\p{P}/u.test(second)) continue
    splits.push({ lines: [first, second], width: Math.max(measure(first), measure(second)) })
  }
  if (splits.length === 0) return [text]
  const fitting = splits.filter((split) => split.width <= MAX_LINE_WIDTH)
  const afterPunctuation = fitting.filter((split) => /\p{P}$/u.test(split.lines[0]))
  const candidates = [afterPunctuation, fitting, splits].find((group) => group.length > 0)
  return candidates.reduce((best, split) => (split.width < best.width ? split : best)).lines
}
