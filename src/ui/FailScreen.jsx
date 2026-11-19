// 失敗畫面:挑戰失敗後看到的畫面,告訴玩家這一局收集了幾個字母,
// 並提供「再試一次」與「回到開始畫面」兩顆按鈕。祝福文字留給破關畫面,這裡不顯示。
// 它蓋住整個畫布,停在這個畫面時點擊不會落到畫布上。
import { actions, backdrop, panel, primaryButton, secondaryButton, title } from './screenStyles.js'

/**
 * `progress` 是這一局收集了幾個字母,`total` 是通關字串的字母數。
 *
 * 玩家按下「再試一次」時呼叫 `onRetry`,按下「回到開始畫面」時呼叫 `onBackToStart`。
 * 這個畫面在按鈕的 click 事件裡同步呼叫這兩個 callback,所以 `onRetry` 可以直接鎖定游標。
 */
export default function FailScreen({ progress, total, onRetry, onBackToStart }) {
  return (
    <div style={styles.backdrop}>
      <section style={styles.panel}>
        <h1 style={styles.title}>時間到了</h1>
        <p style={styles.progress}>
          收集了 {progress} / {total} 個字母
        </p>
        <p style={styles.encouragement}>差一點點,再試一次吧!</p>
        <div style={styles.actions}>
          <button type="button" style={styles.retryButton} onClick={onRetry}>
            再試一次
          </button>
          <button type="button" style={styles.backButton} onClick={onBackToStart}>
            回到開始畫面
          </button>
        </div>
      </section>
    </div>
  )
}

const styles = {
  backdrop,
  panel,
  title,
  progress: {
    margin: '16px 0 8px',
    fontSize: 20,
    fontWeight: 600,
  },
  encouragement: {
    margin: '0 0 28px',
    fontSize: 18,
    lineHeight: 1.7,
  },
  actions,
  retryButton: primaryButton,
  backButton: secondaryButton,
}
