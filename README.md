# ChessPrep

A chess opponent preparation platform built by Pardhav Chakka, a Rutgers University Computer Science and Data Science student and National Master.

ChessPrep helps players explore an opponent’s opening habits, review their past games, and analyze positions with Stockfish.

## Features

- Import public Chess.com games by username.
- Filter games by the opponent’s color and time range.
- Explore candidate moves with frequency and win/draw/loss statistics.
- Move pieces on an interactive board with legal move validation.
- Choose a promotion piece.
- Navigate positions using board controls, arrow keys, and move history.
- View games in pages of 10, with additional batches loaded as needed.
- Sign up, sign in, and reset passwords through Supabase Auth.
- Save preparation searches to revisit past opponents.
- Analyze positions with three Stockfish variations and an evaluation bar.
- Cache backend results using Redis.

## Technology

- **Frontend:** React, react-chessboard, chess.js, Axios
- **Backend:** Node.js, Express
- **Database and authentication:** Supabase
- **Cache:** Redis
- **Analysis:** Stockfish running in a browser Web Worker

## Project Structure

```text
ChessPrep/
├── client/
│   ├── public/stockfish/
│   ├── src/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── workers/
│   │   ├── App.js
│   │   ├── PrepApp.js
│   │   └── supabaseClient.js
│   ├── .env.example
│   └── package.json
├── server/
│   ├── index.js
│   ├── eco.json
│   ├── .env.example
│   └── package.json
└── README.md
```

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/pchakka1234/ChessPrep.git
cd ChessPrep
```

The repository is currently private, so cloning requires access.

### 2. Configure Supabase

Create a Supabase project and configure the database tables, authentication,
and row-level security policies required by the application.

Database migrations are not yet included in this repository.
The environment files alone do not create the database schema.

For local authentication, configure the Supabase Auth site URL and permitted
redirect URLs to include:

```text
http://localhost:3000
```

### 3. Configure environment variables

From the project root:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Replace the placeholder values in both `.env` files with your configuration.

The client uses a Supabase publishable key. The server uses a Supabase secret
key. Never place the server secret key in the client.

Restart the development servers after changing environment variables.

### 4. Start Redis

With Docker running:

```bash
docker run -d \
  --name chessprep-redis \
  --restart unless-stopped \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine
```

If this container already exists, start it instead:

```bash
docker start chessprep-redis
```

### 5. Start the backend

In one terminal:

```bash
cd server
npm ci
npm start
```

The backend reads its port from `server/.env`.

### 6. Start the frontend

In a second terminal, starting from the project root:

```bash
cd client
npm ci
npm start
```

Open:

```text
http://localhost:3000
```

## Usage

1. Create an account and sign in.
2. Enter a Chess.com username.
3. Choose the opponent’s color and a time range.
4. Search to import and explore their games.
5. Play moves on the board or select candidate moves.
6. Review game statistics and Stockfish analysis.
7. Revisit saved preparation searches.

## Production Build

```bash
cd client
npm run build
```

This creates the frontend production build. The Express backend, Supabase,
and Redis must be configured separately for deployment.

## Credentials

Real `.env` files are excluded from Git.

Only placeholder configuration belongs in `.env.example` files.
Supabase row-level security policies should restrict saved searches to
their owning authenticated user.

## Stockfish

ChessPrep includes a browser build of Stockfish.

Stockfish is licensed under GPLv3. Its license and the corresponding source
for the distributed engine build must accompany redistribution. The
application’s own licensing is separate.

Upstream projects:

- https://stockfishchess.org/
- https://github.com/official-stockfish/Stockfish
- https://github.com/nmrugg/stockfish.js

## Author

**Pardhav Chakka**

Rutgers University — Computer Science and Data Science  
National Master in chess

GitHub: https://github.com/pchakka1234