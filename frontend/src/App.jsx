// 首頁就是遊戲畫面。
import { useEffect, useState } from 'react'

import { SEED } from './config.js'
import { createGame } from './game/game.js'
import GameCanvas from './render/GameCanvas.jsx'

// 測試用的傳送 hook 只在網址帶 ?teleport 時開啟。正常遊玩的網址不帶它,所以玩家碰不到這個 hook
const allowTeleport = new URLSearchParams(window.location.search).has('teleport')

export default function App() {
  const [game] = useState(() => createGame(SEED, { allowTeleport }))

  useEffect(() => {
    if (!allowTeleport) return undefined
    window.teleport = (col, row) => game.teleport({ col, row })
    return () => {
      delete window.teleport
    }
  }, [game])

  return (
    <main style={{ position: 'fixed', inset: 0 }}>
      <GameCanvas game={game} />
    </main>
  )
}
