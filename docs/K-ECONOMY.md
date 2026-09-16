# K coins

K is internal game currency for registered accounts. Existing balances, purchases and transaction IDs are preserved. The legacy e_balance tables, /api/e routes and decimal payload field names remain compatible; they now represent K.

The server rolls kill rewards once and journals the roll alongside the scoring action:
- Bots: 0.7–1 K.
- Real players: 1–2 K.
- FFA: add 1 K for each victim streak kill above 2. Death resets the streak.
- Headshots retain their normal score but use the same kill reward range.

Configure these in the economy admin's Kill Rewards section. Existing item/event multipliers, caps, AFK and repeated-victim protections still apply. Survival enemy and boss actions keep their configured score/wave rewards.

Leaving checkpoints pending earnings; match closure or recovery credits the account once. Server-eligible K kills do not lose their reward solely because the player left before minimum match/participation time. Guests and client-submitted kills cannot award K. FFA supports one registered participant fighting server bots. Initial configuration upgrade is idempotent; it enables bot earnings and the new ranges without touching player balances.
