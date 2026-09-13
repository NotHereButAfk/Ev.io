export class EarningsUI {
  constructor(onSummary) {
    this.onSummary = onSummary;
    this.lastMatch = null;
    this.notificationTotal = 0;
    this.timer = null;
    this.el = document.createElement("aside");
    this.el.id = "e-hud";
    this.el.className = "hidden";
    this.el.innerHTML =
      '<div>E This Match: <b data-e="match">0.00</b></div><div>Session E: <b data-e="session">0.00</b></div><div>Balance: <b data-e="balance">0.00</b> E</div><div data-e="daily"></div><small data-e="status"></small><div id="e-toast" aria-live="polite"></div>';
    document.body.appendChild(this.el);
    this.summary = document.createElement("dialog");
    this.summary.id = "e-summary";
    this.summary.innerHTML =
      '<h2>MATCH EARNINGS</h2><div class="e-summary-rows"></div><button type="button">Continue</button><a href="/earnings">E balance & history</a>';
    this.summary.querySelector("button").onclick = () => this.summary.close();
    document.body.appendChild(this.summary);
  }
  format(n) {
    return Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  update(data) {
    if (!data) {
      this.el.classList.add("hidden");
      return;
    }
    this.el.classList.remove("hidden");
    this.data = data;
    const set = (key, text) => {
      this.el.querySelector(`[data-e="${key}"]`).textContent = text;
    };
    set("match", this.format(data.finalE));
    set("session", this.format(Number(data.sessionE) + Number(data.finalE)));
    set("balance", this.format(data.balance));
    set(
      "daily",
      data.dailyCap === null
        ? `Daily E: ${this.format(data.dailyE)}`
        : `Daily E: ${this.format(data.dailyE)} / ${this.format(data.dailyCap)}`,
    );
    set(
      "status",
      data.reason ||
        (data.guest
          ? "Temporary guest E · not saved"
          : "Pending server validation"),
    );
    if (data.lastSummary && data.lastSummary.matchId !== this.lastMatch) {
      this.lastMatch = data.lastSummary.matchId;
      this.showSummary(data.lastSummary);
    }
    window.dispatchEvent(new CustomEvent("e-balance", { detail: data }));
  }
  notify(amount, kind) {
    if (Number(amount) <= 0) return;
    this.notificationTotal += Number(amount);
    clearTimeout(this.timer);
    const el = this.el.querySelector("#e-toast");
    el.textContent = `${kind === "boss" ? "JACKPOT " : ""}+${this.format(this.notificationTotal)} E`;
    this.timer = setTimeout(() => {
      el.textContent = "";
      this.notificationTotal = 0;
    }, 1600);
  }
  showSummary(s) {
    const rows = this.summary.querySelector(".e-summary-rows");
    rows.replaceChildren();
    for (const [key, label] of [
      ["score", "Score"],
      ["eligibleScore", "Eligible Earning Score"],
      ["baseE", "Base E"],
      ["itemBonus", "Item Bonus"],
      ["modeBonus", "Mode Bonus"],
      ["survivalBonus", "Survival Bonus"],
      ["eventBonus", "Event / Booster Bonus"],
      ["bossRewards", "Boss Rewards"],
      ["winReward", "Win Reward"],
      ["eventRewards", "Event Rewards"],
      ["capReduction", "Cap / Validation Reduction"],
      ["finalE", "TOTAL E EARNED"],
      ["balance", "Balance"],
    ]) {
      if (
        !["score", "eligibleScore", "finalE", "balance"].includes(key) &&
        !Number(s[key])
      )
        continue;
      const row = document.createElement("div"),
        labelEl = document.createElement("span"),
        value = document.createElement("strong");
      labelEl.textContent = label;
      value.textContent =
        this.format(s[key]) +
        (key === "score" || key === "eligibleScore" ? "" : " E");
      row.append(labelEl, value);
      rows.appendChild(row);
    }
    if (s.reason) {
      const note = document.createElement("p");
      note.textContent = s.reason;
      rows.appendChild(note);
    }
    if (!this.summary.open) {
      this.onSummary?.();
      this.summary.showModal();
    }
  }
  hide() {
    this.el.classList.add("hidden");
  }
  dispose() {
    clearTimeout(this.timer);
    this.summary.close();
    this.el.remove();
    this.summary.remove();
  }
}
