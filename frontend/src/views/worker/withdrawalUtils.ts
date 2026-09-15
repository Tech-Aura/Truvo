/**
 * Currency definitions and utilities for the Worker view's
 * withdraw-to-local-currency flow (SEP-24 Anchor integration).
 *
 * Exchange rates are now fetched from the Anchor's SEP-38 price oracle
 * via the SDK's estimateLocalCurrencyValue method. These static rates
 * are only used as fallbacks when the oracle is unavailable.
 */

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  /** Fallback exchange rate per 1 XLM (mirrors SEP-38 test anchor rates). */
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
 * Fallback local currency estimation when the SEP-38 oracle is unavailable.
 * In production, use the SDK's estimateLocalCurrencyValue method instead.
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
