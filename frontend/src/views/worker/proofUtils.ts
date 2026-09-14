/**
 * Utilities for worker completion proof hashing and validation.
 *
 * In the Truvo escrow architecture, worker completion proofs are hashed
 * client-side into a 32-byte SHA-256 digest. This 64-character hex string
 * is stored on-chain in the escrow contract's `proof_hash` field (BytesN<32>),
 * allowing the requester to verify the deliverable off-chain before releasing funds.
 */

/**
 * Computes a SHA-256 hash of a string or ArrayBuffer and returns a
 * 64-character lowercase hexadecimal string (matching Soroban BytesN<32>).
 */
export async function computeProofHash(
  data: string | ArrayBuffer,
): Promise<string> {
  const buffer: ArrayBuffer =
    typeof data === "string"
      ? new TextEncoder().encode(data).buffer
      : data;

  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates whether a given string is a valid 32-byte hex hash (64 hex characters).
 */
export function isValidProofHash(hash: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(hash.trim());
}
