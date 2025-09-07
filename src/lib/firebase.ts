// Firebase bootstrap: initialize App/Auth/Firestore and safely expose Analytics
// Note: These public client keys are fine to ship; consider moving to Vite env vars later if preferred.

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported as analyticsIsSupported, type Analytics } from 'firebase/analytics';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
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
} = import.meta.env;

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
const firestore: Firestore = getFirestore(app);

// Analytics: only in the browser and when supported. Expose via a helper to avoid SSR build issues.
export async function getAnalyticsIfSupported(): Promise<Analytics | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    return (await analyticsIsSupported()) ? getAnalytics(app) : undefined;
  } catch {
    return undefined;
  }
}

export { app, auth, firestore };