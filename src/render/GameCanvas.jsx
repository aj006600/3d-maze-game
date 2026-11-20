// 把一局遊戲畫在畫布上的 React component:負責 WebGLRenderer、輸入、每一幀的推進與畫面大小。
// React 不會代管 Three.js 的物件,所以建立與釋放都在 effect 裡自己處理。
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { WebGLRenderer } from 'three'

import { SWING_STRIKE } from '../config.js'
import { createControls } from './controls.js'
import { createDogFigure } from './dogFigure.js'
import { createDogFollower } from './dogFollower.js'
import { createFollowCamera } from './followCamera.js'
import { createLetterFigures } from './letterFigures.js'
import { CELL_SIZE, createMazeScene, toWorld } from './mazeScene.js'
import { createPassengerFigure } from './passengerFigure.js'
import { createPlayerFigure } from './playerFigure.js'

// 一幀最多推進幾秒。分頁切走時動畫迴圈會停下,切回來的第一幀不該讓主角一口氣跑出一大段。
// 倒數也只扣這麼多,所以畫面每秒更新不到 10 次時,倒數會走得比真實時間慢
const MAX_FRAME_SECONDS = 0.1

/**
 * 填滿父元素的遊戲畫布。游標鎖在畫布上時,用 WASD 跑、滑鼠轉向與調整俯仰角,按 F 互動,按滑鼠左鍵或空白鍵揮擊。
 * 收集成功時,被收集的字母、主角與狗會在畫布上播收集的回饋。主角揮擊的動作跟著遊戲核心的揮擊進度播。
 * 奧客被打中時閃白、往後仰並冒出爆炸星號,被擊倒時往後倒在地上;奧客擋在鏡頭與主角之間時變成半透明。
 *
 * 遊戲只在 `active` 為 true、而且游標鎖在畫布上時推進。其餘時候畫面照常繪製,但遊戲停住:
 * - 主角停在原地,朝向不變。揮到一半的揮擊停在那裡,遊戲再推進時接著揮。
 * - 按 F 與揮擊鍵沒有效果。這段時間按下的會被丟掉,遊戲再推進時不會補算。
 * - 游標被放開之前按下、還沒處理到的 F 與揮擊鍵也會被丟掉。
 *
 * `active` 變成 false 時,被畫布鎖住的游標會被放開,玩家才點得到疊在畫布上的按鈕。
 *
 * 介面層透過五個 callback 得知遊戲與游標的狀態:
 * - `onStatusChange({ canInteract, progress, doorOpen, atDoor, finished, failed, countdown })`:
 *   其中任何一項有變時呼叫,每一局的第一幀也會呼叫一次。
 *   countdown 是遊戲核心的倒數無條件進位成的整數秒,不限時的一局是 null。
 *   它只在這個整數改變時才算有變,所以倒數不會讓這個 callback 每一幀都被呼叫。
 *   其餘各項的意思與遊戲核心的同名屬性相同。
 * - `onInteract(result)`:每按一次 F,遊戲核心處理完之後呼叫。result 是遊戲核心 `interact()` 的回傳值。
 * - `onSwingStrike(result)`:主角揮擊、登機箱甩過身體前方的那一刻呼叫,每次揮擊一次,揮空也呼叫。
 *   遊戲核心就在這一刻判定打中,result 是這一下的結果,一次揮擊打中兩位時也只呼叫一次:
 *   - `'knockedDown'`:擊倒了至少一位奧客。同一下打中的另一位就算沒倒,也只回報這一個。
 *   - `'hit'`:打中了至少一位奧客,但沒有擊倒任何一位。
 *   - `'missed'`:沒有打中任何一位奧客。
 *
 *   遊戲停住時揮擊也停住,所以揮到一半之前暫停的話,繼續之後才會呼叫。
 * - `onDiscovered()`:有奧客發現主角的那一幀呼叫,打中還在遊蕩的奧客也算。同一幀有兩位奧客發現主角時只呼叫一次。
 * - `onPointerLockChange(locked)`:游標的鎖定狀態可能變了時呼叫,locked 是游標當下是不是鎖在畫布上。
 *   下列三種時候都會呼叫:
 *   - 鎖定成功。
 *   - 游標被放開,例如按 Esc、切到別的視窗或分頁。
 *   - 瀏覽器拒絕鎖定。
 *
 * 父元件透過 ref 可以拿到 `{ lockPointer() }`,用它把游標鎖在畫布上。點擊畫布本身不會鎖定游標。
 * 父元件必須在使用者的點擊或按鍵事件裡同步呼叫 `lockPointer()`,否則瀏覽器會拒絕鎖定。
 * 鎖定的結果要等 `onPointerLockChange` 才知道。
 *
 * 換一局遊戲(`game` 換成另一個物件)時,場景會釋放後重建,鏡頭的朝向與俯仰角回到起始值。
 * 畫布本身沿用同一個,所以在換局的那次點擊裡呼叫 `lockPointer()`,游標會一直鎖在新的一局上。
 * 卸載時釋放 renderer、geometry 與 material,畫布也會從頁面上移除。
 */
