// 把一局遊戲畫在畫布上的 React component:負責 WebGLRenderer、鏡頭與畫面大小。
// React 不會代管 Three.js 的物件,所以建立與釋放都在同一個 effect 裡自己處理。
import { useEffect, useRef } from 'react'
import { PerspectiveCamera, WebGLRenderer } from 'three'

import { createMazeScene } from './mazeScene.js'

/**
 * 填滿父元素的遊戲畫布。
 *
 * 換一局遊戲(`game` 換成另一個物件)時,整個場景會釋放後重建。
 * 卸載時釋放 renderer、geometry 與 material,畫布也會從頁面上移除。
 */
export default function GameCanvas({ game }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // 畫布預設是 inline,底下會多出行高的空隙,讓頁面出現捲軸
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)

    const mazeScene = createMazeScene(game)
    const camera = createOverviewCamera(mazeScene.width)

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

    renderer.setAnimationLoop(() => renderer.render(mazeScene.scene, camera))

    return () => {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      mazeScene.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [game])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

// 俯瞰鏡頭:從迷宮南方的高處斜看,整張迷宮都在畫面裡
function createOverviewCamera(mazeWidth) {
  const camera = new PerspectiveCamera(50, 1, 0.1, mazeWidth * 10)
  camera.position.set(0, mazeWidth * 1.3, mazeWidth * 0.75)
  camera.lookAt(0, 0, 0)
  return camera
}
