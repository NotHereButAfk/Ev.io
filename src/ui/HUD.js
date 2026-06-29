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
    this.reloadText  = document.getElementById('reload-text');
    this.killCount   = document.getElementById('kill-count');
    this.scoreCount  = document.getElementById('score-count');
    this.serverPop      = document.getElementById('server-pop');
    this.serverPopCount = document.getElementById('server-pop-count');
    this.serverPopMax   = document.getElementById('server-pop-max');
    this.weaponSlots = document.getElementById('weapon-slots');
    this.hitmarker   = document.getElementById('hitmarker');
    this.damageFlash = document.getElementById('damage-flash');
    this.killfeed    = document.getElementById('killfeed');
    this.modeInfo    = document.getElementById('mode-info');
    this.dmTimer        = document.getElementById('dm-timer');
    this.streakBadge    = document.getElementById('streak-badge');
    this.downedOverlay  = document.getElementById('downed-overlay');
    this.downedBar      = document.getElementById('downed-bar');
    this.downedCountdown = document.getElementById('downed-countdown');
    this.waveBanner     = document.getElementById('wave-banner');
    this._teleportFlash    = document.getElementById('teleport-flash');
    this._abilityQ         = document.getElementById('ability-q');
    this._joinNotification = document.getElementById('join-notification');
    this._hitmarkerTimeout    = null;
    this._damageTimeout       = null;
    this._waveBannerTimer     = null;
    this._streakTimeout       = null;
    this._teleportFlashTimeout = null;
    this._joinNotifTimer      = null;
    this._joinFadeTimer       = null;
  }

  show() { this.root?.classList.remove('hidden'); }
  hide() { this.root?.classList.add('hidden'); }

  // Mode-specific top-center overlay (timer, wave, lives).
  setModeHUD(primary, secondary = '') {
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
  }

  hideModeHUD() { this.modeInfo.classList.add('hidden'); }

  // Large centered deathmatch countdown timer
  showDMTimer(timeStr, isLow = false) {
    this.dmTimer.textContent = timeStr;
    this.dmTimer.classList.remove('hidden');
    this.dmTimer.classList.toggle('dm-low', isLow);
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

  // Survival: wave banner (auto-removes after animation)
  showWaveBanner(text) {
    this.waveBanner.textContent = text;
    this.waveBanner.classList.remove('hidden');
    clearTimeout(this._waveBannerTimer);
    this._waveBannerTimer = setTimeout(() => this.waveBanner.classList.add('hidden'), 3000);
  }

  buildWeaponSlots(labels, activeIndex) {
    this.weaponSlots.innerHTML = '';
    labels.forEach((label, i) => {
      const el = document.createElement('div');
      el.className = 'weapon-slot' + (i === activeIndex ? ' active' : '');
      el.textContent = label;
      el.dataset.index = i;
      this.weaponSlots.appendChild(el);
    });
  }

  setActiveSlot(index) {
    this.weaponSlots.querySelectorAll('.weapon-slot').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
  }

  update(player, weaponInfo, kills, score) {
    const hpct = Math.max(0, (player.health / player.maxHealth) * 100);
    this.healthBar.style.width  = `${hpct}%`;
    this.healthText.textContent = Math.ceil(player.health);

    if (player.maxShield > 0) {
      this.shieldWrap.classList.remove('hidden');
      const spct = Math.max(0, (player.shield / player.maxShield) * 100);
      this.shieldBar.style.width  = `${spct}%`;
      this.shieldText.textContent = Math.ceil(player.shield);
    } else {
      this.shieldWrap.classList.add('hidden');
    }

    const spct = Math.max(0, (player.stamina / player.maxStamina) * 100);
    this.staminaBar.style.width  = `${spct}%`;
    this.staminaText.textContent = Math.ceil(player.stamina);
    this.staminaBar.classList.toggle('stamina-low', player.stamina < 25);

    this.weaponName.textContent = weaponInfo.name.toUpperCase();
    this.ammoText.textContent = weaponInfo.isMelee
      ? '∞'
      : `${weaponInfo.magAmmo} / ${weaponInfo.reserveAmmo}`;
    this.reloadText.classList.toggle('hidden', !weaponInfo.isReloading);

    this.killCount.textContent  = kills;
    this.scoreCount.textContent = score;
  }

  updateGrenades(frags, smokes) {
    this.fragCount.textContent  = `${frags}`;
    this.smokeCount.textContent = `${smokes}`;
    this.fragCount.classList.toggle('grenade-empty',  frags  === 0);
    this.smokeCount.classList.toggle('grenade-empty', smokes === 0);
  }

  flashHitmarker(headshot = false) {
    this.hitmarker.classList.remove('show', 'headshot');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
    if (headshot) this.hitmarker.classList.add('headshot');
    clearTimeout(this._hitmarkerTimeout);
    this._hitmarkerTimeout = setTimeout(() => this.hitmarker.classList.remove('show', 'headshot'), 160);
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
    this._abilityQ.style.setProperty('--ratio', Math.max(0, Math.min(1, ratio)));
    this._abilityQ.classList.toggle('ready', ratio >= 1);
  }

  flashDamage() {
    this.damageFlash.classList.remove('show');
    void this.damageFlash.offsetWidth;
    this.damageFlash.classList.add('show');
    clearTimeout(this._damageTimeout);
    this._damageTimeout = setTimeout(() => this.damageFlash.classList.remove('show'), 600);
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
    if (this.serverPopCount) this.serverPopCount.textContent = count;
    if (this.serverPopMax)   this.serverPopMax.textContent   = max;
  }

  showServerPop(show) {
    this.serverPop?.classList.toggle('hidden', !show);
  }

  // Post-match leaderboard (outside #hud, so hud.hide() won't touch it).
  showLeaderboard(rows, playerName, earnedCoins = 0) {
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
