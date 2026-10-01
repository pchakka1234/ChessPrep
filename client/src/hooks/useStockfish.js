import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';

const ENGINE_PATH =
  `${process.env.PUBLIC_URL}/stockfish/stockfish-19-lite-single.js`;

const POSITION_DELAY_MS = 120;
const UI_UPDATE_MS = 100;
const MAX_CACHED_POSITIONS = 30;

function parseInfo(message, fen) {
  if (!message.startsWith('info ') || !message.includes(' pv ')) {
    return null;
  }

  const depthMatch = message.match(/\bdepth (\d+)\b/);
  const rankMatch = message.match(/\bmultipv (\d+)\b/);
  const scoreMatch = message.match(/\bscore (cp|mate) (-?\d+)\b/);
  const pvMatch = message.match(/\bpv (.+)$/);

  if (!depthMatch || !scoreMatch || !pvMatch) return null;

  const position = new Chess(fen);
  const moves = [];

  for (const uci of pvMatch[1].trim().split(/\s+/).slice(0, 14)) {
    try {
      const move = position.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });

      if (!move) break;
      moves.push(move.san);
    } catch {
      break;
    }
  }

  if (moves.length === 0) return null;

  // UCI score is from the side to move's perspective. Store all scores
  // from White's perspective for consistent badges and evaluation bar.
  const perspective = fen.split(' ')[1] === 'b' ? -1 : 1;

  return {
    rank: Number(rankMatch?.[1] ?? 1),
    depth: Number(depthMatch[1]),
    score: {
      type: scoreMatch[1],
      value: Number(scoreMatch[2]) * perspective,
    },
    moves,
  };
}

