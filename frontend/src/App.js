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
import '@solana/wallet-adapter-react-ui/styles.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DEVELOPER_WALLET = '3ALfiR1TK2JqC18nfCE8vhGqBD86obX8AcV4YgjzmRij';

function MultiSendApp() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  
  const [selectedToken, setSelectedToken] = useState('SOL');
  const [recipients, setRecipients] = useState([{ address: '', amount: '' }]);
  const [csvFile, setCsvFile] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [feeEstimate, setFeeEstimate] = useState(null);
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadTokenList();
  }, []);

  const loadTokenList = async () => {
    try {
      const response = await axios.get(`${API}/token-list`);
      setTokens(response.data.tokens);
    } catch (error) {
      console.error('Failed to load token list:', error);
    }
  };

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

      // Send developer fee first
      setTxStatus(`🔄 Sending developer fee (0.1%)...`);
      try {
        const devFeeAmount = feeEstimate.developer_fee;
        const devFeeTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(DEVELOPER_WALLET),
            lamports: Math.floor(devFeeAmount * LAMPORTS_PER_SOL)
          })
        );

        const devFeeSig = await sendTransaction(devFeeTx, connection);
        await connection.confirmTransaction(devFeeSig, 'confirmed');
        signatures.push(devFeeSig);
        setTxStatus(`✅ Developer fee sent: ${devFeeSig.slice(0, 8)}...`);
      } catch (error) {
        throw new Error(`Failed to send developer fee: ${error.message}`);
      }

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        setTxStatus(`🔄 Processing batch ${i + 1}/${batches.length}...`);
        
        const transaction = new Transaction();
        
        for (const recipient of batches[i]) {
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: new PublicKey(recipient.address),
              lamports: Math.floor(parseFloat(recipient.amount) * LAMPORTS_PER_SOL)
            })
          );
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

      // Save to history
      try {
        await axios.post(`${API}/save-transaction`, {
          sender_wallet: publicKey.toString(),
          token_mint: selectedToken,
          recipient_count: validRecipients.length,
          total_amount: feeEstimate.total_amount,
          developer_fee: feeEstimate.developer_fee,
          status: 'confirmed',
          signatures: signatures
        });
      } catch (error) {
        console.error('Failed to save transaction history:', error);
      }

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
              <div className="grid grid-cols-3 gap-3">
                {tokens.map(token => (
                  <button
                    key={token.mint}
                    onClick={() => setSelectedToken(token.mint)}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedToken === token.mint
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-white/20 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-white font-semibold">{token.symbol}</div>
                    <div className="text-gray-300 text-sm">{token.name}</div>
                  </button>
                ))}
              </div>
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
