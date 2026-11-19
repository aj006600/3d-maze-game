// 渲染層的收集回饋共用的節奏:連續收集時怎麼排、跳一下的高度怎麼變化、動作的頭尾怎麼放慢。
// 每一段回饋都一樣長,在同一個字母上連續收集兩次時,各個造型的第二段才會一起開始。
// 動作本身長什麼樣子,由播它的造型決定。
import { COLLECT_FEEDBACK_SECONDS } from '../config.js'

/**
 * 一段長 `COLLECT_FEEDBACK_SECONDS` 的回饋動作的播放順序。每一次收集成功都要從頭完整地播一次。
 *
 * - `play()` 排進一次。正在播時再呼叫,這一次會排在後面,等前一次播完才從頭播,不會打斷前一次。
 * - `advance(dt)` 每一幀呼叫一次,dt 是經過幾秒。回傳目前這一次播到哪裡,0 是開頭、1 是結尾;
 *   沒有在播時回傳 null,這時呼叫端要擺回平常的樣子。
 */
export function createFeedbackClip() {
  let elapsed = null
  let queued = 0

  return {
    play() {
      if (elapsed === null) elapsed = 0
      else queued += 1
    },
    advance(dt) {
      if (elapsed === null) return null
      elapsed += dt
      if (elapsed >= COLLECT_FEEDBACK_SECONDS) {
        if (queued === 0) {
          elapsed = null
          return null
        }
        queued -= 1
        elapsed = 0
      }
      return elapsed / COLLECT_FEEDBACK_SECONDS
    },
  }
}

/**
 * 原地跳一下的高度比例,0 是站在地上、1 是跳到最高。
 *
 * feedback 是回饋播到哪裡,也就是 `advance` 的回傳值。從 from 起跳、到 to 落地,兩者都是整段回饋的幾分之幾。
 * 這一段以外與沒有在播時都是 0。
 */
export function hopOf(feedback, from, to) {
  if (feedback === null || feedback <= from || feedback >= to) return 0
  return Math.sin(((feedback - from) / (to - from)) * Math.PI)
}

/** 把 0 到 1 的 t 換成頭尾放慢的同一段 0 到 1,動作開始與停下時才不會頓一下。 */
export function easeInOut(t) {
  return t * t * (3 - 2 * t)
}
