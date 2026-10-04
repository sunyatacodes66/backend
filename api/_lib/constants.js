// NOTE: Central server-side constants for ad rewards, withdrawal conversion,
// minimum withdrawal requirements, and referral requirements.
// These are NEW constants and do not modify the existing telegram webhook constants.

const AD_REWARD_COINS = 50;

const AD_TIMER_SECONDS = 20;

const COINS_PER_RUPEE = 10;

const MINIMUM_WITHDRAW_RS = 300;

const MINIMUM_WITHDRAW_COINS =
  MINIMUM_WITHDRAW_RS * COINS_PER_RUPEE;

const MINIMUM_REFERRALS = 6;

export {
  AD_REWARD_COINS,
  AD_TIMER_SECONDS,
  COINS_PER_RUPEE,
  MINIMUM_WITHDRAW_RS,
  MINIMUM_WITHDRAW_COINS,
  MINIMUM_REFERRALS,
};
