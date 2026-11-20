// 開始畫面:拆開入口畫面的禮物盒之後看到的標題、目標與操作說明,讓玩家不需要別人教就能開始玩,
// 開局前也在這裡選時限。
// 它蓋住整個畫布,停在這個畫面時點擊不會落到畫布上。
import { Fragment } from 'react'

import { PHRASE, TIME_LIMITS } from '../config.js'
import Key from './Key.jsx'
import { backdrop, panel, primaryButton, secondaryButton, title } from './screenStyles.js'

// separator 是同一列的幾個按鍵之間要夾的字。沒有 separator 的那一列,按鍵直接並排
const CONTROL_HINTS = [
  { keys: ['W', 'A', 'S', 'D'], action: 'W 前進、S 倒退、A 與 D 橫移' },
  { keys: ['滑鼠'], action: '轉動視角,主角跟著轉向' },
  { keys: ['F'], action: '站進有字母的角落時收集字母' },
  { keys: ['滑鼠左鍵', '空白鍵'], separator: '/', action: '揮擊登機箱,擊倒擋路的奧客' },
  { keys: ['Esc'], action: '暫停' },
  { keys: ['M'], action: '靜音' },
]

/**
 * 玩家按下「開始」時,這個畫面會呼叫 `onStart`。
 *
 * `timeLimit` 是目前選的時限,單位是秒,null 是不限時。玩家點時限的選項時呼叫 `onTimeLimitChange(timeLimit)`。
 * 點選項不會開始遊戲,也不會鎖定游標。
 *
 * 這個畫面在按鈕的 click 事件裡同步呼叫 `onStart`,所以 `onStart` 可以直接鎖定游標。
 */
export default function StartScreen({ timeLimit, onTimeLimitChange, onStart }) {
  return (
    <div style={styles.backdrop}>
      <section style={styles.panel}>
        <h1 style={styles.title}>生日迷宮</h1>
        <p style={styles.goal}>在迷宮的角落裡依序收集 {PHRASE} 的字母,集滿後從打開的門走出去。</p>
        <ul style={styles.hints}>
          {CONTROL_HINTS.map(({ keys, separator, action }) => (
            <li key={action} style={styles.hint}>
              <span style={styles.keys}>
                {keys.map((key, i) => (
                  <Fragment key={key}>
                    {separator && i > 0 && <span style={styles.separator}>{separator}</span>}
                    <Key>{key}</Key>
                  </Fragment>
                ))}
              </span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
        <div role="group" aria-labelledby="time-limit-label">
          <p id="time-limit-label" style={styles.timeLimitLabel}>
            時限
          </p>
          <div style={styles.timeLimits}>
            {TIME_LIMITS.map((limit) => (
              <button
                key={limit ?? 'none'}
                type="button"
                aria-pressed={limit === timeLimit}
                style={limit === timeLimit ? styles.selectedTimeLimitButton : styles.timeLimitButton}
                onClick={() => onTimeLimitChange(limit)}
              >
                {labelOf(limit)}
              </button>
            ))}
          </div>
        </div>
        <button type="button" style={styles.startButton} onClick={onStart}>
          開始
        </button>
      </section>
    </div>
  )
}

function labelOf(timeLimit) {
  return timeLimit === null ? '不限時' : `${timeLimit / 60} 分鐘`
}

// 選項沿用次要按鈕的框線與顏色。四個選項要排進同一列,所以左右不留 padding,字也小一點
const timeLimitButton = { ...secondaryButton, padding: '8px 0', fontSize: 15, letterSpacing: 0 }

const styles = {
  backdrop,
  panel,
  title,
  goal: {
    margin: '12px 0 24px',
    lineHeight: 1.6,
  },
  hints: {
    margin: '0 0 28px',
    padding: 0,
    listStyle: 'none',
    display: 'grid',
    gap: 10,
    textAlign: 'left',
  },
  hint: {
    display: 'grid',
    gridTemplateColumns: '136px 1fr',
    alignItems: 'center',
    gap: 12,
    fontSize: 15,
  },
  keys: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-end',
  },
  separator: {
    margin: '0 2px',
    color: '#8a766b',
  },
  timeLimitLabel: {
    margin: '0 0 8px',
    fontSize: 14,
    fontWeight: 600,
    color: '#8a766b',
  },
  timeLimits: {
    display: 'grid',
    gridTemplateColumns: `repeat(${TIME_LIMITS.length}, 1fr)`,
    gap: 8,
    margin: '0 0 24px',
  },
  timeLimitButton,
  // 選中的那一個塗滿主要按鈕的顏色,一眼看得出目前選的是哪一個。
  // 邊框要整個 border 換掉,不能只蓋 borderColor:取消選取時 React 只會移除 borderColor,不會重設沒變的 border,
  // 邊框顏色就變回瀏覽器的預設值
  selectedTimeLimitButton: {
    ...timeLimitButton,
    border: `2px solid ${primaryButton.background}`,
    background: primaryButton.background,
    color: primaryButton.color,
  },
  startButton: primaryButton,
}
