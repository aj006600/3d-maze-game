// 收集成功時,字母、主角與狗各自播一段回饋動作。這裡是三者共用的節奏:每一段多長、連續收集時怎麼排。
// 動作本身長什麼樣子由各自的造型決定。

/**
 * 每一段回饋從頭播到尾的秒數。
 *
 * 字母、主角與狗用同一個長度,在同一個字母上連續收集兩次時,三者的第二段才會一起開始。
 * 介面層的通關字串裡剛亮起的那一格也彈跳這麼久,「門開了」也等這麼久才出現。
 */
export const FEEDBACK_SECONDS = 0.9

/**
 * 一段長 `FEEDBACK_SECONDS` 的回饋動作的播放順序。每一次收集成功都要從頭完整地播一次。
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
      if (elapsed >= FEEDBACK_SECONDS) {
        if (queued === 0) {
          elapsed = null
          return null
        }
        queued -= 1
        elapsed = 0
      }
      return elapsed / FEEDBACK_SECONDS
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
