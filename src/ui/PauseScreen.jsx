// 暫停畫面:一局進行中游標被放開時蓋在遊戲上的畫面,玩家在這裡繼續這一局或回到開始畫面。
// 它蓋住整個畫布,所以暫停時點擊不會落到畫布上;要重新鎖定游標只能按「繼續」。
import { actions, backdrop, panel, primaryButton, secondaryButton, title } from './screenStyles.js'

/**
 * 玩家按下「繼續」時呼叫 `onResume`,按下「回到開始畫面」時呼叫 `onBackToStart`。
 *
 * 這個畫面在按鈕的 click 事件裡同步呼叫這兩個 callback,所以 `onResume` 可以直接鎖定游標。
 * 「回到開始畫面」不再多問一次。
 */
export default function PauseScreen({ onResume, onBackToStart }) {
  return (
    <div style={styles.backdrop}>
      <section style={styles.panel}>
        <h1 style={styles.title}>暫停</h1>
        <div style={styles.actions}>
          <button type="button" style={styles.resumeButton} onClick={onResume}>
            繼續
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
  title: { ...title, marginBottom: 28 },
  actions,
  resumeButton: primaryButton,
  backButton: secondaryButton,
}
