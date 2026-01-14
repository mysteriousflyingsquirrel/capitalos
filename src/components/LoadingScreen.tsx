import { useState, useEffect, useRef } from 'react'

const LOADING_MESSAGES = [
  'Taking a dump...',
  'Aligning the planets...',
  'Feeding the cats...',
  'Counting your money (again)...',
  'Asking the blockchain nicely...',
  'Waking up the servers...',
  'Negotiating with the APIs...',
  'Bribing the database...',
  'Calculating risk like a Jedi...',
  'Loading… please don\'t blink.',
  'Making numbers look smart...',
  'Shaking hands with exchanges...',
  'Summoning financial wisdom...',
  'Polishing the dashboard...',
  'Finding missing decimals...',
  'Asking Kraken politely...',
  'Convincing data to behave...',
  'Charging the money printer...',
  'Making charts feel important...',
  'Consulting the crystal ball...',
  'Turning coffee into code...',
  'Herding wild JSON objects...',
  'Checking if math still works...',
  'Optimizing imaginary profits...',
  'Calibrating financial lasers...',
  'Fighting rounding errors...',
  'Feeding the hamsters…',
  'Synchronizing timelines...',
  'Pretending this is instant...',
  'Almost there… probably.',
]

const MESSAGE_INTERVAL = 1500

function LoadingScreen() {
  const [currentMessage, setCurrentMessage] = useState('')
  const [messageOpacity, setMessageOpacity] = useState(1)
  const previousMessageIndexRef = useRef(-1)

  useEffect(() => {
    const getRandomMessage = (): string => {
      let randomIndex: number
      do {
        randomIndex = Math.floor(Math.random() * LOADING_MESSAGES.length)
      } while (randomIndex === previousMessageIndexRef.current)
      
      previousMessageIndexRef.current = randomIndex
      return LOADING_MESSAGES[randomIndex]
    }

    setCurrentMessage(getRandomMessage())

    const interval = setInterval(() => {
      setMessageOpacity(0)
      setTimeout(() => {
        setCurrentMessage(getRandomMessage())
        setMessageOpacity(1)
      }, 200)
    }, MESSAGE_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-page">
      <div className="text-center">
        <div 
          className="text-highlight-yellow text-2xl font-medium mb-4 transition-opacity duration-200"
          style={{ opacity: messageOpacity }}
        >
          {currentMessage}
        </div>
        <div className="flex justify-center space-x-1">
          <div className="w-2 h-2 bg-highlight-yellow rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-highlight-yellow rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-highlight-yellow rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen

