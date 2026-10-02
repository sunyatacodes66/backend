// NOTE: Shared server-side Firebase initialization.
// This file will be reused by ad and withdrawal API routes,
// so Firebase configuration does not need to be duplicated in every API file.

import { initializeApp, getApps } from "firebase/app";

import {
  getFirestore,
} from "firebase/firestore";


// NOTE: Firebase configuration is read from Vercel environment variables.
// No Firebase credentials are hard-coded in this file.

const firebaseConfig = {
  apiKey:
    process.env.FIREBASE_API_KEY || "",

  authDomain:
    process.env.FIREBASE_AUTH_DOMAIN || "",

  projectId:
    process.env.FIREBASE_PROJECT_ID || "",

  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET || "",

  messagingSenderId:
    process.env.FIREBASE_MESSAGING_SENDER_ID || "",

  appId:
    process.env.FIREBASE_APP_ID || "",
};


// NOTE: Validate that all required Firebase environment variables exist
// before any new API route attempts to use Firestore.

const missingFirebaseConfig = Object.entries(
  firebaseConfig
)
  .filter(([, value]) => !value)
  .map(([key]) => key);


if (missingFirebaseConfig.length > 0) {
  throw new Error(
    "Missing Firebase environment variables: " +
      missingFirebaseConfig.join(", ")
  );
}


// NOTE: Reuse an already initialized Firebase app when Vercel
// reuses the same serverless runtime, otherwise initialize it once.

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);


// NOTE: Export the shared Firestore instance for all new API routes.

const db = getFirestore(firebaseApp);


export {
  db,
  firebaseApp,
};
