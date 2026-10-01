import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import axios from 'axios';
import { savePrepSearch } from './savePrepSearch';
import useStockfish, {
  evaluationWhitePercent,
  formatEvaluation,
} from './hooks/useStockfish';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL;
const GAMES_PER_PAGE = 10;

function buildGame(moves) {
  const chess = new Chess();
  moves.forEach((move) => chess.move(move));
  return chess;
}

function formatVariation(moves, completedPlies) {
  if (!Array.isArray(moves)) return '';

  return moves
    .map((move, offset) => {
      const ply = completedPlies + offset;
      const moveNumber = Math.floor(ply / 2) + 1;

      if (ply % 2 === 0) {
        return `${moveNumber}. ${move}`;
      }

      if (offset === 0) {
        return `${moveNumber}... ${move}`;
      }

      return move;
    })
    .join(' ');
}

function PrepApp({ selectedSearch, onSearchSaved }) {
  const [moveLine, setMoveLine] = useState([]);
  const [moveIndex, setMoveIndex] = useState(0);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  const game = useMemo(
    () => buildGame(moveLine.slice(0, moveIndex)),
    [moveLine, moveIndex]
  );
  const fen = game.fen();

  const {
    lines: engineLines = [],
    depth: engineDepth,
    error: engineError,
  } = useStockfish(fen);

  const bestLine = engineLines[0];
  const isCheckmate = game.isCheckmate();
  const isDraw = game.isDraw();

  const gameResult = isCheckmate
    ? game.turn() === 'b'
      ? 'White wins by checkmate'
      : 'Black wins by checkmate'
    : isDraw
      ? 'Draw'
      : null;

  const whitePercent = isCheckmate
    ? game.turn() === 'b'
      ? 100
      : 0
    : isDraw
      ? 50
      : bestLine
        ? evaluationWhitePercent(bestLine.score)
        : 50;

  const [usernameDraft, setUsernameDraft] = useState('');
  const [colorFilter, setColorFilter] = useState('white');
  const [timeRangeMonths, setTimeRangeMonths] = useState(2);
  const [activeSearch, setActiveSearch] = useState(null);

  const [games, setGames] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [candidateMoves, setCandidateMoves] = useState([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [resultKey, setResultKey] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const requestIdRef = useRef(0);
  const operationIdRef = useRef(0);
  const justSavedSearchIdRef = useRef(null);

  const searchStoredGames = useCallback(
    async (searchedUsername, history, searchColor, searchMonths) => {
      const requestId = ++requestIdRef.current;

      setLoading(true);
      setErrorMessage('');
      setGames([]);
      setCurrentPage(1);
      setCandidateMoves([]);
      setTotalMatches(0);
      setNextOffset(null);
      setResultKey(null);

      try {
        const response = await axios.post(`${API_URL}/api/prep-search`, {
          opponentUsername: searchedUsername,
          moveHistory: history,
          colorFilter: searchColor,
          timeRangeMonths: searchMonths,
        });

        if (requestId !== requestIdRef.current) return;

        setGames(response.data.games || []);
        setCandidateMoves(response.data.candidateMoves || []);
        setTotalMatches(response.data.totalMatches || 0);
        setNextOffset(response.data.nextOffset ?? null);
        setResultKey(response.data.resultKey || null);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;

        console.error('Prep search failed:', error);
        setErrorMessage(
          error.response?.data?.error ||
            'Could not search stored games.'
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!activeSearch) return;

    searchStoredGames(
      activeSearch.username,
      game.history(),
      colorFilter,
      timeRangeMonths
    );
  }, [
    activeSearch,
    game,
    colorFilter,
    timeRangeMonths,
    searchStoredGames,
  ]);

  async function importAndSearch() {
    const searchedUsername = usernameDraft.trim();

    if (!searchedUsername) {
      setErrorMessage('Enter a Chess.com username.');
      return;
    }

    const operationId = ++operationIdRef.current;
    ++requestIdRef.current;
    setLoading(true);
    setErrorMessage('');

    try {
      await axios.post(`${API_URL}/api/ingest/chess-com`, {
        opponentUsername: searchedUsername,
        timeRangeMonths,
      });

      if (operationId !== operationIdRef.current) return;

      try {
        const savedSearch = await savePrepSearch({
          opponentUsername: searchedUsername,
          colorFilter,
          timeRangeMonths,
        });

        if (operationId !== operationIdRef.current) return;

        justSavedSearchIdRef.current = savedSearch.id;
        onSearchSaved?.(savedSearch);
      } catch (saveError) {
        console.error('Could not save prep search:', saveError);
        setErrorMessage(
          `Games imported, but search history was not saved: ${saveError.message}`
        );
      }

      setActiveSearch({
        username: searchedUsername,
        request: operationId,
      });
    } catch (error) {
      if (operationId !== operationIdRef.current) return;

      console.error('Chess.com import failed:', error);
      setErrorMessage(
        error.response?.data?.error ||
          'Could not import Chess.com games.'
      );
    } finally {
      if (operationId === operationIdRef.current) {
        setLoading(false);
      }
    }
  }

  // Refresh a saved opponent without inserting another search row.
  useEffect(() => {
    if (!selectedSearch?.id) return;

    if (selectedSearch.id === justSavedSearchIdRef.current) {
      justSavedSearchIdRef.current = null;
      return;
    }

    const savedUsername = selectedSearch.opponent_username;
    const savedColor = selectedSearch.color_to_prepare;
    const savedMonths = selectedSearch.time_range_months ?? 2;

    if (!savedUsername || !['white', 'black'].includes(savedColor)) {
      setErrorMessage('This saved search has invalid filters.');
      return;
    }

    const operationId = ++operationIdRef.current;
    ++requestIdRef.current;
    setLoading(true);
    setErrorMessage('');

    async function reopenSavedSearch() {
      try {
        await axios.post(`${API_URL}/api/ingest/chess-com`, {
          opponentUsername: savedUsername,
          timeRangeMonths: savedMonths,
        });

        if (operationId !== operationIdRef.current) return;

        setUsernameDraft(savedUsername);
        setColorFilter(savedColor);
        setTimeRangeMonths(savedMonths);
        setMoveLine([]);
        setMoveIndex(0);
        setPendingPromotion(null);
        setActiveSearch({
          username: savedUsername,
          request: operationId,
        });
      } catch (error) {
        if (operationId !== operationIdRef.current) return;

        console.error('Could not refresh saved search:', error);
        setErrorMessage(
          error.response?.data?.error ||
            'Could not refresh this opponent’s games.'
        );
      } finally {
        if (operationId === operationIdRef.current) {
          setLoading(false);
        }
      }
    }

    reopenSavedSearch();
  }, [selectedSearch?.id]);

  async function loadMoreGames() {
    if (loadingMore || loading || nextOffset === null || !resultKey) {
      return false;
    }

    const expectedKey = resultKey;
    const expectedOffset = nextOffset;
    const loadRequestId = requestIdRef.current;

    setLoadingMore(true);
    setErrorMessage('');

    try {
      const response = await axios.post(`${API_URL}/api/prep-more`, {
        resultKey: expectedKey,
        offset: expectedOffset,
      });

      if (requestIdRef.current !== loadRequestId) return false;

      const moreGames = response.data.games || [];
      setGames((previous) => [...previous, ...moreGames]);
      setNextOffset(response.data.nextOffset ?? null);
      return moreGames.length > 0;
    } catch (error) {
      if (requestIdRef.current !== loadRequestId) return false;

      console.error('Load more failed:', error);
      setErrorMessage(
        error.response?.data?.error || 'Could not load more games.'
      );
      return false;
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleNextPage() {
    const nextPage = currentPage + 1;
    const totalPages = Math.ceil(totalMatches / GAMES_PER_PAGE);

    if (nextPage > totalPages) return;

    if ((nextPage - 1) * GAMES_PER_PAGE < games.length) {
      setCurrentPage(nextPage);
      return;
    }

    const loaded = await loadMoreGames();
    if (loaded) setCurrentPage(nextPage);
  }

  function commitMove(moveInput) {
    const nextGame = buildGame(moveLine.slice(0, moveIndex));

    try {
      const move = nextGame.move(moveInput);
      if (!move) return false;

      const nextLine = [
        ...moveLine.slice(0, moveIndex),
        move.san,
      ];

      setMoveLine(nextLine);
      setMoveIndex(nextLine.length);
      setPendingPromotion(null);
      return true;
    } catch {
      return false;
    }
  }

  function onDrop({ sourceSquare, targetSquare }) {
    if (!targetSquare || pendingPromotion) return false;

    const piece = game.get(sourceSquare);
    if (!piece || piece.color !== game.turn()) return false;

    const reachesPromotionRank =
      piece.type === 'p' &&
      ((piece.color === 'w' && targetSquare.endsWith('8')) ||
        (piece.color === 'b' && targetSquare.endsWith('1')));

    if (reachesPromotionRank) {
      const legalPromotion = game
        .moves({ square: sourceSquare, verbose: true })
        .some(
          (move) =>
            move.to === targetSquare &&
            Boolean(move.promotion)
        );

      if (legalPromotion) {
        setPendingPromotion({
          from: sourceSquare,
          to: targetSquare,
          color: piece.color,
        });
      }

      return false;
    }

    return commitMove({
      from: sourceSquare,
      to: targetSquare,
    });
  }

  function selectPromotion(pieceType) {
    if (!pendingPromotion) return;

    commitMove({
      from: pendingPromotion.from,
      to: pendingPromotion.to,
      promotion: pieceType,
    });
  }

  function goBack() {
    setPendingPromotion(null);
    setMoveIndex((index) => Math.max(0, index - 1));
  }

  function goForward() {
    setPendingPromotion(null);
    setMoveIndex((index) =>
      Math.min(moveLine.length, index + 1)
    );
  }

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(
            target.tagName
          ));

      if (
        typing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPendingPromotion(null);
        setMoveIndex((index) => Math.max(0, index - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPendingPromotion(null);
        setMoveIndex((index) =>
          Math.min(moveLine.length, index + 1)
        );
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () =>
      window.removeEventListener('keydown', handleKeyDown);
  }, [moveLine.length]);

  function jumpToMove(index) {
    setPendingPromotion(null);
    setMoveLine((line) => line.slice(0, index));
    setMoveIndex(index);
  }

  function handleReset() {
    setPendingPromotion(null);
    setMoveLine([]);
    setMoveIndex(0);
  }

  const totalPages = Math.max(
    1,
    Math.ceil(totalMatches / GAMES_PER_PAGE)
  );

  return (
    <div className="app-container">
      <div className="left-panel">
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            value={usernameDraft}
            onChange={(event) =>
              setUsernameDraft(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !loading) {
                importAndSearch();
              }
            }}
            placeholder="Chess.com username"
          />

          <button
            type="button"
            className="search-button"
            onClick={importAndSearch}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Search'}
          </button>

          <button
            type="button"
            className="search-button"
            onClick={handleReset}
          >
            Reset
          </button>
        </div>

        <div className="filter-controls">
          <label htmlFor="prep-color">Color:</label>
          <select
            id="prep-color"
            className="filter-select"
            value={colorFilter}
            onChange={(event) =>
              setColorFilter(event.target.value)
            }
          >
            <option value="white">As White</option>
            <option value="black">As Black</option>
          </select>

          <label htmlFor="prep-range">Range:</label>
          <select
            id="prep-range"
            className="filter-select"
            value={timeRangeMonths}
            onChange={(event) =>
              setTimeRangeMonths(Number(event.target.value))
            }
          >
            <option value={1}>Last 1 Month</option>
            <option value={2}>Last 2 Months</option>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 1 Year</option>
            <option value={60}>Last 5 Years</option>
          </select>
        </div>

        {errorMessage && (
          <div role="alert" className="prep-error">
            {errorMessage}
          </div>
        )}

        <div className="board-analysis">
          <div
            className="board-wrapper"
            style={{ position: 'relative' }}
          >
            <Chessboard
              key={fen}
              options={{
                position: fen,
                onPieceDrop: onDrop,
                allowDragging: !pendingPromotion,
                canDragPiece: ({ square }) =>
                  game.get(square)?.color === game.turn(),
                boardStyle: {
                  width: '560px',
                  height: '560px',
                  borderRadius: '4px',
                },
              }}
            />

            {pendingPromotion && (
              <div
                role="dialog"
                aria-label="Choose promotion piece"
                className="promotion-dialog"
              >
                {[
                  ['q', 'Queen'],
                  ['r', 'Rook'],
                  ['b', 'Bishop'],
                  ['n', 'Knight'],
                ].map(([pieceType, label]) => (
                  <button
                    key={pieceType}
                    type="button"
                    onClick={() => selectPromotion(pieceType)}
                  >
                    {label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setPendingPromotion(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div
            className="horizontal-evaluation"
            role="img"
            aria-label={
              gameResult ||
              `White ${Math.round(whitePercent)}%, Black ${Math.round(100 - whitePercent)}%`
            }
          >
            <div
              className="horizontal-evaluation-white"
              style={{ width: `${whitePercent}%` }}
            />
            <div className="horizontal-evaluation-center" />
          </div>

          <div className="evaluation-caption">
            <span>White</span>
            <span>
              {gameResult ??
                (bestLine
                  ? formatEvaluation(bestLine.score)
                  : 'Analyzing...')}
            </span>
            <span>Black</span>
          </div>
        </div>

        <div className="board-navigation">
          <button
            className="pagination-btn"
            type="button"
            onClick={goBack}
            disabled={moveIndex === 0}
          >
            ← Back
          </button>

          <button
            className="pagination-btn"
            type="button"
            onClick={goForward}
            disabled={moveIndex === moveLine.length}
          >
            Forward →
          </button>
        </div>
      </div>

      <div className="right-panel">
        <div className="move-breadcrumb">
          Current Moves:{' '}
          {moveLine.length === 0 ? (
            <strong>Starting Position</strong>
          ) : (
            <strong>
              {moveLine.map((move, index) => (
                <React.Fragment key={index}>
                  {index % 2 === 0 &&
                    `${Math.floor(index / 2) + 1}. `}
                  <button
                    type="button"
                    onClick={() => jumpToMove(index + 1)}
                    title={`Go to position after ${move}`}
                    className={
                      index + 1 === moveIndex
                        ? 'breadcrumb-move active'
                        : 'breadcrumb-move'
                    }
                  >
                    {move}
                  </button>{' '}
                </React.Fragment>
              ))}
            </strong>
          )}
        </div>

        <div className="panel-card">
          <div className="card-header">
            <h3 className="card-title">
              Stockfish analysis
            </h3>
            {engineDepth != null && !gameResult && (
              <span className="depth-badge">
                Depth {engineDepth}
              </span>
            )}
          </div>

          {gameResult ? (
            <div className="engine-status">
              {gameResult}
            </div>
          ) : engineError ? (
            <div role="alert">{engineError}</div>
          ) : engineLines.length === 0 ? (
            <div className="engine-status">
              Analyzing position...
            </div>
          ) : (
            <div className="engine-lines">
              {engineLines.slice(0, 3).map((line, index) => {
                const scoreValue = line.score?.value ?? 0;
                const scoreColor =
                  scoreValue > 0
                    ? 'white-advantage'
                    : scoreValue < 0
                      ? 'black-advantage'
                      : 'equal-position';

                return (
                  <div
                    className="engine-line"
                    key={line.rank ?? index}
                  >
                    <strong
                      className={`engine-line-score ${scoreColor}`}
                      title={
                        scoreValue > 0
                          ? 'White is better'
                          : scoreValue < 0
                            ? 'Black is better'
                            : 'Equal position'
                      }
                    >
                      {formatEvaluation(line.score)}
                    </strong>

                    <span className="engine-line-moves">
                      {formatVariation(line.moves, moveIndex)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel-card">
          <div className="card-header">
            <h3 className="card-title">
              Move Breakdown ({candidateMoves.length} Responses)
            </h3>
          </div>

          <div className="move-explorer-list">
            {candidateMoves.length === 0 ? (
              <div className="engine-status">
                No further moves found for this sequence.
              </div>
            ) : (
              candidateMoves.slice(0, 5).map((move) => {
                // API win/loss percentages are from the searched
                // opponent's perspective.
                const whitePct =
                  colorFilter === 'white'
                    ? move.winPct
                    : move.lossPct;
                const blackPct =
                  colorFilter === 'black'
                    ? move.winPct
                    : move.lossPct;
                const drawPct = move.drawPct;

                return (
                  <button
                    key={move.moveSan}
                    type="button"
                    className="move-row"
                    onClick={() => {
                      if (!pendingPromotion) {
                        commitMove(move.moveSan);
                      }
                    }}
                  >
                    <span className="move-san">
                      {move.moveSan}
                    </span>

                    <span className="move-freq">
                      {move.freqPct}%
                    </span>

                    <span className="move-count">
                      {move.count > 999
                        ? `${(move.count / 1000).toFixed(1)}K`
                        : move.count}
                    </span>

                    <span
                      className="result-bar"
                      title={`White wins: ${whitePct}%, draws: ${drawPct}%, Black wins: ${blackPct}%`}
                    >
                      {whitePct > 0 && (
                        <span
                          className="bar-win"
                          style={{ flexGrow: whitePct }}
                        >
                          {whitePct}%
                        </span>
                      )}

                      {drawPct > 0 && (
                        <span
                          className="bar-draw"
                          style={{ flexGrow: drawPct }}
                        >
                          {drawPct}%
                        </span>
                      )}

                      {blackPct > 0 && (
                        <span
                          className="bar-loss"
                          style={{ flexGrow: blackPct }}
                        >
                          {blackPct}%
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div
          className="panel-card"
          style={{ flex: 1, overflowY: 'auto' }}
        >
          <div className="card-header">
            <h3 className="card-title">
              Notable Games ({totalMatches} sequence matches)
            </h3>
          </div>

          <table className="games-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Rating</th>
                <th>Player</th>
                <th>Rating</th>
                <th>Result</th>
                <th>Type</th>
              </tr>
            </thead>

            <tbody>
              {games.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    style={{ textAlign: 'center' }}
                  >
                    {loading
                      ? 'Loading games...'
                      : 'No matching games found.'}
                  </td>
                </tr>
              ) : (
                games
                  .slice(
                    (currentPage - 1) * GAMES_PER_PAGE,
                    currentPage * GAMES_PER_PAGE
                  )
                  .map((match) => (
                    <tr key={match.id}>
                      <td className="player-white">
                        {match.white.title}{' '}
                        {match.white.username}
                      </td>
                      <td className="rating-text">
                        ({match.white.rating ?? '—'})
                      </td>
                      <td>
                        {match.black.title}{' '}
                        {match.black.username}
                      </td>
                      <td className="rating-text">
                        ({match.black.rating ?? '—'})
                      </td>
                      <td>
                        <strong>{match.result}</strong>
                      </td>
                      <td className="rating-text">
                        {match.timeControl}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>

          <div className="pagination-container">
            <button
              className="pagination-btn"
              type="button"
              onClick={() =>
                setCurrentPage((page) =>
                  Math.max(1, page - 1)
                )
              }
              disabled={
                currentPage === 1 ||
                loading ||
                loadingMore
              }
            >
              Previous
            </button>

            <span>
              Page {currentPage} of {totalPages}
            </span>

            <button
              className="pagination-btn"
              type="button"
              onClick={handleNextPage}
              disabled={
                loading ||
                loadingMore ||
                currentPage >= totalPages
              }
            >
              {loadingMore
                ? 'Loading...'
                : currentPage * GAMES_PER_PAGE >= games.length &&
                    nextOffset !== null
                  ? 'Load more'
                  : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrepApp;