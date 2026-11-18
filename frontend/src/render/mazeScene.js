// 把一局遊戲的迷宮畫成 Three.js 場景:草地地板、樹籬牆、白天光線,以及外牆上的門。
// 這裡只把遊戲核心給的狀態換算成 3D 物件,不決定任何規則;哪裡有牆、門在哪裡都由核心決定。
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from 'three'

import { SCENE } from '../config.js'
import { WALL_THICKNESS as WALL_THICKNESS_IN_CELLS } from '../game/game.js'

/** 一格在世界座標裡的邊長。一格扣掉兩側各半個牆厚就是走道寬度,所以這個邊長由設定的走道寬度推回來。 */
export const CELL_SIZE = SCENE.corridorWidth / (1 - WALL_THICKNESS_IN_CELLS)
const WALL_HEIGHT = SCENE.wallHeight
// 牆厚跟著遊戲核心的碰撞走,畫面上的牆才會與擋住主角的位置一致
const WALL_THICKNESS = WALL_THICKNESS_IN_CELLS * CELL_SIZE
const DOOR_HEIGHT = 3.2

const SKY_COLOR = '#a8dcff'
const GRASS_COLOR = '#8ccf5a'
const HEDGE_COLOR = '#2f7a35'
const DOOR_COLOR = '#9a6233'
const LOCK_COLOR = '#f2c33c'

// 世界座標的契約:原點在迷宮正中央,北方是 -z,東方是 +x,y 朝上
const OFFSETS = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
}

/**
 * 從一局遊戲建立迷宮場景。
 *
 * 迷宮的正中央在世界座標的原點,遊戲核心的座標用 `toWorld` 換算。
 * 場景只反映建立當下的狀態,之後狀態改變不會自動更新。
 * 用完必須呼叫 `dispose()` 釋放 geometry 與 material;renderer 由呼叫端自己釋放。
 */
export function createMazeScene(game) {
  const { maze, door } = game
  const width = maze.size * CELL_SIZE
  const scene = new Scene()
  scene.background = new Color(SKY_COLOR)

  const floorGeometry = new PlaneGeometry(1, 1)
  const grassMaterial = new MeshStandardMaterial({ color: GRASS_COLOR, roughness: 1 })
  const floor = new Mesh(floorGeometry, grassMaterial)
  // 地板比迷宮大上好幾倍,從門走出去之後腳下仍是草地
  floor.scale.setScalar(width * 4)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  const walls = wallSegmentsOf(game)
  // 每一段牆都是同一個長方體:長度多出一個牆厚,相鄰兩段在轉角處互相疊住,不會留縫
  const hedgeGeometry = new BoxGeometry(CELL_SIZE + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS)
  const hedgeMaterial = new MeshStandardMaterial({ color: HEDGE_COLOR, roughness: 1 })
  // 多出的一個實例是門上方的那一截樹籬
  const hedges = new InstancedMesh(hedgeGeometry, hedgeMaterial, walls.length + 1)
  walls.forEach((wall, i) => hedges.setMatrixAt(i, hedgeMatrixOf(maze, wall, 0)))
  hedges.setMatrixAt(walls.length, hedgeMatrixOf(maze, door, DOOR_HEIGHT))
  scene.add(hedges)

  // 門板塞在左右兩段外牆之間,所以比一格短一個牆厚
  const doorGeometry = new BoxGeometry(CELL_SIZE - WALL_THICKNESS, DOOR_HEIGHT, WALL_THICKNESS / 2)
  const doorMaterial = new MeshStandardMaterial({ color: DOOR_COLOR, roughness: 0.8 })
  const doorPanel = new Mesh(doorGeometry, doorMaterial)
  // 鎖比門板厚,迷宮內外兩面都看得到
  const lockGeometry = new BoxGeometry(0.6, 0.7, WALL_THICKNESS)
  const lockMaterial = new MeshStandardMaterial({ color: LOCK_COLOR, roughness: 0.4 })
  const lock = new Mesh(lockGeometry, lockMaterial)
  lock.position.y = -0.2
  doorPanel.add(lock)
  const doorCenter = sideCenterOf(maze, door)
  doorPanel.position.set(doorCenter.x, DOOR_HEIGHT / 2, doorCenter.z)
  doorPanel.rotation.y = rotationOf(door.side)
  scene.add(doorPanel)

  // 背光的牆面只照得到天光,天光要夠亮,從任何方向看迷宮都是白天
  const skyLight = new HemisphereLight('#ffffff', GRASS_COLOR, 3)
  const sun = new DirectionalLight('#fff4dd', 1.8)
  // 太陽從東南方的高處照下來,牆的頂面與各個側面亮度不同,看得出立體感
  sun.position.set(0.5, 1, 0.3)
  scene.add(skyLight, sun)

  const resources = [
    floorGeometry,
    grassMaterial,
    hedges,
    hedgeGeometry,
    hedgeMaterial,
    doorGeometry,
    doorMaterial,
    lockGeometry,
    lockMaterial,
  ]

  return {
    scene,
    dispose() {
      for (const resource of resources) resource.dispose()
    },
  }
}

// 列出要立起樹籬的每一段牆,每段以「哪一格的哪一側」表示。門所在的那段外牆不立樹籬。
function wallSegmentsOf({ maze, door }) {
  const last = maze.size - 1
  const segments = []
  for (let row = 0; row < maze.size; row += 1) {
    for (let col = 0; col < maze.size; col += 1) {
      const openings = maze.openings({ col, row })
      // 相鄰兩格共用一段牆,所以每格只負責北側與西側,最南一列與最東一行再補上南側與東側的外牆
      const sides = ['north', 'west']
      if (row === last) sides.push('south')
      if (col === last) sides.push('east')
      for (const side of sides) {
        const isDoor = door.col === col && door.row === row && door.side === side
        if (!openings.includes(side) && !isDoor) segments.push({ col, row, side })
      }
    }
  }
  return segments
}

// 立在某一格某一側的一截樹籬,從 bottom 的高度長到牆頂
function hedgeMatrixOf(maze, segment, bottom) {
  const center = sideCenterOf(maze, segment)
  return new Matrix4()
    .makeRotationY(rotationOf(segment.side))
    .multiply(new Matrix4().makeScale(1, (WALL_HEIGHT - bottom) / WALL_HEIGHT, 1))
    .setPosition(center.x, (bottom + WALL_HEIGHT) / 2, center.z)
}

/** 把遊戲核心以格為單位的平面座標 `{ x, y }` 換算成世界座標地面上的 `{ x, z }`。 */
export function toWorld(maze, { x, y }) {
  const half = (maze.size * CELL_SIZE) / 2
  return { x: x * CELL_SIZE - half, z: y * CELL_SIZE - half }
}

// (col, row) 這一格朝 side 那一側的邊線中點,在世界座標的地面上
function sideCenterOf(maze, { col, row, side }) {
  return toWorld(maze, { x: col + 0.5 + OFFSETS[side].x / 2, y: row + 0.5 + OFFSETS[side].z / 2 })
}

// 長方體的長邊預設沿著 x 軸,也就是東西向;東西兩側的牆是南北向,要轉九十度
function rotationOf(side) {
  return side === 'east' || side === 'west' ? Math.PI / 2 : 0
}
