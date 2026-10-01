import TelegramBot from "node-telegram-bot-api";

import { initializeApp, getApps } from "firebase/app";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

/*
========================================================
TELEGRAM BOT BACKEND
Vercel Serverless + Telegram Webhook + Firestore

Required Vercel Environment Variables:

BOT_TOKEN
WEBHOOK_SECRET
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID

Optional:

WEB_APP_URL
WELCOME_IMAGE_URL
========================================================
*/


// ======================================================
// 1. ENVIRONMENT VARIABLES
// ======================================================

const BOT_TOKEN = process.env.BOT_TOKEN;

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const WEB_APP_URL =
  process.env.WEB_APP_URL ||
  "https://sunyatacodes66.github.io/tgearnnow";

const WELCOME_IMAGE_URL =
  process.env.WELCOME_IMAGE_URL ||
  "https://i.imgur.com/kRnNNbM.jpeg";

const REFERRAL_REWARD = 20;


// ======================================================
// 2. BASIC VALIDATION
// ======================================================

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing.");
}


// ======================================================
// 3. FIREBASE CONFIG
// ======================================================

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId:
    process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.FIREBASE_APP_ID || "",
};


const missingFirebaseConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);


if (missingFirebaseConfig.length > 0) {
  throw new Error(
    "Missing Firebase environment variables: " +
      missingFirebaseConfig.join(", ")
  );
}


// ======================================================
// 4. INITIALIZE FIREBASE
// ======================================================

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp(firebaseConfig);

const db = getFirestore(firebaseApp);


// ======================================================
// 5. INITIALIZE TELEGRAM BOT
// ======================================================

const bot = new TelegramBot(BOT_TOKEN, {
  polling: false,
});


// ======================================================
// 6. REFERRAL ID VALIDATION
// ======================================================

function normalizeReferralId(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const referralId = String(value).trim();

  if (!referralId) {
    return null;
  }

  /*
  Telegram deep-link parameters normally use
  letters, numbers, underscore and hyphen.
  */

  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(
      referralId
    )
  ) {
    return null;
  }

  return referralId;
}


// ======================================================
// 7. EXTRACT /start REFERRAL
// ======================================================

function extractStartParameter(text) {
  if (typeof text !== "string") {
    return null;
  }

  const match = text
    .trim()
    .match(
      /^\/start(?:@\w+)?(?:\s+(.+))?$/i
    );

  if (!match) {
    return null;
  }

  return normalizeReferralId(
    match[1] || null
  );
}


// ======================================================
// 8. GET TELEGRAM PROFILE PHOTO
// TEMPORARILY DISABLED FOR DEBUGGING
// ======================================================

async function getTelegramPhotoUrl(userId) {
  console.log("PROFILE PHOTO TEST: skipped", userId);
  return "";
}
// ======================================================
// 9. CREATE OR ENSURE USER
// ======================================================

async function createOrEnsureUser(
  userId,
  firstName,
  photoURL,
  referralId
) {
  const userRef =
    doc(
      db,
      "users",
      String(userId)
    );

  const existing =
    await getDoc(userRef);


  // ----------------------------------------------------
  // NEW USER
  // ----------------------------------------------------

  if (!existing.exists()) {
    await setDoc(
      userRef,
      {
        id: String(userId),
        name:
          firstName ||
          "User",
        photoURL:
          photoURL ||
          "",
        coins: 0,
        reffer: 0,
        refferBy:
          referralId ||
          null,
        tasksCompleted: 0,
        totalWithdrawals: 0,
        frontendOpened: true,
        rewardGiven: false,
      }
    );

    return;
  }


  // ----------------------------------------------------
  // EXISTING USER
  // ----------------------------------------------------

  const current =
    existing.data() || {};

  const updates = {
    frontendOpened: true,
  };


  /*
  Do not overwrite refferBy
  or rewardGiven.
  */

  if (
    firstName &&
    firstName !== current.name
  ) {
    updates.name =
      firstName;
  }


  if (
    photoURL &&
    photoURL !== current.photoURL
  ) {
    updates.photoURL =
      photoURL;
  }


  await updateDoc(
    userRef,
    updates
  );
}


// ======================================================
// 10. PROCESS REFERRAL REWARD
// ======================================================

