import { getWeaponHudThumb } from './WeaponThumbnails.js';

function setText(el, value) {
  if (!el) return;
  const next = String(value);
  if (el.textContent !== next) el.textContent = next;
}

function setStyle(el, property, value) {
  if (el && el.style[property] !== value) el.style[property] = value;
}

function setCustomStyle(el, property, value) {
  if (el && el.style.getPropertyValue(property) !== value) el.style.setProperty(property, value);
}

function toggleClass(el, name, enabled) {
  if (el && el.classList.contains(name) !== enabled) el.classList.toggle(name, enabled);
}

export class HUD {
  constructor() {
    this.root        = document.getElementById('hud');
    this.healthBar   = document.getElementById('health-bar');
    this.healthText  = document.getElementById('health-text');
    this.shieldWrap  = document.getElementById('shield-wrap');
    this.shieldBar   = document.getElementById('shield-bar');
    this.shieldText  = document.getElementById('shield-text');
    this.staminaBar  = document.getElementById('stamina-bar');
    this.staminaText = document.getElementById('stamina-text');
    this.fragCount   = document.getElementById('frag-count');
    this.smokeCount  = document.getElementById('smoke-count');
    this.weaponName  = document.getElementById('weapon-name');
    this.ammoText    = document.getElementById('ammo-text');
    this.weaponWrap  = document.getElementById('weapon-wrap');
    this.reloadText  = document.getElementById('reload-text');
    this.reloadProgress = document.getElementById('reload-progress');
    this.reloadTime     = document.getElementById('reload-time');
    this.killCount   = document.getElementById('kill-count');
    this.scoreCount  = document.getElementById('score-count');
    this.serverPop      = document.getElementById('server-pop');
    this.serverPopCount = document.getElementById('server-pop-count');
    this.serverPopMax   = document.getElementById('server-pop-max');
    this.weaponSlots = document.getElementById('weapon-slots');
    this.hitmarker   = document.getElementById('hitmarker');
    this.crosshair   = document.getElementById('crosshair');
    this.killConfirm      = document.getElementById('kill-confirm');
    this.killConfirmTitle = document.getElementById('kill-confirm-title');
    this.killConfirmScore = document.getElementById('kill-confirm-score');
    this.damageFlash = document.getElementById('damage-flash');
    this.blindOverlay = document.getElementById('blind-overlay');
    this.killfeed    = document.getElementById('killfeed');
    this.modeInfo    = document.getElementById('mode-info');
    this.dmTimer        = document.getElementById('dm-timer');
    this.streakBadge    = document.getElementById('streak-badge');
    this.downedOverlay  = document.getElementById('downed-overlay');
    this.downedBar      = document.getElementById('downed-bar');
    this.downedCountdown = document.getElementById('downed-countdown');
    this.respawnOverlay  = document.getElementById('respawn-overlay');
    this.respawnCountdown = document.getElementById('respawn-countdown');
    this.waveBanner     = document.getElementById('wave-banner');
    this._teleportFlash    = document.getElementById('teleport-flash');
    this._abilityQ         = document.getElementById('ability-q');
    this._joinNotification = document.getElementById('join-notification');
    this._adsActive           = false;
    this._hitmarkerTimeout    = null;
    this._killConfirmTimeout  = null;
    this._damageTimeout       = null;
    this._waveBannerTimer     = null;
    this._streakTimeout       = null;
    this._teleportFlashTimeout = null;
    this._joinNotifTimer      = null;
    this._joinFadeTimer       = null;
    this._slotEls             = [];
    this._slotAmmoEls         = [];
    this._activeSlot          = -1;
  }

  show() { this.root?.classList.remove('hidden'); }
  hide() { this.root?.classList.add('hidden'); }

  // Mode-specific top-center overlay (timer, wave, lives, + optional 3rd line).
  setModeHUD(primary, secondary = '', tertiary = '') {
    this.modeInfo.classList.remove('hidden');
    this.modeInfo.textContent = '';
    const p = document.createElement('span');
    p.className = 'mode-primary';
    p.textContent = primary;
    this.modeInfo.appendChild(p);
    if (secondary) {
      const s = document.createElement('span');
      s.className = 'mode-secondary';
      s.textContent = secondary;
      this.modeInfo.appendChild(s);
    }
    if (tertiary) {
      const t = document.createElement('span');
      t.className = 'mode-tertiary';
      t.textContent = tertiary;
      this.modeInfo.appendChild(t);
    }
  }

  hideModeHUD() { this.modeInfo.classList.add('hidden'); }

