import { useRef, useState } from 'react'

const MAX_DURATION_MS = 120_000
const MIN_DURATION_MS = 500

export function useVoiceRecorder(onAudioReady: (blob: Blob) => void) {
  const [isRecording, setIsRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimeRef = useRef<number>(0)

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Prefer webm/opus (Chrome/Android), fallback to mp4 (iOS/Safari), then default
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      startTimeRef.current = Date.now()

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        // Use the actual recorded MIME type (important for iOS/Safari)
        const actualType = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: actualType })
        if (blob.size > 0) {
          onAudioReady(blob)
        }
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
    const elapsed = Date.now() - startTimeRef.current
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      if (elapsed < MIN_DURATION_MS) {
        // Too short — wait for minimum duration before stopping
        const remaining = MIN_DURATION_MS - elapsed
        setTimeout(() => {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop()
          }
          recorderRef.current = null
          setIsRecording(false)
        }, remaining)
        return
      }
      recorderRef.current.stop()
    }
    recorderRef.current = null
    setIsRecording(false)
  }

  return { isRecording, startRecording, stopRecording }
}
