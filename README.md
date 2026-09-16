# Element

A responsive web adaptation of **Element**, the 2–4-player strategy game by Mike Richie, published by Rather Dashing Games. Includes private invite tables, pass-and-play, a rules guide, and the agreed house rules.

## Try it locally

Requires Node.js 20 or newer. There are **no runtime or build dependencies to install**.

```sh
npm start
```

Open **http://127.0.0.1:8787**. Create a private table and open its invite in separate browser profiles/private sessions to simulate friends, or select **Play on one device** for pass-and-play. Tabs in the same browser profile share the same seat.

The local server saves tables and anonymous sessions in `.data/tables.json`, so restarting it preserves games. It listens on loopback and is intended for development. Internet play uses Supabase below.

```sh
npm test        # Rules, room permissions, production handler, HTTP/restart tests
npm run build  # Produces a standalone dist/ folder
npm run preview # Serves the production dist/ build at the same local address
```

Stop the development server before starting the preview on the same port. Without Supabase settings, the production build supports shared-device play and clearly marks online tables unavailable.

## Turn controls and feedback

Quick flow selects the first drawn element, keeps repeated stones selected, then advances through the remaining hand. When the hand is empty, Sage movement becomes active. Movement remains selected across paid steps and free wind jumps. River paths and limited-fire choices still require confirmation; End turn remains explicit.

Online placements and Sage moves appear immediately after local validation while the server saves them. A brief settling animation plays once, and the existing token stays in place when confirmation arrives. If a move is rejected, the UI restores the authoritative board. Draws and victory announcements wait for server confirmation. Further actions wait until the current save finishes.

Desktop draw, placement, and river/fire controls sit beside the board in a viewport-sized layout. On phones, controls sit below the board and remain within reach while scrolling. Grouped stones show counts. **Sound & motion** in the header controls optional audio, volume, and reduced motion; preferences are saved on the device. Sage steps use the approved **Quiet brush** cue. Sounds only start after a browser interaction, and hidden tabs are quiet. Each accepted board action has visual feedback and a **Replay last action** button for the latest observed move (replay does not change game state).

## Table clock and shared activity

The host can choose **No timer**, **5**, **10**, **15**, or **30 minutes per player** in the lobby. The clock starts after the opening toss reveal, runs throughout the active player's turn (including drawing and path previews), and switches on **End turn**. There is no increment or disconnect pause. Expiry ends the entire game: the player targeting the timed-out Sage wins, including in three- and four-player games. This is an optional digital house rule.

The server uses its own timestamp to enforce the clock; browser clocks are displays, not authority. A seated client requests an expiry check at zero. If everyone is offline, the next sync or action resolves the overdue game. Remaining time survives refresh and rematches get fresh clocks. Untimed existing tables continue normally.

Everyone sees the current draw, including played-stone indicators. A staggered reveal uses only the server-confirmed draw. The activity sidebar shows the move log to the right on desktop; on phones the draw sits above the board and the log follows it. Rivers animate along their chosen orthogonal route, including extinguishing fire as specified by the published rules. Reduced motion skips these animations, and replay does not change the game.

New games open with a visible server-selected toss: Heads/Tails for two players, or an equal-chance starting-Sage draw for three or four. The result is stored once, survives refresh and retries, and appears in the move log. Moves are blocked during the 3.6-second reveal, and that time does not consume anyone's clock. Existing games do not replay the toss.

## What is included

- 11×11 board; standard 2-, 3-, and 4-player starts; counterclockwise turns and clockwise targets.
- Finite shared bag: 30 stones of each element. Server-generated random draws.
- Fire spreading along straight lines, river selection and path previews, permanent earth ranges, and wind stacks/jumps.
- Legal placement hints, Sage movement hints, immediate wins, shared victories, action history, rematches, and an in-game reference.
- Private 8-character invite codes and links. Nicknames with anonymous authentication; no account-creation screen.
- Authoritative multiplayer state, stale-action rejection, duplicate-request protection, and refresh/disconnection recovery.
- Responsive desktop/mobile layouts and keyboard navigation across board spaces.
- Original SVG artwork; no external fonts, images, CDN scripts, or publisher artwork required.

## Deploy: GitHub Pages + Supabase

The frontend is static. Supabase stores tables and validates moves in an Edge Function. Both use the same `src/game.js` rules engine.

### 1. Prepare Supabase

