// 主角的人:一位穿制服的空服員,平常用左手拉著登機箱,揮擊時雙手握著拉桿把登機箱揮出去。
// 用長方體與多面體拼成的低多邊形造型,跑步與揮擊的動作由程式計算,不使用模型、動畫或圖片素材檔;
// 腰帶的虎紋也是在程式裡畫出來的貼圖。
// 這裡只負責外觀、擺放與動作;主角在哪裡、朝哪裡、移動了多遠,都由呼叫端依遊戲核心的狀態告訴它。
// 鏡頭大多在主角背後,所以背影的辨識度優先:後腦那條帶著收邊的直立髮捲(法式包頭)、腰帶右側的蝴蝶結與兩條帶尾。
import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  IcosahedronGeometry,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'

import { createFeedbackClip, easeInOut, hopOf } from './collectFeedback.js'
import { createCanvasTexture, createRunCycle, part, placeFigure } from './lowPolyFigure.js'
import { createSuitcaseFigure } from './suitcaseFigure.js'
import { paintTigerStripes, TIGER_ORANGE, TIGER_TILE_SIZE } from './tigerStripes.js'

const SKIN_COLOR = '#f2c7a5'
const HAIR_COLOR = '#2b1d17'
const SHIRT_COLOR = '#f5c065'
const NAME_TAG_COLOR = '#ffe03a'
const PANTS_COLOR = '#3a3c42'
const SHOE_COLOR = '#151515'
const TIGER_BLACK = '#1b1410'

// 各部位的尺寸,單位與世界座標相同。整個人含頭髮大約 1.94 高。
// 總身高是整個場景的比例尺,牆高與鏡頭都依它設定,調整部位時不要改變總身高。
// 髖關節以上的部位以髖關節為原點,臉朝 -z,右手在 +x。軀幹各段的 size 是 `[寬, 深]`
const HIP_HEIGHT = 0.9
// hem 是褲管下緣離地的高度,褲管與鞋子在這裡交接
const LEG = { width: 0.155, depth: 0.17, spacing: 0.095, hem: 0.07 }
// 骨盆下緣與兩條褲管的外緣一樣大,褲管上方才不會多出一圈像裙襬的邊
const PELVIS = { bottom: -0.1, top: 0.21, bottomSize: [LEG.spacing * 2 + LEG.width, LEG.depth], topSize: [0.31, 0.2] }
const WAIST = { y: 0.19, size: [0.3, 0.19] }
const CHEST = { y: 0.4, size: [0.36, 0.23] }
const SHOULDER = { y: 0.56, size: [0.37, 0.2] }
const BELT = { y: 0.21, width: 0.33, height: 0.07, depth: 0.22 }
// length 是肩關節到手腕的長度。七分袖是整條袖子的七成,所以 sleeve 取 length 的七成。
// splay 是右手臂往外張的角度,它讓垂下的手臂避開腰帶右側的蝴蝶結,縮小它之前要確認袖口不會插進蝴蝶結。
// 左手臂拉著登機箱,往外張的角度另外由 CARRY 決定
const ARM = { width: 0.1, depth: 0.11, sleeve: 0.36, length: 0.52, splay: 0.14 }
// 手掌中心離肩關節的距離,沿著手臂往下量
const HAND_REACH = ARM.length + 0.05
// 手肘離肩關節的距離。手肘落在袖子裡,彎起來時袖子在這裡折成上下兩截
const ELBOW = 0.26
// 頭是一顆橢球,radii 是 x、y、z 三個方向的半徑,y 是中心的高度
const HEAD = { radii: [0.165, 0.19, 0.175], y: 0.83 }
// 髮蓋是一塊球殼,軸心從頭頂往後倒 tilt,從軸心往外蓋到 coverage 的角度。
// 兩者相減是前緣離頭頂的角度,停在額頭上方,所以沒有瀏海;兩者相加是後緣離頭頂的角度,蓋到後頸。
// 球殼在分線那裡留一道 partGap 寬的縫,縫裡露出頭皮,就是側分的分線;partOffset 是分線從正前方往左偏的角度。
// 縫從離軸心 partStart 的地方開到前緣,頭頂後方不開縫,從背後看才不像一道裂痕
const HAIR_CAP = { tilt: 0.95, coverage: 1.66, partStart: 0.9, partGap: 0.06, partOffset: 0.45 }
// 髮殼是髮蓋與髮捲共同貼著的橢球,比頭大一圈。半徑多出的那一點就是頭髮的厚度。
// 中心相對於頭的中心稍微往上、往後挪
const HAIR_SHELL = { radii: HEAD.radii.map((radius) => radius + 0.015), center: [0, 0.005, 0.005] }
// 髮殼在頭頂後方往外撐起一個圓頂,就是盤髮的份量。圓頂的中心在髮蓋的軸心上,那裡的半徑多撐出 lift 倍,
// 離中心 reach 的角度收平。頭頂離軸心 tilt 的角度,reach 要比它小一截,圓頂才不會墊高總身高
const HAIR_DOME = { lift: 0.15, reach: 0.85 }
// 法式包頭的髮捲由兩片貼在髮殼上的鼓起並排而成,每一片都像一片兩端尖、中間寬的葉子。位置用髮殼上的角度描述:
// - from 與 to 是上緣與下緣離頭頂的角度,往後量。上緣在頭頂後方,下緣在後頸,不超過髮蓋的後緣。
// - side 是這一片的中線往右(+x)偏的角度,spread 是從中線往左右各蓋多寬的角度。
// - height 是中央浮出髮殼的高度。四周沉進髮殼 sink 的深度,與髮蓋接得平順;兩端因此比 from 與 to 短一點才露出來。
// 兩片交界的凹痕就是收邊
const FRENCH_TWIST = {
  // 一側的頭髮蓋過另一側捲進去的那一片,寬而厚,收邊在它的右緣
  outer: { from: 0.72, to: 2.6, side: -0.02, spread: 0.27, height: 0.07, sink: 0.02 },
  // 被蓋住的那一側,窄而薄,從收邊的右邊露出來
  inner: { from: 0.95, to: 2.45, side: 0.2, spread: 0.14, height: 0.04, sink: 0.02 },
}

