// 鍵盤與滑鼠的輸入:WASD 決定往哪個方向跑,游標鎖定後滑鼠的水平移動決定朝向、垂直移動決定俯仰角。
// 這裡只把輸入整理成遊戲核心 step 要的 forward、right 與 heading,以及鏡頭要的 pitch,不決定任何規則。
import { CAMERA } from '../config.js'

// 每移動一個像素轉幾弧度,水平與垂直相同
const MOUSE_SENSITIVITY = 0.0025
// 用 KeyboardEvent.code 認按鍵的實體位置,換成別的鍵盤配置時 WASD 仍在同一個位置
const KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD' }
const MOVE_KEY_CODES = new Set(Object.values(KEYS))

/**
 * 開始監聽輸入。點擊 element 會鎖定游標,按 Esc 由瀏覽器放開,再點一下可以重新鎖定。
 *
 * `read()` 回傳當下的 `{ forward, right, heading, pitch }`。
 * - heading 從 initialHeading 開始累加,不限角度。
 * - pitch 從設定的起始俯仰角開始,滑鼠往下移是往下看,限制在設定的上下限之間。
 *
 * 游標沒鎖定時滑鼠不會轉向,但 WASD 照樣有效。
 * `lock()` 把游標鎖在 element 上。它必須在使用者的點擊或按鍵事件裡呼叫,否則瀏覽器會拒絕鎖定。
 * 瀏覽器拒絕鎖定時,`lock()` 不會丟出錯誤,玩家之後點一下 element 一樣能鎖定。
 * 用完必須呼叫 `dispose()` 移除所有監聽,游標若被它鎖住也會一併放開。
 */
export function createControls(element, initialHeading) {
  const pressed = new Set()
  let heading = initialHeading
  let pitch = CAMERA.startPitch

  const isLocked = () => document.pointerLockElement === element

  function onKeyDown(event) {
    if (MOVE_KEY_CODES.has(event.code)) pressed.add(event.code)
  }
  function onKeyUp(event) {
    pressed.delete(event.code)
  }
  // 視窗失焦時收不到放開按鍵的事件,不清掉的話回來時主角會自己一直跑
  function onBlur() {
    pressed.clear()
  }
  function lock() {
    if (isLocked()) return
    // 有些瀏覽器回傳 Promise、有些不回傳。按 Esc 放開後立刻再點時瀏覽器會拒絕鎖定,
    // 這時玩家再點一次就好;接住 rejection,console 才不會出現 uncaught 錯誤
    Promise.resolve(element.requestPointerLock()).catch(() => {})
  }
  function onMouseMove(event) {
    if (!isLocked()) return
    heading += event.movementX * MOUSE_SENSITIVITY
    // 每一次移動都夾在上下限內,而不是讀取時才夾:滑過頭之後往回移,鏡頭會立刻跟著動
    const nextPitch = pitch + event.movementY * MOUSE_SENSITIVITY
    pitch = Math.min(Math.max(nextPitch, CAMERA.minPitch), CAMERA.maxPitch)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  element.addEventListener('click', lock)
  document.addEventListener('mousemove', onMouseMove)

  const axis = (positive, negative) => (pressed.has(positive) ? 1 : 0) - (pressed.has(negative) ? 1 : 0)

  return {
    read() {
      return { forward: axis(KEYS.forward, KEYS.back), right: axis(KEYS.right, KEYS.left), heading, pitch }
    },
    lock,
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      element.removeEventListener('click', lock)
      document.removeEventListener('mousemove', onMouseMove)
      if (isLocked()) document.exitPointerLock()
    },
  }
}