async function processReferralReward(
  userId
) {
  const currentUserRef =
    doc(
      db,
      "users",
      String(userId)
    );


  /*
  The reward ledger uses the referred user's
  Telegram ID as its document ID.

  Therefore the same user can never create
  another reward ledger entry.
  */

  const rewardRef =
    doc(
      db,
      "ref_rewards",
      String(userId)
    );


  return runTransaction(
    db,
    async (transaction) => {

      // ------------------------------------------------
      // READ CURRENT USER
      // ------------------------------------------------

      const currentUserSnapshot =
        await transaction.get(
          currentUserRef
        );


      if (
        !currentUserSnapshot.exists()
      ) {
        return {
          granted: false,
          reason: "user_not_found",
        };
      }


      const currentUser =
        currentUserSnapshot.data() || {};


      // ------------------------------------------------
      // READ REWARD LEDGER
      // ------------------------------------------------

      const rewardSnapshot =
        await transaction.get(
          rewardRef
        );


      // ------------------------------------------------
      // REQUIRED CONDITIONS
      // ------------------------------------------------

      const frontendOpened =
        currentUser.frontendOpened === true;

      const rewardGiven =
        currentUser.rewardGiven === true;

      const referrerId =
        normalizeReferralId(
          currentUser.refferBy
        );


      if (
        !frontendOpened ||
        rewardGiven ||
        !referrerId
      ) {
        return {
          granted: false,
          reason: "conditions_not_met",
        };
      }


      // ------------------------------------------------
      // DUPLICATE PROTECTION
      // ------------------------------------------------

      if (
        rewardSnapshot.exists()
      ) {
        transaction.update(
          currentUserRef,
          {
            rewardGiven: true,
          }
        );

        return {
          granted: false,
          reason: "already_rewarded",
        };
      }


      // ------------------------------------------------
      // SELF REFERRAL PROTECTION
      // ------------------------------------------------

      if (
        referrerId ===
        String(userId)
      ) {
        transaction.update(
          currentUserRef,
          {
            rewardGiven: true,
          }
        );

        return {
          granted: false,
          reason: "self_referral",
        };
      }


      // ------------------------------------------------
      // GET REFERRER
      // ------------------------------------------------

      const referrerRef =
        doc(
          db,
          "users",
          referrerId
        );


      const referrerSnapshot =
        await transaction.get(
          referrerRef
        );


      if (
        !referrerSnapshot.exists()
      ) {
        /*
        Referrer doesn't exist.
        Mark reward as handled so the same
        webhook cannot repeatedly attempt it.
        */

        transaction.update(
          currentUserRef,
          {
            rewardGiven: true,
          }
        );

        return {
          granted: false,
          reason: "referrer_not_found",
        };
      }


      // ------------------------------------------------
      // REWARD REFERRER
      // ------------------------------------------------

      transaction.update(
        referrerRef,
        {
          coins:
            increment(
              REFERRAL_REWARD
            ),

          reffer:
            increment(1),
        }
      );


      // ------------------------------------------------
      // MARK CURRENT USER REWARD GIVEN
      // ------------------------------------------------

      transaction.update(
        currentUserRef,
        {
          rewardGiven: true,
        }
      );


      // ------------------------------------------------
      // CREATE REWARD LEDGER
      // ------------------------------------------------

      transaction.set(
        rewardRef,
        {
          userId:
            String(userId),

          referrerId:
            referrerId,

          reward:
            REFERRAL_REWARD,

          createdAt:
            serverTimestamp(),
        }
      );


      return {
        granted: true,
        referrerId:
          referrerId,

        reward:
          REFERRAL_REWARD,
      };
    }
  );
}


// ======================================================
// 11. UPDATE FIELD
// ======================================================

async function updateField(
  userId,
  field,
  value
) {
  const userRef =
    doc(
      db,
      "users",
      String(userId)
    );


  await updateDoc(
    userRef,
    {
      [field]: value,
    }
  );
}


// ======================================================
// 12. INCREMENT FIELD
// ======================================================

async function incrementField(
  userId,
  field,
  amount
) {
  const userRef =
    doc(
      db,
      "users",
      String(userId)
    );


  await updateDoc(
    userRef,
    {
      [field]:
        increment(amount),
    }
  );
}


// ======================================================
// 13. SEND WELCOME MESSAGE
// ======================================================

