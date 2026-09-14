/**
 * Placeholder data and utilities for the Worker view's
 * withdraw-to-local-currency flow (SEP-24 Anchor integration).
 *
 * In production, exchange rates come from the Anchor's SEP-38 price oracle,
 * balances come from Horizon via AnchorClient/TruvoClient, and the
 * interactive URL comes from AnchorClient.initiateWithdrawal.
 */

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  /** Estimated exchange rate per 1 XLM (mirrors SEP-38 test anchor rates). */
  ratePerXlm: number;
}

export const SUPPORTED_LOCAL_CURRENCIES: CurrencyOption[] = [
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", ratePerXlm: 2340.5 },
  { code: "USD", name: "US Dollar", symbol: "$", ratePerXlm: 0.125 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", ratePerXlm: 16.2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", ratePerXlm: 0.68 },
  { code: "EUR", name: "Euro", symbol: "€", ratePerXlm: 0.115 },
];

/**
 * Computes estimated local currency value for a given XLM amount.
 */
export function estimateLocalValue(
  xlmAmount: number | string,
  currencyCode: string = "NGN",
): { estimate: string; formatted: string; rate: number } {
  const amountNum = typeof xlmAmount === "string" ? parseFloat(xlmAmount) || 0 : xlmAmount;
  const currency =
    SUPPORTED_LOCAL_CURRENCIES.find((c) => c.code === currencyCode) ||
    SUPPORTED_LOCAL_CURRENCIES[0];

  const value = amountNum * currency.ratePerXlm;
  const formatted = `${currency.symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency.code}`;

  return {
    estimate: value.toFixed(2),
    formatted,
    rate: currency.ratePerXlm,
  };
}

/**
 * Generates a mock SEP-24 interactive withdrawal result matching the SDK's
 * InitiateWithdrawalResult (sdk/src/anchor/client.ts).
 */
export function generateMockSep24Withdrawal(
  account: string,
  amount: string,
  assetCode: string = "XLM",
): {
  transactionId: string;
  interactiveUrl: string;
  type: string;
} {
  const transactionId = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const encodedAccount = encodeURIComponent(account);
  const interactiveUrl = `https://testanchor.stellar.org/sep24/interactive?transaction_id=${transactionId}&asset_code=${encodeURIComponent(
    assetCode,
  )}&amount=${encodeURIComponent(amount)}&account=${encodedAccount}&step=withdraw`;

  return {
    transactionId,
    interactiveUrl,
    type: "interactive_customer_info_needed",
  };
}
