/* Oilada o'rin yo'q. Sardor: "o'rinlar reytinglar tushunchasi bo'lmasin" — a family
   sees points and how far each is from a target, never places or percentages. */
const { loadClient } = require("./harness");

const mk = (id, name, over = {}) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
  ...over,
});
const OTA = mk("sardor", "Sardor Valixanov");
const ONA = mk("zuhra", "Zuhra");
const AZIZ = mk("aziz", "Aziz", { is_child: true, reward_goal: 20 });
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];
const prayed = (n) => {
  const days = {};
  for (let i = 0; i < n; i += 1) {
    days["2026-08-" + String(31 + i).padStart(2, "0")] =
      Object.fromEntries(FARD.map(k => [k, { s: "ontime" }]));
  }
  return { ...blank(), days };
};

function client(kind) {
  const loaded = loadClient({ at: "2026-09-06T07:00:00Z", expose: ["isFamily"] });
  loaded.setState({
    members: [OTA, ONA, AZIZ],
    data: { sardor: prayed(3), zuhra: prayed(1), aziz: prayed(2) },
    me: "sardor", date: "2026-09-06", token: "tok", isAdmin: false, circleId: 2,
    circles: [{ id: 2, name: kind === "family" ? "Oilam" : "Do'stlar",
      kind, owner_id: "sardor", week_goal: 25 }],
    deeds: [], rewards: [], skills: [], duels: [],
  });
  return loaded;
}

module.exports = {
  async "a family sees no podium and no places"(assert) {
    const c = client("family");
    await c.A.go("app");
    c.A.setTab("stats");
    const h = c.html;
    assert.ok(!h.includes("Hafta qahramoni"), "no podium in a family");
    assert.ok(!/\d-o'rin/.test(h), "and nobody is in Nth place");
    assert.ok(!h.includes("Taqqoslash"), "no comparison cards either");
    assert.ok(!h.includes("vaqtida o'qilgan</div>"), "and no percentages");
  },

  async "it sees points and how far each is from the goal instead"(assert) {
    const c = client("family");
    await c.A.go("app");
    c.A.setTab("stats");
    const h = c.html;
    assert.ok(h.includes("Kim qancha ball to'pladi"), "expected the points board");
    assert.ok(h.includes("Sardor") && h.includes("Zuhra"), "everybody on it");
    assert.ok(h.includes("Aziz"), "children too");
  },

  async "friends keep the podium exactly as it was"(assert) {
    const c = client("friends");
    await c.A.go("app");
    c.A.setTab("stats");
    const h = c.html;
    assert.ok(h.includes("Hafta qahramoni"), "the podium is a friends thing");
    assert.ok(h.includes("Taqqoslash"), "and so is the comparison");
  },

  async "the breakdown table stays: it explains, it does not rank"(assert) {
    const c = client("family");
    await c.A.go("app");
    c.A.setTab("stats");
    assert.ok(c.html.includes("Ball qayerdan"), "a family still asks where points came from");
  },
};
