import React from 'react';

export default function TokenSelector({ tokens, selectedToken, setSelectedToken, disabled }) {
  return (
    <div>
      {tokens.length === 0 ? (
        <div className="text-gray-300">Loading tokens…</div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {tokens.map(token => (
            <button
              key={token.mint}
              onClick={() => setSelectedToken(token.mint)}
              disabled={disabled}
              aria-disabled={disabled}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedToken === token.mint
                  ? 'border-purple-500 bg-purple-500/20'
                  : 'border-white/20 bg-white/5 hover:bg-white/10'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="text-white font-semibold">{token.symbol}</div>
              <div className="text-gray-300 text-sm">{token.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
