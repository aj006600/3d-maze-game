// 畫面角落的喇叭圖示,反映目前有沒有靜音。切換靜音的是 M 鍵,這個圖示只負責顯示。
// 它不接收滑鼠事件:遊戲中點擊要穿過它落到畫布上,才能重新鎖定游標。
import { pill } from './screenStyles.js'

/** 有聲音時畫出聲波,靜音時畫一個叉。 */
export default function SpeakerIcon({ muted }) {
  const label = muted ? '已靜音,按 M 恢復聲音' : '有聲音,按 M 靜音'
  return (
    <div style={{ ...styles.badge, color: muted ? '#a8968a' : '#e0577d' }} role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" width={22} height={22} style={styles.icon} aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {muted ? (
          <path d="M16 9l6 6M22 9l-6 6" />
        ) : (
          <>
            <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />
            <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
          </>
        )}
      </svg>
    </div>
  )
}

const styles = {
  badge: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    ...pill,
    pointerEvents: 'none',
  },
  icon: {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
}
