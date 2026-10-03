// NOTE: Creates a new server-side ad session.
// The session belongs to the authenticated Telegram user and starts
// the server-side 30-second anti-cheat timer.

import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  db,
} from "../_lib/firebase.js";

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

const method = String(req.method || "").toUpperCase();

if (method === "OPTIONS") {
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

  return res.status(204).end();
}

if (method !== "POST") {
  return res.status(405).json({
    ok: false,
    error: "Method not allowed",
  });
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


    // NOTE: Generate a unique Firestore document ID for this ad session.

    const sessionRef =
      doc(
        collection(
          db,
          "ad_sessions"
        )
      );


    const sessionId =
      sessionRef.id;


    // NOTE: Store the session server-side.
    // The server timestamp becomes the authoritative starting point.

    await setDoc(
      sessionRef,
      {
        id: sessionId,

        user_id: userId,

        started_at:
          serverTimestamp(),

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
