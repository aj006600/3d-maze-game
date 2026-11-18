// 首頁就是遊戲畫面。
import { useState } from 'react'

import { SEED } from './config.js'
import { createGame } from './game/game.js'
import GameCanvas from './render/GameCanvas.jsx'

export default function App() {
  const [game] = useState(() => createGame(SEED))

  return (
    <main style={{ position: 'fixed', inset: 0 }}>
      <GameCanvas game={game} />
    </main>
  )
}
