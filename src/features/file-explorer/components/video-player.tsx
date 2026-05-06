import { useCallback, useEffect, useRef, useState } from "react"
import { Maximize2, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react"

interface Props {
  src: string
  compact?: boolean
}

function formatTime(s: number): string {
  if (!isFinite(s)) return "0:00"
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Reusable draggable slider
// ---------------------------------------------------------------------------
interface SliderProps {
  value: number // 0–1
  onChange: (v: number) => void
  width?: string
}

function Slider({ value, onChange, width = "w-full" }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const calc = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    onChange(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
  }, [onChange])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    calc(e.clientX)
    const onMove = (ev: MouseEvent) => calc(ev.clientX)
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [calc])

  const pct = `${(value * 100).toFixed(1)}%`

  return (
    <div
      ref={trackRef}
      className={`group/sl relative flex h-4 cursor-pointer select-none items-center ${width}`}
      onMouseDown={onMouseDown}
    >
      {/* Track */}
      <div className="h-[3px] w-full overflow-visible rounded-full bg-white/20 transition-[height] duration-150 group-hover/sl:h-[5px]">
        {/* Fill */}
        <div
          className="relative h-full rounded-full bg-primary"
          style={{ width: pct }}
        >
          {/* Thumb */}
          <span
            className="absolute -right-[6px] top-1/2 h-[12px] w-[12px] -translate-y-1/2 scale-0 rounded-full bg-white shadow-md transition-transform duration-150 group-hover/sl:scale-100"
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Volume icon based on level
// ---------------------------------------------------------------------------
function VolumeIcon({ level, muted }: { level: number; muted: boolean }) {
  if (muted || level === 0) return <VolumeX className="h-4 w-4" />
  if (level < 0.5) return <Volume1 className="h-4 w-4" />
  return <Volume2 className="h-4 w-4" />
}

// ---------------------------------------------------------------------------
// Main player
// ---------------------------------------------------------------------------
export function VideoPlayer({ src, compact }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const volTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [showVolumePct, setShowVolumePct] = useState(false)

  // Auto-hide
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setShowControls(false), 2500)
  }, [])

  const revealControls = useCallback(() => {
    setShowControls(true)
    if (playing) scheduleHide()
  }, [playing, scheduleHide])

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    if (volTimer.current) clearTimeout(volTimer.current)
    const v = videoRef.current
    if (v) { v.pause(); v.src = ""; v.load() }
  }, [])

  // Actions
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }, [])

  const seekTo = useCallback((ratio: number) => {
    const v = videoRef.current
    if (!v || !isFinite(duration)) return
    v.currentTime = ratio * duration
  }, [duration])

  const applyVolume = useCallback((val: number) => {
    const v = videoRef.current
    if (!v) return
    v.volume = val
    v.muted = val === 0
    setShowVolumePct(true)
    if (volTimer.current) clearTimeout(volTimer.current)
    volTimer.current = setTimeout(() => setShowVolumePct(false), 900)
  }, [])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (v) v.muted = !v.muted
  }, [])

  const requestFullscreen = useCallback(() => {
    containerRef.current?.requestFullscreen()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      const v = videoRef.current
      if (!v) return
      switch (e.code) {
        case "Space":
          e.preventDefault()
          togglePlay()
          break
        case "ArrowLeft":
          e.preventDefault()
          v.currentTime = Math.max(0, v.currentTime - 5)
          break
        case "ArrowRight":
          e.preventDefault()
          v.currentTime = Math.min(duration, v.currentTime + 5)
          break
        case "ArrowUp":
          e.preventDefault()
          applyVolume(Math.min(1, v.volume + 0.1))
          break
        case "ArrowDown":
          e.preventDefault()
          applyVolume(Math.max(0, v.volume - 0.1))
          break
        case "KeyM":
          toggleMute()
          break
        case "KeyF":
          requestFullscreen()
          break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [togglePlay, applyVolume, toggleMute, requestFullscreen, duration])

  const progress = duration > 0 ? currentTime / duration : 0
  const effectiveVolume = muted ? 0 : volume
  const volumePct = Math.round(effectiveVolume * 100)

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center overflow-hidden bg-black ${
        compact ? "h-full w-full" : "max-h-[70vh] w-full"
      }`}
      onMouseMove={revealControls}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        className="max-h-full max-w-full cursor-pointer"
        onClick={togglePlay}
        onPlay={() => { setPlaying(true); scheduleHide() }}
        onPause={() => {
          setPlaying(false)
          if (hideTimer.current) clearTimeout(hideTimer.current)
          setShowControls(true)
        }}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          setDuration(videoRef.current?.duration ?? 0)
          setVolume(videoRef.current?.volume ?? 1)
        }}
        onVolumeChange={() => {
          setMuted(videoRef.current?.muted ?? false)
          setVolume(videoRef.current?.volume ?? 1)
        }}
        onEnded={() => {
          setPlaying(false)
          if (hideTimer.current) clearTimeout(hideTimer.current)
          setShowControls(true)
        }}
      />

      {/* Centre play button */}
      {!playing && (
        <button
          onClick={togglePlay}
          className="absolute rounded-full bg-black/50 p-4 text-white backdrop-blur-sm hover:bg-black/70"
        >
          <Play className="h-7 w-7 fill-current" />
        </button>
      )}

      {/* Volume % toast */}
      {showVolumePct && (
        <div className="pointer-events-none absolute top-4 right-4 rounded-md bg-black/70 px-2 py-1 text-xs font-medium tabular-nums text-white backdrop-blur-sm">
          {volumePct}%
        </div>
      )}

      {/* Controls bar */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3 pt-10 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Seek bar */}
        <div className="mb-3">
          <Slider value={progress} onChange={seekTo} />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3 text-white">
          {/* Play/pause */}
          <button
            onClick={togglePlay}
            className="rounded p-0.5 transition-colors hover:text-primary"
          >
            {playing
              ? <Pause className="h-4 w-4 fill-current" />
              : <Play className="h-4 w-4 fill-current" />
            }
          </button>

          {/* Time */}
          <span className="text-xs tabular-nums text-white/60">
            {formatTime(currentTime)}
            <span className="mx-1 text-white/30">/</span>
            {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-3">
            {/* Volume group */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="shrink-0 rounded p-0.5 transition-colors hover:text-primary"
              >
                <VolumeIcon level={volume} muted={muted} />
              </button>
              <Slider
                value={effectiveVolume}
                onChange={applyVolume}
                width="w-20"
              />
              <span className="w-6 text-right text-[11px] tabular-nums text-white/50">
                {volumePct}%
              </span>
            </div>

            {/* Fullscreen */}
            <button
              onClick={requestFullscreen}
              className="rounded p-0.5 transition-colors hover:text-primary"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
