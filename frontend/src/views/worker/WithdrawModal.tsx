/**
 * Withdraw to Local Currency Modal (SEP-24 Anchor Off-Ramp).
 *
 * Provides the worker off-ramp flow:
 * 1. Displays current wallet balance and estimated local-currency value.
 * 2. Allows selecting local currency (e.g. NGN, USD, KES, BRL, EUR) with live estimates.
 * 3. On click, calls the placeholder withdrawal handler (initiates SEP-24 interactive flow)
 *    and opens the anchor's interactive URL in a new tab or embedded webview.
 */

import { useState } from "react";
import {
  CurrencyOption,
  SUPPORTED_LOCAL_CURRENCIES,
  estimateLocalValue,
  generateMockSep24Withdrawal,
} from "./withdrawalUtils";

interface WithdrawModalProps {
  workerAddress: string;
  defaultAmount: string;
  availableBalance: string;
  onClose: () => void;
  onInitiateWithdrawalPlaceholder?: (
    assetCode: string,
    amount: string,
    account: string,
  ) => { transactionId: string; interactiveUrl: string };
}

function truncateMiddle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function WithdrawModal({
  workerAddress,
  defaultAmount,
  availableBalance,
  onClose,
  onInitiateWithdrawalPlaceholder = (assetCode, amount, account) => {
    console.log(
      "[placeholder] Truvo SDK initiateWithdrawal would be called with:",
      JSON.stringify({ assetCode, amount, account }, null, 2),
    );
    return generateMockSep24Withdrawal(account, amount, assetCode);
  },
}: WithdrawModalProps) {
  const [amount, setAmount] = useState(defaultAmount || availableBalance || "10");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("NGN");
  const [isInitiating, setIsInitiating] = useState(false);
  const [withdrawalSession, setWithdrawalSession] = useState<{
    transactionId: string;
    interactiveUrl: string;
  } | null>(null);
  const [showEmbeddedWebview, setShowEmbeddedWebview] = useState(false);

  const localEstimate = estimateLocalValue(amount, selectedCurrency);
  const totalBalanceEstimate = estimateLocalValue(availableBalance, selectedCurrency);

  const handleInitiate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsInitiating(true);

    try {
      const result = onInitiateWithdrawalPlaceholder("XLM", amount, workerAddress);
      setWithdrawalSession(result);

      // Open SEP-24 interactive URL in new tab
      window.open(result.interactiveUrl, "_blank", "noopener,noreferrer");
    } finally {
      setIsInitiating(false);
    }
  };

  const handleOpenNewTab = () => {
    if (withdrawalSession) {
      window.open(withdrawalSession.interactiveUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-container withdraw-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Withdraw to Local Currency</h3>
            <p className="hint">
              Off-ramp released earnings via Stellar SEP-24 Anchor integration.
            </p>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Anchor Info Banner */}
        <div className="anchor-badge-banner">
          <div className="anchor-badge-header">
            <span className="anchor-dot"></span>
            <strong>Stellar Anchor SEP-24 Interactive Off-Ramp</strong>
          </div>
          <p>
            Truvo connects you directly to regulated financial anchors (e.g.{" "}
            <code>testanchor.stellar.org</code>). You will complete KYC and input your
            local bank account or mobile money details in the anchor's secure portal.
          </p>
        </div>

        {/* Balance & Estimate Display */}
        <div className="withdraw-balance-cards">
          <div className="balance-item">
            <span className="balance-label">Connected Wallet</span>
            <span className="mono" title={workerAddress}>
              {truncateMiddle(workerAddress)}
            </span>
          </div>
          <div className="balance-item">
            <span className="balance-label">Total Spendable Balance</span>
            <div className="balance-value-row">
              <strong>{availableBalance} XLM</strong>
              <span className="balance-sub">({totalBalanceEstimate.formatted})</span>
            </div>
          </div>
        </div>

        {!withdrawalSession ? (
          <form onSubmit={handleInitiate} className="withdraw-form">
            <div className="form-field">
              <label htmlFor="withdraw-currency-select">
                Select Destination Currency:
              </label>
              <select
                id="withdraw-currency-select"
                className="currency-select"
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
              >
                {SUPPORTED_LOCAL_CURRENCIES.map((currency: CurrencyOption) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.name} ({currency.code}) — {currency.symbol}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <div className="field-label-row">
                <label htmlFor="withdraw-amount-input">Amount to Withdraw (XLM):</label>
                <button
                  type="button"
                  className="btn-max"
                  onClick={() => setAmount(availableBalance)}
                >
                  Use Max ({availableBalance} XLM)
                </button>
              </div>
              <input
                id="withdraw-amount-input"
                type="number"
                step="any"
                min="0.1"
                max={availableBalance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            {/* Estimated Payout Card */}
            <div className="estimate-summary-box">
              <div className="estimate-row">
                <span>Estimated Local Currency Payout:</span>
                <strong className="estimate-highlight">
                  {localEstimate.formatted}
                </strong>
              </div>
              <div className="estimate-rate-note">
                Rate: 1 XLM ≈ {localEstimate.rate.toLocaleString()} {selectedCurrency}{" "}
                (via SEP-38 price estimate; final rate confirmed in anchor portal)
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={isInitiating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary btn-withdraw"
                disabled={isInitiating || parseFloat(amount) <= 0}
              >
                {isInitiating ? "Initiating..." : "Withdraw via Anchor (SEP-24)"}
              </button>
            </div>
          </form>
        ) : (
          /* Active Interactive Withdrawal Session */
          <div className="interactive-session-container">
            <div className="session-active-card">
              <div className="session-status-badge">
                <span className="pulse-dot"></span> Interactive Session Active
              </div>
              <p className="session-tx-id">
                SEP-24 Transaction ID:{" "}
                <code className="mono">{withdrawalSession.transactionId}</code>
              </p>
              <p>
                The anchor portal was opened in a new tab. If it did not open
                automatically, click the button below:
              </p>

              <div className="session-action-buttons">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleOpenNewTab}
                >
                  Open Anchor Portal in New Tab
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEmbeddedWebview((prev) => !prev)}
                >
                  {showEmbeddedWebview ? "Hide Embedded Webview" : "Show Embedded Webview"}
                </button>
              </div>

              {/* Embedded Webview (Iframe) */}
              {showEmbeddedWebview && (
                <div className="embedded-webview-wrapper">
                  <div className="webview-header">
                    <span>Anchor Embedded Webview: testanchor.stellar.org</span>
                    <button
                      type="button"
                      className="btn-close-webview"
                      onClick={() => setShowEmbeddedWebview(false)}
                    >
                      ×
                    </button>
                  </div>
                  <iframe
                    src={withdrawalSession.interactiveUrl}
                    title="Anchor SEP-24 Interactive Portal"
                    className="anchor-iframe"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