// 跑完一個完整步伐循環(左右腳各跨一次)前進的距離
const STRIDE_LENGTH = 1.8
const LEG_SWING = 0.9
const ARM_SWING = 0.8
const BOB_HEIGHT = 0.08
// 跑步時上半身繞髖關節往前傾的角度。繞 x 軸轉負的角度是往前(-z)傾
const FORWARD_LEAN = 0.15
const LEAN_AXIS = new Vector3(1, 0, 0)

// 左手一直握著登機箱的拉桿,不跟著跑步前後擺動。
// - splay 是左手臂往外張的角度。登機箱的握把在箱子正中間,手要張到半個箱寬落在左腿外側,箱子才不會插進左腿。
// - pullBack 是跑起來時左手臂往後伸的角度,登機箱因此拖在左後方。
// - tilt 是跑起來時登機箱往後倒的角度。
const CARRY = { splay: 0.32, pullBack: 0.45, tilt: (35 * Math.PI) / 180 }

// 收集成功時的歡呼:舉起右手、原地小跳一下。時間點都是整段回饋的幾分之幾。
// - armRaise 是右手臂舉起時往外張的角度,接近 π 就是舉過頭頂。
// - 右手在 raise 舉到最高,停到 lower 開始放下,回饋播完時剛好回到原位。
// - 從 hopFrom 起跳、hopTo 落地,hopHeight 是跳起來的高度,單位與世界座標相同。
// 左手仍然握著拉桿,登機箱留在地上:跳起來時拉桿跟著手的高度伸長
const CHEER = { armRaise: 2.75, raise: 0.15, lower: 0.6, hopFrom: 0.1, hopTo: 0.55, hopHeight: 0.2 }

/** 揮擊的進度到這裡時,登機箱正好往下甩過主角身體的前方。揮擊的動作照這個時間點編排。 */
export const SWING_STRIKE = 0.5

// 揮擊:左手先把登機箱沿著身體左側往前盪起來,右手跟著握上拉桿,雙手把箱子舉到右肩上方再往左下揮出去,
// 最後箱子沿著左側盪回來,回到平常的姿勢。揮的力量從軀幹來:舉起時往右扭、往後仰,把力量蓄起來,
// 在最高點停一下,再一口氣轉向左邊、往前彎著揮下去,揮到底之後停一下,才收回來。
// 揮擊的姿勢蓋過平常姿勢的程度,兩隻手各自從開頭漸強到 riseEnd、從 fallStart 漸弱到結尾,都是整次揮擊的幾分之幾。
// 左手一直握著拉桿,所以比右手早握上、晚放開。handGap 是兩手的手掌中心在握把上隔多遠
const SWING = {
  left: { riseEnd: 0.1, fallStart: 0.86 },
  right: { riseEnd: 0.22, fallStart: 0.74 },
  handGap: 0.11,
}
// 軀幹在腰帶的高度彎腰與扭腰,骨盆與腿不跟著轉,腿照樣播跑步或站立的動作。
// 頭只跟著扭轉的 (1 - headCounter),臉大致朝著前方
const SWING_BODY = { pivotY: BELT.y, headCounter: 0.6 }
// 左手把箱子往前盪起來的姿勢,揮擊的開頭與結尾都經過它。拉桿只往前倒、不往內偏,箱子在腿旁邊時才一直留在左腿外側
const SWING_PENDULUM = { grip: [-0.42, 0.12, -0.22], toward: [-0.12, -0.6, -0.8], body: [0, 0, 0] }
const SWING_RAISED = { grip: [0.15, 0.55, -0.3], toward: [0.55, 0.75, 0.35] }
const SWING_STRUCK = { grip: [-0.06, 0.22, -0.33], toward: [-0.6, -0.45, -0.65] }
// 揮擊經過的姿勢。grip 與 toward 用上半身的座標描述:原點在髖關節,臉朝 -z,右手在 +x。軀幹轉動時它們跟著轉。
// - at 是到達這個姿勢的時間點,是整次揮擊的幾分之幾。第一個之前停在第一個,最後一個之後停在最後一個。
// - grip 是兩手之間、握把的中心。右手握著握把的時候,它離兩邊的肩關節都不能超過 HAND_REACH,否則手搆不到。
// - toward 是從握把往箱子的方向,也就是拉桿伸出去的方向,不必是單位向量。
// - body 是軀幹的 `[前後, 扭轉, 側彎]`,單位是弧度。前後為正是往後仰;扭轉為正是轉向左邊;側彎為正是上身倒向左邊。
// 箱子掛在拉桿末端、離握把很遠。箱子只在髖部以上的高度經過身體前方,低於髖部時都在左腿外側,
// 跑步時往前踢的腿才碰不到它。改姿勢之後要從背後、側面各看一次,確認箱子沒有穿過身體或地面。
// 開始往下揮與揮到底的時間點要對稱地落在 SWING_STRIKE 的兩側,箱子才在那一刻正好甩過身體前方
const SWING_POSES = [
  { at: SWING.left.riseEnd, ...SWING_PENDULUM },
  // 雙手在胸前,箱子平舉在左前方,高過跑步時往前踢的腿;軀幹開始往右扭
  { at: SWING.right.riseEnd, grip: [-0.15, 0.4, -0.33], toward: [-0.3, -0.15, -0.95], body: [0, -0.2, 0] },
  // 舉到右肩上方,箱子在右上方:軀幹往右扭、往後仰
  { at: 0.36, ...SWING_RAISED, body: [0.12, -0.55, 0.08] },
  // 在最高點停一下,讓人看得出接下來要往下揮
  { at: 0.42, ...SWING_RAISED, body: [0.15, -0.62, 0.1] },
  // 往左下揮到底,箱子甩到左前方:軀幹轉向左邊、往前彎
  { at: 0.58, ...SWING_STRUCK, body: [-0.32, 0.38, 0.12] },
  // 停在揮到底的姿勢,箱子的份量才看得出來
  { at: SWING.right.fallStart, ...SWING_STRUCK, body: [-0.36, 0.42, 0.12] },
  { at: SWING.left.fallStart, ...SWING_PENDULUM },
].map(({ at, grip, toward, body }) => ({
  at,
  grip: new Vector3(...grip),
  toward: new Vector3(...toward).normalize(),
  body: new Vector3(...body),
}))
// 手肘彎向哪一側,用上半身的座標描述:往下、往外,稍微往後,和人雙手往前握東西時一樣
const ELBOW_POLES = { left: new Vector3(-1, -1, 0.4), right: new Vector3(1, -1, 0.4) }

