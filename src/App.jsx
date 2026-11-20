// 首頁就是遊戲:畫布在底下,介面層的畫面疊在上面。這裡決定目前停在哪個畫面、選了哪個時限、有沒有靜音,
// 並把畫面、靜音與遊戲中的事件(收集、按錯、門打開、倒數最後幾秒的每一秒、揮擊時登機箱揮下去、打中與擊倒奧客、
// 奧客發現主角)告訴音訊,由它播對應的音樂與音效。
//
// 暫停只有一條規則:畫面停在遊戲中,而且游標鎖在畫布上,遊戲才推進。游標一放開就是暫停,
// 不論是按 Esc、切到別的視窗還是切到別的分頁,瀏覽器都會放開游標,所以三者走同一條路。
import { useCallback, useEffect, useRef, useState } from 'react'

import { createAudio } from './audio/audio.js'
import { DEFAULT_TIME_LIMIT, FINAL_WARNING_SECONDS, PHRASE, SEED } from './config.js'
import { createGame } from './game/game.js'
import GameCanvas from './render/GameCanvas.jsx'
import EntryScreen from './ui/EntryScreen.jsx'
import FailScreen from './ui/FailScreen.jsx'
import FinishScreen from './ui/FinishScreen.jsx'
import Hud from './ui/Hud.jsx'
import PauseScreen from './ui/PauseScreen.jsx'
import SpeakerIcon from './ui/SpeakerIcon.jsx'
import StartScreen from './ui/StartScreen.jsx'

// 測試用的傳送 hook 只在網址帶 ?teleport 時開啟。正常遊玩的網址不帶它,所以玩家碰不到這個 hook
const allowTeleport = new URLSearchParams(window.location.search).has('teleport')

const newGame = (timeLimit) => createGame(SEED, { allowTeleport, timeLimit })

// 用 KeyboardEvent.code 認按鍵的實體位置,與移動鍵的認法一致
const MUTE_KEY = 'KeyM'

// 揮擊的每一種結果播哪一個音效
const STRIKE_SOUNDS = { missed: 'swing', hit: 'passengerHit', knockedDown: 'knockDown' }

