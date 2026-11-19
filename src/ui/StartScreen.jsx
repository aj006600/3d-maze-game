// 開始畫面:拆開入口畫面的禮物盒之後看到的標題、目標與操作說明,讓玩家不需要別人教就能開始玩。
// 它蓋住整個畫布,停在這個畫面時點擊不會落到畫布上。
import { PHRASE } from '../config.js'
import Key from './Key.jsx'
import { backdrop, panel, primaryButton, title } from './screenStyles.js'

const CONTROL_HINTS = [
  { keys: ['W', 'A', 'S', 'D'], action: 'W 前進、S 倒退、A 與 D 橫移' },
  { keys: ['滑鼠'], action: '轉動視角,主角跟著轉向' },
  { keys: ['F'], action: '站進有字母的死路時收集字母' },
  { keys: ['Esc'], action: '暫停' },
  { keys: ['M'], action: '靜音' },
]

/**
 * 玩家按下「開始」時,這個畫面會呼叫 `onStart`。
 *
 * 這個畫面在按鈕的 click 事件裡同步呼叫 `onStart`,所以 `onStart` 可以直接鎖定游標。
 */
export default function StartScreen({ onStart }) {
  return (
    <div style={styles.backdrop}>
      <section style={styles.panel}>
        <h1 style={styles.title}>生日迷宮</h1>
        <p style={styles.goal}>在迷宮的死路裡依序收集 {PHRASE} 的字母,集滿後從打開的門走出去。</p>
        <ul style={styles.hints}>
          {CONTROL_HINTS.map(({ keys, action }) => (
            <li key={action} style={styles.hint}>
              <span style={styles.keys}>
                {keys.map((key) => (
                  <Key key={key}>{key}</Key>
                ))}
              </span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
        <button type="button" style={styles.startButton} onClick={onStart}>
          開始
        </button>
      </section>
    </div>
  )
}

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
    gridTemplateColumns: '128px 1fr',
    alignItems: 'center',
    gap: 12,
    fontSize: 15,
  },
  keys: {
    display: 'flex',
    gap: 4,
    justifyContent: 'flex-end',
  },
  startButton: primaryButton,
}
