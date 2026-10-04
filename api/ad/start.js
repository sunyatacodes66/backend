// NOTE: Creates a new server-side ad session.
// The session belongs to the authenticated Telegram user and starts
// the server-side 30-second anti-cheat timer.

// NOTE (ADMIN MIGRATION): This file now uses the Firebase Admin SDK
// (adminDb + FieldValue from firebaseAdmin.js) instead of the client SDK.
// The behaviour is the same: same fields, same response, same timer logic.

import {
  adminDb,
  FieldValue,
} from "../_lib/firebaseAdmin.js";

import {
  getTelegramUserFromInitData,
} from "../_lib/telegramAuth.js";

import {
  AD_REWARD_COINS,
  AD_TIMER_SECONDS,
} from "../_lib/constants.js";


// NOTE: Vercel serverless API endpoint for starting an ad session.

export default async function handler(
  req,
  res
) {

  // NOTE: CORS headers - only the Mini App's GitHub Pages origin is allowed.

  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://sunyatacodes66.github.io"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  // NOTE (CHANGED): The browser's preflight (OPTIONS) request now gets an
  // empty 204 response, same as complete.js and request.js. The old debug
  // console.log and the temporary "OPTIONS_REACHED" test response were removed.

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {

    // NOTE: Read Telegram Mini App initData from the request body.
    // The frontend must send the real Telegram WebApp initData.

    const initData =
      req.body?.initData;


    // NOTE: Verify Telegram initData before creating any session.
    // This prevents arbitrary users from creating sessions for another user.

    const telegramUser =
      getTelegramUserFromInitData(
        initData
      );


    const userId =
      String(
        telegramUser.id
      );


    // NOTE (CHANGED): Admin SDK way to get a new document with an
    // auto-generated unique ID in the "ad_sessions" collection.
    // Old client SDK way was: doc(collection(db, "ad_sessions")).

    const sessionRef =
      adminDb
        .collection("ad_sessions")
        .doc();


    const sessionId =
      sessionRef.id;


    // NOTE (CHANGED): Store the session server-side using sessionRef.set(...)
    // (old client SDK way was setDoc(sessionRef, ...)).
    // FieldValue.serverTimestamp() makes Firestore's own clock the
    // authoritative starting point, so the user cannot fake the start time.

    await sessionRef.set(
      {
        id: sessionId,

        user_id: userId,

        started_at:
          FieldValue.serverTimestamp(),

        completed_at:
          null,

        status:
          "STARTED",

        coins_awarded:
          0,

        reward_coins:
          AD_REWARD_COINS,

        required_seconds:
          AD_TIMER_SECONDS,
      }
    );


    // NOTE: Return only the session information needed by the frontend.
    // The frontend must NOT decide or directly credit the reward.

    res.status(200).json({
      ok: true,

      session_id:
        sessionId,

      reward_coins:
        AD_REWARD_COINS,

      required_seconds:
        AD_TIMER_SECONDS,
    });

  } catch (error) {

    console.error(
      "Ad session start error:",
      error
    );


    res.status(401).json({
      ok: false,
      error:
        error?.message ||
        "Unable to start ad session.",
    });
  }
}