/**
 * 建立主角的人與她平常用左手拉著的登機箱,`object` 要由呼叫端加進場景。
 *
 * 每一幀依序呼叫兩個方法:
 * - `place(position, heading)`:position 是世界座標地面上的 `{ x, z }`,heading 是遊戲核心的朝向。
 * - `animate(distance, dt, cameraPosition, swingProgress)`:distance 是這一幀在世界座標裡移動了多遠,倒退時是負的;
 *   dt 是經過幾秒;cameraPosition 是鏡頭這一幀在世界座標的位置;swingProgress 是遊戲核心的揮擊進度。
 *   有在移動就播跑步動作,登機箱跟著往後倒、拖在左後方;停下後很快回到站姿並保持靜止,登機箱直立在左側。
 *   登機箱的輪子依 distance 轉動,倒退時反轉;鏡頭離登機箱太近時,登機箱會暫時藏起來。
 *
 * swingProgress 不是 null 時,手臂播揮擊的動作,腿照樣播跑步或站立的動作。
 * 揮擊的動作只看 swingProgress,自己不計時,所以它不變時動作就停在那裡。
 *
 * 收集成功時呼叫 `cheer()`:主角舉起右手、原地小跳一下,左手仍然握著登機箱,登機箱留在地上。
 * 歡呼還沒播完時又呼叫,第二次會等第一次播完再從頭播。動作由之後每一幀的 `animate` 推進。
 * 歡呼與揮擊同時發生時,手臂照揮擊的動作擺,小跳照樣播。
 *
 * 只能在瀏覽器裡建立,因為虎紋貼圖要用 canvas 畫。
 * 用完必須呼叫 `dispose()` 釋放 geometry、material 與貼圖。
 */
