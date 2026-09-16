// Read-only account projection. Permanent K is never written to browser storage.
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
    } finally {
      this.render();
    }
  },
  render() {
    const text =
      Number(this.balance).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " K";
    for (const id of ["nav-coins", "ps-balance", "inv-balance"]) {
      const el = document.getElementById(id);
      if (el) el.textContent = this.loaded ? text : "Sign in to earn K";
    }
  },
};
window.addEventListener("e-balance", (e) => {
  EAccount.balance = e.detail.balance;
  EAccount.loaded = !e.detail.guest;
  EAccount.render();
});
