# Public EV.IO Comparison

Last checked: 2026-08-13

Legend: ✅ matching observable contract · ⚠️ close/partially verified · ❌ incorrect · ❓ unable to verify

| Mechanic | Public EV.IO observation | KYX.IO measured/observed | Status | Difference / evidence |
|---|---|---|---|---|
| Game entry | Public site exposes `CLICK TO PLAY` and immediate browser play | Guest entry and play button boot a match in the browser smoke | ✅ | Same low-friction observable flow |
| First-person Auto Rifle framing | Public gameplay stills show a compact diagonal rifle from lower right, with the rear cropped and support grip visible | Corrected to persistent 0.14 rad pitch, 0.13 rad yaw, 0.76 scale; screenshot and bounds checked | ⚠️ | Silhouette is closely matched; model geometry/skin remains original |
| Walk | Live EV.IO server unavailable in this session | 1.20 m during an independent 0.9 s browser trial; configured 6.2 m/s after acceleration | ❓ | Need a successful current EV.IO match for equivalent measurement |
| Sprint | Live EV.IO server unavailable | 2.09 m during an independent 0.9 s trial; 1.74× observed walk distance | ❓ | KYX behavior works; EV.IO timing not measured today |
| Jump | Live EV.IO server unavailable | Browser-observed peak +4.41 m; deterministic jump fixture passes | ❓ | EV.IO jump arc still needs current frame analysis |
| Auto Rifle cadence | Public live timing unavailable | 9 rounds/s contract test passes | ❓ | Do not claim parity until equivalent EV.IO footage is timestamped |
| Ammo/reload | EV.IO visibly has finite magazine HUD and reload | Ammo decreased 50→48; reload, reload-to-swap, and death-during-reload reset completed | ⚠️ | Observable contract matches; exact EV.IO reload duration unknown |
| Weapon switching | EV.IO exposes numbered weapon inventory | Gun→melee→gun browser sequence passes | ⚠️ | Exact public swap duration unknown |
| ADS/crosshair | EV.IO supports right-click aim and reticle change | Rapid-look browser stress and ADS enter/exit pass; all firearms clear the first ADS frame; 30/60/144 Hz state agrees | ⚠️ | Exact EV.IO FOV/sensitivity not measured |
| Blink/teleport | EV.IO exposes teleport ability and cooldown | Q activates blink and enters a 5 s cooldown; a new life resets it to ready | ⚠️ | Exact public range/cooldown not remeasured today |
| Frag/smoke abilities | EV.IO publicly exposes throwable combat abilities | G/F consume distinct frag/smoke charges; both refill at the new-life boundary | ⚠️ | Input/inventory contract works; exact public cooldown and projectile timing remain unmeasured |
| Scoreboard | EV.IO exposes leaderboard/performance UI | Hold Tab opens live scoreboard; release closes it | ✅ | Input/UI contract matches |
| Death/respawn | EV.IO uses a death/respawn flow | Dedicated overlay on local and authoritative paths; three-second monotonic automatic respawn; clean weapon and ability state verified | ⚠️ | Public exact delay unavailable in the disconnected session |
| Health/shield | EV.IO shows health/shield resources | 100 health; armor-dependent shield; damage and regeneration gates pass | ⚠️ | Exact public regeneration values unverified |
| Collision/map bounds | EV.IO uses angular arena collision and kill volumes | Deterministic wall/ceiling/corner/fall fixtures, map topology, and spawn gates pass | ⚠️ | KYX map is based on public Rook data, but feel needs human A/B play |
| Match population | EV.IO displays multiplayer population | KYX displays 8/8 with seven bot slots by default | ❌ | Default shipped game is not equivalent public multiplayer |
| Team Slayer | Public EV.IO has team modes | KYX menu entry currently runs deathmatch logic | ❌ | Teams not implemented |
| Capture the Flag | Public EV.IO has CTF | No flags implemented | ❌ | Mode incomplete |
| King of the Hill | Public EV.IO has objective modes | No hill implemented | ❌ | Mode incomplete |
| Firefight/survival | Public EV.IO exposes survival/PvE | KYX has wave defense, down/revive, zombies | ⚠️ | Exact wave and difficulty parity unverified |
| Performance stability | Public value device-dependent | 64-player sim ≤0.7 ms/tick; automated soak reports no leak | ⚠️ | Needs comparable live-client FPS capture on same hardware |
| Console/network health | Public EV.IO disconnected in this browser session | Zero first-party errors/failures in system-Chrome smoke; embedded-browser entry also reaches the HUD with no logs after pointer-lock rejection containment | ✅ | Public server availability is currently outside KYX code |

## Current public reference limitation

The public EV.IO page was opened on 2026-08-13. Its UI and canvas loaded, but the game reported: “Disconnected. Server may have restart or you might be trying to enter a room that requires login.” Therefore no current live values for movement, jump, reload, damage, or respawn are presented as verified facts. The first-person framing comparison uses publicly visible gameplay stills only.

## Next comparison cycle

1. Retry a current public EV.IO match and capture timestamps for jump, Auto Rifle cadence, reload, swap, and respawn.
2. Run an equivalent scripted KYX sequence at the same viewport/FOV.
3. Prioritize the largest player-noticeable mismatch.
4. Implement the smallest focused correction.
5. Rerun `test:gameplay-smoke`, the affected contract tests, and `certify`.