export function createPlayerFigure() {
  // 長方體與橢球共用單位大小的 geometry,靠 scale 決定大小;上下粗細不同的部位各自有一個 geometry
  const box = new BoxGeometry(1, 1, 1)
  const ball = new IcosahedronGeometry(1, 1)
  // 手肘的關節是一段沿著 x 的圓柱,手肘彎起來時填住上下兩截袖子之間張開的縫
  const elbowGeometry = new CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2)
  const pelvisGeometry = taperedBox(PELVIS.top - PELVIS.bottom, PELVIS.bottomSize, PELVIS.topSize)
  const waistGeometry = taperedBox(CHEST.y - WAIST.y, WAIST.size, CHEST.size)
  const chestGeometry = taperedBox(SHOULDER.y - CHEST.y, CHEST.size, SHOULDER.size)
  const collarGeometry = taperedBox(0.06, [0.13, 0.12], [0.11, 0.105])
  const hairGeometries = [...createHairCapGeometries(), ...Object.values(FRENCH_TWIST).map(createHairSwell)]
  const geometries = [
    box,
    ball,
    elbowGeometry,
    pelvisGeometry,
    waistGeometry,
    chestGeometry,
    collarGeometry,
    ...hairGeometries,
  ]

  const tigerTexture = createTigerTexture()
  const materials = {
    skin: new MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.9, flatShading: true }),
    // 髮蓋是沒有封口的球殼,從邊緣斜看進去會看到內面,所以兩面都要畫
    hair: new MeshStandardMaterial({ color: HAIR_COLOR, roughness: 0.7, flatShading: true, side: DoubleSide }),
    shirt: new MeshStandardMaterial({ color: SHIRT_COLOR, roughness: 0.9 }),
    // 名牌和襯衫都是暖黃色,名牌自己微微發光才不會融進襯衫裡
    nameTag: new MeshStandardMaterial({
      color: NAME_TAG_COLOR,
      emissive: NAME_TAG_COLOR,
      emissiveIntensity: 0.3,
      roughness: 0.4,
    }),
    pants: new MeshStandardMaterial({ color: PANTS_COLOR, roughness: 0.9 }),
    shoe: new MeshStandardMaterial({ color: SHOE_COLOR, roughness: 0.5 }),
    tiger: new MeshStandardMaterial({ map: tigerTexture, roughness: 0.8 }),
  }

  // 四肢的原點在關節上,繞 x 軸轉就是前後擺動
  const joint = (x, y, ...parts) => {
    const group = new Group()
    group.position.set(x, y, 0)
    group.add(...parts)
    return group
  }

  const leftLeg = joint(-LEG.spacing, 0, ...legParts(box, materials))
  const rightLeg = joint(LEG.spacing, 0, ...legParts(box, materials))

  // 手臂往外張的角度見 ARM 與 CARRY。Euler 的順序是先繞 z 再繞 x:先往外張,前後擺動時才不會改變往外張的角度
  const shoulderX = SHOULDER.size[0] / 2 + ARM.width / 2
  const shoulderY = SHOULDER.y - 0.04
  const leftArm = createArm(-shoulderX, shoulderY, box, elbowGeometry, materials)
  const rightArm = createArm(shoulderX, shoulderY, box, elbowGeometry, materials)

  const head = new Group()
  head.position.y = HEAD.y
  // 臉不做五官。頭髮的 geometry 都已經擺在頭的座標裡,不再縮放或移動
  head.add(
    part(ball, materials.skin, HEAD.radii, [0, 0, 0]),
    ...hairGeometries.map((geometry) => part(geometry, materials.hair, [1, 1, 1], [0, 0, 0])),
  )

  // 上半身的原點在髖部,前傾時繞髖部轉,腿不會跟著傾斜
  const upperBody = new Group()
  const pelvis = part(pelvisGeometry, materials.pants, [1, 1, 1], [0, (PELVIS.bottom + PELVIS.top) / 2, 0])
  const pelvisRest = pelvis.position.clone()
  upperBody.add(
    pelvis,
    // 襯衫的下襬紮進褲子,接縫藏在腰帶底下
    part(waistGeometry, materials.shirt, [1, 1, 1], [0, (WAIST.y + CHEST.y) / 2, 0]),
    part(chestGeometry, materials.shirt, [1, 1, 1], [0, (CHEST.y + SHOULDER.y) / 2, 0]),
    part(box, materials.tiger, [BELT.width, BELT.height, BELT.depth], [0, BELT.y, 0]),
    createBow(box, materials),
    // 名牌刻意不放文字與 logo
    part(box, materials.nameTag, [0.085, 0.03, 0.012], [-0.09, 0.43, -CHEST.size[1] / 2]),
    part(box, materials.skin, [0.09, 0.2, 0.085], [0, SHOULDER.y + 0.04, 0]),
    ...collarParts(box, collarGeometry, materials),
    leftArm.shoulder,
    rightArm.shoulder,
    head,
  )

  const hips = new Group()
  hips.position.y = HIP_HEIGHT
  hips.add(leftLeg, rightLeg, upperBody)

  const suitcase = createSuitcaseFigure()
  const object = new Group()
  object.add(hips, suitcase.object)

  const runCycle = createRunCycle(STRIDE_LENGTH)
  const cheerClip = createFeedbackClip()
  const grip = new Vector3()
  const swingGrip = new Vector3()
  const direction = new Vector3()
  const across = new Vector3()
  const rightDirection = new Vector3()
  const rightAcross = new Vector3()
  const handTarget = new Vector3()
  const bodyAngles = new Vector3()
  const bodyEuler = new Euler(0, 0, 0, 'YXZ')
  const bodyTurn = new Quaternion()
  const pelvisTurn = new Quaternion()
  const leanTurn = new Quaternion()
  const waistPivot = new Vector3(0, SWING_BODY.pivotY, 0)
  const pivotShift = new Vector3()
  // 這次歡呼舉起右手的程度還剩幾成,見 animate 裡的說明
  let cheerHand = 1
  const swing = { direction: new Vector3(), across: new Vector3(), weight: 0 }
  const restQuaternion = new Quaternion()
  const reachQuaternion = new Quaternion()

  // 把手臂從平常的姿勢往「手掌中心落在 target」的姿勢擺過去,weight 是擺過去的程度。座標都是上半身的座標
  function blendReach(arm, target, pole, weight) {
    restQuaternion.copy(arm.shoulder.quaternion)
    const bend = solveReach(arm.shoulder.position, target, pole, reachQuaternion)
    arm.shoulder.quaternion.slerpQuaternions(restQuaternion, reachQuaternion, weight)
    arm.elbow.rotation.x = bend * weight
  }

  return {
    object,
    place(position, heading) {
      placeFigure(object, position, heading)
    },
    cheer() {
      cheerClip.play()
    },
    animate(distance, dt, cameraPosition, swingProgress) {
      const { phase, blend } = runCycle.advance(Math.abs(distance), dt)
      const feedback = cheerClip.advance(dt)
      const stride = Math.sin(phase) * blend
      leftLeg.rotation.x = stride * LEG_SWING
      rightLeg.rotation.x = -stride * LEG_SWING
      // 每跨一步身體起伏一次,所以用 |sin|
      const bob = Math.abs(Math.sin(phase)) * BOB_HEIGHT * blend
      hips.position.y = HIP_HEIGHT + bob + hopOf(feedback, CHEER.hopFrom, CHEER.hopTo) * CHEER.hopHeight
      // 登機箱的姿勢用緩入緩出的強度,起跑與停下時箱子才不會猛然倒下或立起來
      const carry = easeInOut(blend)

      const leftWeight = envelopeOf(swingProgress, SWING.left.riseEnd, SWING.left.fallStart)
      const rightWeight = envelopeOf(swingProgress, SWING.right.riseEnd, SWING.right.fallStart)
      if (leftWeight > 0) swingPoseOf(swingProgress, swingGrip, direction, bodyAngles)
      else bodyAngles.set(0, 0, 0)
      bodyAngles.multiplyScalar(leftWeight)

      // 跑步的前傾繞髖關節轉,揮擊的彎腰與扭腰繞腰轉。上半身的原點在髖關節,所以繞腰轉時原點要跟著挪
      bodyTurn.setFromEuler(bodyEuler.set(bodyAngles.x, bodyAngles.y, bodyAngles.z))
      leanTurn.setFromAxisAngle(LEAN_AXIS, -FORWARD_LEAN * blend)
      upperBody.quaternion.multiplyQuaternions(leanTurn, bodyTurn)
      pivotShift.copy(waistPivot).applyQuaternion(bodyTurn)
      upperBody.position.subVectors(waistPivot, pivotShift).applyQuaternion(leanTurn)
      // 骨盆抵銷彎腰與扭腰,留在腿上,只跟著跑步前傾
      pelvisTurn.copy(bodyTurn).invert()
      pelvis.quaternion.copy(pelvisTurn)
      pelvis.position.subVectors(pelvisRest, waistPivot).applyQuaternion(pelvisTurn).add(waistPivot)
      head.rotation.y = -bodyAngles.y * SWING_BODY.headCounter
      // 歡呼時揮擊,舉起的右手隨著右手握上拉桿放下來,這次歡呼剩下的時間都不再舉起。
      // 揮完時若讓右手回到舉高的位置,手臂從左下方轉回頭頂的途中會穿過頭
      if (feedback === null) cheerHand = 1
      else cheerHand = Math.min(cheerHand, 1 - rightWeight)

      // 先擺平常的姿勢。三個角度都要設:揮擊時直接換掉手臂的方向,沒設到的角度會留著上一幀揮擊的值。
      // 右手舉起來時不再跟著跑步前後擺動
      const raise = envelopeOf(feedback, CHEER.raise, CHEER.lower) * cheerHand
      rightArm.shoulder.rotation.set(
        stride * ARM_SWING * (1 - raise),
        0,
        ARM.splay + (CHEER.armRaise - ARM.splay) * raise,
      )
      leftArm.shoulder.rotation.set(-CARRY.pullBack * carry, 0, -CARRY.splay)
      leftArm.elbow.rotation.x = 0
      rightArm.elbow.rotation.x = 0

      // 揮擊時兩隻手往握把伸過去,蓋過平常的姿勢。右手的程度只會比左手小
      if (leftWeight > 0) {
        acrossOf(direction, across)
        handTarget.copy(swingGrip).addScaledVector(across, -SWING.handGap / 2)
        blendReach(leftArm, handTarget, ELBOW_POLES.left, leftWeight)
      }
      if (rightWeight > 0) {
        // 右手還沒握上與放開之後,伸向握上與放開那一刻的握把。
        // 箱子在左腿旁時,握把在右手搆不到的地方;伸向那裡的話,伸直的右手會從肚子前面橫過去
        const reachAt = MathUtils.clamp(swingProgress, SWING.right.riseEnd, SWING.right.fallStart)
        swingPoseOf(reachAt, handTarget, rightDirection)
        handTarget.addScaledVector(acrossOf(rightDirection, rightAcross), SWING.handGap / 2)
        blendReach(rightArm, handTarget, ELBOW_POLES.right, rightWeight)
      }

      // 全身擺好之後才量得到手在哪裡,登機箱再依手的位置擺上去。
      // 左手一直握著拉桿:平常握在握把的中心,揮擊時握在握把偏左的地方,讓出右邊給右手。
      // 拉桿與橫桿的方向要從上半身的座標換到主角造型的座標
      leftArm.hand.getWorldPosition(grip)
      object.worldToLocal(grip)
      if (leftWeight > 0) {
        swing.direction.copy(direction).applyQuaternion(upperBody.quaternion)
        swing.across.copy(across).applyQuaternion(upperBody.quaternion)
        swing.weight = leftWeight
        grip.addScaledVector(swing.across, (SWING.handGap / 2) * leftWeight)
      }
      suitcase.pose(grip, CARRY.tilt * carry, leftWeight > 0 ? swing : null)
      suitcase.roll(distance)
      suitcase.hideNear(cameraPosition)
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of Object.values(materials)) material.dispose()
      tigerTexture.dispose()
      suitcase.dispose()
    },
  }
}

