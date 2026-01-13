import { useState, useEffect, useRef } from 'react'
import Heading from './Heading'

const funnyMessages = [
  'Baking bread...',
  'Taking a poop...',
  'Counting money...',
  'Petting the cat...',
  'Making coffee...',
  'Stretching legs...',
  'Checking crypto prices...',
  'Asking the oracle...',
  'Consulting the stars...',
  'Reading tea leaves...',
  'Summoning data...',
  'Polishing diamonds...',
  'Feeding the hamsters...',
  'Waking up servers...',
  'Brewing magic potions...',
  'Training AI models...',
  'Charging crystals...',
  'Aligning planets...',
  'Calibrating sensors...',
  'Warming up engines...',
]

interface LoadingScreenProps {
  message?: string
}

export default function LoadingScreen({ message }: LoadingScreenProps) {
  // Start with a random message index
  const [messageIndex, setMessageIndex] = useState(() => 
    Math.floor(Math.random() * funnyMessages.length)
  )
  const [currentMessage, setCurrentMessage] = useState(
    message || funnyMessages[messageIndex]
  )
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasCustomMessageRef = useRef(!!message)

  // Update message when custom message prop changes
  useEffect(() => {
    const hasCustomMessage = !!message
    const hadCustomMessage = hasCustomMessageRef.current

    if (hasCustomMessage) {
      // Custom message provided - update it and stop rotation
      setCurrentMessage(message)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      hasCustomMessageRef.current = true
    } else if (hadCustomMessage && !hasCustomMessage) {
      // Switched from custom to no custom - start rotation
      hasCustomMessageRef.current = false
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setMessageIndex((prev) => {
            const nextIndex = (prev + 1) % funnyMessages.length
            setCurrentMessage(funnyMessages[nextIndex])
            return nextIndex
          })
        }, 4000)
      }
    }
    // If hadCustomMessage is false and hasCustomMessage is false, do nothing (rotation continues)
  }, [message])

  // Initialize rotation on mount if no custom message
  useEffect(() => {
    if (!message && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setMessageIndex((prev) => {
          const nextIndex = (prev + 1) % funnyMessages.length
          setCurrentMessage(funnyMessages[nextIndex])
          return nextIndex
        })
      }, 4000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-page">
      <div className="text-center">
        <Heading level={1} className="text-text-primary mb-4">
          Capitalos
        </Heading>
        <div className="text-text-secondary text-lg md:text-xl animate-pulse">
          {currentMessage}
        </div>
        <div className="mt-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-goldenrod"></div>
        </div>
      </div>
    </div>
  )
}
