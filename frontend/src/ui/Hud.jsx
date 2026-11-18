// 遊戲中疊在畫布上的提示:上方的通關字串與收集進度、可互動時的「按 F」,以及按錯時的「不是這個」。
// 它不接收滑鼠事件,點擊會穿過它落到畫布上;玩家放開游標之後,才能點畫布重新鎖定。

// inline style 寫不了 @keyframes,動畫另外放在這段 CSS 裡
const KEYFRAMES = `
@keyframes hud-next-blink {
  0%, 100% { opacity: 1; transform: translateY(-3px) scale(1.12); }
  50% { opacity: 0.35; transform: translateY(0) scale(1); }
}
@keyframes hud-wrong {
  0% { opacity: 0; transform: translateX(0) scale(0.9); }
  8% { opacity: 1; transform: translateX(-12px) scale(1); }
  16% { transform: translateX(12px); }
  24% { transform: translateX(-8px); }
  32% { transform: translateX(8px); }
  40% { transform: translateX(0); }
  75% { opacity: 1; }
  100% { opacity: 0; transform: translateX(0); }
}
`

/**
 * 遊戲中的提示。
 *
 * - `phrase` 是要顯示的通關字串,空格只用來分開單字,不算一個字母。
 * - `progress` 是已收集的字母數:前 progress 個字母亮起,下一個閃爍。
 * - `canInteract` 為 true 時顯示「按 F」。
 * - `wrongCount` 每加一,「不是這個」就從頭播一次,播完自己消失。它是 0 時不顯示。
 */
export default function Hud({ phrase, progress, canInteract, wrongCount }) {
  return (
    <div style={styles.overlay}>
      <style>{KEYFRAMES}</style>
      <div style={styles.phrase}>
        {wordsOf(phrase).map((word) => (
          <span key={word[0].index} style={styles.word}>
            {word.map(({ letter, index }) => (
              <span key={index} style={letterStyleOf(index, progress)}>
                {letter}
              </span>
            ))}
          </span>
        ))}
      </div>
      <div style={styles.prompts}>
        {/* 換 key 會換一個新的元素,動畫才會從頭播,連續按錯時每一下都看得到 */}
        {wrongCount > 0 && (
          <div key={wrongCount} style={styles.wrong}>
            不是這個
          </div>
        )}
        {canInteract && (
          <div style={styles.interact}>
            按 <kbd style={styles.key}>F</kbd>
          </div>
        )}
      </div>
    </div>
  )
}

// 把通關字串拆成單字,每個字母帶著它在收集順序裡的位置;空格不佔位置
function wordsOf(phrase) {
  let index = 0
  return phrase
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => [...word].map((letter) => ({ letter, index: index++ })))
}

function letterStyleOf(index, progress) {
  if (index < progress) return { ...styles.letter, ...styles.collected }
  if (index === progress) return { ...styles.letter, ...styles.next }
  return styles.letter
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    color: '#4a3b35',
  },
  phrase: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 20,
    padding: '10px 22px',
    borderRadius: 999,
    background: 'rgba(255, 253, 248, 0.92)',
    boxShadow: '0 6px 20px rgba(120, 80, 40, 0.2)',
    whiteSpace: 'nowrap',
  },
  word: {
    display: 'flex',
    gap: 6,
  },
  letter: {
    display: 'inline-block',
    minWidth: '0.8em',
    fontSize: 28,
    fontWeight: 800,
    textAlign: 'center',
    color: '#a8968a',
  },
  collected: {
    color: '#ff5fa2',
    textShadow: '0 0 10px rgba(255, 95, 162, 0.55)',
  },
  next: {
    color: '#e0577d',
    animation: 'hud-next-blink 1s ease-in-out infinite',
  },
  // 主角在畫面正中央偏下,提示放在最底下才不會蓋住主角的身體
  prompts: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 32,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  interact: {
    padding: '10px 24px',
    borderRadius: 999,
    background: 'rgba(255, 253, 248, 0.9)',
    boxShadow: '0 6px 20px rgba(120, 80, 40, 0.2)',
    fontSize: 20,
    fontWeight: 600,
  },
  key: {
    display: 'inline-block',
    minWidth: 28,
    margin: '0 4px',
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid #e3d6c8',
    borderBottomWidth: 3,
    background: '#fff',
    fontFamily: 'inherit',
    textAlign: 'center',
  },
  wrong: {
    padding: '10px 24px',
    borderRadius: 999,
    background: '#6b5a52',
    color: '#fff',
    fontSize: 20,
    fontWeight: 600,
    opacity: 0,
    animation: 'hud-wrong 1.4s ease-out forwards',
  },
}
