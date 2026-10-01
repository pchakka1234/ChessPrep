require('dotenv').config();

const { createHash } = require('node:crypto');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const { Chess } = require('chess.js');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { createClient: createRedisClient } = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT);
const CACHE_SECONDS = 600;
const IMPORT_CACHE_SECONDS = 300;
const GAMES_PER_BATCH = 50;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('Set a valid PORT in server/.env');
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_KEY in server/.env');
}

if (!process.env.REDIS_URL) {
  throw new Error('Set REDIS_URL in server/.env');
}

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: WebSocket,
    },
    auth: {
      persistSession: false,
    },
  }
);

const redis = createRedisClient({
  url: process.env.REDIS_URL,
});

redis.on('error', (error) => {
  console.error('Redis error:', error);
});

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readCachedJson(key) {
  const value = await redis.get(key);
  return value === null ? null : JSON.parse(value);
}

async function writeCachedJson(key, value, seconds = CACHE_SECONDS) {
  await redis.set(key, JSON.stringify(value), {
    EX: seconds,
  });
}

async function getCacheVersion(username) {
  return (await redis.get(`prep:version:${username}`)) || '0';
}

function getCutoff(months) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

async function getChessComJson(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ChessPrep/1.0 (public game archive importer)',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (response.status === 404) {
    throw Object.assign(
      new Error(`Chess.com ${label} was not found.`),
      { status: 404 }
    );
  }

  if (response.status === 429) {
    throw Object.assign(
      new Error('Chess.com rate limit reached. Try again later.'),
      { status: 503 }
    );
  }

  if (!response.ok) {
    throw new Error(
      `Chess.com ${label} request failed (${response.status}).`
    );
  }

  return response.json();
}

// Import an opponent's recent public Chess.com games.
app.post('/api/ingest/chess-com', async (req, res) => {
  const username = req.body?.opponentUsername?.trim();
  const months = Number(req.body?.timeRangeMonths ?? 2);

  if (
    !username ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(username) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 60
  ) {
    return res.status(400).json({
      error: 'Invalid username or time range.',
    });
  }

  const normalizedUsername = username.toLowerCase();
  const importKey = `prep:import:${hash(JSON.stringify([
    normalizedUsername,
    months,
  ]))}`;

  try {
    // Reuse a recent import when Search is clicked again.
    const recentImport = await readCachedJson(importKey);

    if (recentImport !== null) {
      return res.json({
        ...recentImport,
        cached: true,
      });
    }

    const cutoff = getCutoff(months);
    const baseUrl =
      `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games`;

    const archiveData = await getChessComJson(
      `${baseUrl}/archives`,
      'archive list'
    );

    const archiveUrls = (archiveData.archives || []).filter((url) => {
      const match = url.match(/\/games\/(\d{4})\/(\d{2})$/);
      if (!match) return false;

      const year = Number(match[1]);
      const month = Number(match[2]);

      // Include the month containing the cutoff date.
      return (
        year > cutoff.getUTCFullYear() ||
        (
          year === cutoff.getUTCFullYear() &&
          month >= cutoff.getUTCMonth() + 1
        )
      );
    });

    let gamesProcessed = 0;

    for (const archiveUrl of archiveUrls) {
      const archive = await getChessComJson(
        archiveUrl,
        'monthly archive'
      );

      const rows = (archive.games || []).flatMap((game) => {
        if (!game.url || !game.pgn || !game.end_time) {
          return [];
        }

        const playedAt = new Date(game.end_time * 1000);

        if (
          Number.isNaN(playedAt.getTime()) ||
          playedAt < cutoff
        ) {
          return [];
        }

        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn);
        } catch {
          return [];
        }

        const resultMatch = game.pgn.match(
          /^\[Result\s+"(1-0|0-1|1\/2-1\/2|\*)"\]/m
        );
        const result = resultMatch?.[1];

        if (!result) return [];

        return [{
          platform: 'chess_com',
          platform_game_id: game.url,
          white_username: game.white?.username || '',
          black_username: game.black?.username || '',
          white_title: game.white?.title || null,
          black_title: game.black?.title || null,
          white_rating: game.white?.rating ?? null,
          black_rating: game.black?.rating ?? null,
          result,
          time_control: game.time_control || null,
          played_at: playedAt.toISOString(),
          pgn: game.pgn,
        }];
      });

      for (let index = 0; index < rows.length; index += 200) {
        const chunk = rows.slice(index, index + 200);

        const { error } = await supabase
          .from('opponent_games')
          .upsert(chunk, {
            onConflict: 'platform,platform_game_id',
          });

        if (error) throw error;

        gamesProcessed += chunk.length;
      }
    }

    // Old parsed games and position results have an old version
    // in their cache keys and will no longer be used.
    await redis.incr(`prep:version:${normalizedUsername}`);

    const summary = {
      username,
      months,
      archivesChecked: archiveUrls.length,
      gamesProcessed,
    };

    await writeCachedJson(
      importKey,
      summary,
      IMPORT_CACHE_SECONDS
    );

    res.json({
      ...summary,
      cached: false,
    });
  } catch (error) {
    console.error('Chess.com import failed:', error);

    res.status(error.status || 502).json({
      error: error.status
        ? error.message
        : 'Could not import Chess.com games.',
    });
  }
});