const GameCanvas = forwardRef(function GameCanvas(
  { game, active, onStatusChange, onInteract, onSwingStrike, onDiscovered, onPointerLockChange },
  ref,
) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const controlsRef = useRef(null)
  // 目前這一局的鏡頭。畫面大小改變時要更新它的長寬比
  const cameraRef = useRef(null)
  // 動畫迴圈只在 game 換掉時重建,所以迴圈裡要透過 ref 讀到最新的 active 與 callback
  const activeRef = useRef(active)
  const callbacksRef = useRef({ onStatusChange, onInteract, onSwingStrike, onDiscovered, onPointerLockChange })

  useEffect(() => {
    activeRef.current = active
    if (!active) controlsRef.current?.unlock()
  }, [active])

  useEffect(() => {
    callbacksRef.current = { onStatusChange, onInteract, onSwingStrike, onDiscovered, onPointerLockChange }
  }, [onStatusChange, onInteract, onSwingStrike, onDiscovered, onPointerLockChange])

  useImperativeHandle(ref, () => ({
    lockPointer() {
      controlsRef.current?.lock()
    },
  }))

  // renderer 與輸入跟著這個 component 活,換局時不重建:畫布一換掉,鎖在舊畫布上的游標就會被瀏覽器放開。
  // 這個 effect 必須寫在每一局的 effect 前面,每一局開始時 renderer 與輸入才已經建好
  useEffect(() => {
    const container = containerRef.current
    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // 畫布預設是 inline,底下會多出行高的空隙,讓頁面出現捲軸
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)
    const controls = createControls(renderer.domElement, {
      onLockChange: (locked) => callbacksRef.current.onPointerLockChange?.(locked),
    })
    rendererRef.current = renderer
    controlsRef.current = controls

    function resize() {
      renderer.setSize(container.clientWidth, container.clientHeight)
      if (cameraRef.current) fitCamera(cameraRef.current, container)
    }
    // ResizeObserver 的第一次回報可能晚於第一幀,所以先同步量一次容器大小,第一幀才不會用到畫布的預設大小
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    return () => {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      rendererRef.current = null
      controlsRef.current = null
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  useEffect(() => {
    const renderer = rendererRef.current
    const controls = controlsRef.current
    controls.reset(game.player.heading)

    const mazeScene = createMazeScene(game)
    const letterFigures = createLetterFigures(game)
    mazeScene.scene.add(letterFigures.object)
    const figure = createPlayerFigure()
    mazeScene.scene.add(figure.object)
    const dogFigure = createDogFigure()
    mazeScene.scene.add(dogFigure.object)
    // 一局裡奧客的人數固定,所以造型在開局時照人數建好
    const passengerFigures = game.passengers.map(() => {
      const passengerFigure = createPassengerFigure()
      mazeScene.scene.add(passengerFigure.object)
      return passengerFigure
    })
    const dogFollower = createDogFollower(game)
    const followCamera = createFollowCamera(game)
    const { camera } = followCamera
    cameraRef.current = camera
    fitCamera(camera, containerRef.current)

    let lastTime = null
    let lastStatus = null
    let doorOpen = game.doorOpen
    let swingProgress = game.swingProgress
    renderer.setAnimationLoop((time) => {
      const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS)
      lastTime = time

      const before = game.player
      const passengersBefore = game.passengers
      const { pitch, interactions, swings, ...input } = controls.read()
      if (activeRef.current && controls.isLocked()) {
        game.step({ ...input, dt })
        // 互動在移動之後處理,判斷的是主角這一幀跑完之後所在的格子
        for (let i = 0; i < interactions; i += 1) {
          const result = game.interact()
          if (result === 'collected') {
            // 進度剛加一,所以剛收集的是通關字串裡的第 progress 個字母
            letterFigures.playCollect(game.phrase[game.progress - 1])
            figure.cheer()
            dogFigure.hop()
          }
          callbacksRef.current.onInteract?.(result)
        }
        for (let i = 0; i < swings; i += 1) game.swing()
      }
      const passengers = game.passengers
      if (swingStruck(swingProgress, game.swingProgress)) {
        callbacksRef.current.onSwingStrike?.(strikeResultOf(passengersBefore, passengers))
      }
      swingProgress = game.swingProgress
      if (discoveredBetween(passengersBefore, passengers)) callbacksRef.current.onDiscovered?.()
      if (game.doorOpen && !doorOpen) {
        doorOpen = true
        // 門那段牆從 game.walls 拿掉了,狗與鏡頭要重新讀牆,否則會把開著的門當成牆
        mazeScene.openDoor()
        dogFollower.refreshWalls()
        followCamera.refreshWalls()
      }
      const status = statusOf(game)
      if (lastStatus === null || Object.keys(status).some((key) => status[key] !== lastStatus[key])) {
        lastStatus = status
        callbacksRef.current.onStatusChange?.(status)
      }
      const player = game.player

      const position = toWorld(game.maze, player)
      // 鏡頭先就定位:主角的造型要依鏡頭這一幀的位置決定登機箱要不要藏起來
      followCamera.follow(position, player.heading, pitch, dt)
      const travelled = travelledBetween(before, player)
      figure.place(position, player.heading)
      // 按著倒退鍵時傳負的距離,登機箱的輪子才會反轉
      figure.animate(input.forward < 0 ? -travelled : travelled, dt, camera.position, game.swingProgress)
      const dogPose = dogFollower.follow(position, player.heading, dt)
      dogFigure.place(dogPose.position, dogPose.heading)
      dogFigure.animate(dogPose.distance, dt)
      passengers.forEach((passenger, i) => {
        passengerFigures[i].place(toWorld(game.maze, passenger), passenger.heading)
        if (wasHit(passengersBefore[i], passenger)) passengerFigures[i].hit(position)
        passengerFigures[i].animate(travelledBetween(passengersBefore[i], passenger), dt, passenger.state)
        passengerFigures[i].fadeIfBlocking(camera.position, position, dt)
      })
      letterFigures.animate(time / 1000, camera.position)

      renderer.render(mazeScene.scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      cameraRef.current = null
      figure.dispose()
      dogFigure.dispose()
      for (const passengerFigure of passengerFigures) passengerFigure.dispose()
      letterFigures.dispose()
      mazeScene.dispose()
    }
  }, [game])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
})

export default GameCanvas

function statusOf(game) {
  return {
    canInteract: game.canInteract,
    progress: game.progress,
    doorOpen: game.doorOpen,
    atDoor: game.atDoor,
    finished: game.finished,
    failed: game.failed,
    // 無條件進位:5 分鐘的一局一開始是 300,剩 0.4 秒時還是 1,歸零的那一刻才是 0
    countdown: game.countdown === null ? null : Math.ceil(game.countdown),
  }
}

// 從遊戲核心的位置 before 到 after 的距離,換算成世界座標的長度
function travelledBetween(before, after) {
  return Math.hypot(after.x - before.x, after.y - before.y) * CELL_SIZE
}

// 這一幀有沒有奧客發現主角,也就是有奧客不再遊蕩。遊蕩的奧客被打中時直接進入硬直,沒有經過追趕,所以不能只看追趕。
// 重生的奧客是從等待重生回到遊蕩,不會被算進來。兩位在同一幀發現主角時也只算一次
function discoveredBetween(before, after) {
  return after.some((passenger, i) => before[i].state === 'wandering' && passenger.state !== 'wandering')
}

// 這一位奧客在這一幀有沒有被打中,擊倒他的那一下也算。重生時被打中的次數歸零,所以只看次數有沒有增加
function wasHit(before, after) {
  return after.hits > before.hits
}

// 揮擊在這一幀打中了誰,回報給 onSwingStrike 的結果。被擊倒的奧客這一幀剛變成倒地
function strikeResultOf(before, after) {
  if (after.some((passenger, i) => passenger.state === 'down' && before[i].state !== 'down')) return 'knockedDown'
  if (after.some((passenger, i) => wasHit(before[i], passenger))) return 'hit'
  return 'missed'
}

// 這一幀揮擊的進度是不是跨過了 SWING_STRIKE。
// 進度在一次揮擊裡只會增加,所以進度變小或回到 null,代表上一次揮擊在這一幀揮完,一樣跨過了
function swingStruck(before, after) {
  if (before === null || before >= SWING_STRIKE) return false
  return after === null || after < before || after >= SWING_STRIKE
}

function fitCamera(camera, container) {
  camera.aspect = container.clientWidth / container.clientHeight
  camera.updateProjectionMatrix()
}
