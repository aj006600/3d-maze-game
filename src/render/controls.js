// 鍵盤與滑鼠的輸入:WASD 決定往哪個方向跑,F 是互動鍵,滑鼠左鍵與空白鍵是揮擊鍵,
// 游標鎖定後滑鼠的水平移動決定朝向、垂直移動決定俯仰角。
// 這裡只把輸入整理成遊戲核心 step 要的 forward、right 與 heading、互動鍵與揮擊鍵各按了幾次,以及鏡頭要的 pitch,
// 不決定任何規則。
import { CAMERA } from '../config.js'

// 每移動一個像素轉幾弧度,水平與垂直相同
const MOUSE_SENSITIVITY = 0.0025
// 用 KeyboardEvent.code 認按鍵的實體位置,換成別的鍵盤配置時 WASD 仍在同一個位置
const KEYS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD' }
const MOVE_KEY_CODES = new Set(Object.values(KEYS))
const INTERACT_KEY = 'KeyF'
const SWING_KEY = 'Space'
// MouseEvent.button 的 0 是主要按鍵,一般就是左鍵
const SWING_BUTTON = 0

/**
 * 開始監聽輸入。游標只透過 `lock()` 鎖定,點擊 element 不會鎖定。
 *
 * `read()` 回傳當下的 `{ forward, right, heading, pitch, interactions, swings }`。
 * - heading 從 `reset()` 給的朝向開始累加,不限角度;還沒呼叫過 `reset()` 時從 0 開始。
 * - pitch 從設定的起始俯仰角開始,滑鼠往下移是往下看,限制在設定的上下限之間。
 * - interactions 是上一次 `read()` 之後按下互動鍵的次數。每一下只會被回報一次,按住不放也只算一下。
 *   游標的鎖定狀態一變,還沒回報的次數就歸零。
 * - swings 是上一次 `read()` 之後按下揮擊鍵的次數,計法與 interactions 相同。
 *   滑鼠左鍵只在游標鎖在 element 上時才算,所以點疊在畫布上的按鈕的那一下不算。
 *
 * 空白鍵在瀏覽器裡的預設行為一律被擋掉:頁面不會捲動,有焦點的按鈕也不會被觸發。
 *
 * 游標沒鎖定時滑鼠不會轉向,左鍵也不算揮擊,但 WASD、互動鍵與空白鍵照樣有效。
 * `lock()` 把游標鎖在 element 上。它必須在使用者的點擊或按鍵事件裡呼叫,否則瀏覽器會拒絕鎖定。
 * 瀏覽器拒絕鎖定時,`lock()` 不會丟出錯誤,之後在另一次點擊裡再呼叫一次就好。
 * `unlock()` 放開被它鎖住的游標,游標沒被它鎖住時什麼都不做。
 * `isLocked()` 回傳游標當下是不是鎖在 element 上。
 * `reset(startHeading)` 在新的一局開始時呼叫:朝向換成 startHeading,俯仰角回到起始值,
 * 還沒回報的互動鍵與揮擊鍵也一併清掉。
 * 用完必須呼叫 `dispose()` 移除所有監聽,游標若被它鎖住也會一併放開。
 *
 * `onLockChange(locked)` 在游標的鎖定狀態可能變了時呼叫,locked 是呼叫當下 `isLocked()` 的值:
 * - 鎖定成功時呼叫。
 * - 游標被放開時呼叫,不論是 `unlock()`、按 Esc,還是切到別的視窗或分頁。
 * - 瀏覽器拒絕鎖定時也會呼叫。這時狀態沒有變,locked 通常是 false。
 *
 * 鎖定與放開都由瀏覽器非同步完成,所以 `onLockChange` 一定在 `lock()` 與 `unlock()` 回傳之後才被呼叫。
 */
export function createControls(element, { onLockChange } = {}) {
  const pressed = new Set()
  let heading = 0
  let pitch = CAMERA.startPitch
  // 上一次 read() 之後按了幾次、還沒回報的按鍵
  const pending = { interactions: 0, swings: 0 }
  const clearPending = () => Object.assign(pending, { interactions: 0, swings: 0 })

  const isLocked = () => document.pointerLockElement === element

  function onKeyDown(event) {
    if (MOVE_KEY_CODES.has(event.code)) pressed.add(event.code)
    // 按住不放時瀏覽器會一直重送 keydown,只有第一下算一次互動
    if (event.code === INTERACT_KEY && !event.repeat) pending.interactions += 1
    if (event.code === SWING_KEY) {
      event.preventDefault()
      if (!event.repeat) pending.swings += 1
    }
  }
  function onKeyUp(event) {
    pressed.delete(event.code)
    // 有些瀏覽器在放開空白鍵時才觸發有焦點的按鈕,所以放開時也要擋
    if (event.code === SWING_KEY) event.preventDefault()
  }
  function onMouseDown(event) {
    if (isLocked() && event.button === SWING_BUTTON) pending.swings += 1
  }
  // 視窗失焦時收不到放開按鍵的事件,不清掉的話回來時主角會自己一直跑
  function onBlur() {
    pressed.clear()
  }
  function lock() {
    if (isLocked()) return
    // 有些瀏覽器回傳 Promise、有些不回傳,所以鎖定的結果從 pointerlockchange 與 pointerlockerror 得知。
    // 按 Esc 放開後立刻再鎖時瀏覽器會拒絕;接住 rejection,console 才不會出現 uncaught 錯誤
    Promise.resolve(element.requestPointerLock()).catch(() => {})
  }
  function unlock() {
    if (isLocked()) document.exitPointerLock()
  }
  // 拒絕鎖定的 pointerlockerror 也走這裡:呼叫端在等鎖定的結果,拒絕時一樣要通知
  function onPointerLockChange() {
    // 畫面在背景時瀏覽器會停掉動畫迴圈,按下的互動鍵可能一直沒被讀走。
    // 鎖定狀態一變就清掉,暫停前或暫停時按的 F 與揮擊鍵才不會在繼續之後才生效
    clearPending()
    onLockChange?.(isLocked())
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
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('pointerlockerror', onPointerLockChange)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mousedown', onMouseDown)

  const axis = (positive, negative) => (pressed.has(positive) ? 1 : 0) - (pressed.has(negative) ? 1 : 0)

  return {
    read() {
      const counts = { ...pending }
      clearPending()
      return {
        forward: axis(KEYS.forward, KEYS.back),
        right: axis(KEYS.right, KEYS.left),
        heading,
        pitch,
        ...counts,
      }
    },
    lock,
    unlock,
    isLocked,
    reset(startHeading) {
      heading = startHeading
      pitch = CAMERA.startPitch
      clearPending()
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('pointerlockerror', onPointerLockChange)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mousedown', onMouseDown)
      unlock()
    },
  }
}