// Fetch and parse games once per opponent/color/range/cache version.
async function getParsedOpponentGames(
  username,
  colorFilter,
  months,
  version
) {
  const cacheKey = `prep:games:${hash(JSON.stringify([
    version,
    username.toLowerCase(),
    colorFilter,
    months,
  ]))}`;

  const cached = await readCachedJson(cacheKey);
  if (cached !== null) return cached;

  const cutoff = getCutoff(months);
  const playerColumn =
    colorFilter === 'white'
      ? 'white_username'
      : 'black_username';

  const parsed = [];
  const batchSize = 500;

  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await supabase
      .from('opponent_games')
      .select(`
        id,
        white_username,
        black_username,
        white_title,
        black_title,
        white_rating,
        black_rating,
        result,
        time_control,
        played_at,
        pgn
      `)
      .eq('platform', 'chess_com')
      .ilike(playerColumn, username)
      .gte('played_at', cutoff.toISOString())
      .order('played_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) throw error;

    for (const row of data || []) {
      // SQL LIKE treats underscores as wildcards. Confirm exact match.
      if (
        row[playerColumn]?.toLowerCase() !==
        username.toLowerCase()
      ) {
        continue;
      }

      try {
        const chess = new Chess();
        chess.loadPgn(row.pgn);

        parsed.push({
          history: chess.history(),
          game: {
            id: row.id,
            white: {
              username: row.white_username,
              title: row.white_title || '',
              rating: row.white_rating,
            },
            black: {
              username: row.black_username,
              title: row.black_title || '',
              rating: row.black_rating,
            },
            result: row.result,
            timeControl: row.time_control,
            createdAt: row.played_at,
          },
        });
      } catch {
        // Skip a game with an invalid PGN.
      }
    }

    if (!data || data.length < batchSize) break;
  }

  await writeCachedJson(cacheKey, parsed);
  return parsed;
}

// Return move statistics and the first 50 matching games.
app.post('/api/prep-search', async (req, res) => {
  const {
    opponentUsername,
    moveHistory = [],
    colorFilter = 'white',
    timeRangeMonths = 2,
  } = req.body || {};

  const username = opponentUsername?.trim();
  const months = Number(timeRangeMonths);

  if (
    !username ||
    !Array.isArray(moveHistory) ||
    !moveHistory.every((move) => typeof move === 'string') ||
    !['white', 'black'].includes(colorFilter) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 60
  ) {
    return res.status(400).json({
      error: 'Invalid search parameters.',
    });
  }

  try {
    const version = await getCacheVersion(
      username.toLowerCase()
    );

    const resultKey = `prep:position:${hash(JSON.stringify([
      version,
      username.toLowerCase(),
      colorFilter,
      months,
      moveHistory,
    ]))}`;

    let result = await readCachedJson(resultKey);

    if (result === null) {
      const parsedGames = await getParsedOpponentGames(
        username,
        colorFilter,
        months,
        version
      );

      const matching = parsedGames.filter(({ history }) =>
        moveHistory.every(
          (move, index) => history[index] === move
        )
      );

      const moveStats = new Map();
      let gamesWithNextMove = 0;

      for (const { game, history } of matching) {
        const nextMove = history[moveHistory.length];
        if (!nextMove) continue;

        gamesWithNextMove += 1;

        const stats = moveStats.get(nextMove) || {
          count: 0,
          wins: 0,
          draws: 0,
          losses: 0,
        };

        stats.count += 1;

        if (game.result === '1/2-1/2') {
          stats.draws += 1;
        } else if (
          (colorFilter === 'white' && game.result === '1-0') ||
          (colorFilter === 'black' && game.result === '0-1')
        ) {
          stats.wins += 1;
        } else if (
          game.result === '1-0' ||
          game.result === '0-1'
        ) {
          stats.losses += 1;
        }

        moveStats.set(nextMove, stats);
      }

      const candidateMoves = [...moveStats.entries()]
        .map(([moveSan, stats]) => ({
          moveSan,
          count: stats.count,
          freqPct: Math.round(
            (stats.count / gamesWithNextMove) * 100
          ),
          winPct: Math.round(
            (stats.wins / stats.count) * 100
          ),
          drawPct: Math.round(
            (stats.draws / stats.count) * 100
          ),
          lossPct: Math.round(
            (stats.losses / stats.count) * 100
          ),
        }))
        .sort((a, b) => b.count - a.count);

      result = {
        totalMatches: matching.length,
        candidateMoves,
        games: matching.map(({ game }) => game),
      };

      await writeCachedJson(resultKey, result);
    }

    res.json({
      totalMatches: result.totalMatches,
      candidateMoves: result.candidateMoves,
      games: result.games.slice(0, GAMES_PER_BATCH),
      nextOffset:
        result.games.length > GAMES_PER_BATCH
          ? GAMES_PER_BATCH
          : null,
      resultKey,
    });
  } catch (error) {
    console.error('Prep search failed:', error);

    res.status(500).json({
      error: 'Could not search opponent games.',
    });
  }
});

// Return the next 50 games from the cached position result.
// This does not query Supabase or recalculate the move statistics.
app.post('/api/prep-more', async (req, res) => {
  const { resultKey, offset } = req.body || {};
  const start = Number(offset);

  if (
    typeof resultKey !== 'string' ||
    !/^prep:position:[a-f0-9]{64}$/.test(resultKey) ||
    !Number.isInteger(start) ||
    start < GAMES_PER_BATCH
  ) {
    return res.status(400).json({
      error: 'Invalid load-more request.',
    });
  }

  try {
    const result = await readCachedJson(resultKey);

    if (result === null) {
      return res.status(410).json({
        error: 'Search expired. Run Search again.',
      });
    }

    const end = start + GAMES_PER_BATCH;

    res.json({
      games: result.games.slice(start, end),
      nextOffset:
        end < result.games.length ? end : null,
    });
  } catch (error) {
    console.error('Load more failed:', error);

    res.status(500).json({
      error: 'Could not load more games.',
    });
  }
});

async function startServer() {
  await redis.connect();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});