/**
 * 一段動作蓋過平常姿勢的程度,0 是平常的姿勢、1 是完全照這段動作擺。
 *
 * progress 是這段動作播到哪裡,0 是開頭、1 是結尾,沒有在播時是 null。
 * 從開頭到 riseEnd 漸強,停到 fallStart 開始漸弱,播完時剛好回到 0。漸強與漸弱都頭尾放慢,手才不會突然停住。
 */
function envelopeOf(progress, riseEnd, fallStart) {
  if (progress === null) return 0
  if (progress < riseEnd) return easeInOut(progress / riseEnd)
  if (progress < fallStart) return 1
  return easeInOut((1 - progress) / (1 - fallStart))
}

// 揮擊在 progress 這一刻的握把中心與拉桿方向寫進 grip 與 direction,座標是上半身的座標;
// 有給 body 時,軀幹的 `[前後, 扭轉, 側彎]` 寫進它的 x、y、z。
// 相鄰兩個姿勢之間頭尾放慢:握把走直線,拉桿的方向沿著兩個方向之間最短的弧轉過去
function swingPoseOf(progress, grip, direction, body = null) {
  const next = SWING_POSES.findIndex(({ at }) => at > progress)
  if (next === 0 || next === -1) {
    const held = SWING_POSES.at(next)
    grip.copy(held.grip)
    direction.copy(held.toward)
    body?.copy(held.body)
    return
  }
  const from = SWING_POSES[next - 1]
  const to = SWING_POSES[next]
  const t = easeInOut((progress - from.at) / (to.at - from.at))
  grip.lerpVectors(from.grip, to.grip, t)
  poseScratch.turn.setFromUnitVectors(from.toward, to.toward)
  direction.copy(from.toward).applyQuaternion(poseScratch.partial.identity().slerp(poseScratch.turn, t))
  body?.lerpVectors(from.body, to.body, t)
}
const poseScratch = { turn: new Quaternion(), partial: new Quaternion() }

