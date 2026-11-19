// 遊戲的聲音。這個模組負責下列幾件事:
// - 載入音檔。
// - 依目前的畫面播放對應的音樂,換畫面時切換曲子。
// - 遊戲中的事件發生時播音效。
// - 靜音。
// 呼叫端只需要告訴它目前在哪個畫面、發生了哪個事件、有沒有靜音,怎麼播由這裡決定。遊戲核心不知道它的存在。
//
// 播放用 Web Audio API 而不用 <audio>:<audio loop> 每次繞回開頭都有一小段空隙,
// AudioBufferSourceNode 的 loop 則是逐個 sample 接回開頭,循環時才聽不出接縫。
// 也因為這樣,要無縫循環的曲子必須是 OGG:MP3 編碼會在頭尾補上空白,解碼出來的頭尾就不是原本的接縫。
import finishedMusicUrl from './music/happy-birthday-music-box.mp3'
import playingMusicUrl from './music/flowerbed-fields-loop.ogg'
import startMusicUrl from './music/pleasant-creek-loop.ogg'
import collectedSoundUrl from './sounds/confirmation_001.ogg'
import doorOpenedSoundUrl from './sounds/jingles_PIZZI10.ogg'
import wrongSoundUrl from './sounds/question_004.ogg'

/**
 * 各畫面的音樂,每一首都會一直重播到換畫面為止。沒列在這裡的畫面不播音樂。
 *
 * - `volume` 拉齊各曲原檔的響度差異。
 * - `gapSeconds` 是每播完一遍之後停多久再重播。0 表示無縫循環。
 * - `fadeOutSeconds` 是換畫面時這首淡出多久,淡出完才開始播下一首。
 */
const MUSIC = {
  start: { url: startMusicUrl, volume: 0.38, gapSeconds: 0, fadeOutSeconds: 1 },
  playing: { url: playingMusicUrl, volume: 0.7, gapSeconds: 0, fadeOutSeconds: 0 },
  // 原檔的結尾已經有約 2 秒的無聲,再補 1 秒,兩遍之間聽起來大約停 3 秒
  finished: { url: finishedMusicUrl, volume: 0.35, gapSeconds: 1, fadeOutSeconds: 0 },
}

/**
 * 各事件的音效。
 *
 * - 事件每發生一次就從頭播一次。前一次還沒播完時,兩次會疊在一起播。
 * - 音效播放時,音樂照樣播下去。
 * - `volume` 讓音效聽得出來,又不會蓋過音樂。
 * - `delaySeconds` 是事件發生之後等多久才開始播。
 */
const SOUNDS = {
  collected: { url: collectedSoundUrl, volume: 0.35, delaySeconds: 0 },
  wrong: { url: wrongSoundUrl, volume: 0.3, delaySeconds: 0 },
  // 門只會在收集最後一個字母的那一下打開,同一下也會播收集成功的叮聲。
  // jingle 晚一點才播,讓叮聲先播完,兩個聲音才聽得出是分開的兩拍
  doorOpened: { url: doorOpenedSoundUrl, volume: 0.5, delaySeconds: 0.3 },
}

// 不淡出的轉場與靜音也不是瞬間把音量切成 0:瞬間切斷會聽到「啪」的一聲
const DECLICK_SECONDS = 0.03

/**
 * 建立遊戲的聲音。建立時就開始下載音檔,但在呼叫 `unlock()` 之前不會發出任何聲音。
 *
 * - `unlock()` 必須在使用者的點擊或按鍵事件裡呼叫,否則瀏覽器會讓它一直保持無聲。呼叫第二次沒有效果。
 * - `setScreen(screen)` 告訴它目前在哪個畫面:`'entry'`、`'start'`、`'playing'` 或 `'finished'`。
 *   畫面有變時,上一首停下或淡出,接著播這個畫面的音樂;同一個畫面重複呼叫不會讓音樂從頭播。
 *   `unlock()` 之前也可以呼叫,解鎖時就從當下的畫面開始播。
 * - `playSound(event)` 播一次這個事件的音效:`'collected'`、`'wrong'` 或 `'doorOpened'`。
 *   前兩個與遊戲核心 `interact()` 的回傳值同名。`unlock()` 之前呼叫不會出聲,之後也不會補播。
 * - `setMuted(muted)` 切換靜音,音樂與音效一起安靜。靜音時音樂照樣往下播,只是聽不到。
 *
 * 音檔下載或解碼失敗時,那一首或那個音效不播並在 console 留下錯誤,遊戲本身不受影響。
 */