export function formatEvaluation(score) {
  if (!score || !Number.isFinite(score.value)) return '—';

  if (score.type === 'mate') {
    if (score.value > 0) return `M${score.value}`;
    if (score.value < 0) return `-M${Math.abs(score.value)}`;
    return 'M0';
  }

  const pawns = score.value / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

export function evaluationWhitePercent(score) {
  if (!score || !Number.isFinite(score.value)) return 50;

  if (score.type === 'mate') {
    return score.value > 0 ? 98 : score.value < 0 ? 2 : 50;
  }

  return Math.max(
    2,
    Math.min(
      98,
      50 + 48 * Math.tanh(score.value / 200)
    )
  );
}

function emptyAnalysis(fen) {
  return {
    fen,
    lines: [],
    depth: null,
    status: 'loading',
    error: null,
  };
}

export default function useStockfish(fen) {
  const [analysis, setAnalysis] = useState(() =>
    emptyAnalysis(fen)
  );

  const workerRef = useRef(null);
  const readyRef = useRef(false);
  const searchingRef = useRef(false);
  const stopSentRef = useRef(false);
  const activeFenRef = useRef(null);
  const requestedFenRef = useRef(fen);

  const startTimerRef = useRef(null);
  const updateTimerRef = useRef(null);

  const cacheRef = useRef(new Map());
  const currentLinesRef = useRef(new Map());
  const currentDepthRef = useRef(0);
  const lastPublishedRef = useRef(0);

  function getCached(nextFen) {
    return cacheRef.current.get(nextFen);
  }

  function remember(nextFen, snapshot) {
    const cache = cacheRef.current;

    // Reinserting places recently viewed positions at the end.
    cache.delete(nextFen);
    cache.set(nextFen, snapshot);

    if (cache.size > MAX_CACHED_POSITIONS) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  }

  function publish(nextFen) {
    if (nextFen !== requestedFenRef.current) return;

    const lines = [...currentLinesRef.current.values()]
      .sort((a, b) => a.rank - b.rank);

    const snapshot = {
      fen: nextFen,
      lines,
      depth: currentDepthRef.current || null,
      status: searchingRef.current ? 'analyzing' : 'ready',
      error: null,
    };

    remember(nextFen, snapshot);
    setAnalysis(snapshot);
    lastPublishedRef.current = Date.now();
  }

  function schedulePublish(nextFen) {
    if (
      Date.now() - lastPublishedRef.current >= UI_UPDATE_MS
    ) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
      publish(nextFen);
      return;
    }

    if (updateTimerRef.current !== null) return;

    updateTimerRef.current = setTimeout(() => {
      updateTimerRef.current = null;
      publish(nextFen);
    }, UI_UPDATE_MS);
  }

  function start(nextFen) {
    const worker = workerRef.current;

    if (
      !worker ||
      !readyRef.current ||
      searchingRef.current ||
      nextFen !== requestedFenRef.current
    ) {
      return;
    }

    activeFenRef.current = nextFen;
    searchingRef.current = true;
    stopSentRef.current = false;

    const cached = getCached(nextFen);
    currentLinesRef.current = new Map(
      (cached?.lines || []).map((line) => [
        line.rank,
        line,
      ])
    );
    currentDepthRef.current = cached?.depth || 0;

    setAnalysis({
      fen: nextFen,
      lines: cached?.lines || [],
      depth: cached?.depth || null,
      status: 'analyzing',
      error: null,
    });

    worker.postMessage(`position fen ${nextFen}`);
    worker.postMessage('go infinite');
  }

  function scheduleStart(nextFen) {
    clearTimeout(startTimerRef.current);

    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      start(nextFen);
    }, POSITION_DELAY_MS);
  }

  useEffect(() => {
    let worker;

    try {
      worker = new Worker(ENGINE_PATH);
      workerRef.current = worker;
    } catch (error) {
      setAnalysis({
        ...emptyAnalysis(requestedFenRef.current),
        status: 'error',
        error: `Could not start Stockfish: ${error.message}`,
      });
      return undefined;
    }

    worker.onmessage = (event) => {
      const messages = String(event.data ?? '')
        .split(/\r?\n/);

      for (const raw of messages) {
        const message = raw.trim();
        if (!message) continue;

        if (message === 'uciok') {
          worker.postMessage('setoption name MultiPV value 3');
          worker.postMessage('setoption name Hash value 32');
          worker.postMessage('isready');
          continue;
        }

        if (message === 'readyok') {
          readyRef.current = true;
          scheduleStart(requestedFenRef.current);
          continue;
        }

        if (message.startsWith('bestmove')) {
          const finishedFen = activeFenRef.current;

          searchingRef.current = false;
          stopSentRef.current = false;

          if (finishedFen === requestedFenRef.current) {
            publish(finishedFen);
          }

          // A position change may have requested stop while the old
          // analysis was still running. Start only the latest position.
          if (finishedFen !== requestedFenRef.current) {
            scheduleStart(requestedFenRef.current);
          }

          continue;
        }

        if (!message.startsWith('info ')) continue;

        const activeFen = activeFenRef.current;

        if (
          !activeFen ||
          activeFen !== requestedFenRef.current ||
          !searchingRef.current
        ) {
          continue;
        }

        const line = parseInfo(message, activeFen);
        if (!line || line.rank < 1 || line.rank > 3) {
          continue;
        }

        const previous = currentLinesRef.current.get(line.rank);

        if (!previous || line.depth >= previous.depth) {
          currentLinesRef.current.set(line.rank, line);
        }

        currentDepthRef.current = Math.max(
          currentDepthRef.current,
          line.depth
        );

        // Publish shallow lines right away; throttle later updates so
        // engine messages do not make React render hundreds of times.
        schedulePublish(activeFen);
      }
    };

    worker.onerror = (event) => {
      console.error('Stockfish worker error:', event);
      setAnalysis({
        ...emptyAnalysis(requestedFenRef.current),
        status: 'error',
        error:
          'Stockfish could not load. Check the browser console and public/stockfish.',
      });
    };

    worker.postMessage('uci');

    return () => {
      clearTimeout(startTimerRef.current);
      clearTimeout(updateTimerRef.current);
      worker.terminate();

      workerRef.current = null;
      readyRef.current = false;
      searchingRef.current = false;
      stopSentRef.current = false;
    };
    // The worker must be created once, not again for every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    requestedFenRef.current = fen;
    clearTimeout(startTimerRef.current);
    clearTimeout(updateTimerRef.current);
    updateTimerRef.current = null;

    const cached = getCached(fen);
    setAnalysis(
      cached
        ? { ...cached, status: 'analyzing' }
        : emptyAnalysis(fen)
    );

    const worker = workerRef.current;

    if (searchingRef.current) {
      if (
        activeFenRef.current !== fen &&
        !stopSentRef.current
      ) {
        stopSentRef.current = true;
        worker?.postMessage('stop');
      }

      // If the user returned to the active position before stop
      // completed, its bestmove handler will start it again.
    } else if (readyRef.current) {
      scheduleStart(fen);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  if (analysis.fen !== fen) {
    return emptyAnalysis(fen);
  }

  return analysis;
}