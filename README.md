# Element

A responsive web adaptation of **Element**, the 2–4-player strategy game by Mike Richie, published by Rather Dashing Games. Includes private invite tables, pass-and-play, a rules guide, and the three agreed house rules.

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

Table updates are fetched approximately every **1.8 seconds** while a tab is visible and every **10 seconds** in the background. Polls go directly to the protected database REST API; only mutations invoke the Edge Function. This avoids a separate WebSocket lifecycle and keeps the deployment small. Each mutation uses a version check, so simultaneous actions cannot overwrite one another.

The app retains tables until the project owner removes them. No scheduled cleanup or paid infrastructure is created. Browser storage holds the anonymous session; clearing it or switching browsers loses access to that seat. A disconnected player keeps their seat and their turn waits. There is no turn timer, automatic replacement player, or host migration needed during an active game.

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

### Practical limits

- Rules previews mark geometrically eligible placements. Final validation also checks complete river effects and self-trapping; a highlighted placement can still be rejected for those reasons.
- Checking whether stones are completely unplayable explores remaining Sage moves and possible placements. Extremely complex positions use a conservative search budget: if the search is inconclusive, it refuses to return stones instead of granting an incorrect discard. The UI explains this outcome.
- Intended for private games among friends. No matchmaking, chat, accounts UI, spectators, bots, or timed/asynchronous match management.

## Project map

| Location | Purpose |
| --- | --- |
| `src/game.js` | Pure rules engine and validation |
| `src/rooms.js` | Room commands, ownership, versions and idempotency |
| `src/app.js`, `styles.css` | Board UI, lobby and rules guide |
| `src/api.js` | Anonymous sessions, polling and mutations |
| `scripts/server.mjs` | Persistent local multiplayer server |
| `supabase/functions/table/` | Production move handler |
| `supabase/migrations/` | Private table storage and read policies |
| `.github/workflows/pages.yml` | Tests, static build and Pages deployment |

Original board game by Mike Richie, published by Rather Dashing Games. This is an unofficial adaptation, not affiliated with or endorsed by the publisher. Digital artwork and interface were created for this implementation.
