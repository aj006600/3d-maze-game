// 蓋住整個畫布的畫面共用的外觀:半透明底、置中的面板、標題與主要按鈕。
// 這些畫面共用同一份,畫面之間切換時,面板的大小與按鈕的樣子才會一致。

export const backdrop = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(255, 244, 230, 0.55)',
  backdropFilter: 'blur(4px)',
}

export const panel = {
  width: '100%',
  maxWidth: 440,
  padding: '32px 32px 28px',
  borderRadius: 24,
  background: '#fffdf8',
  boxShadow: '0 12px 40px rgba(120, 80, 40, 0.25)',
  textAlign: 'center',
}

export const title = {
  margin: 0,
  fontSize: 36,
  letterSpacing: 4,
  color: '#e0577d',
}

export const primaryButton = {
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
}
