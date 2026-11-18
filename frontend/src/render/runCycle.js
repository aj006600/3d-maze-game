// 跑步動作的節奏,人和狗共用:步伐的相位跟著移動的距離前進,腳步才會與地面的速度一致;
// 動作的強度在起跑時漸強、停下時漸弱,停下後很快回到站姿並保持靜止。

// 跑步動作在起跑與停下時漸強與漸弱的速度:每秒從靜止到全速幾次
const BLEND_RATE = 8
// 每秒移動距離低於這個值就當作沒在跑。正面頂著牆時位置只有浮點誤差等級的變化,不該原地跑步
const MIN_RUN_SPEED = 0.5

/**
 * 建立一個跑步節奏。strideLength 是跑完一個完整步伐循環前進的距離。
 *
 * 每一幀呼叫 `advance(distance, dt)`,distance 是這一幀在世界座標裡移動了多遠,dt 是經過幾秒。
 * 回傳 `{ phase, blend }`:phase 是步伐的相位,在 0 到 2π 之間;blend 是跑步動作的強度,0 是站姿、1 是全速。
 */
export function createRunCycle(strideLength) {
  let phase = 0
  let blend = 0
  return {
    advance(distance, dt) {
      const running = dt > 0 && distance > MIN_RUN_SPEED * dt
      phase = (phase + (distance / strideLength) * Math.PI * 2) % (Math.PI * 2)
      const target = running ? 1 : 0
      blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), BLEND_RATE * dt)
      return { phase, blend }
    },
  }
}
