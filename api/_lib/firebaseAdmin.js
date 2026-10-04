// NOTE: Firebase Admin SDK (server-only). Bypasses Firestore rules.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!rawServiceAccount) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT is missing.");
}

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(JSON.parse(rawServiceAccount)),
      });

const adminDb = getFirestore(adminApp);

export { adminDb, FieldValue };
