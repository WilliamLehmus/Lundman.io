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

## 🛡️ Standard Bug Fix Workflow (MANDATORY)
Whenever a bug, error, or logic gap is identified, follow these three steps:
1. **Felsökning (Troubleshoot)**: Identify the root cause through logs, code audit, or reproduction.
2. **Åtgärdar (Fix)**: Implement the minimal, robust solution.
3. **Dokumentera (Document)**: Record the error, root cause, and solution in `App Documentation.md` under the "Known Issues & Critical Fixes" section to prevent regression.

## ⚠️ Known Bugs & Gotchas

### Vite 500 Internal Server Error on `game.js`
**Symptom**: `GET /game.js net::ERR_ABORTED 500` + Vite `import-analysis` plugin fails.

**Root Causes (in order of likelihood):**
1. **Mismatched braces `{}`** – A large `replace_file_content` or `multi_replace_file_content` call inserts a `function drawX()` block but leaves extra or missing closing braces from the original code. The JS is syntactically broken but `node -c` may still pass (Node is lenient with some edge cases).
2. **Nested function declaration** – A replacement accidentally places a `function` declaration *inside* another function body (e.g. `drawElements` ending up inside `interpolateState`). Vite's strict ESM transform catches this, Node's `node -c` does not.
3. **Non-ASCII characters** – Swedish characters (ä, ö, å) in comments or strings can cause encoding mismatches when Vite tries to parse the file.
5. **Missing Imports from `gameConfig.js`** – When adding logic to `game.js` that uses shared constants (like `WEAPON_MODULES`, `MATERIALS`, etc.), ensure they are added to the destructured `import` statement at the top of the file.

**Prevention Rules (ALWAYS follow these):**
- **Verify Imports**: Before finishing a task that uses shared data, check that every constant is explicitly imported in `game.js`.
- **After ANY edit to `game.js`, verify with `node -c frontend/game.js`** before considering the task done. A clean exit means no syntax errors.
- **After `node -c` passes, run `cd frontend; npm run build`** to catch missing variables or Vite-specific transform errors.
- **When replacing large blocks**, count opening `{` and closing `}` manually before saving. The number must balance.
- **When adding a new `function X()` block**, use `Select-String` to confirm the function appears **exactly once** and is **not nested** inside another function.
- **Never use non-ASCII characters** (Swedish/special chars) in JS source files. Comments in Swedish are fine in `.md` files only.
- **Keep `vite.config.js` with `fs: { allow: ['..'] }`** at all times since `game.js` imports from `../backend/gameConfig.js`.

**Debugging Steps (if the 500 error happens again):**
1. `node -c frontend/game.js` – check for syntax errors.
2. `cd frontend; npm run build` – get the exact Vite error with file + line number.
3. Check the specific line in the error, look for brace imbalance or nested functions above it.
4. Use `Select-String` to find duplicate or missing function declarations.
