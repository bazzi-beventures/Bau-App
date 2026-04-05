import { useRef, useState } from 'react'

const MAX_DURATION_MS = 120_000

export function useVoiceRecorder(onAudioReady: (blob: Blob) => void) {
  const [isRecording, setIsRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Prefer webm/opus (Chrome/Android), fallback to whatever is available
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        onAudioReady(blob)
      }

      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)

      // Auto-stop after MAX_DURATION_MS
      timerRef.current = setTimeout(stopRecording, MAX_DURATION_MS)
    } catch {
      // Microphone permission denied or unavailable
    }
  }

  function stopRecording() {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    setIsRecording(false)
  }

  return { isRecording, startRecording, stopRecording }
}