  // Survival "Wave Bonus" coin multiplier (top-right).
  setWaveBonus(mult) {
    let el = document.getElementById('wave-bonus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wave-bonus';
      (this.root || document.getElementById('hud') || document.body).appendChild(el);
    }
    el.classList.remove('hidden');
    el.innerHTML = `<span class="wb-label">WAVE BONUS</span><span class="wb-mult">${mult}x</span>`;
  }
  hideWaveBonus() { document.getElementById('wave-bonus')?.classList.add('hidden'); }

  // Large centered deathmatch countdown timer
  showDMTimer(timeStr, isLow = false) {
    setText(this.dmTimer, timeStr);
    this.dmTimer.classList.remove('hidden');
    toggleClass(this.dmTimer, 'dm-low', isLow);
  }
  hideDMTimer() { this.dmTimer.classList.add('hidden'); }

  // Kill streak badge (shown briefly above the DM timer)
  showStreak(streak, coins) {
    if (streak < 2) return;
    this.streakBadge.textContent = `🔥 x${streak} KILL STREAK  +${coins} COINS`;
    this.streakBadge.classList.remove('hidden');
    clearTimeout(this._streakTimeout);
    this._streakTimeout = setTimeout(() => this.streakBadge.classList.add('hidden'), 2500);
  }

  // Survival: downed overlay with countdown bar
  showDowned(secsLeft, totalSecs) {
    this.downedOverlay.classList.remove('hidden');
    const pct = Math.max(0, (secsLeft / totalSecs) * 100);
    if (this.downedBar) this.downedBar.style.width = pct + '%';
    if (this.downedCountdown) this.downedCountdown.textContent = Math.ceil(Math.max(0, secsLeft));
  }
  hideDowned() { this.downedOverlay.classList.add('hidden'); }

  showRespawn(secsLeft) {
    this.respawnOverlay?.classList.remove('hidden');
    if (this.respawnCountdown) {
      this.respawnCountdown.textContent = secsLeft > 0 ? Math.ceil(secsLeft) : 'DEPLOYING';
    }
  }
  hideRespawn() { this.respawnOverlay?.classList.add('hidden'); }

  // Survival: wave banner (auto-removes after animation)
  showWaveBanner(text) {
    this.waveBanner.textContent = text;
    this.waveBanner.classList.remove('hidden');
    clearTimeout(this._waveBannerTimer);
    this._waveBannerTimer = setTimeout(() => this.waveBanner.classList.add('hidden'), 3000);
  }

  buildWeaponSlots(slots, activeIndex) {
    this.weaponSlots.innerHTML = '';
    this._slotEls.length = 0;
    this._slotAmmoEls.length = 0;
    this._activeSlot = activeIndex;
    slots.forEach((slot, i) => {
      const key = (typeof slot === 'object') ? slot.key : slot;
      const id  = (typeof slot === 'object') ? slot.id  : null;
      const el = document.createElement('div');
      el.className = 'weapon-slot' + (i === activeIndex ? ' active' : '');
      el.dataset.index = i;
      el.classList.toggle('melee-slot', Boolean(slot.isMelee));

      const thumb = id ? getWeaponHudThumb(id) : null;
      if (thumb) {
        const img = document.createElement('div');
        img.className = 'ws-thumb';
        img.style.backgroundImage = `url(${thumb})`;
        el.appendChild(img);
      }
      const ammo = document.createElement('span');
      ammo.className = 'ws-ammo';
      ammo.textContent = slot.isMelee ? '∞' : `${slot.magAmmo ?? 0} / ${slot.reserveAmmo ?? 0}`;
      el.appendChild(ammo);
      const k = document.createElement('span');
      k.className = 'ws-key';
      k.textContent = key;
      el.appendChild(k);

      this.weaponSlots.appendChild(el);
      this._slotEls.push(el);
      this._slotAmmoEls.push(ammo);
    });
  }

