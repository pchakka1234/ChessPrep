/* eslint-disable no-restricted-globals */
import { Chess } from 'chess.js';

self.onmessage = (e) => {
  const { allGames, currentHistory, username } = e.data;

  if (!allGames || allGames.length === 0) {
    self.postMessage({ filteredGames: [], candidateMoves: [] });
    return;
  }

  // 1. Filter games matching exact position move sequence
  const matching = allGames.filter((g) => {
    const tempChess = new Chess();
    try {
      tempChess.loadPgn(g.pgn);
      const gameHistory = tempChess.history();
      return currentHistory.every((move, idx) => gameHistory[idx] === move);
    } catch (err) {
      return false;
    }
  });

  // 2. Aggregate next candidate moves for Move Explorer
  const moveStats = {};
  let totalPositionGames = 0;

  matching.forEach((g) => {
    const tempChess = new Chess();
    try {
      tempChess.loadPgn(g.pgn);
      const gameHistory = tempChess.history();
      const nextMove = gameHistory[currentHistory.length];

      if (nextMove) {
        totalPositionGames += 1;
        if (!moveStats[nextMove]) {
          moveStats[nextMove] = { count: 0, wins: 0, draws: 0, losses: 0 };
        }
        moveStats[nextMove].count += 1;

        const isOpponentWhite = g.white.username.toLowerCase() === username.toLowerCase();
        if (g.result === '1/2-1/2') {
          moveStats[nextMove].draws += 1;
        } else if ((g.result === '1-0' && isOpponentWhite) || (g.result === '0-1' && !isOpponentWhite)) {
          moveStats[nextMove].wins += 1;
        } else {
          moveStats[nextMove].losses += 1;
        }
      }
    } catch (err) {
      // Ignore corrupted PGN strings
    }
  });

  // Format candidate move stats
  const candidateMoves = Object.entries(moveStats)
    .map(([moveSan, stats]) => {
      const winPct = Math.round((stats.wins / stats.count) * 100);
      const drawPct = Math.round((stats.draws / stats.count) * 100);
      const lossPct = 100 - winPct - drawPct;
      const freqPct = Math.round((stats.count / totalPositionGames) * 100);

      return { moveSan, count: stats.count, freqPct, winPct, drawPct, lossPct };
    })
    .sort((a, b) => b.count - a.count);

  self.postMessage({ filteredGames: matching, candidateMoves });
};