import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import axios from 'axios';
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet
} from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter
} from '@solana/wallet-adapter-wallets';
import {
  WalletModalProvider,
  WalletMultiButton
} from '@solana/wallet-adapter-react-ui';
import {
  clusterApiUrl,
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction as splCreateTransfer } from '@solana/spl-token';
import feeUtils from './utils/fee';
import TokenSelector from './components/TokenSelector';
import '@solana/wallet-adapter-react-ui/styles.css';

// Compute API base: prefer REACT_APP_BACKEND_URL if set (useful for local dev),
// otherwise default to the monorepo '/api' route in production.
// When developing locally (NODE_ENV=development) and no env provided, default to http://localhost:8001/api
let API = '/api';
try {
  const backendEnv = process.env.REACT_APP_BACKEND_URL;
  if (backendEnv && backendEnv.length > 0) {
    API = backendEnv.replace(/\/$/, '') + '/api';
  } else if (process.env.NODE_ENV === 'development') {
    API = 'http://localhost:8001/api';
  }
} catch (e) {
  API = '/api';
}

const DEVELOPER_WALLET = process.env.REACT_APP_DEV_WALLET || '7N2NBbR2bXJkga5HsFUAgAi4rBtAr5VSVJdvkYXq8vxk';

function MultiSendApp() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  
  const [selectedToken, setSelectedToken] = useState(() => {
    try {
      return localStorage.getItem('selectedToken') || 'SOL';
    } catch (e) {
      return 'SOL';
    }
  });
  const [recipients, setRecipients] = useState([{ address: '', amount: '' }]);
  const [csvFile, setCsvFile] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [tokenLoadError, setTokenLoadError] = useState(null);
  const [feeEstimate, setFeeEstimate] = useState(null);
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadTokenList();
  }, []);

  // When the user connects their wallet, ensure a sensible default token is selected
  useEffect(() => {
    if (publicKey && tokens && tokens.length > 0) {
      const mintList = tokens.map(t => t.mint);
      if (!mintList.includes(selectedToken)) {
        setSelectedToken(tokens[0].mint);
      }
    }
  }, [publicKey, tokens]);

  // Persist selected token to localStorage
  useEffect(() => {
    try {
      if (selectedToken) localStorage.setItem('selectedToken', selectedToken);
    } catch (e) {
      // ignore localStorage errors in restricted environments
    }
  }, [selectedToken]);

  const loadTokenList = async () => {
    try {
      setTokenLoadError(null);
      const response = await axios.get(`${API}/token-list`);
      if (response?.data?.tokens) {
        setTokens(response.data.tokens);
      } else {
        setTokenLoadError('Invalid token list response from backend');
      }
    } catch (error) {
      console.error('Failed to load token list:', error);
      setTokenLoadError(error.response?.data?.detail || error.message || String(error));
    }
  };

  // If wallet connects after initial mount and tokens are not loaded, try loading again
  useEffect(() => {
    if (publicKey && (!tokens || tokens.length === 0)) {
      loadTokenList();
    }
  }, [publicKey]);

  const addRecipient = () => {
    setRecipients([...recipients, { address: '', amount: '' }]);
  };

  const removeRecipient = (index) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const updateRecipient = (index, field, value) => {
    const updated = [...recipients];
    updated[index][field] = value;
    setRecipients(updated);
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      const response = await axios.post(`${API}/parse-csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (response.data.success) {
        setRecipients(response.data.recipients.map(r => ({
          address: r.wallet_address,
          amount: r.amount.toString()
        })));
        setTxStatus(`✅ Loaded ${response.data.count} recipients from CSV`);
        if (response.data.errors.length > 0) {
          setTxStatus(prev => prev + `\n⚠️ ${response.data.errors.length} rows had errors`);
        }
      }
    } catch (error) {
      setTxStatus(`❌ Failed to parse CSV: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const validateRecipients = async () => {
    if (!publicKey) {
      setTxStatus('❌ Please connect your wallet first');
      return;
    }

    const validRecipients = recipients.filter(r => r.address && r.amount);
    if (validRecipients.length === 0) {
      setTxStatus('❌ Please add at least one recipient');
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(`${API}/validate-recipients`, {
        token_mint: selectedToken,
        sender_wallet: publicKey.toString(),
        recipients: validRecipients.map(r => ({
          wallet_address: r.address,
          amount: parseFloat(r.amount)
        }))
      });
      
      setValidationResults(response.data);
      
      if (response.data.ready_to_send) {
        setTxStatus(`✅ All ${response.data.valid_recipients} recipients validated successfully`);
        await estimateFees(validRecipients);
      } else {
        setTxStatus(`⚠️ ${response.data.invalid_recipients} invalid recipients found`);
      }
    } catch (error) {
      setTxStatus(`❌ Validation failed: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const estimateFees = async (validRecipients) => {
    try {
      const response = await axios.post(`${API}/estimate-fees`, {
        token_mint: selectedToken,
        sender_wallet: publicKey.toString(),
        recipients: validRecipients.map(r => ({
          wallet_address: r.address,
          amount: parseFloat(r.amount)
        }))
      });
      
      setFeeEstimate(response.data);
    } catch (error) {
      console.error('Failed to estimate fees:', error);
    }
  };

  const executeSend = async () => {
    if (!publicKey || !connection) {
      setTxStatus('❌ Wallet not connected');
      return;
    }

    if (!validationResults?.ready_to_send) {
      setTxStatus('❌ Please validate recipients first');
      return;
    }

    try {
      setLoading(true);
      setTxStatus('🔄 Preparing transactions...');

      const validRecipients = recipients.filter(r => r.address && r.amount);
      
      // Create batches (12 per transaction for safety)
      const batchSize = 12;
      const batches = [];
      for (let i = 0; i < validRecipients.length; i += batchSize) {
        batches.push(validRecipients.slice(i, i + batchSize));
      }

      const signatures = [];

      // We'll collect fee in the same token by appending a fee instruction to each batch.

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        setTxStatus(`🔄 Processing batch ${i + 1}/${batches.length}...`);
        
        const transaction = new Transaction();

        // Build transfer instructions for this batch
        let batchTotalLamports = 0n;
        let batchTotalUnits = 0n; // for SPL tokens

        if (selectedToken === 'SOL') {
          for (const recipient of batches[i]) {
            const lamports = BigInt(Math.floor(parseFloat(recipient.amount) * LAMPORTS_PER_SOL));
            batchTotalLamports += lamports;
            transaction.add(
              SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: new PublicKey(recipient.address),
                lamports: Number(lamports)
              })
            );
          }
        } else {
          const tokenInfo = tokens.find(t => t.mint === selectedToken);
          if (!tokenInfo) throw new Error('Token info not found for transfers');
          const mintPubkey = new PublicKey(tokenInfo.mint);

          // derive sender token account
          const senderTokenAccount = await getAssociatedTokenAddress(mintPubkey, publicKey);

          // helper to convert decimal amount string to smallest unit BigInt
          const convertToUnits = (amountStr, decimals) => {
            const parts = amountStr.split('.');
            const whole = BigInt(parts[0] || '0');
            const frac = parts[1] || '';
            const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
            return whole * BigInt(10 ** decimals) + BigInt(fracPadded || '0');
          };

          for (const recipient of batches[i]) {
            const recipientPub = new PublicKey(recipient.address);
            const recipientTokenAccount = await getAssociatedTokenAddress(mintPubkey, recipientPub);

            // ensure recipient ATA exists
            const acctInfo = await connection.getAccountInfo(recipientTokenAccount);
            if (!acctInfo) {
              transaction.add(
                createAssociatedTokenAccountInstruction(
                  publicKey, // payer
                  recipientTokenAccount,
                  recipientPub,
                  mintPubkey
                )
              );
            }

            const units = convertToUnits(recipient.amount, tokenInfo.decimals);
            batchTotalUnits += units;

            transaction.add(
              splCreateTransfer(
                senderTokenAccount,
                recipientTokenAccount,
                publicKey,
                Number(units)
              )
            );
          }
        }

        // Append fee instruction(s) depending on selectedToken
        const devWallet = process.env.REACT_APP_DEV_WALLET || DEVELOPER_WALLET;
        if (selectedToken === 'SOL') {
          const feeInstr = feeUtils.buildSolFeeInstruction(publicKey, devWallet, batchTotalLamports, 10n);
          if (feeInstr) transaction.add(feeInstr);
        } else {
          // SPL token flow: find mint info and sender token account
            const tokenInfo = tokens.find(t => t.mint === selectedToken);
            if (!tokenInfo) throw new Error('Token info not found for fee calculation');

            const mintPubkey = new PublicKey(tokenInfo.mint);
            // derive senderTokenAccount via associated token address
            const { getAssociatedTokenAddress } = await import('@solana/spl-token');
            const senderTokenAccount = await getAssociatedTokenAddress(mintPubkey, publicKey);

            // helper to convert decimal amount string to smallest unit BigInt
            const convertToUnits = (amountStr, decimals) => {
              const parts = amountStr.split('.');
              const whole = BigInt(parts[0] || '0');
              const frac = parts[1] || '';
              const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
              return whole * BigInt(10 ** decimals) + BigInt(fracPadded || '0');
            };

            const totalUnits = batches[i].reduce((acc, r) => acc + convertToUnits(r.amount, tokenInfo.decimals), 0n);
            const splFeeInstrs = await feeUtils.buildSplFeeInstructions({
              connection,
              mintPubkey,
              senderPubkey: publicKey,
              senderTokenAccount: senderTokenAccount,
              devPubkey: devWallet,
              totalUnitsBigInt: totalUnits,
              feeBps: 10n
            });
          for (const instr of splFeeInstrs) transaction.add(instr);
        }

        const signature = await sendTransaction(transaction, connection);
        await connection.confirmTransaction(signature, 'confirmed');
        signatures.push(signature);
        
        setTxStatus(`✅ Batch ${i + 1}/${batches.length} completed: ${signature.slice(0, 8)}...`);
      }

      setTxStatus(
        `🎉 Multi-send completed!\n` +
        `Total sent: ${feeEstimate.total_amount} ${selectedToken}\n` +
        `Developer fee: ${feeEstimate.developer_fee} ${selectedToken}\n` +
        `Recipients: ${validRecipients.length}\n` +
        `Transactions: ${signatures.length}`
      );

      // No backend persistence configured (no database). Optionally log to console.
      console.info('Transactions signatures:', signatures);

    } catch (error) {
      setTxStatus(`❌ Transaction failed: ${error.message}`);
      console.error('Send error:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = useMemo(() => {
    return recipients.reduce((sum, r) => {
      const amount = parseFloat(r.amount);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
  }, [recipients]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Solana Multi-Send</h1>
            <p className="text-gray-300">Send SOL & SPL tokens to multiple recipients in batched transactions</p>
          </div>
          <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />
        </div>

        {/* Main Content */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Left Column - Input */}
          <div className="md:col-span-2 space-y-6">
            {/* Token Selection */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-xl font-semibold text-white mb-4">Select Token</h2>
              {!publicKey ? (
                <div className="text-gray-300">Please connect your wallet to choose which token to send.</div>
              ) : (
                <div>
                  {tokenLoadError ? (
                    <div className="space-y-2">
                      <div className="text-red-400">Failed to load tokens: {tokenLoadError}</div>
                      <button
                        onClick={loadTokenList}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <TokenSelector tokens={tokens} selectedToken={selectedToken} setSelectedToken={setSelectedToken} disabled={!publicKey} />
                  )}
                </div>
              )}
            </div>

            {/* Recipients Input */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">Recipients</h2>
                <div className="flex gap-2">
                  <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
                    📁 Upload CSV
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={addRecipient}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    + Add Recipient
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recipients.map((recipient, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Wallet Address"
                      value={recipient.address}
                      onChange={(e) => updateRecipient(index, 'address', e.target.value)}
                      className="flex-1 px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={recipient.amount}
                      onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
                      className="w-32 px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                      step="0.000000001"
                      min="0"
                    />
                    <button
                      onClick={() => removeRecipient(index)}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="text-gray-300">
                  <span className="font-semibold">Total Recipients:</span> {recipients.filter(r => r.address && r.amount).length}
                </div>
                <div className="text-gray-300">
                  <span className="font-semibold">Total Amount:</span> {totalAmount.toFixed(9)} {tokens.find(t => t.mint === selectedToken)?.symbol || 'SOL'}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={validateRecipients}
                disabled={loading || !publicKey}
                className="flex-1 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? '⏳ Validating...' : '🔍 Validate Recipients'}
              </button>
              <button
                onClick={executeSend}
                disabled={loading || !publicKey || !validationResults?.ready_to_send}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all"
              >
                {loading ? '⏳ Sending...' : '🚀 Execute Multi-Send'}
              </button>
            </div>
          </div>

          {/* Right Column - Status & Info */}
          <div className="space-y-6">
            {/* Fee Estimate */}
            {feeEstimate && (
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4">💰 Fee Estimate</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-300">
                    <span>Total Amount:</span>
                    <span className="font-semibold text-white">{feeEstimate.total_amount} {tokens.find(t => t.mint === selectedToken)?.symbol}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Developer Fee (0.1%):</span>
                    <span className="font-semibold text-purple-400">{feeEstimate.developer_fee} {tokens.find(t => t.mint === selectedToken)?.symbol}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Network Fees:</span>
                    <span className="font-semibold text-blue-400">~{feeEstimate.estimated_network_fee_sol} SOL</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Transactions:</span>
                    <span className="font-semibold text-white">{feeEstimate.transaction_count}</span>
                  </div>
                  <div className="pt-2 border-t border-white/20 flex justify-between">
                    <span className="text-white font-semibold">Total Cost:</span>
                    <span className="font-bold text-green-400">{feeEstimate.total_cost_including_fees.toFixed(6)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Validation Results */}
            {validationResults && (
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4">✓ Validation Results</h2>
                <div className="space-y-2">
                  <div className="flex justify-between text-green-400">
                    <span>Valid:</span>
                    <span className="font-bold">{validationResults.valid_recipients}</span>
                  </div>
                  {validationResults.invalid_recipients > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>Invalid:</span>
                      <span className="font-bold">{validationResults.invalid_recipients}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status */}
            {txStatus && (
              <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4">📊 Status</h2>
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">{txStatus}</pre>
              </div>
            )}

            {/* Info */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-xl font-semibold text-white mb-4">ℹ️ How it Works</h2>
              <ul className="text-sm text-gray-300 space-y-2">
                <li>• Select token (SOL or SPL tokens)</li>
                <li>• Add recipients manually or upload CSV</li>
                <li>• Validate all addresses</li>
                <li>• Review fee estimate</li>
                <li>• Execute batched transactions</li>
                <li>• 0.1% fee goes to developer</li>
                <li>• Up to 12 transfers per transaction for optimal fees</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter()
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <MultiSendApp />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;