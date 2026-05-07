import { useState } from "react"
import type { Hotkey } from "@tanstack/react-hotkeys"
import { formatForDisplay } from "@tanstack/react-hotkeys"
import { useHotkeyRecorder } from "@tanstack/react-hotkeys"
import { RotateCcw } from "lucide-react"
import { Button } from "@kenafold/ui"

interface Props {
  hotkey: Hotkey
  isCustom: boolean
  onRecord: (hotkey: Hotkey) => void
  onReset: () => void
}

export function HotkeyRecorderButton({
  hotkey,
  isCustom,
  onRecord,
  onReset,
}: Props) {
  const [pending, setPending] = useState<Hotkey | null>(null)

  const recorder = useHotkeyRecorder({
    onRecord: (h) => {
      setPending(null)
      if (h) onRecord(h)
    },
    onCancel: () => setPending(null),
  })

  const display = recorder.isRecording
    ? pending
      ? formatForDisplay(pending)
      : "Pulsa una tecla..."
    : formatForDisplay(hotkey)

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          if (recorder.isRecording) {
            recorder.cancelRecording()
          } else {
            setPending(null)
            recorder.startRecording()
          }
        }}
        className={`min-w-24 rounded border px-2 py-1 font-mono text-xs transition-colors ${
          recorder.isRecording
            ? "animate-pulse border-primary bg-primary/10 text-primary"
            : "border-border/60 bg-muted/30 hover:bg-muted/50"
        }`}
      >
        {display}
      </button>
      {isCustom && !recorder.isRecording && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onReset}
          title="Restaurar default"
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