// 握把橫桿的方向,寫進 across 並回傳 across:取身體的左右方向扣掉沿著拉桿的分量,橫桿才與拉桿垂直
function acrossOf(direction, across) {
  return across.set(1, 0, 0).addScaledVector(direction, -direction.x).normalize()
}

/**
 * 把一隻手臂擺成手掌中心落在 target,手肘彎向 pole 那一側。座標都是上半身的座標,與肩關節的 position 相同。
 *
 * 肩關節要轉成的方向寫進 quaternion,回傳手肘要彎的角度,也就是手肘 rotation.x 的值。
 * target 搆不到時手臂伸直,朝 target 指過去。pole 不必是單位向量,但不能與肩關節到 target 的方向平行。
 */
function solveReach(shoulder, target, pole, quaternion) {
  const upper = ELBOW
  const lower = HAND_REACH - ELBOW
  const { toTarget, side, upperDirection, xAxis, yAxis, zAxis, basis } = reachScratch
  toTarget.subVectors(target, shoulder)
  const distance = MathUtils.clamp(toTarget.length(), Math.abs(upper - lower) + 1e-4, upper + lower - 1e-4)
  const aim = toTarget.normalize()
  // 手肘落在 aim 與 pole 撐出的平面上、偏向 pole 的那一側
  side.copy(pole).addScaledVector(aim, -pole.dot(aim)).normalize()
  // 上臂、前臂與肩關節到 target 圍成三角形,用餘弦定理求肩關節與手肘的夾角
  const cosShoulder = (upper ** 2 + distance ** 2 - lower ** 2) / (2 * upper * distance)
  const sinShoulder = Math.sqrt(1 - cosShoulder ** 2)
  upperDirection.copy(aim).multiplyScalar(cosShoulder).addScaledVector(side, sinShoulder)
  // 肩關節的座標軸:-y 沿著上臂往下,-z 是前臂彎過去的那一側,也就是背離 pole、朝向 target 的那一側
  yAxis.copy(upperDirection).negate()
  zAxis.copy(aim).multiplyScalar(-sinShoulder).addScaledVector(side, cosShoulder)
  xAxis.crossVectors(yAxis, zAxis)
  quaternion.setFromRotationMatrix(basis.makeBasis(xAxis, yAxis, zAxis))
  const cosElbow = (upper ** 2 + lower ** 2 - distance ** 2) / (2 * upper * lower)
  return Math.PI - Math.acos(MathUtils.clamp(cosElbow, -1, 1))
}
const reachScratch = {
  toTarget: new Vector3(),
  side: new Vector3(),
  upperDirection: new Vector3(),
  xAxis: new Vector3(),
  yAxis: new Vector3(),
  zAxis: new Vector3(),
  basis: new Matrix4(),
}

// 一條腿:從髖關節往下到腳踝的直筒褲管,加上黑色低跟鞋。原點在髖關節
function legParts(box, materials) {
  const length = HIP_HEIGHT - LEG.hem
  // 鞋身前低後高,鞋尖著地、鞋跟由底下的小方塊墊高
  const shoe = part(box, materials.shoe, [0.12, 0.06, 0.22], [0, -HIP_HEIGHT + 0.05, -0.04])
  shoe.rotation.x = -0.15
  return [
    part(box, materials.pants, [LEG.width, length, LEG.depth], [0, -length / 2, 0]),
    shoe,
    part(box, materials.shoe, [0.07, 0.045, 0.05], [0, -HIP_HEIGHT + 0.0225, 0.045]),
  ]
}

