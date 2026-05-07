export function playArchiveDone() {
  try {
    const ctx = new AudioContext()

    // Short rising sweep → gives the "zip" feel
    const sweep = ctx.createOscillator()
    const sweepGain = ctx.createGain()
    sweep.connect(sweepGain)
    sweepGain.connect(ctx.destination)
    sweep.type = "sine"
    sweep.frequency.setValueAtTime(200, ctx.currentTime)
    sweep.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.18)
    sweepGain.gain.setValueAtTime(0, ctx.currentTime)
    sweepGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.02)
    sweepGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    sweep.start(ctx.currentTime)
    sweep.stop(ctx.currentTime + 0.18)

    // C5 – E5 – G5 arpeggio (major chord, pleasant completion chime)
    const notes = [523.25, 659.25, 783.99]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = "sine"
      osc.frequency.value = freq

      const t = ctx.currentTime + 0.2 + i * 0.11
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.13, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      osc.start(t)
      osc.stop(t + 0.5)
    })

    setTimeout(() => ctx.close(), 2000)
  } catch {
    // AudioContext unavailable — ignore
  }
}
