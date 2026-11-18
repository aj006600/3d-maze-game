// 首頁就是遊戲:畫布在底下,介面層的畫面疊在上面。這裡決定目前停在哪個畫面。
import { useCallback, useEffect, useRef, useState } from 'react'

import { PHRASE, SEED } from './config.js'
import { createGame } from './game/game.js'
import GameCanvas from './render/GameCanvas.jsx'
import FinishScreen from './ui/FinishScreen.jsx'
import Hud from './ui/Hud.jsx'
import StartScreen from './ui/StartScreen.jsx'

// 測試用的傳送 hook 只在網址帶 ?teleport 時開啟。正常遊玩的網址不帶它,所以玩家碰不到這個 hook
const allowTeleport = new URLSearchParams(window.location.search).has('teleport')

const newGame = () => createGame(SEED, { allowTeleport })

export default function App() {
  const [game, setGame] = useState(newGame)
  // 畫面狀態刻意不存進 localStorage 或網址,重新整理網頁才會回到開始畫面
  const [screen, setScreen] = useState('start')
  // 畫布回報這一局的第一幀之前是 null,這時還不知道這一局的狀態,遊戲中的提示先不顯示
  const [status, setStatus] = useState(null)
  const [wrongCount, setWrongCount] = useState(0)
  const canvasRef = useRef(null)

  const handleStatusChange = useCallback((next) => {
    setStatus(next)
    if (next.finished) setScreen('finished')
  }, [])

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

  function restart() {
    canvasRef.current.lockPointer()
    setGame(newGame())
    // 上一局的狀態要一起清掉:提示不能顯示上一局的進度,「不是這個」與「門開了」也不能在提示重新出現時再播一次
    setStatus(null)
    setWrongCount(0)
    setScreen('playing')
  }

  return (
    <main style={styles.main}>
      <GameCanvas
        ref={canvasRef}
        game={game}
        active={screen === 'playing'}
        onStatusChange={handleStatusChange}
        onInteract={handleInteract}
      />
      {screen === 'playing' && status !== null && (
        <Hud
          phrase={PHRASE}
          progress={status.progress}
          canInteract={status.canInteract}
          wrongCount={wrongCount}
          atDoor={status.atDoor}
          doorOpen={status.doorOpen}
        />
      )}
      {screen === 'start' && <StartScreen onStart={start} />}
      {screen === 'finished' && <FinishScreen onRestart={restart} />}
    </main>
  )
}

const styles = {
  // 疊在畫布上的各個畫面都繼承這個字型與文字顏色
  main: {
    position: 'fixed',
    inset: 0,
    fontFamily: 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif',
    color: '#4a3b35',
  },
}
