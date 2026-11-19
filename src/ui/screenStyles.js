// 介面層共用的外觀:蓋住整個畫布的畫面用的半透明底、置中的面板、標題、主要與次要按鈕,
// 以及疊在畫面上的小提示用的白色圓角底。大家共用同一份,畫面之間切換時樣子才會一致。

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

/** 次要按鈕,給較少用、不希望被誤按的動作。它只有框線、字也比主要按鈕小,和主要按鈕放在一起時不搶眼。 */
export const secondaryButton = {
  padding: '8px 28px',
  border: '2px solid #e3d6c8',
  borderRadius: 999,
  background: 'transparent',
  color: '#8a766b',
  fontFamily: 'inherit',
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: 2,
  cursor: 'pointer',
}

/** 面板底部的按鈕區:主要按鈕在上、次要按鈕在下,置中排成一欄。 */
export const actions = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
}

/** 疊在畫面上的小提示共用的白色圓角底,例如通關字串、「按 F」與喇叭圖示。 */
export const pill = {
  borderRadius: 999,
  background: 'rgba(255, 253, 248, 0.92)',
  boxShadow: '0 6px 20px rgba(120, 80, 40, 0.2)',
}