export function createAudio() {
  // 下載不需要使用者互動,所以建立時就開始。等到第一次要播的時候,檔案多半已經下載好
  const musicDownloads = downloadAll(MUSIC)
  const soundDownloads = downloadAll(SOUNDS)
  const musicBuffers = {}
  const soundBuffers = {}
  let context = null
  let master = null
  let muted = false
  let screen = null
  // 正在播的那一首:{ gain, source, fadeOutSeconds }。開始淡出之後就不算正在播
  let current = null
  // 它在每次換畫面時加一。曲子解碼需要時間,解碼完時用它確認畫面沒有在這段時間裡又換掉
  let generation = 0

  function musicBufferOf(name) {
    musicBuffers[name] ??= musicDownloads[name]
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => withGap(context, buffer, MUSIC[name].gapSeconds))
    return musicBuffers[name]
  }

  function soundBufferOf(name) {
    soundBuffers[name] ??= soundDownloads[name].then((bytes) => context.decodeAudioData(bytes))
    return soundBuffers[name]
  }

  // 從 when 開始播 buffer,when 已經過了就馬上播。聲音一律接在 master 底下,靜音時才會一起安靜
  function startSource(buffer, { volume, loop, when }) {
    const gain = context.createGain()
    gain.gain.value = volume
    gain.connect(master)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = loop
    source.connect(gain)
    source.onended = () => gain.disconnect()
    source.start(Math.max(when, context.currentTime))
    return { gain, source }
  }

  async function playMusic(name, notBefore) {
    const requested = generation
    let buffer
    try {
      buffer = await musicBufferOf(name)
    } catch (error) {
      console.error(`音樂載入失敗:${MUSIC[name].url}`, error)
      return
    }
    if (requested !== generation) return

    const { gain, source } = startSource(buffer, { volume: MUSIC[name].volume, loop: true, when: notBefore })
    current = { gain, source, fadeOutSeconds: MUSIC[name].fadeOutSeconds }
  }

  // 讓正在播的那一首淡出並停下,回傳它完全安靜的時間點
  function fadeOutCurrent() {
    const now = context.currentTime
    if (current === null) return now
    const { gain, source, fadeOutSeconds } = current
    current = null
    const end = now + Math.max(fadeOutSeconds, DECLICK_SECONDS)
    // 先把目前的音量釘在現在,ramp 才會從現在的音量降下去,而不是從上一個排程點開始算
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, end)
    source.stop(end)
    return end
  }

  return {
    unlock() {
      if (context !== null) return
      context = new AudioContext()
      master = context.createGain()
      master.gain.value = muted ? 0 : 1
      master.connect(context.destination)
      if (screen in MUSIC) playMusic(screen, context.currentTime)
    },
    setScreen(next) {
      if (next === screen) return
      screen = next
      generation += 1
      if (context === null) return
      const silentAt = fadeOutCurrent()
      if (next in MUSIC) playMusic(next, silentAt)
    },
    async playSound(event) {
      if (context === null) return
      // 延遲從呼叫的這一刻算起:第一次播時要先解碼,解碼花掉的時間不算進延遲
      const when = context.currentTime + SOUNDS[event].delaySeconds
      let buffer
      try {
        buffer = await soundBufferOf(event)
      } catch (error) {
        console.error(`音效載入失敗:${SOUNDS[event].url}`, error)
        return
      }
      startSource(buffer, { volume: SOUNDS[event].volume, loop: false, when })
    },
    setMuted(value) {
      muted = value
      if (context === null) return
      // setTargetAtTime 以指數逼近目標,大約三個時間常數之後就聽不出差別
      master.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, DECLICK_SECONDS / 3)
    },
  }
}

// 開始下載 table 裡的每一個音檔。回傳的物件與 table 用同樣的名字當 key
function downloadAll(table) {
  return Object.fromEntries(Object.entries(table).map(([name, { url }]) => [name, download(url)]))
}

function download(url) {
  const bytes = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return response.arrayBuffer()
  })
  // 播到這一首之前沒有人在等這個 Promise。先接住失敗,下載一失敗 console 才不會多一條 uncaught 錯誤;
  // 失敗留到真的要播這一首時再回報
  bytes.catch(() => {})
  return bytes
}

// 在曲子後面補上 gapSeconds 秒的無聲,整段一起循環,就是每播完一遍停一段時間再重播
function withGap(context, buffer, gapSeconds) {
  if (gapSeconds === 0) return buffer
  const gapLength = Math.round(gapSeconds * buffer.sampleRate)
  const padded = context.createBuffer(buffer.numberOfChannels, buffer.length + gapLength, buffer.sampleRate)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    padded.copyToChannel(buffer.getChannelData(channel), channel)
  }
  return padded
}