  // Floating "+N" coin-earn popup near the crosshair (ev.io-style).
  showCoinEarn(amount) {
    const amt = Math.round(amount * 100) / 100;
    if (!amt) return;
    const host = this.root || document.getElementById('hud') || document.body;
    const el = document.createElement('div');
    el.className = 'coin-earn';
    el.innerHTML = `+${amt} <span class="coin-earn-icon">&#9670;</span>`;
    el.style.setProperty('--cx', `${(Math.random() * 2 - 1) * 30}px`);
    host.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 1300);
  }

  setActiveSlot(index) {
    if (this._activeSlot === index) return;
    this._slotEls[this._activeSlot]?.classList.remove('active');
    this._slotEls[index]?.classList.add('active');
    this._activeSlot = index;
  }

  update(player, weaponInfo, kills, score) {
    const hpct = Math.max(0, (player.health / player.maxHealth) * 100);
    setStyle(this.healthBar, 'width', `${hpct}%`);
    setText(this.healthText, Math.ceil(player.health));

    if (player.maxShield > 0) {
      this.shieldWrap.classList.remove('hidden');
      const spct = Math.max(0, (player.shield / player.maxShield) * 100);
      setStyle(this.shieldBar, 'width', `${spct}%`);
      setText(this.shieldText, Math.ceil(player.shield));
    } else {
      this.shieldWrap.classList.add('hidden');
    }

    const spct = Math.max(0, (player.stamina / player.maxStamina) * 100);
    setStyle(this.staminaBar, 'width', `${spct}%`);
    setText(this.staminaText, Math.ceil(player.stamina));
    toggleClass(this.staminaBar, 'stamina-low', player.stamina < 25);

    setText(this.weaponName, weaponInfo.name.toUpperCase());
    setText(this.ammoText, weaponInfo.isMelee
      ? '∞'
      : `${weaponInfo.magAmmo} / ${weaponInfo.reserveAmmo}`);
    toggleClass(this.weaponWrap, 'melee-active', weaponInfo.isMelee);
    this._slotAmmoEls.forEach((ammo, i) => {
      const slot = weaponInfo.slots?.[i];
      if (!slot || !ammo) return;
      setText(ammo, slot.isMelee ? '∞' : `${slot.magAmmo} / ${slot.reserveAmmo}`);
    });
    toggleClass(this.reloadText, 'hidden', !weaponInfo.isReloading);
    if (this.crosshair) {
      const bloom = Math.max(0, Math.min(1, weaponInfo.spreadRatio || 0));
      const aiming = Math.max(0, Math.min(1, weaponInfo.aiming || 0));
      this._adsActive = aiming > 0.72;
      // EV.IO-style readable cone: sustained hip fire opens the four bars;
      // ADS closes them into the optic without moving the centre dot.
      const gap = (4 + bloom * 8) * (1 - aiming * 0.78);
      setCustomStyle(this.crosshair, '--xhair-size', `${12 + gap * 2}px`);
      setCustomStyle(this.crosshair, '--xhair-opacity', `${1 - aiming * 0.42}`);
      toggleClass(this.crosshair, 'ads', this._adsActive);
      if (this._adsActive && this.hitmarker?.classList.contains('show')) {
        clearTimeout(this._hitmarkerTimeout);
        this.hitmarker.classList.remove('show', 'headshot');
      }
    }
    if (this.reloadProgress) {
      const reloadPct = Math.max(0, Math.min(1, weaponInfo.reloadProgress || 0));
      setStyle(this.reloadProgress, 'width', `${reloadPct * 100}%`);
    }
    if (this.reloadTime) {
      setText(this.reloadTime, `${Math.max(0, weaponInfo.reloadRemaining || 0).toFixed(1)}s`);
    }

    setText(this.killCount, kills);
    setText(this.scoreCount, score);
  }

  updateGrenades(frags, smokes) {
    setText(this.fragCount, frags);
    setText(this.smokeCount, smokes);
    toggleClass(this.fragCount, 'grenade-empty', frags === 0);
    toggleClass(this.smokeCount, 'grenade-empty', smokes === 0);
  }

  flashHitmarker(headshot = false) {
    // The marker is a rotated X at screen centre. During ADS that places it
    // directly over the target and reads as a broken aim indicator. Scoped
    // hits retain their sound, damage number and elimination confirmation.
    if (this._adsActive || !this.hitmarker) return;
    this.hitmarker.classList.remove('show', 'headshot');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
    if (headshot) this.hitmarker.classList.add('headshot');
    clearTimeout(this._hitmarkerTimeout);
    this._hitmarkerTimeout = setTimeout(() => this.hitmarker.classList.remove('show', 'headshot'), 160);
  }

  showKillConfirm(headshot = false, points = 100) {
    if (!this.killConfirm) return;
    clearTimeout(this._killConfirmTimeout);
    this.killConfirmTitle.textContent = headshot ? 'HEADSHOT' : 'ELIMINATION';
    this.killConfirmScore.textContent = `+${Math.round(points)}`;
    this.killConfirm.classList.remove('hidden', 'show', 'headshot');
    void this.killConfirm.offsetWidth;
    this.killConfirm.classList.add('show');
    if (headshot) this.killConfirm.classList.add('headshot');
    this._killConfirmTimeout = setTimeout(() => {
      this.killConfirm.classList.remove('show', 'headshot');
      this.killConfirm.classList.add('hidden');
    }, 1150);
  }

  showHeadshotFlair() {
    const el = document.createElement('div');
    el.className = 'hs-flair';
    el.textContent = '🎯 HEADSHOT';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  flashTeleport() {
    if (!this._teleportFlash) return;
    this._teleportFlash.classList.remove('show');
    void this._teleportFlash.offsetWidth;
    this._teleportFlash.classList.add('show');
    clearTimeout(this._teleportFlashTimeout);
    this._teleportFlashTimeout = setTimeout(() => this._teleportFlash.classList.remove('show'), 300);
  }

  updateTeleport(ratio) {
    if (!this._abilityQ) return;
    setCustomStyle(this._abilityQ, '--ratio', String(Math.max(0, Math.min(1, ratio))));
    toggleClass(this._abilityQ, 'ready', ratio >= 1);
  }

  /**
   * Point an arc at whatever just hit you.
   * @param {THREE.Vector3} from    world position of the shooter
   * @param {THREE.Vector3} self    world position of the player
   * @param {number} yaw            player's facing (game forward is +Z)
   */
  showDamageFrom(from, self, yaw) {
    const host = this._damageDirs || (this._damageDirs = document.getElementById('damage-dirs'));
    if (!host) return;
    // Angle to the shooter in world space, minus where we're looking → an angle
    // relative to the crosshair, with 0° meaning "dead ahead".
    const world = Math.atan2(from.x - self.x, from.z - self.z);
    let rel = world - yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));        // wrap to ±π
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.setProperty('--a', `${(-rel * 180) / Math.PI}deg`);
    host.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  flashDamage() {
    this.damageFlash.classList.remove('show');
    void this.damageFlash.offsetWidth;
    this.damageFlash.classList.add('show');
    clearTimeout(this._damageTimeout);
    this._damageTimeout = setTimeout(() => this.damageFlash.classList.remove('show'), 600);
  }

  updateBlind(secondsLeft) {
    if (!this.blindOverlay) return;
    const active = secondsLeft > 0;
    toggleClass(this.blindOverlay, 'active', active);
    setStyle(this.blindOverlay, 'opacity', active
      ? String(Math.max(0.18, Math.min(1, secondsLeft / 0.7)))
      : '0');
  }

  // Mid-match player join/leave toast — slides in from left, fades after 3s.
  showJoinNotification(text, isLeave = false) {
    const el = this._joinNotification;
    if (!el) return;
    clearTimeout(this._joinNotifTimer);
    clearTimeout(this._joinFadeTimer);
    el.textContent = text;
    el.classList.remove('hidden', 'fade-out', 'leave');
    if (isLeave) el.classList.add('leave');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    this._joinNotifTimer = setTimeout(() => {
      el.classList.add('fade-out');
      this._joinFadeTimer = setTimeout(() => el.classList.add('hidden'), 420);
    }, 3000);
  }

  // Live server population indicator (you + remote players, out of capacity).
  setServerPop(count, max) {
    setText(this.serverPopCount, count);
    setText(this.serverPopMax, max);
  }

  showServerPop(show) {
    this.serverPop?.classList.toggle('hidden', !show);
  }

  // Post-match leaderboard (outside #hud, so hud.hide() won't touch it).
  showLeaderboard(rows, playerName, earnedCoins = 0, stats = {}) {
    const overlay = document.getElementById('leaderboard-overlay');
    const tbody   = document.getElementById('lb-rows');
    if (!overlay || !tbody) return;
    tbody.innerHTML = '';

    // Winner banner + earned coins
    const winner = rows[0];
    const winEl  = document.getElementById('lb-winner-name');
    if (winEl && winner) winEl.textContent = winner.name;
    const earnedEl = document.getElementById('lb-earned-val');
    if (earnedEl) earnedEl.textContent = earnedCoins.toLocaleString();

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    const mins = Math.floor((stats.playTime || 0) / 60);
    const secs = Math.floor(stats.playTime || 0) % 60;
    setText('lb-stat-accuracy', `${(stats.accuracy || 0).toFixed(1)}%`);
    setText('lb-stat-damage', Math.round(stats.damageDealt || 0).toLocaleString());
    setText('lb-stat-shots', `${stats.shotsFired || 0} / ${stats.hits || 0}`);
    setText('lb-stat-headshots', stats.headshots || 0);
    setText('lb-stat-streak', stats.bestStreak || 0);
    setText('lb-stat-time', `${mins}:${String(secs).padStart(2, '0')}`);

    const views = {
      leaderboard: document.getElementById('lb-leaderboard-view'),
      earn: document.getElementById('lb-earn-view'),
      performance: document.getElementById('lb-performance-view'),
    };
    const tabs = overlay.querySelectorAll('[data-lb-tab]');
    const selectTab = (name) => {
      Object.entries(views).forEach(([key, view]) => view?.classList.toggle('hidden', key !== name));
      tabs.forEach((tab) => {
        const active = tab.dataset.lbTab === name;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });
    };
    tabs.forEach((tab) => { tab.onclick = () => selectTab(tab.dataset.lbTab); });
    selectTab('leaderboard');

    rows.forEach((row, i) => {
      const rank   = i + 1;
      const rankCls = rank <= 3 ? `lb-rank lb-rank-${rank}` : 'lb-rank';
      const tr = document.createElement('tr');
      tr.className = row.isYou ? 'lb-row-you' : '';

      const nameTd = document.createElement('td');
      nameTd.className = 'lb-name-cell';
      nameTd.textContent = row.name;
      if (row.isYou) {
        const badge = document.createElement('span');
        badge.className = 'lb-you-badge';
        badge.textContent = 'YOU';
        nameTd.appendChild(badge);
      } else if (row.isBot) {
        const badge = document.createElement('span');
        badge.className = 'lb-bot-badge';
        badge.textContent = 'BOT';
        nameTd.appendChild(badge);
      }

      tr.innerHTML = `<td><span class="${rankCls}">${rank}</span></td>`;
      tr.appendChild(nameTd);

      const cell = (val, cls) => {
        const td = document.createElement('td');
        if (cls) td.className = cls;
        td.textContent = val;
        tr.appendChild(td);
      };
      cell(row.score.toLocaleString(), 'lb-score-cell');
      cell(row.assists ?? 0, 'lb-dim-cell');
      cell(row.kills, 'lb-kills');
      cell(row.deaths ?? 0, 'lb-dim-cell');
      cell(row.kd ?? '0.0', 'lb-kd-cell');

      tbody.appendChild(tr);
    });
    overlay.classList.remove('hidden');
  }

  hideLeaderboard() {
    document.getElementById('leaderboard-overlay')?.classList.add('hidden');
  }

  // In-game scoreboard (hold TAB). rows: [{name, kills, score, isYou}], sub: mode label.
  showScoreboard(rows, sub = '') {
    const ov = document.getElementById('scoreboard-overlay');
    const tb = document.getElementById('sb-rows');
    if (!ov || !tb) return;
    const subEl = document.getElementById('sb-sub');
    if (subEl && sub) subEl.textContent = sub;
    tb.innerHTML = '';
    rows.forEach((r, i) => {
      const rank = i + 1;
      const tr = document.createElement('tr');
      if (r.isYou) tr.className = 'sb-row-you';
      const rankCls = rank <= 3 ? `sb-rank sb-rank-${rank}` : 'sb-rank';

      const nameTd = document.createElement('td');
      nameTd.className = 'sb-name-cell';
      nameTd.textContent = r.name;
      if (r.isYou) {
        const b = document.createElement('span');
        b.className = 'sb-you-badge'; b.textContent = 'YOU';
        nameTd.appendChild(b);
      } else if (r.isBot) {
        const b = document.createElement('span');
        b.className = 'sb-bot-badge'; b.textContent = 'BOT';
        nameTd.appendChild(b);
      }
      tr.innerHTML = `<td><span class="${rankCls}">${rank}</span></td>`;
      tr.appendChild(nameTd);
      const k = document.createElement('td'); k.className = 'sb-kills'; k.textContent = r.kills;
      const s = document.createElement('td'); s.className = 'sb-score'; s.textContent = (r.score || 0).toLocaleString();
      tr.appendChild(k); tr.appendChild(s);
      tb.appendChild(tr);
    });
    ov.classList.remove('hidden');
  }

  hideScoreboard() {
    document.getElementById('scoreboard-overlay')?.classList.add('hidden');
  }

  updateLeaderboardCountdown(secsLeft, total) {
    const el = document.getElementById('lb-countdown');
    if (el) el.textContent = secsLeft;
    const bar = document.getElementById('lb-bar');
    if (bar) bar.style.width = `${Math.max(0, (secsLeft / total) * 100)}%`;
  }

  addKillFeed(text) {
    const el = document.createElement('div');
    el.className = 'kill-entry';
    el.textContent = text;
    this.killfeed.appendChild(el);
    setTimeout(() => el.remove(), 4000);
    while (this.killfeed.children.length > 5) {
      this.killfeed.removeChild(this.killfeed.firstChild);
    }
  }
}
