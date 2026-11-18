// 把一局遊戲畫在畫布上的 React component:負責 WebGLRenderer、輸入、每一幀的推進與畫面大小。
// React 不會代管 Three.js 的物件,所以建立與釋放都在同一個 effect 裡自己處理。
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { WebGLRenderer } from 'three'

import { createControls } from './controls.js'
import { createDogFigure } from './dogFigure.js'
import { createDogFollower } from './dogFollower.js'
import { createFollowCamera } from './followCamera.js'
import { createLetterFigures } from './letterFigures.js'
import { CELL_SIZE, createMazeScene, toWorld } from './mazeScene.js'
import { createPlayerFigure } from './playerFigure.js'

// 一幀最多推進幾秒。分頁切走時動畫迴圈會停下,切回來的第一幀不該讓主角一口氣跑出一大段
const MAX_FRAME_SECONDS = 0.1

/**
 * 填滿父元素的遊戲畫布。點擊畫布鎖定游標,之後用 WASD 跑、滑鼠轉向與調整俯仰角,按 F 互動。
 *
 * `active` 為 false 時畫面照常繪製,但遊戲不會推進,主角停在原地、朝向不變,按 F 也沒有效果。
 *
 * 介面層透過兩個 callback 得知遊戲的狀態:
 * - `onStatusChange({ canInteract, progress })`:可互動或進度有變時呼叫。每一局的第一幀也會呼叫一次。
 * - `onInteract(result)`:每按一次 F,遊戲核心處理完之後呼叫。result 是遊戲核心 `interact()` 的回傳值。
 *
 * 父元件透過 ref 可以拿到 `{ lockPointer() }`,用它把游標鎖在畫布上。
 * 父元件必須在使用者的點擊或按鍵事件裡同步呼叫 `lockPointer()`,否則瀏覽器會拒絕鎖定。
 *
 * 換一局遊戲(`game` 換成另一個物件)時,整個場景會釋放後重建。
 * 卸載時釋放 renderer、geometry 與 material,畫布也會從頁面上移除。
 */
const GameCanvas = forwardRef(function GameCanvas({ game, active, onStatusChange, onInteract }, ref) {
  const containerRef = useRef(null)
  const controlsRef = useRef(null)
  // 動畫迴圈只在 game 換掉時重建,所以迴圈裡要透過 ref 讀到最新的 active 與 callback
  const activeRef = useRef(active)
  const callbacksRef = useRef({ onStatusChange, onInteract })

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    callbacksRef.current = { onStatusChange, onInteract }
  }, [onStatusChange, onInteract])

  useImperativeHandle(ref, () => ({
    lockPointer() {
      controlsRef.current?.lock()
    },
  }))

  useEffect(() => {
    const container = containerRef.current
    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // 畫布預設是 inline,底下會多出行高的空隙,讓頁面出現捲軸
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)

    const mazeScene = createMazeScene(game)
    const letterFigures = createLetterFigures(game)
    mazeScene.scene.add(letterFigures.object)
    const figure = createPlayerFigure()
    mazeScene.scene.add(figure.object)
    const dogFigure = createDogFigure()
    mazeScene.scene.add(dogFigure.object)
    const dogFollower = createDogFollower(game)
    const { camera, follow } = createFollowCamera(game)
    const controls = createControls(renderer.domElement, game.player.heading)
    controlsRef.current = controls

    function resize() {
      const { clientWidth: width, clientHeight: height } = container
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    // ResizeObserver 的第一次回報可能晚於第一幀,所以先同步量一次容器大小,第一幀才不會用到畫布的預設大小
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let lastTime = null
    let lastStatus = null
    renderer.setAnimationLoop((time) => {
      const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS)
      lastTime = time

      const before = game.player
      const { pitch, interactions, ...input } = controls.read()
      if (activeRef.current) {
        game.step({ ...input, dt })
        // 互動在移動之後處理,判斷的是主角這一幀跑完之後所在的格子
        for (let i = 0; i < interactions; i += 1) callbacksRef.current.onInteract?.(game.interact())
      }
      const status = { canInteract: game.canInteract, progress: game.progress }
      if (lastStatus?.canInteract !== status.canInteract || lastStatus?.progress !== status.progress) {
        lastStatus = status
        callbacksRef.current.onStatusChange?.(status)
      }
      const player = game.player

      const position = toWorld(game.maze, player)
      figure.place(position, player.heading)
      figure.animate(Math.hypot(player.x - before.x, player.y - before.y) * CELL_SIZE, dt)
      const dogPose = dogFollower.follow(position, player.heading, dt)
      dogFigure.place(dogPose.position, dogPose.heading)
      dogFigure.animate(dogPose.distance, dt)
      follow(position, player.heading, pitch, dt)
      letterFigures.animate(time / 1000, camera.position)

      renderer.render(mazeScene.scene, camera)
    })

    return () => {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      controlsRef.current = null
      controls.dispose()
      figure.dispose()
      dogFigure.dispose()
      letterFigures.dispose()
      mazeScene.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [game])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
})

export default GameCanvas
