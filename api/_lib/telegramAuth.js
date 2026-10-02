// NOTE: Verifies Telegram Mini App initData on the server.
// This prevents the frontend from simply sending a fake Telegram user ID
// to the ad and withdrawal APIs.

import crypto from "crypto";


// NOTE: Telegram authentication data expires after this period.
// This helps prevent old initData from being reused indefinitely.

const TELEGRAM_AUTH_MAX_AGE_SECONDS = 86400;


// NOTE: Creates the secret key required by Telegram's Web App
// initData verification algorithm.

function createTelegramSecretKey(botToken) {
  return crypto
    .createHmac(
      "sha256",
      "WebAppData"
    )
    .update(botToken)
    .digest();
}


// NOTE: Verifies Telegram Web App initData and returns the authenticated
// Telegram user object only when the signature and timestamp are valid.

function verifyTelegramInitData(initData) {
  if (
    typeof initData !== "string" ||
    !initData.trim()
  ) {
    throw new Error(
      "Telegram initData is missing."
    );
  }


  const BOT_TOKEN =
    process.env.BOT_TOKEN;


  if (!BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN is missing."
    );
  }


  const params =
    new URLSearchParams(
      initData
    );


  const receivedHash =
    params.get("hash");


  if (!receivedHash) {
    throw new Error(
      "Telegram initData hash is missing."
    );
  }


  params.delete("hash");


  const dataCheckString =
    [...params.entries()]
      .sort(
        ([keyA], [keyB]) =>
          keyA.localeCompare(keyB)
      )
      .map(
        ([key, value]) =>
          `${key}=${value}`
      )
      .join("\n");


  const secretKey =
    createTelegramSecretKey(
      BOT_TOKEN
    );


  const calculatedHash =
    crypto
      .createHmac(
        "sha256",
        secretKey
      )
      .update(dataCheckString)
      .digest("hex");


  const receivedHashBuffer =
    Buffer.from(
      receivedHash,
      "hex"
    );

  const calculatedHashBuffer =
    Buffer.from(
      calculatedHash,
      "hex"
    );


  if (
    receivedHashBuffer.length !==
    calculatedHashBuffer.length
  ) {
    throw new Error(
      "Invalid Telegram initData signature."
    );
  }


  if (
    !crypto.timingSafeEqual(
      receivedHashBuffer,
      calculatedHashBuffer
    )
  ) {
    throw new Error(
      "Invalid Telegram initData signature."
    );
  }


  const authDate =
    Number(
      params.get("auth_date")
    );


  if (
    !Number.isFinite(authDate)
  ) {
    throw new Error(
      "Telegram auth_date is missing."
    );
  }


  const currentTime =
    Math.floor(
      Date.now() / 1000
    );


  if (
    currentTime - authDate >
    TELEGRAM_AUTH_MAX_AGE_SECONDS
  ) {
    throw new Error(
      "Telegram initData has expired."
    );
  }


  const userRaw =
    params.get("user");


  if (!userRaw) {
    throw new Error(
      "Telegram user data is missing."
    );
  }


  let telegramUser;


  try {
    telegramUser =
      JSON.parse(userRaw);
  } catch (error) {
    throw new Error(
      "Invalid Telegram user data."
    );
  }


  if (
    !telegramUser ||
    telegramUser.id === undefined ||
    telegramUser.id === null
  ) {
    throw new Error(
      "Invalid Telegram user."
    );
  }


  return telegramUser;
}


// NOTE: Small helper used by the API routes to consistently obtain
// the authenticated Telegram user from the request body.

function getTelegramUserFromInitData(
  initData
) {
  return verifyTelegramInitData(
    initData
  );
}


export {
  verifyTelegramInitData,
  getTelegramUserFromInitData,
};
