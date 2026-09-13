const $ = (id) => document.getElementById(id),
  fmt = (n) =>
    Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
async function api(path, data) {
  const r = await fetch("/api/e/" + path, {
    credentials: "same-origin",
    ...(data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {}),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "E unavailable");
  return value;
}
function text(tag, value, parent) {
  const el = document.createElement(tag);
  el.textContent = value;
  parent.appendChild(el);
  return el;
}
async function load() {
  try {
    const p = await api("me"),
      h = await api("history");
    $("status").textContent = p.earningEnabled
      ? "Rewards are finalized by the game server."
      : "E earning is currently disabled.";
    $("account").hidden = false;
    $("admin-link").hidden = !p.admin;
    $("balance").textContent = fmt(p.balance) + " E";
    $("session").textContent = fmt(p.sessionE);
    $("daily").textContent =
      fmt(p.dailyE) + (p.dailyCap === null ? "" : " / " + fmt(p.dailyCap));
    $("equipment").replaceChildren();
    for (const kind of ["character", "weapon"]) {
      const label = text("label", kind + " earning item", $("equipment")),
        select = document.createElement("select");
      text("option", "None — base earnings", select).value = "";
      for (const item of p.catalog.filter(
        (i) =>
          i.kind === kind &&
          p.ownedSkins.some((s) => s.id === i.id && s.kind === kind),
      )) {
        text(
          "option",
          `${item.id} · ${item.earningEnabled ? "bonus enabled" : "cosmetic only"}`,
          select,
        ).value = item.id;
      }
      select.value = p.equipment.find((e) => e.kind === kind)?.item_id || "";
      label.appendChild(select);
      select.onchange = async () => {
        try {
          await api("equip", { kind, itemId: select.value || null });
          $("status").textContent = "Equipment saved for your next match.";
        } catch (e) {
          $("status").textContent = e.message;
        }
      };
    }
    $("catalog").replaceChildren();
    for (const item of p.catalog.filter((i) => i.priceE != null)) {
      const card = document.createElement("article");
      text("h3", item.id, card);
      text("p", `${item.rarity} · ${fmt(item.priceE)} E`, card);
      const b = text("button", "Buy with E", card);
      b.onclick = async () => {
        b.disabled = true;
        try {
          await api("purchase", { itemId: item.id, key: crypto.randomUUID() });
          await load();
        } catch (e) {
          $("status").textContent = e.message;
          b.disabled = false;
        }
      };
      $("catalog").appendChild(card);
    }
    if (!$("catalog").children.length)
      text(
        "p",
        "No E items are currently listed. Basic earnings require no items.",
        $("catalog"),
      );
    $("ledger").replaceChildren();
    for (const t of h.transactions) {
      const row = document.createElement("tr");
      for (const v of [
        new Date(t.created_at).toLocaleString(),
        t.type,
        fmt(t.amount) + " E",
        fmt(t.new_balance) + " E",
        t.description,
      ])
        text("td", v, row);
      $("ledger").appendChild(row);
    }
    $("summaries").replaceChildren();
    for (const s of h.summaries) {
      const box = document.createElement("details");
      text(
        "summary",
        `${fmt(s.finalE)} E · match ${s.matchId.slice(0, 8)}`,
        box,
      );
      for (const [key, label] of [
        ["score", "Score"],
        ["eligibleScore", "Eligible score"],
        ["baseE", "Base E"],
        ["itemBonus", "Item bonus"],
        ["survivalBonus", "Survival bonus"],
        ["eventBonus", "Event bonus"],
        ["bossRewards", "Boss rewards"],
        ["winReward", "Win reward"],
        ["capReduction", "Reduction"],
      ])
        if (Number(s[key])) text("p", `${label}: ${fmt(s[key])}`, box);
      if (s.reason) text("p", s.reason, box);
      $("summaries").appendChild(box);
    }
  } catch (e) {
    $("status").textContent =
      e.message + " — sign in with a registered account to view permanent E.";
  }
}
load();