async function sendWelcomeMessage(chatId, firstName) {
  const safeName = String(firstName || "User").slice(0, 64);

  console.log("=== TEXT MESSAGE TEST ===");
  console.log(
    "BOT TOKEN PREFIX:",
    BOT_TOKEN ? BOT_TOKEN.slice(0, 8) : "MISSING"
  );
  console.log("Chat ID:", chatId);

  try {
    const result = await bot.sendMessage(
      chatId,
      `Hello ${safeName}! 👋

This is a Telegram text-message test.

If you can see this message, sendMessage is working correctly.`
    );

    console.log("=== sendMessage SUCCESS ===");
    console.log("Message ID:", result?.message_id);

    return result;
  } catch (error) {
    console.error("=== sendMessage FAILED ===");
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error code:", error?.code);

    throw error;
  }
}


// ======================================================
// 14. HANDLE TELEGRAM UPDATE
// ======================================================

async function handleTelegramUpdate(
  update
) {
  const message =
    update?.message;


  if (
    !message ||
    !message.from ||
    !message.chat
  ) {
    return;
  }


  const text =
    typeof message.text === "string"
      ? message.text
      : "";


  /*
  This backend handles /start.
  */

  if (
    !/^\/start(?:@\w+)?(?:\s+.*)?$/i.test(
      text.trim()
    )
  ) {
    return;
  }


  // ----------------------------------------------------
  // TELEGRAM USER DATA
  // ----------------------------------------------------

  const telegramUser =
    message.from;


  const userId =
    String(
      telegramUser.id
    );


  const firstName =
    telegramUser.first_name ||
    "User";


  // ----------------------------------------------------
  // REFERRAL
  // ----------------------------------------------------

  const referralId =
    extractStartParameter(
      text
    );


  // ----------------------------------------------------
  // PROFILE PHOTO
  // ----------------------------------------------------

  const photoURL =
    await getTelegramPhotoUrl(
      telegramUser.id
    );


  // ----------------------------------------------------
  // CREATE / MERGE USER
  // ----------------------------------------------------

  await createOrEnsureUser(
    userId,
    firstName,
    photoURL,
    referralId
  );


  // ----------------------------------------------------
  // PROCESS REFERRAL REWARD
  // ----------------------------------------------------

  await processReferralReward(
    userId
  );


  // ----------------------------------------------------
  // SEND WELCOME MESSAGE
  // ----------------------------------------------------

  await sendWelcomeMessage(
    message.chat.id,
    firstName
  );
}


// ======================================================
// 15. VERCEL SERVERLESS HANDLER
// ======================================================

export default async function handler(
  req,
  res
) {

  // ----------------------------------------------------
  // ONLY POST ALLOWED
  // ----------------------------------------------------

  if (
    req.method !== "POST"
  ) {
    res.status(405).json({
      ok: false,
      error:
        "Method not allowed",
    });

    return;
  }


  // ----------------------------------------------------
  // TELEGRAM SECRET TOKEN CHECK
  // ----------------------------------------------------

  if (WEBHOOK_SECRET) {

    const receivedSecret =
      req.headers[
        "x-telegram-bot-api-secret-token"
      ];


    if (
      receivedSecret !==
      WEBHOOK_SECRET
    ) {
      console.error(
        "Telegram webhook secret mismatch."
      );

      res.status(401).json({
        ok: false,
        error:
          "Unauthorized",
      });

      return;
    }
  }


  // ----------------------------------------------------
  // GET TELEGRAM UPDATE
  // ----------------------------------------------------

  let update =
    req.body;


  if (
    typeof update === "string"
  ) {
    try {
      update =
        JSON.parse(update);
    } catch (error) {
      res.status(400).json({
        ok: false,
        error:
          "Invalid JSON",
      });

      return;
    }
  }


  if (
    !update ||
    typeof update !== "object"
  ) {
    res.status(400).json({
      ok: false,
      error:
        "Invalid Telegram update",
    });

    return;
  }


  // ----------------------------------------------------
  // PROCESS COMPLETE REQUEST
  // ----------------------------------------------------

  try {

    await handleTelegramUpdate(
      update
    );


    /*
    One request completed.

    No polling.
    No loops.
    No intervals.
    No background workers.
    No realtime listeners.
    */

    res.status(200).json({
      ok: true,
    });

  } catch (error) {

    console.error(
      "Telegram webhook error:",
      error
    );


    res.status(500).json({
      ok: false,
      error:
        "Internal server error",
    });
  }
}


// ======================================================
// 16. EXPORT REQUIRED FUNCTIONS
// ======================================================

export {
  createOrEnsureUser,
  processReferralReward,
  updateField,
  incrementField,
};