/**
 * 一隻手臂:七分袖蓋到前臂的一半,袖口往上反摺成一圈較寬的邊,底下露出前臂與手。
 *
 * 回傳三個 Group:
 * - shoulder 是肩關節,擺在上半身的 `(x, y, 0)`。轉它就是轉整隻手臂。
 * - elbow 是手肘,繞自己的 x 軸轉正的角度時,前臂往 -z 彎。
 * - hand 是手掌的中心,只用來量位置。
 */
function createArm(x, y, box, elbowGeometry, materials) {
  // 袖子從肩關節往上多蓋一點,包住肩膀的頂端
  const sleeveTop = 0.03
  const forearm = ARM.length - ARM.sleeve
  const lowerSleeve = ARM.sleeve - ELBOW
  const shoulder = new Group()
  shoulder.position.set(x, y, 0)
  shoulder.add(part(box, materials.shirt, [ARM.width, ELBOW + sleeveTop, ARM.depth], [0, (sleeveTop - ELBOW) / 2, 0]))

  // 手肘以下的部位以手肘為原點
  const elbow = new Group()
  elbow.position.y = -ELBOW
  const hand = new Group()
  hand.position.y = ELBOW - HAND_REACH
  // 關節的圓柱比袖子細一點,手臂伸直時整個藏在袖子裡
  const jointSize = [ARM.width - 0.002, ARM.depth / 2 - 0.001, ARM.depth / 2 - 0.001]
  elbow.add(
    part(elbowGeometry, materials.shirt, jointSize, [0, 0, 0]),
    part(box, materials.shirt, [ARM.width, lowerSleeve, ARM.depth], [0, -lowerSleeve / 2, 0]),
    part(box, materials.shirt, [ARM.width + 0.025, 0.05, ARM.depth + 0.025], [0, ELBOW - ARM.sleeve + 0.02, 0]),
    part(
      box,
      materials.skin,
      [ARM.width - 0.025, forearm, ARM.depth - 0.025],
      [0, ELBOW - ARM.sleeve - forearm / 2, 0],
    ),
    part(box, materials.skin, [0.075, 0.1, 0.09], [0, ELBOW - HAND_REACH, 0]),
    hand,
  )
  shoulder.add(elbow)
  return { shoulder, elbow, hand }
}

/**
 * 髮蓋球殼,擺在頭的座標裡,形狀由 `HAIR_CAP` 決定,貼著撐起圓頂的髮殼。
 *
 * 球殼的軸心原本朝上,往後倒之後軸心指向後上方。球殼分成兩塊:靠軸心的一塊是完整的,
 * 外圈那一塊在正前方往左偏 partOffset 的經線上留一道縫當分線。
 */
function createHairCapGeometries() {
  const { tilt, coverage, partStart, partGap, partOffset } = HAIR_CAP
  // SphereGeometry 的經度 phi 在 3π/2 是正前方(-z),往左(-x)是遞增
  const phiStart = (Math.PI * 3) / 2 + partOffset + partGap / 2
  // 兩塊的頂點在交界上對不齊,會裂出一條細縫。外圈那塊往軸心多鋪一小段,墊在稍微大一點的靠軸心那塊底下,把縫蓋住
  const overlap = 0.1
  const crown = new SphereGeometry(1.005, 12, 3, phiStart, Math.PI * 2, 0, partStart)
  const front = new SphereGeometry(
    1,
    12,
    3,
    phiStart,
    Math.PI * 2 - partGap,
    partStart - overlap,
    coverage - partStart + overlap,
  )
  const vertex = new Vector3()
  for (const geometry of [crown, front]) {
    // 繞 x 軸轉正的角度,朝上的軸心會倒向 +z,也就是後面
    geometry.rotateX(tilt)
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i += 1) {
      shellPoint(vertex.fromBufferAttribute(position, i), vertex)
      position.setXYZ(i, vertex.x, vertex.y, vertex.z)
    }
    geometry.computeVertexNormals()
  }
  return [crown, front]
}

/**
 * 把方向 direction 換成髮殼上的點,寫進 target 並回傳 target。target 可以就是 direction。
 *
 * direction 必須是還沒乘上 `HAIR_SHELL.radii` 的方向,圓頂才會撐在對的位置。
 * 它的長度是倍數:單位向量落在髮殼上,長一點的落在髮殼外面。
 */
function shellPoint(direction, target) {
  const { radii, center } = HAIR_SHELL
  const scale = domeScale(direction)
  return target.set(
    center[0] + direction.x * scale * radii[0],
    center[1] + direction.y * scale * radii[1],
    center[2] + direction.z * scale * radii[2],
  )
}

// 髮殼在 direction 這個方向上要撐大成幾倍,見 `HAIR_DOME`。direction 不必是單位向量。
// 圓頂從中心往外依 cos² 收平,在 reach 那一圈與髮殼接得平順,不會多出一道稜
function domeScale(direction) {
  // 圓頂的中心是髮蓋的軸心,方向是 (0, cos tilt, sin tilt)。先算 direction 與它夾角的 cos
  const cosine = (Math.cos(HAIR_CAP.tilt) * direction.y + Math.sin(HAIR_CAP.tilt) * direction.z) / direction.length()
  const angle = Math.acos(MathUtils.clamp(cosine, -1, 1))
  if (angle >= HAIR_DOME.reach) return 1
  return 1 + HAIR_DOME.lift * Math.cos((angle / HAIR_DOME.reach) * (Math.PI / 2)) ** 2
}

