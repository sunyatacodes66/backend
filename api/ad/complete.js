// NOTE: Completes an ad session and securely credits the reward.
// The server verifies Telegram identity, session ownership,
// session status, and the server-side elapsed time before awarding coins.

import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  increment,
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


// NOTE: Vercel serverless API endpoint for completing an ad session.

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

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  
  // NOTE: Only POST requests are allowed for completing ad sessions.

  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });

    return;
  }


  try {

    // NOTE: Read Telegram initData and the previously-created
    // server-side session ID from the frontend request.

    const initData =
      req.body?.initData;

    const sessionId =
      req.body?.session_id;


    if (
      typeof sessionId !== "string" ||
      !sessionId.trim()
    ) {
      res.status(400).json({
        ok: false,
        error:
          "Ad session ID is missing.",
      });

      return;
    }


    // NOTE: Verify Telegram initData before accessing the session.
    // The Telegram user ID obtained here is the authoritative user ID.

    const telegramUser =
      getTelegramUserFromInitData(
        initData
      );


    const userId =
      String(
        telegramUser.id
      );


    const sessionRef =
      doc(
        db,
        "ad_sessions",
        sessionId
      );


    const userRef =
      doc(
        db,
        "users",
        userId
      );


    // NOTE: Read the session before entering the transaction so that
    // obviously invalid/missing sessions can be rejected early.

    const sessionSnapshot =
      await getDoc(
        sessionRef
      );


    if (!sessionSnapshot.exists()) {
      res.status(404).json({
        ok: false,
        error:
          "Ad session not found.",
      });

      return;
    }


    const sessionData =
      sessionSnapshot.data();


    // NOTE: Make sure this session actually belongs to the
    // Telegram user making the request.

    if (
      String(
        sessionData.user_id
      ) !== userId
    ) {
      res.status(403).json({
        ok: false,
        error:
          "Ad session does not belong to this user.",
      });

      return;
    }


    // NOTE: The reward can only be processed while the session
    // is still STARTED. COMPLETED sessions can never receive
    // another reward.

    if (
      sessionData.status !==
      "STARTED"
    ) {
      res.status(409).json({
        ok: false,
        error:
          "Ad session has already been processed.",
      });

      return;
    }


    // NOTE: The frontend timer is NOT trusted.
    // We calculate elapsed time from the server-side Firestore timestamp.

    const startedAt =
      sessionData.started_at;


    if (
      !startedAt ||
      typeof startedAt.toMillis !==
        "function"
    ) {
      res.status(400).json({
        ok: false,
        error:
          "Invalid ad session timestamp.",
      });

      return;
    }


    const elapsedMilliseconds =
      Date.now() -
      startedAt.toMillis();


    const requiredMilliseconds =
      AD_TIMER_SECONDS * 1000;


    // NOTE: The server rejects completion if the required
    // minimum viewing time has not elapsed.

    if (
      elapsedMilliseconds <
      requiredMilliseconds
    ) {
      const remainingSeconds =
        Math.ceil(
          (
            requiredMilliseconds -
            elapsedMilliseconds
          ) / 1000
        );

      res.status(400).json({
        ok: false,
        error:
          "Ad viewing time is incomplete.",
        remaining_seconds:
          remainingSeconds,
      });

      return;
    }


    // NOTE: Atomically mark the session COMPLETED and credit
    // the user's coins. This prevents two simultaneous requests
    // from rewarding the same session twice.

let rewardGranted = false;
    
    await runTransaction(
      db,
      async (transaction) => {

        const freshSessionSnapshot =
          await transaction.get(
            sessionRef
          );


        if (
          !freshSessionSnapshot.exists()
        ) {
          throw new Error(
            "Ad session not found."
          );
        }


        const freshSessionData =
          freshSessionSnapshot.data();


        // NOTE: Re-check session ownership inside the transaction
        // because the earlier read must not be trusted during a race.

        if (
          String(
            freshSessionData.user_id
          ) !== userId
        ) {
          throw new Error(
            "Ad session does not belong to this user."
          );
        }


        // NOTE: Re-check the session status inside the transaction.
        // Only one request can successfully change STARTED → COMPLETED.

        // NOTE: Re-check the session status inside the transaction.
// A COMPLETED session is treated as an idempotent retry.
// It will NOT receive another coin reward.

if (
    freshSessionData.status ===
    "COMPLETED"
) {
    return;
}

if (
    freshSessionData.status !==
    "STARTED"
) {
    throw new Error(
        "Ad session has already been processed."
    );
}


        const freshStartedAt =
          freshSessionData.started_at;


        if (
          !freshStartedAt ||
          typeof freshStartedAt.toMillis !==
            "function"
        ) {
          throw new Error(
            "Invalid ad session timestamp."
          );
        }


        const freshElapsedMilliseconds =
          Date.now() -
          freshStartedAt.toMillis();


        if (
          freshElapsedMilliseconds <
          requiredMilliseconds
        ) {
          throw new Error(
            "Ad viewing time is incomplete."
          );
        }

rewardGranted = true;
        
        // NOTE: Mark the session as COMPLETED and store the exact
        // reward amount that was credited.

        transaction.update(
          sessionRef,
          {
            status:
              "COMPLETED",

            completed_at:
              serverTimestamp(),

            coins_awarded:
              AD_REWARD_COINS,
          }
        );


        // NOTE: Credit coins and task completion atomically with
        // the session completion.

        transaction.update(
          userRef,
          {
            coins:
              increment(
                AD_REWARD_COINS
              ),

            tasksCompleted:
              increment(1),
          }
        );
      }
    );


    // NOTE: Return a successful result only after the transaction
    // has completed successfully.

   res.status(200).json({
    ok: true,

    session_id:
        sessionId,

    coins_awarded:
        rewardGranted
            ? AD_REWARD_COINS
            : 0,

    message:
        rewardGranted
            ? "Ad completed successfully."
            : "Ad session was already completed.",
});

  } catch (error) {

    console.error(
      "Ad completion error:",
      error
    );


    res.status(400).json({
      ok: false,
      error:
        error?.message ||
        "Unable to complete ad.",
    });
  }
}
