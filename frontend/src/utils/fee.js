import { PublicKey, SystemProgram } from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';

/**
 * Compute fee amount in smallest units using BigInt.
 * feeBps: basis points (10 == 0.1%)
 */
export function computeFeeAmount(totalUnitsBigInt, feeBps = 10n) {
  return (totalUnitsBigInt * feeBps) / 10000n;
}

// Build a SOL fee transfer instruction
export function buildSolFeeInstruction(senderPubkey, devPubkey, totalLamportsBigInt, feeBps = 10n) {
  const feeLamports = computeFeeAmount(totalLamportsBigInt, feeBps);
  if (feeLamports <= 0n) return null;

  return SystemProgram.transfer({
    fromPubkey: senderPubkey,
    toPubkey: new PublicKey(devPubkey),
    lamports: Number(feeLamports)
  });
}

// Build SPL fee instructions (may include ATA creation for dev)
export async function buildSplFeeInstructions({
  connection,
  mintPubkey,
  senderPubkey,
  senderTokenAccount,
  devPubkey,
  totalUnitsBigInt,
  feeBps = 10n
}) {
  const feeUnits = computeFeeAmount(totalUnitsBigInt, feeBps);
  if (feeUnits <= 0n) return [];

  const instructions = [];
  const devTokenAccount = await getAssociatedTokenAddress(mintPubkey, new PublicKey(devPubkey));

  // If dev token account doesn't exist, add create ATA instruction (sender will pay)
  const devAccountInfo = await connection.getAccountInfo(devTokenAccount);
  if (!devAccountInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        senderPubkey, // payer
        devTokenAccount,
        new PublicKey(devPubkey),
        mintPubkey
      )
    );
  }

  instructions.push(
    createTransferInstruction(
      senderTokenAccount,
      devTokenAccount,
      senderPubkey,
      Number(feeUnits)
    )
  );

  return instructions;
}

export default {
  computeFeeAmount,
  buildSolFeeInstruction,
  buildSplFeeInstructions
};
