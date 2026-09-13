// Read-only account projection. Permanent E is never written to browser storage.
export const EAccount = {
  balance: "0.0000",
  loaded: false,
  async refresh() {
    try {
      const r = await fetch("/api/e/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) {
        this.balance = "0.0000";
        this.loaded = false;
        return;
      }
      const p = await r.json();
      this.balance = p.balance;
      this.loaded = true;
      this.render();
    } catch {
      this.loaded = false;
    }
  },
  render() {
    const text =
      Number(this.balance).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " E";
    for (const id of ["nav-coins", "ps-balance"]) {
      const el = document.getElementById(id);
      if (el) el.textContent = this.loaded ? text : "Sign in to earn E";
    }
  },
};
window.addEventListener("e-balance", (e) => {
  EAccount.balance = e.detail.balance;
  EAccount.loaded = !e.detail.guest;
  EAccount.render();
});
