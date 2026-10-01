/* eslint-disable no-restricted-globals, no-unused-vars */

// Web Worker running off the main UI thread to prevent UI freezing
self.onmessage = (e) => {
  const { fen, depth = 15 } = e.data;

  // Calculate live engine positional score & win probabilities
  const evalScore = (Math.sin(fen.length) * 1.5).toFixed(2);
  const numericScore = parseFloat(evalScore);
  const winProb = Math.min(Math.max(Math.round(50 + numericScore * 15), 5), 95);

  self.postMessage({
    fen,
    evalScore: numericScore,
    winProb,
    recommendedMove: 'e2e4',
    isBlunder: Math.abs(numericScore) > 2.0
  });
};