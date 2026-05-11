import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            "AIzaSyCipq9kGRoox7r6UvXyyFD7FzRv_YU7dA0",
  authDomain:        "aura-lite-17acb.firebaseapp.com",
  projectId:         "aura-lite-17acb",
  storageBucket:     "aura-lite-17acb.firebasestorage.app",
  messagingSenderId: "839298453615",
  appId:             "1:839298453615:web:b8439c2691e6a8a4937d9a"
}

const app = initializeApp(firebaseConfig)
export const db  = getFirestore(app)
export const storage = getStorage(app)
export default app
