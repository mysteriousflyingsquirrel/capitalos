// Firebase configuration and initialization
import { initializeApp } from "firebase/app"
import { getAnalytics } from "firebase/analytics"
import { getAuth, GoogleAuthProvider } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC8ebAZsCxozD6xCF2hqB5vokJnrEH6-B4",
  authDomain: "capitalos-a24f7.firebaseapp.com",
  projectId: "capitalos-a24f7",
  storageBucket: "capitalos-a24f7.firebasestorage.app",
  messagingSenderId: "639751428084",
  appId: "1:639751428084:web:9f35c96d07da27aa2e0ba1",
  measurementId: "G-9VXC3P4DX9"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Analytics (only in browser, not SSR)
let analytics: ReturnType<typeof getAnalytics> | null = null
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app)
}

// Initialize Auth with Google provider
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()

// Initialize Firestore
export const db = getFirestore(app)

export { app, analytics }

