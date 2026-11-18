// 開始畫面:打開網頁時第一眼看到的標題、目標與操作說明,讓玩家不需要別人教就能開始玩。
// 它蓋住整個畫布,停在這個畫面時點擊不會落到畫布上,也就不會意外鎖定游標。

const CONTROL_HINTS = [
  { keys: ['W', 'A', 'S', 'D'], action: 'W 前進、S 倒退、A 與 D 橫移' },
  { keys: ['滑鼠'], action: '轉動視角,主角跟著轉向' },
  { keys: ['F'], action: '站進有字母的死路時收集字母' },
  { keys: ['Esc'], action: '放開游標,點一下畫面就能繼續' },
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
        <p style={styles.goal}>在迷宮的死路裡依序收集 HAPPY BIRTHDAY 的字母,集滿後從打開的門走出去。</p>
        <ul style={styles.hints}>
          {CONTROL_HINTS.map(({ keys, action }) => (
            <li key={action} style={styles.hint}>
              <span style={styles.keys}>
                {keys.map((key) => (
                  <kbd key={key} style={styles.key}>
                    {key}
                  </kbd>
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
  backdrop: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(255, 244, 230, 0.55)',
    backdropFilter: 'blur(4px)',
    color: '#4a3b35',
  },
  panel: {
    width: '100%',
    maxWidth: 440,
    padding: '32px 32px 28px',
    borderRadius: 24,
    background: '#fffdf8',
    boxShadow: '0 12px 40px rgba(120, 80, 40, 0.25)',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: 36,
    letterSpacing: 4,
    color: '#e0577d',
  },
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
  // border-box 讓 minWidth 包含 padding 與邊框,W A S D 四顆鍵才放得進 keys 那一欄
  key: {
    boxSizing: 'border-box',
    minWidth: 28,
    padding: '3px 6px',
    borderRadius: 6,
    border: '1px solid #e3d6c8',
    borderBottomWidth: 3,
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 14,
    textAlign: 'center',
  },
  startButton: {
    padding: '12px 48px',
    border: 'none',
    borderRadius: 999,
    background: '#e0577d',
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: 4,
    cursor: 'pointer',
    boxShadow: '0 4px 0 #b83d61',
  },
}
