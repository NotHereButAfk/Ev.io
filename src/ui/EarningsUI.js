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
      '<div class="e-rate-row">Earn Rate <span title="E multipliers applied by the server">ⓘ</span><b data-e="rate">1x</b></div><div class="e-balance-row">Balance <b data-e="balance">0.00</b><span class="e-match-gain">(+<span data-e="match">0.00</span>)</span></div><div class="e-details">Session E: <b data-e="session">0.00</b><div data-e="daily"></div></div><small data-e="status"></small><div id="e-toast" aria-live="polite"></div>';
    document.body.appendChild(this.el);
  }

  format(n) {
    return Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  update(data) {
    if (!data || data.guest) {
      this.el.classList.add("hidden");
      return;
    }
    this.el.classList.remove("hidden");
    this.data = data;
    this.el.title = `E per 100 eligible score: ${data.ePer100Score ?? 1}. Pending earnings are finalized at match end.`;
    const set = (key, text) => {
      this.el.querySelector(`[data-e="${key}"]`).textContent = text;
    };
    set("rate", `${Number(((Number(data.itemMultiplier ?? 1))*(Number(data.modeMultiplier ?? 1))*(Number(data.eventMultiplier ?? 1))*(Number(data.survivalMultiplier ?? 1))).toFixed(2))}x`);
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
    const status=this.el.querySelector('[data-e="status"]');
    status.hidden=!data.reason;
    if(data.reason)status.textContent=data.reason;
    if (data.lastSummary && data.lastSummary.matchId !== this.lastMatch) {
      this.lastMatch = data.lastSummary.matchId;
      // Finalized earnings remain available in the Earn tab and account history.
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
  hide() {
    this.el.classList.add("hidden");
  }
  dispose() {
    clearTimeout(this.timer);
    this.el.remove();
  }
}