/**
 * 一塊貼在髮殼上的鼓起,形狀由 `FRENCH_TWIST` 的一項決定,擺在頭的座標裡。
 *
 * 中間最厚,上下兩端與左右兩側都收窄、沉進髮殼裡,像一片葉子。
 */
function createHairSwell({ from, to, side, spread, height, sink }) {
  // 單位球的每個頂點當成參數:y 決定上下的位置,x 決定左右的位置,z 決定浮出髮殼多高。
  // z 為 1 的那一點浮出 height;z 為 0 的兩端與兩側沉進 sink
  const geometry = new SphereGeometry(1, 8, 6)
  const position = geometry.attributes.position
  const { radii } = HAIR_SHELL
  const direction = new Vector3()
  const normal = new Vector3()
  const point = new Vector3()
  for (let i = 0; i < position.count; i += 1) {
    // 上下的位置照緯度角平均分:照 y 平均分的話兩端是圓的,照緯度角分才會兩端尖。
    // 浮點誤差會讓 y 略超出 ±1,acos 之前要先夾住
    const latitude = Math.acos(MathUtils.clamp(position.getY(i), -1, 1))
    const polar = from + (latitude / Math.PI) * (to - from)
    const azimuth = side + position.getX(i) * spread
    direction.set(Math.sin(azimuth), Math.cos(polar) * Math.cos(azimuth), Math.sin(polar) * Math.cos(azimuth))
    // 法線取沒撐起圓頂的橢球的法線:圓頂很平緩,差別看不出來
    normal.set(direction.x / radii[0], direction.y / radii[1], direction.z / radii[2]).normalize()
    shellPoint(direction, point).addScaledVector(normal, position.getZ(i) * (height + sink) - sink)
    position.setXYZ(i, point.x, point.y, point.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

// 襯衫的領子:繞脖子一圈的領座,加上胸前往兩側攤開的兩片領尖
function collarParts(box, collarGeometry, materials) {
  const band = part(collarGeometry, materials.shirt, [1, 1, 1], [0, SHOULDER.y + 0.02, 0])
  const points = [-1, 1].map((side) => {
    const point = part(box, materials.shirt, [0.06, 0.05, 0.015], [side * 0.04, SHOULDER.y - 0.02, -0.1])
    point.rotation.z = side * 0.6
    return point
  })
  return [band, ...points]
}

// 腰帶右側的蝴蝶結:中間的結、往兩邊翹起的兩個環,以及兩條垂下來的帶尾。
// 原點在腰帶右後方的轉角附近,蝴蝶結的正面朝 +x。整個蝴蝶結斜斜地朝向右後方,從背後也看得到環與帶尾的正面
function createBow(box, materials) {
  const bow = new Group()
  bow.position.set(BELT.width / 2 - 0.025, BELT.y, BELT.depth / 2 - 0.035)
  bow.rotation.y = -0.6
  bow.add(part(box, materials.tiger, [0.035, 0.05, 0.045], [0.01, 0, 0]))

  for (const side of [-1, 1]) {
    // side 為 1 的在後面。兩個環都是遠離結的那一端往上翹
    const loop = part(box, materials.tiger, [0.025, 0.065, 0.085], [0.012, 0.012, side * 0.055])
    loop.rotation.x = -side * 0.35
    bow.add(loop)

    // 帶尾的貼圖紋路要橫過帶子,所以帶子沿 x 方向建立再轉成垂直
    const length = 0.28
    const strip = part(box, materials.tiger, [length, 0.012, 0.04], [0, -length / 2, 0])
    strip.rotation.z = Math.PI / 2
    // 帶尾的原點在結的下半部。先繞自己的長軸扭一下,平的那一面才有一部分朝向背後或前面,再往前後張開
    const tail = new Group()
    tail.position.set(0.012, -0.015, side * 0.015)
    tail.rotation.set(-side * 0.15, -side * 0.35, 0)
    tail.add(strip)
    bow.add(tail)
  }
  return bow
}

/**
 * 上下兩個面大小不同的長方體,原點在中心。
 *
 * bottom 與 top 都是 `[寬, 深]`,分別是 x 與 z 方向的長度。四個側面仍然是平面,低多邊形的稜角才會一致。
 */
function taperedBox(height, [bottomWidth, bottomDepth], [topWidth, topDepth]) {
  const geometry = new BoxGeometry(1, height, 1)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i += 1) {
    const [width, depth] = position.getY(i) > 0 ? [topWidth, topDepth] : [bottomWidth, bottomDepth]
    position.setX(i, position.getX(i) * width)
    position.setZ(i, position.getZ(i) * depth)
  }
  // 側面斜了,原本的法向量不再垂直於側面,光影會不對
  geometry.computeVertexNormals()
  return geometry
}

// 腰帶與蝴蝶結的橘底黑紋虎紋貼圖。貼在長方體的每一面上時,紋路都沿著貼圖的上下方向
function createTigerTexture() {
  const [width, height] = TIGER_TILE_SIZE
  return createCanvasTexture(width, height, (context) => {
    context.fillStyle = TIGER_ORANGE
    context.fillRect(0, 0, width, height)
    context.fillStyle = TIGER_BLACK
    paintTigerStripes(context)
  })
}