1. Create a Supabase project on the Free plan.
2. Enable **Anonymous Sign-Ins** in the project's Authentication settings. This provides an authenticated identity without asking players for an email or password.
3. In the SQL editor, run `supabase/migrations/202609150001_tables.sql` once. Alternatively, use the CLI migration commands below.
4. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) using its documented installation method. From this folder, run:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy table
   ```

   If you did **not** run the migration through the SQL editor, also run:

   ```sh
   supabase db push
   ```

5. Copy the project URL and **publishable** API key, beginning `sb_publishable_`, from the project settings. These two values are intended for the browser. Do not put a secret/service-role key in the frontend or GitHub variables.

The Edge Function uses Supabase's server-only `SUPABASE_SERVICE_ROLE_KEY` environment variable. The function's gateway `verify_jwt` is disabled in `supabase/config.toml` because the handler explicitly verifies the supplied bearer token through Supabase Auth's `/auth/v1/user` endpoint. Missing, forged, or unauthenticated tokens are rejected before database access. This supports current signing keys without depending on the legacy gateway verifier.

### 2. Publish the frontend

1. Put **the contents of this `element` folder at your GitHub repository root** and push to its `main` branch.
2. Under **Settings → Secrets and variables → Actions → Variables**, add:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | The public `sb_publishable_…` key |

3. Under **Settings → Pages**, choose **GitHub Actions** as the source.
4. Run **Test and deploy Element** from the Actions tab, or push another commit to `main`.

The workflow runs the tests, builds `dist/`, and publishes it. Relative asset URLs and fragment-based invite links work at both `username.github.io` and `username.github.io/repository/`. Pull requests run tests and build without publishing.

To build locally with online rooms enabled:

```sh
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY \
npm run build
```

Only `dist/` should be uploaded to a static host. Backend changes require deploying the Edge Function again; the Pages workflow deploys the frontend only. Deploy the matching rules engine on both sides when changing gameplay.

### 3. Check the live site

Use two separate devices or browser profiles. Create a two-player room, join it using the invitation, start the game, place a stone, and confirm both devices see the same position. Reload the current player's browser and complete the turn. Repeat with a four-player table. This live check is required because local tests do not validate a project's deployed Auth settings, SQL policies, or Edge Function configuration.

### Hosting behavior

Supabase's Free plan currently includes 500 MB of database storage and 500,000 Edge Function invocations per month. Low-activity projects may pause after a week; resume them through the dashboard before the next game. See [current pricing](https://supabase.com/pricing) and [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

Table updates are fetched approximately every **1.8 seconds** while a tab is visible and every **10 seconds** in the background. Polls go directly to the protected database REST API; mutations and timed-game clock synchronization invoke the Edge Function. This avoids a separate WebSocket lifecycle and keeps the deployment small. Each mutation uses a version check, so simultaneous actions cannot overwrite one another.

The app retains tables until the project owner removes them. No scheduled cleanup or paid infrastructure is created. Browser storage holds the anonymous session; clearing it or switching browsers loses access to that seat. A disconnected player keeps their seat. Untimed games wait for them; timed games keep counting down. There is no automatic replacement player or host migration during an active game.

## Rules and interpretation

The source of truth is **Element_Rules_revised_v2.pdf**, the revised April 2017 base rules supplied by the project owner. Printed pages 2–3 cover turn structure, setup and victory; pages 4–11 cover the elements. The publisher PDF is not copied into this project.

The agreed additions are described in [RULES.md](RULES.md) and the in-game guide. They are house rules, not claims of official publisher rulings. No expansion elements are included.

## Verification

`npm test` includes rules scenarios, inventory conservation, room capacity/ownership, stale and duplicate commands, four-player HTTP synchronization, persistence across a local server restart, and the production Edge Function handler against a controlled Auth/PostgREST test double. The test double does not replace a live SQL/RLS deployment check.

Optional browser tests use Playwright:

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
# Start npm start in another terminal, then:
node scripts/browser-test.mjs
```

Alternatively set `BROWSER_CHANNEL=chrome` to use installed Chrome. `PLAYWRIGHT_MODULE` may point to an existing Playwright `index.mjs` installation. Screenshots are written to the ignored `test-results/` directory. These checks exercise four-player creation/join, draw/place/move/end, reload, host departure, temporary network loss, mobile layouts, the rules dialog, and river preview/confirmation.

Use `BROWSER_ENGINE=webkit` (without `BROWSER_CHANNEL`) after installing Playwright's WebKit browser to check Safari's rendering engine. The browser checks also verify that board tokens remain square and leave space inside their cells on desktop and mobile.

### Practical limits

- Rules previews mark geometrically eligible placements. Final validation also checks complete river effects and self-trapping; a highlighted placement can still be rejected for those reasons.
- Checking whether stones are completely unplayable explores remaining Sage moves and possible placements. Extremely complex positions use a conservative search budget: if the search is inconclusive, it refuses to return stones instead of granting an incorrect discard. The UI explains this outcome.
- Intended for private games among friends. No matchmaking, chat, accounts UI, spectators, bots, or asynchronous match scheduling.

Run `node scripts/interaction-browser-test.mjs` with the same browser environment variables for Quick flow, river confirmation, replay, preferences, and responsive action-bar checks.

Run `node scripts/placement-browser-test.mjs` to test immediate feedback while replies are held, rejection rollback, stale-state recovery, and idempotent retries after a lost response.

Run `node scripts/table-browser-test.mjs` (default local port 8793; override with `ELEMENT_TEST_URL`) for lobby clocks, two-player shared draws, draw and river animations, the activity sidebar, reduced motion, and timeout victory.

Run `node scripts/viewport-browser-test.mjs` (default port 8794) for timer visibility, persistent toss results, and no-scroll desktop draw/play/river/fire controls across six viewport sizes.

## Project map

| Location | Purpose |
| --- | --- |
| `src/game.js` | Pure rules engine and validation |
| `src/clock.js` | Per-player time accounting and timeout victory |
| `src/rooms.js` | Room commands, ownership, versions and idempotency |
| `src/app.js`, `styles.css` | Board UI, lobby and rules guide |
| `src/api.js` | Anonymous sessions, polling and mutations |
| `scripts/server.mjs` | Persistent local multiplayer server |
| `supabase/functions/table/` | Production move handler |
| `supabase/migrations/` | Private table storage and read policies |
| `.github/workflows/pages.yml` | Tests, static build and Pages deployment |

Original board game by Mike Richie, published by Rather Dashing Games. This is an unofficial adaptation, not affiliated with or endorsed by the publisher. Digital artwork and interface were created for this implementation.
