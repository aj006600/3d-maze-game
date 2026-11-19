// 遊戲核心唯一的亂數來源:由 seed 初始化的產生器。
// 核心內部不用 Math.random,同一個 seed 才會永遠得到同一局。

/**
 * 建立一個由 seed 決定整條數列的亂數產生器。
 *
 * 演算法是 mulberry32:狀態只有一個 32-bit 整數,seed 會先轉成 32-bit 無號整數。
 * 呼叫的次數與順序都會影響後面的結果,所以同一局裡的呼叫順序要固定。
 */
export function createRandom(seed) {
  let state = seed >>> 0

  function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** 回傳大於等於 0、小於 1 的小數。 */
  function float() {
    return next()
  }

  /** 回傳 0 到 n - 1 之間的整數。 */
  function int(n) {
    return Math.floor(next() * n)
  }

  /** 從非空陣列裡挑一個元素。 */
  function pick(items) {
    return items[int(items.length)]
  }

  /** 回傳一個打亂順序的新陣列,原陣列不變。 */
  function shuffle(items) {
    // Fisher-Yates:每一種排列出現的機會都相同
    const shuffled = [...items]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = int(i + 1)
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  return { float, int, pick, shuffle }
}