export default function App() {
  // 選的時限只存在記憶體裡:回到開始畫面時仍是上次選的,重新整理網頁後回到預設
  const [timeLimit, setTimeLimit] = useState(DEFAULT_TIME_LIMIT)
  const [game, setGame] = useState(() => newGame(DEFAULT_TIME_LIMIT))
  // 畫面狀態刻意不存進 localStorage 或網址,重新整理網頁才會回到入口畫面
  const [screen, setScreen] = useState('entry')
  // 靜音同樣不記住,重新整理網頁後回到有聲音
  const [muted, setMuted] = useState(false)
  const [audio] = useState(createAudio)
  // 畫布回報這一局的第一幀之前是 null,這時還不知道這一局的狀態,遊戲中的提示先不顯示
  const [status, setStatus] = useState(null)
  const [wrongCount, setWrongCount] = useState(0)
  const canvasRef = useRef(null)

  const handleStatusChange = useCallback((next) => {
    setStatus(next)
    // 遊戲核心保證兩者不會同時是 true
    if (next.finished) setScreen('finished')
    if (next.failed) setScreen('failed')
  }, [])

  // 鎖定被瀏覽器拒絕時也會收到 false,剛按「開始」「再玩一次」或「再試一次」的新一局因此停在暫停畫面
  const handlePointerLockChange = useCallback((locked) => {
    setScreen((current) => {
      if (locked && current === 'paused') return 'playing'
      if (!locked && current === 'playing') return 'paused'
      return current
    })
  }, [])

  const handleInteract = useCallback(
    (result) => {
      // 在沒有字母的地方按 F 得到 null,這一下沒有任何效果,所以也不出聲
      if (result !== null) audio.playSound(result)
      if (result === 'wrong') setWrongCount((count) => count + 1)
    },
    [audio],
  )

  // 一次揮擊只播一個聲音:打中奧客的那一下改播悶響或擊倒的聲音,不疊上揮擊的撞擊聲
  const handleSwingStrike = useCallback((result) => audio.playSound(STRIKE_SOUNDS[result]), [audio])
  const handleDiscovered = useCallback(() => audio.playSound('discovered'), [audio])

  useEffect(() => {
    audio.setScreen(screen)
  }, [audio, screen])

  // 每一局開始時門都鎖著,所以 doorOpen 變成 true 就是門剛打開。
  // 重開一局時 status 先清成 null,doorOpen 回到 false,下一局門打開時才會再播一次
  const doorOpen = status?.doorOpen ?? false
  useEffect(() => {
    if (doorOpen) audio.playSound('doorOpened')
  }, [audio, doorOpen])

  // 最後幾秒裡倒數顯示的秒數,其餘時候是 null。它每換成另一個數字就響一聲提示聲。
  // 歸零的那一刻它是 null,所以不響。暫停時倒數不動,所以也不響。
  // 遊戲核心在破關的那一步仍然會扣倒數,顯示的秒數可能剛好在那一步少一。
  // 所以破關之後它一律是 null,破關畫面才不會再響
  const warningSecond =
    status !== null &&
    !status.finished &&
    status.countdown !== null &&
    status.countdown >= 1 &&
    status.countdown <= FINAL_WARNING_SECONDS
      ? status.countdown
      : null
  useEffect(() => {
    if (warningSecond !== null) audio.playSound('countdownWarning')
  }, [audio, warningSecond])

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])

  // 入口畫面還沒有聲音,M 從開始畫面起才有效。
  // 這裡監聽的是 window:游標被畫布鎖住時,按鍵事件仍然會送到 window
  const giftOpened = screen !== 'entry'
  useEffect(() => {
    if (!giftOpened) return undefined
    function onKeyDown(event) {
      if (event.code === MUTE_KEY && !event.repeat) setMuted((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [giftOpened])

  useEffect(() => {
    if (!allowTeleport) return undefined
    window.teleport = (col, row) => game.teleport({ col, row })
    return () => {
      delete window.teleport
    }
  }, [game])

  function open() {
    // 瀏覽器只在使用者事件裡允許網頁開始出聲,所以要在點擊裡直接解鎖,不能等畫面切換之後才解鎖
    audio.unlock()
    setScreen('start')
  }

  // 「開始」「再玩一次」與「再試一次」都用目前選的時限建立新的一局,直接進入遊戲。
  // 它們先切到遊戲中,不等鎖定的結果:鎖定成功時畫面才不會先閃過暫停畫面。
  // 鎖定的結果出來之前,畫布不會推進遊戲,倒數也還沒開始走
  function start() {
    // 瀏覽器只在使用者事件裡允許鎖定游標,所以要在按鈕的 click 裡直接鎖,不能等畫面切換之後才鎖
    canvasRef.current.lockPointer()
    replaceGame()
    setScreen('playing')
  }

  // 畫面留在暫停畫面,等鎖定成功才回到遊戲中。按完 Esc 立刻按「繼續」時瀏覽器會拒絕鎖定,玩家再按一次就好
  function resume() {
    canvasRef.current.lockPointer()
  }

  // 這一局直接丟掉,開始畫面後面的畫布顯示新的一局:主角站在起點
  function backToStart() {
    replaceGame()
    setScreen('start')
  }

  function replaceGame() {
    setGame(newGame(timeLimit))
    // 上一局的狀態要一起清掉:提示不能顯示上一局的進度,「不是這個」與「門開了」也不能在提示重新出現時再播一次
    setStatus(null)
    setWrongCount(0)
  }

  // 暫停時提示照樣掛著,只是被暫停畫面蓋住。卸載再掛回去的話,提示的動畫會在繼續時重播一次
  const inRound = screen === 'playing' || screen === 'paused'

  return (
    <main style={styles.main}>
      <GameCanvas
        ref={canvasRef}
        game={game}
        active={screen === 'playing'}
        onStatusChange={handleStatusChange}
        onInteract={handleInteract}
        onSwingStrike={handleSwingStrike}
        onDiscovered={handleDiscovered}
        onPointerLockChange={handlePointerLockChange}
      />
      {inRound && status !== null && (
        <Hud
          phrase={PHRASE}
          progress={status.progress}
          canInteract={status.canInteract}
          wrongCount={wrongCount}
          atDoor={status.atDoor}
          doorOpen={status.doorOpen}
          countdown={status.countdown}
        />
      )}
      {screen === 'entry' && <EntryScreen onOpen={open} />}
      {screen === 'start' && <StartScreen timeLimit={timeLimit} onTimeLimitChange={setTimeLimit} onStart={start} />}
      {screen === 'paused' && <PauseScreen onResume={resume} onBackToStart={backToStart} />}
      {screen === 'failed' && (
        <FailScreen progress={status.progress} total={game.phrase.length} onRetry={start} onBackToStart={backToStart} />
      )}
      {screen === 'finished' && <FinishScreen onRestart={start} onBackToStart={backToStart} />}
      {giftOpened && <SpeakerIcon muted={muted} />}
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
