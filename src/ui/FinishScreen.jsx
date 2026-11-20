// 破關畫面:主角走出門之後看到的慶祝畫面,有落下的彩帶、HAPPY BIRTHDAY、祝福文字,
// 以及「再玩一次」與「回到開始畫面」兩顆按鈕。它蓋住整個畫布,停在這個畫面時點擊不會落到畫布上。
import { BLESSING, PHRASE } from '../config.js'
import { actions, backdrop, panel, primaryButton, secondaryButton, title } from './screenStyles.js'

const CONFETTI_COLORS = ['#ff5fa2', '#ffc93c', '#5ec8f2', '#7ed957', '#b28dff', '#ff8a5c']
const CONFETTI_COUNT = 60

// inline style 寫不了 @keyframes,動畫另外放在這段 CSS 裡
const KEYFRAMES = `
@keyframes finish-confetti-fall {
  from { transform: translateY(-10vh) rotateZ(0deg) rotateY(0deg); }
  to { transform: translateY(110vh) rotateZ(540deg) rotateY(720deg); }
}
@keyframes finish-pop {
  0% { opacity: 0; transform: scale(0.8); }
  60% { opacity: 1; transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}
`

// 每一條彩帶的位置、顏色與節奏由編號決定,每次打開破關畫面都長得一樣。
// 延遲是負的,畫面一出現彩帶就已經散在半空中,而不是全部從頂端一起開始落
const CONFETTI = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  width: 8 + (i % 3) * 3,
  height: 14 + (i % 4) * 4,
  duration: `${3.5 + ((i * 7) % 10) * 0.25}s`,
  delay: `${-((i * 13) % 40) * 0.1}s`,
}))

/**
 * 玩家按下「再玩一次」時呼叫 `onRestart`,按下「回到開始畫面」時呼叫 `onBackToStart`。
 *
 * 這個畫面在按鈕的 click 事件裡同步呼叫這兩個 callback,所以 `onRestart` 可以直接鎖定游標。
 */
export default function FinishScreen({ onRestart, onBackToStart }) {
  return (
    <div style={styles.backdrop}>
      <style>{KEYFRAMES}</style>
      <div style={styles.confetti} aria-hidden="true">
        {CONFETTI.map(({ left, color, width, height, duration, delay }, i) => (
          <span
            key={i}
            style={{
              ...styles.piece,
              left,
              width,
              height,
              background: color,
              animationDuration: duration,
              animationDelay: delay,
            }}
          />
        ))}
      </div>
      <section style={styles.panel}>
        <h1 style={styles.title}>{PHRASE}</h1>
        <p style={styles.blessing}>{BLESSING}</p>
        <div style={styles.actions}>
          <button type="button" style={styles.restartButton} onClick={onRestart}>
            再玩一次
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
  // 彩帶從畫面外落進來再落出去,超出畫面的部分要裁掉,頁面才不會出現捲軸
  backdrop: { ...backdrop, overflow: 'hidden' },
  // 彩帶不接收滑鼠事件,落在按鈕上時也點得到按鈕
  confetti: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  piece: {
    position: 'absolute',
    top: 0,
    borderRadius: 2,
    animationName: 'finish-confetti-fall',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
  // relative 讓面板疊在絕對定位的彩帶上面
  panel: { ...panel, position: 'relative', animation: 'finish-pop 0.6s ease-out both' },
  title: { ...title, fontSize: 40 },
  blessing: {
    margin: '16px 0 28px',
    fontSize: 18,
    lineHeight: 1.7,
    // 祝福文字裡的換行照樣換行;太長的一行仍然自動折行
    whiteSpace: 'pre-line',
  },
  actions,
  restartButton: primaryButton,
  backButton: secondaryButton,
}
