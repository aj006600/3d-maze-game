// 入口畫面:打開網頁時第一眼看到的禮物盒與「點一下打開」的提示,點一下就進到開始畫面。
// 它存在的理由是瀏覽器的限制:使用者與網頁互動之前,網頁不能出聲。玩家拆禮物的這一下,同時讓音樂開始播。
// 整個畫面是一顆按鈕,點在禮物盒以外的地方也算數。
import { backdrop, pill } from './screenStyles.js'

// inline style 寫不了 @keyframes,動畫另外放在這段 CSS 裡
const KEYFRAMES = `
@keyframes entry-gift-wiggle {
  0%, 55%, 100% { transform: rotate(0deg); }
  65% { transform: rotate(-7deg); }
  75% { transform: rotate(6deg); }
  85% { transform: rotate(-3deg); }
}
@keyframes entry-hint-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
`

/**
 * 玩家點一下這個畫面時,它會呼叫 `onOpen`。
 *
 * 這個畫面在 click 事件裡同步呼叫 `onOpen`,所以 `onOpen` 可以直接讓網頁開始出聲。
 */
export default function EntryScreen({ onOpen }) {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <button type="button" style={styles.backdrop} onClick={onOpen}>
        <GiftBox />
        <span style={styles.hint}>點一下打開</span>
      </button>
    </>
  )
}

function GiftBox() {
  return (
    <svg viewBox="0 0 120 120" width={240} height={240} style={styles.gift} aria-hidden="true">
      <path d="M60 32 C 46 8, 18 12, 30 32 Z" fill="#ffc93c" />
      <path d="M60 32 C 74 8, 102 12, 90 32 Z" fill="#ffc93c" />
      <rect x="24" y="50" width="72" height="58" rx="4" fill="#ff7fa8" />
      <rect x="18" y="32" width="84" height="22" rx="4" fill="#e0577d" />
      <rect x="53" y="32" width="14" height="76" fill="#ffc93c" />
      <rect x="24" y="54" width="72" height="4" fill="#b83d61" opacity="0.25" />
      <circle cx="60" cy="32" r="7" fill="#f2b21f" />
    </svg>
  )
}

const styles = {
  // 按鈕預設的邊框、字型與顏色都換掉,看起來就跟其他畫面的底一樣
  backdrop: {
    ...backdrop,
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    gap: 20,
    border: 'none',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
  },
  // 以底部為軸搖晃,看起來像禮物盒在桌上晃
  gift: {
    transformOrigin: '50% 90%',
    animation: 'entry-gift-wiggle 2.4s ease-in-out infinite',
    filter: 'drop-shadow(0 10px 18px rgba(120, 80, 40, 0.25))',
  },
  hint: {
    padding: '10px 28px',
    ...pill,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 4,
    color: '#e0577d',
    animation: 'entry-hint-pulse 1.6s ease-in-out infinite',
  },
}
