// NOTE: Creates a secure withdrawal request.
// The backend independently verifies the Telegram user, coin balance,
// referral count, withdrawal amount, and then atomically deducts coins
// before creating the PENDING withdrawal record.

import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import {
  db,
} from "../_lib/firebase.js";

import {
  getTelegramUserFromInitData,
} from "../_lib/telegramAuth.js";

import {
  COINS_PER_RUPEE,
  MINIMUM_WITHDRAW_RS,
  MINIMUM_WITHDRAW_COINS,
  MINIMUM_REFERRALS,
} from "../_lib/constants.js";


// NOTE: Vercel serverless API endpoint for withdrawal requests.

export default async function handler(
  req,
  res
) {

  // NOTE: Only POST requests are allowed for creating withdrawals.

  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });

    return;
  }


  try {

    // NOTE: Read the genuine Telegram Mini App initData
    // and the withdrawal details supplied by the frontend.

    const initData =
      req.body?.initData;

    const upi =
      String(
        req.body?.upi || ""
      ).trim();

    const requestedCoins =
      Number(
        req.body?.coins
      );


    // NOTE: Verify Telegram identity before touching the user's
    // balance or creating any withdrawal document.

    const telegramUser =
      getTelegramUserFromInitData(
        initData
      );


    const userId =
      String(
        telegramUser.id
      );


    // NOTE: Validate the UPI/VPA input at the API boundary.

    if (
      !upi ||
      upi.length < 3 ||
      upi.length > 128 ||
      /\s/.test(upi)
    ) {
      res.status(400).json({
        ok: false,
        error:
          "Invalid UPI ID.",
      });

      return;
    }


    // NOTE: Withdrawal amount must be a positive whole number
    // of coins and must respect the 10 coins = ₹1 conversion.

    if (
      !Number.isSafeInteger(
        requestedCoins
      ) ||
      requestedCoins <= 0
    ) {
      res.status(400).json({
        ok: false,
        error:
          "Invalid withdrawal amount.",
      });

      return;
    }


    if (
      requestedCoins %
        COINS_PER_RUPEE !==
      0
    ) {
      res.status(400).json({
        ok: false,
        error:
          "Withdrawal amount must use a valid coin-to-rupee conversion.",
      });

      return;
    }


    // NOTE: The minimum withdrawal is enforced server-side.
    // This cannot be bypassed by changing the frontend.

    if (
      requestedCoins <
      MINIMUM_WITHDRAW_COINS
    ) {
      res.status(400).json({
        ok: false,
        error:
          `Minimum withdrawal is ₹${MINIMUM_WITHDRAW_RS}.`,
        minimum_coins:
          MINIMUM_WITHDRAW_COINS,
        minimum_rs:
          MINIMUM_WITHDRAW_RS,
      });

      return;
    }


    const userRef =
      doc(
        db,
        "users",
        userId
      );


    // NOTE: Balance verification, referral verification,
    // coin deduction, and withdrawal creation happen inside
    // one Firestore transaction to prevent race conditions
    // and double withdrawals.

    let withdrawalId = "";
    let withdrawalCoins = 0;
    let withdrawalAmountRs = 0;


    await runTransaction(
      db,
      async (transaction) => {

        const userSnapshot =
          await transaction.get(
            userRef
          );


        if (
          !userSnapshot.exists()
        ) {
          throw new Error(
            "User account not found."
          );
        }


        const userData =
          userSnapshot.data();


        // NOTE: Read the current server-side coin balance.
        // Never trust the amount displayed by the frontend.

        const currentCoins =
          Number(
            userData.coins || 0
          );


        // NOTE: "reffer" is the existing referral-count field
        // used by the current backend referral reward system.

        const referralCount =
          Number(
            userData.reffer || 0
          );


        // NOTE: Both requirements are mandatory:
        // minimum ₹300 balance AND minimum 6 valid referrals.

        if (
          currentCoins <
          MINIMUM_WITHDRAW_COINS
        ) {
          throw new Error(
            `Minimum ₹${MINIMUM_WITHDRAW_RS} balance chahiye.`
          );
        }


        if (
          referralCount <
          MINIMUM_REFERRALS
        ) {
          throw new Error(
            `${MINIMUM_REFERRALS} referrals chahiye.`
          );
        }


        // NOTE: The requested withdrawal cannot exceed
        // the user's current server-side coin balance.

        if (
          requestedCoins >
          currentCoins
        ) {
          throw new Error(
            "Insufficient coin balance."
          );
        }


        withdrawalCoins =
          requestedCoins;


        withdrawalAmountRs =
          requestedCoins /
          COINS_PER_RUPEE;


        // NOTE: Create a unique withdrawal document inside
        // the same transaction as the coin deduction.

        const withdrawalRef =
          doc(
            db,
            "withdrawals"
          );


        withdrawalId =
          withdrawalRef.id;


        // NOTE: Deduct the requested coins atomically.
        // This prevents two simultaneous withdrawal requests
        // from spending the same balance.

        transaction.update(
          userRef,
          {
            coins:
              currentCoins -
              requestedCoins,
          }
        );


        // NOTE: New withdrawal records use the canonical schema:
        // user_id, coins, amount_rs, status, created_at, and upi.

        transaction.set(
          withdrawalRef,
          {
            user_id:
              userId,

            coins:
              requestedCoins,

            amount_rs:
              withdrawalAmountRs,

            status:
              "PENDING",

            created_at:
              serverTimestamp(),

            upi:
              upi,
          }
        );
      }
    );


    // NOTE: Return the created withdrawal information only
    // after the Firestore transaction has successfully committed.

    res.status(200).json({
      ok: true,

      withdrawal_id:
        withdrawalId,

      coins:
        withdrawalCoins,

      amount_rs:
        withdrawalAmountRs,

      status:
        "PENDING",
    });

  } catch (error) {

    console.error(
      "Withdrawal request error:",
      error
    );


    res.status(400).json({
      ok: false,
      error:
        error?.message ||
        "Unable to create withdrawal request.",
    });
  }
}
