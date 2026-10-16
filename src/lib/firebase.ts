// Firebase bootstrap: initialize App/Auth/Firestore
// Note: These public client keys are fine to ship; consider moving to Vite env vars later if preferred.

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { shouldUseEmulator } from './emulatorGuard';
// Storage not used: free plan alternative uses local IndexedDB

// Your web app's Firebase configuration (loaded from Vite env)
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const {
  VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID,
  VITE_FIREBASE_EMULATOR,
} = import.meta.env;

// Throws before any Firebase call if emulator mode is paired with a non-demo project
const useEmulator = shouldUseEmulator(VITE_FIREBASE_EMULATOR, VITE_FIREBASE_PROJECT_ID);

const firebaseConfig = {
  apiKey: VITE_FIREBASE_API_KEY,
  authDomain: VITE_FIREBASE_AUTH_DOMAIN,
  projectId: VITE_FIREBASE_PROJECT_ID,
  storageBucket: VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: VITE_FIREBASE_APP_ID,
  measurementId: VITE_FIREBASE_MEASUREMENT_ID,
} as const;

// Singleton App
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Core services
const auth: Auth = getAuth(app);
if (useEmulator) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
// Initialize Firestore with persistent local cache (modern API)
let firestore: Firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({
        // In environments without localStorage (e.g., web workers), take ownership
        forceOwnership: typeof window === 'undefined' || !(('localStorage' in globalThis))
      })
    })
  });
} catch {
  // Fallback to default init if custom cache fails (should be rare)
  firestore = initializeFirestore(app, {});
}
if (useEmulator) connectFirestoreEmulator(firestore, '127.0.0.1', 8080);

export { auth, firestore };