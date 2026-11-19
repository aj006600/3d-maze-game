// 遊戲中疊在畫布上的提示:上方的通關字串與收集進度、門打開時的「門開了」,
// 下方可互動時的「按 F」、按錯時的「不是這個」,以及走到鎖著的門前時的「先收集完字母」。
// 它不接收滑鼠事件,點擊會穿過它落到畫布上;玩家放開游標之後,才能點畫布重新鎖定。
import { FEEDBACK_SECONDS } from '../render/collectFeedback.js'
import Key from './Key.jsx'
import { pill } from './screenStyles.js'

// inline style 寫不了 @keyframes,動畫另外放在這段 CSS 裡
const KEYFRAMES = `
@keyframes hud-next-blink {
  0%, 100% { opacity: 1; transform: translateY(-3px) scale(1.12); }
  50% { opacity: 0.35; transform: translateY(0) scale(1); }
}
@keyframes hud-collected {
  0% { transform: translateY(0) scale(1); }
  25% {
    transform: translateY(-6px) scale(1.6);
    text-shadow: 0 0 6px #fff, 0 0 18px rgba(255, 95, 162, 0.95), 0 0 32px rgba(255, 95, 162, 0.7);
  }
  50% { transform: translateY(0) scale(0.9); }
  70% { transform: translateY(-2px) scale(1.12); }
  100% { transform: translateY(0) scale(1); }
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
@keyframes hud-door-opened {
  0% { opacity: 0; transform: translateX(-50%) scale(0.6); }
  10% { opacity: 1; transform: translateX(-50%) scale(1.15); }
  18% { transform: translateX(-50%) scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) scale(1); }
}
`

/**
 * 遊戲中的提示。
 *
 * - `phrase` 是要顯示的通關字串,空格只用來分開單字,不算一個字母。
 * - `progress` 是已收集的字母數:前 progress 個字母亮起,下一個閃爍。
 *   progress 每加一,剛亮起的那一格就放大彈跳並發光一下。
 * - `canInteract` 為 true 時顯示「按 F」。
 * - `wrongCount` 每加一,「不是這個」就從頭播一次,播完自己消失。它是 0 時不顯示。
 * - `atDoor` 為 true 且 `doorOpen` 為 false 時顯示「先收集完字母」。
 * - `doorOpen` 從 false 變成 true 時,「門開了」播一次,播完自己消失。一開始就是 true 時也會播一次。
 *   它等收集的回饋播完才出現:門在收集最後一個字母的那一下打開,那個字母就在畫面上方,兩者才不會疊在一起。
 */
export default function Hud({ phrase, progress, canInteract, wrongCount, atDoor, doorOpen }) {
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
      {doorOpen && <div style={styles.doorOpened}>門開了</div>}
      <div style={styles.prompts}>
        {/* 換 key 會換一個新的元素,動畫才會從頭播,連續按錯時每一下都看得到 */}
        {wrongCount > 0 && (
          <div key={wrongCount} style={styles.wrong}>
            不是這個
          </div>
        )}
        {canInteract && (
          <div style={styles.hint}>
            按<Key>F</Key>
          </div>
        )}
        {atDoor && !doorOpen && <div style={styles.hint}>先收集完字母</div>}
      </div>
    </div>
  )
}

// 把通關字串拆成單字,每個字母帶著它在收集順序裡的位置;空格不佔位置
function wordsOf(phrase) {
  let index = 0
  return phrase.split(' ').map((word) => [...word].map((letter) => ({ letter, index: index++ })))
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
  },
  phrase: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 20,
    padding: '10px 22px',
    ...pill,
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
  // 每一格已收集的字母都帶著這個只播一次的動畫。瀏覽器只在一格剛換上它時播,所以只有剛亮起的那一格會彈跳;
  // 之後進度再前進時這一格的樣式不變,動畫不會重播,也不會被下一格打斷
  collected: {
    color: '#ff5fa2',
    textShadow: '0 0 10px rgba(255, 95, 162, 0.55)',
    animation: `hud-collected ${FEEDBACK_SECONDS}s ease-out`,
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
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 24px',
    ...pill,
    fontSize: 20,
    fontWeight: 600,
  },
  // 放在通關字串的正下方,玩家看進度時就會看到它,也不會蓋住畫面中央偏下的主角
  doorOpened: {
    position: 'absolute',
    top: 84,
    left: '50%',
    padding: '12px 32px',
    borderRadius: 999,
    background: '#e0577d',
    color: '#fff',
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: 4,
    whiteSpace: 'nowrap',
    boxShadow: '0 6px 20px rgba(224, 87, 125, 0.4)',
    opacity: 0,
    animation: `hud-door-opened 3s ease-out ${FEEDBACK_SECONDS}s forwards`,
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
