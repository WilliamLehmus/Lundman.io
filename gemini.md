# Gemini / AI Rules & Memories

## 🏗️ Project Architecture
- **Tech Stack**: Node.js (ESM) + Vite 6 + Vanilla JS.
- **Pattern**: Zero-Config Railway Monorepo.
- **Workflow**: 
    - Use `npm run dev` to start both backend and frontend.
    - Root `package.json` manages backend deps and frontend build orchestration.
    - Frontend lives in `/frontend/`, Backend logic in `/backend/`.

## 🛠️ Preferred Frameworks & Tools
- **Core**: Express, Axios, Socket.io.
- **Physics**: Matter.js (Server-side authoritative).
- **Styling**: Vanilla CSS (Neon/Premium aesthetic).
- **Dev Tools**: `concurrently` (multi-process), `nodemon` (backend restart).

## 🎮 Game Specific Patterns
- **Audio**: Audio must be triggered by user interaction (Host/Join).
- **Volume**: Preferences saved to `localStorage`.
- **Options**: `ESC` key toggles the options menu.
- **Persistence**: Player name saved to `localStorage` as `tanks_username`.

## 🚀 Deployment (Railway)
- Root directory: `/`.
- Build command: `npm run build` (triggers `postinstall` which builds frontend).
- Port: `3000` (Backend) / `5173` (Vite Proxy).
