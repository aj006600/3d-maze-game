// 首頁就是遊戲:畫布在底下,介面層的畫面疊在上面。這裡決定目前停在哪個畫面。
import { useCallback, useEffect, useRef, useState } from 'react'

import { PHRASE, SEED } from './config.js'
import { createGame } from './game/game.js'
import GameCanvas from './render/GameCanvas.jsx'
import Hud from './ui/Hud.jsx'
import StartScreen from './ui/StartScreen.jsx'

// 測試用的傳送 hook 只在網址帶 ?teleport 時開啟。正常遊玩的網址不帶它,所以玩家碰不到這個 hook
const allowTeleport = new URLSearchParams(window.location.search).has('teleport')

export default function App() {
  const [game] = useState(() => createGame(SEED, { allowTeleport }))
  // 畫面狀態刻意不存進 localStorage 或網址,重新整理網頁才會回到開始畫面
  const [screen, setScreen] = useState('start')
  const [status, setStatus] = useState({ canInteract: false, progress: 0 })
  const [wrongCount, setWrongCount] = useState(0)
  const canvasRef = useRef(null)

  const handleInteract = useCallback((result) => {
    if (result === 'wrong') setWrongCount((count) => count + 1)
  }, [])

  useEffect(() => {
    if (!allowTeleport) return undefined
    window.teleport = (col, row) => game.teleport({ col, row })
    return () => {
      delete window.teleport
    }
  }, [game])

  function start() {
    // 瀏覽器只在使用者事件裡允許鎖定游標,所以要在按鈕的 click 裡直接鎖,不能等畫面切換之後才鎖
    canvasRef.current.lockPointer()
    setScreen('playing')
  }

  return (
    <main style={styles.main}>
      <GameCanvas
        ref={canvasRef}
        game={game}
        active={screen === 'playing'}
        onStatusChange={setStatus}
        onInteract={handleInteract}
      />
      {screen === 'playing' && (
        <Hud
          phrase={PHRASE}
          progress={status.progress}
          canInteract={status.canInteract}
          wrongCount={wrongCount}
        />
      )}
      {screen === 'start' && <StartScreen onStart={start} />}
    </main>
  )
}

const styles = {
  // 疊在畫布上的各個畫面都繼承這個字型
  main: {
    position: 'fixed',
    inset: 0,
    fontFamily: 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif',
  },
}
