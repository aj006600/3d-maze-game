// 畫面上的按鍵圖示。開始畫面的操作說明與遊戲中的「按 F」共用它,同一個按鍵在兩處長得一樣。

/** 畫成一顆鍵帽的按鍵名稱。字的大小跟著外層的文字。 */
export default function Key({ children }) {
  return <kbd style={style}>{children}</kbd>
}

// border-box 讓 minWidth 包含 padding 與邊框,開始畫面的 W A S D 四顆鍵才放得進同一欄
const style = {
  display: 'inline-block',
  boxSizing: 'border-box',
  minWidth: 28,
  padding: '3px 6px',
  borderRadius: 6,
  border: '1px solid #e3d6c8',
  borderBottomWidth: 3,
  background: '#fff',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  textAlign: 'center',
  // 「滑鼠左鍵」這種好幾個字的按鍵名稱,在鍵帽裡折行就不像一顆鍵
  whiteSpace: 'nowrap',
}
