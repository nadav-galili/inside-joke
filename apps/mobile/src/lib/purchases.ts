import { VIDEO_PRODUCT_ID, type Me } from '@insidejoke/shared';
import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { track } from './analytics';

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
let configuredFor: string | null = null;

/**
 * Sets RevenueCat up for this user. RevenueCat's app user id is our user id, so its webhook can
 * credit the right account.
 */
export function configurePurchases(userId: string) {
  if (!apiKey || configuredFor === userId) return;
  if (configuredFor === null) Purchases.configure({ apiKey, appUserID: userId });
  else void Purchases.logIn(userId);
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
