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

  /** 回傳 0 到 n - 1 之間的整數。 */
  function int(n) {
    return Math.floor(next() * n)
  }

  /** 從非空陣列裡挑一個元素。 */
  function pick(items) {
    return items[int(items.length)]
  }

  return { int, pick }
}
