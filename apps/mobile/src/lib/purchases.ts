import { VIDEO_PRODUCT_ID, type Me } from '@insidejoke/shared';
import Purchases, { LOG_LEVEL, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { track } from './analytics';

/**
 * In development builds, RevenueCat's Test Store key (if set) wins, so purchases work in the
 * Simulator without Apple. Release builds always use the App Store key: the SDK crashes a release
 * build that has a Test Store key.
 */
const apiKey =
  (__DEV__ && process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY) ||
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
let configuredFor: string | null = null;

/**
 * RevenueCat logs a cancelled purchase as an error, which shows a red error screen in development.
 * Cancelling is normal and `buyVideo` handles it, so it's logged quietly.
 */
function revenueCatLog(level: LOG_LEVEL, message: string) {
  const line = `[RevenueCat] ${message}`;
  if (level === LOG_LEVEL.ERROR && !/purchase was cancelled/i.test(message)) console.error(line);
  else if (level === LOG_LEVEL.WARN) console.warn(line);
  else if (level !== LOG_LEVEL.DEBUG && level !== LOG_LEVEL.VERBOSE) console.log(line);
}

/**
 * Sets RevenueCat up for this user. RevenueCat's app user id is our user id, so its webhook can
 * credit the right account.
 */
export function configurePurchases(userId: string) {
  if (!apiKey || configuredFor === userId) return;
  if (configuredFor === null) {
    Purchases.setLogHandler(revenueCatLog);
    Purchases.configure({ apiKey, appUserID: userId });
  } else {
    void Purchases.logIn(userId);
  }
  configuredFor = userId;
}

/** The video's price in the user's App Store currency, such as "$4.99". */
export async function videoPrice(): Promise<string | null> {
  if (!configuredFor) return null;
  const [product] = await Purchases.getProducts([VIDEO_PRODUCT_ID]).catch(() => []);
  return product?.priceString ?? null;
}

export type BuyResult = 'bought' | 'cancelled' | 'pending';

/**
 * Buys one video through Apple, then waits for RevenueCat's webhook to put the credit on the
 * account. 'pending' means Apple took the payment but the credit hasn't shown up yet.
 */
export async function buyVideo(loadMe: () => Promise<Me>): Promise<BuyResult> {
  if (!configuredFor) throw new Error('purchases are not configured');
  const before = (await loadMe()).videoCredits;
  track('purchase_started');
  try {
    const [product] = await Purchases.getProducts([VIDEO_PRODUCT_ID]);
    if (!product) throw new Error(`product ${VIDEO_PRODUCT_ID} not found`);
    await Purchases.purchaseStoreProduct(product);
  } catch (e) {
    if ((e as { code?: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      track('purchase_cancelled');
      return 'cancelled';
    }
    throw e;
  }
  track('purchase_completed');
  for (let i = 0; i < 15; i++) {
    if ((await loadMe()).videoCredits > before) return 'bought';
    await new Promise((r) => setTimeout(r, 1000));
  }
  return 'pending';
}
