# Rules decisions

## Published base rules

Use the supplied **Element_Rules_revised_v2.pdf**, revised April 2017. The web game implements:

- An 11×11 board and 30 stones per element.
- Two-player starts at F7 and F5. Three and four players use C9, I9, I3 and C3 in clockwise seat order; the three-player game leaves C3 empty.
- A randomly chosen starting player. Turns run counterclockwise; each player's target is the next Sage clockwise.
- At the start of a turn, choose to draw 0–4 stones, limited by the available supply. Movement allowance is 5 minus the number actually drawn. Drawing happens before any movement or placement.
- Use movements and placements in any order. All drawn stones must be placed; unused movement expires when the turn ends. Wind jumps do not spend movement.
- Replacement cycle: water replaces fire; fire replaces wind; wind replaces unprotected earth; earth replaces water. Replaced stones return to the shared bag. Fire can replace an entire wind stack.
- Fire extends at the far end of each orthogonally adjacent fire line. No chain reactions from free stones.
- Water selects one adjacent directional line, including when placed between lines. The river follows a clear orthogonal path equal to its full length, including the new headwater. It may turn and extinguish fire. Existing water cells block its path; the route cannot intersect itself.
- Earth stacks of two create mountains. Every earth stone connected orthogonally or diagonally becomes part of a protected range. Diagonal Sage steps cannot squeeze between two range stones.
- Wind stacks may contain up to four stones. A jump crosses as many spaces as the total height of the contiguous wind line next to the Sage, then lands on the following empty space. Stacks can carry Sages over intervening obstacles. A Sage cannot enter wind diagonally through a range. Every actual wind stone can be used only once per turn.
- A Sage is captured when it has no legal ordinary step or wind jump. Capture checks evaluate physical escape routes, not the current player's remaining movement allowance. Already-used wind does not permanently trap a Sage.
- The owner of a captured target wins immediately, even when another player caused the capture. Remaining hand stones do not delay the victory. An action that traps the acting player's own Sage is illegal.

## Agreed house rules

These were explicitly selected for this adaptation and are not presented as official rulings.

### 1. Unplayable stones

Remaining stones can be returned to the bag only when no legal continuation can place any remaining stone. The check includes the Sage's remaining ordinary moves and wind jumps, and full river/fire effects. As long as any remaining stone can legally be placed after a continuation, the player must continue playing. Returned stones grant no movement and cannot be redrawn in that turn.

The search has a conservative computational limit. An inconclusive result is not permission to return stones. The player receives an explanation rather than an incorrect automatic discard.

### 2. Fire supply shortages

Generate only as many free fire stones as are currently in the bag. If eligible destinations outnumber the available supply, the acting player selects exactly that many destinations before the placement commits. If no fire remains, no free stones appear, but the original placement is still permitted when otherwise legal.

### 3. Simultaneous captures

Eligible target owners share victory if one completed action traps multiple opposing Sages. An action that also traps the acting Sage remains illegal.

### 4. Optional chess clock

The host chooses Off, 5, 10, 15, or 30 minutes per player before starting. Only the active player's clock runs, including drawing, Sage movement, placement previews, and confirmation. End turn switches the running clock. There is no increment and disconnecting does not pause it. Running out ends the whole game immediately and awards victory to the player whose target is the timed-out Sage (the preceding player in clockwise seating order). The server decides expiry before accepting a late move. Existing untimed tables are unchanged.

## Resolution boundaries

A placement and its complete elemental effect are one atomic action. River-path and fire-shortage selections are previews; no partial effect is committed. Captures are checked on the resolved board. This prevents animation order or server iteration order from deciding a winner. The game ends immediately after a resolved action produces a capture.

## Digital table behavior

- Every participant sees the board, current drawn stones, bag counts and last 60 log entries.
- Refreshing restores the last committed action. An unconfirmed path preview is discarded on refresh.
- Nicknames identify people visually; server-verified anonymous identities own their seats.
- The creator starts a full table and can open a rematch after the game ends. In the lobby, if the creator leaves, ownership passes to the next seated player.
- Closing a browser does not remove a seat. Untimed games wait for a disconnected player's return; timed games keep counting down.
- In pass-and-play mode all participants use the same device and the same local save.
