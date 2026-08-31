/* Debt is a punishment for prayers not said, and nothing else touches it: no bonus,
   no night prayer, no congregation, no made-up qazo, no completed task. It is
   counted a month at a time and starts again from zero on the first. */
const { loadClient } = require("./harness");

const mk = (id, name, over = {}) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
  ...over,
});
const SARDOR = mk("sardor", "Sardor Valixanov");
const BEHRUZ = mk("behruz", "Behruz Qurbonov");
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];
/* Contiguous days, every prayer marked, so the only debt is the one the test asks
   for: an unrecorded day that has closed is five missed prayers by itself. */
const span = (from, to, missedOn = {}) => {
  const days = {};
  let d = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  while (d <= end) {
    const ds = d.toISOString().slice(0, 10);
    const n = missedOn[ds] || 0;
    days[ds] = Object.fromEntries(
      FARD.map((k, j) => [k, { s: j < n ? "missed" : "ontime" }]));
    d = new Date(d.getTime() + 86400000);
  }
  return { ...blank(), days };
};

function client(patch = {}) {
  const loaded = loadClient({
    at: "2026-08-28T09:00:00Z",
    expose: ["score", "JAZO", "jazoDaraja", "vazifaQarzi", "P_MISS"],
    routes: { "/members/sardor/data": { ok: true } },
  });
  loaded.setState({
    members: [SARDOR, BEHRUZ], data: { sardor: blank(), behruz: blank() },
    me: "sardor", date: "2026-08-28", token: "tok", isAdmin: false, circleId: 1,
    ...patch,
  });
  return loaded;
}
/* n points owed this month, spread over whole days ending yesterday. */
const owing = (n) => {
  const marks = {};
  let left = n, day = 27;
  while (left > 0) { marks["2026-08-" + day] = Math.min(5, left); left -= 5; day -= 1; }
  return span("2026-08-20", "2026-08-27", marks);
};

module.exports = {
  "debt is the month's penalties and nothing else"(assert) {
    const c = client();
    const s = c.score(owing(3), SARDOR, false);
    assert.strictEqual(s.debt, 3 * c.P_MISS);
    assert.strictEqual(s.debt, s.oylar["2026-08"], "the debt is just this month's column");
  },

  "nothing takes the debt back down"(assert) {
    const c = client();
    const bare = c.score(owing(3), SARDOR, false);
    const base = owing(3);
    const rich = c.score({
      ...base,
      /* Every one of these used to shave the debt. */
      bonuses: [{ p: "bomdod", lvl: 1, amt: 5, d: "2026-08-21" }],
      tasks: [{ d: "2026-08-21", rak: 26, tas: 2000, lvl: 3, oy: "2026-08" }],
      days: {
        ...base.days,
        "2026-08-21": { ...base.days["2026-08-21"],
          bomdod: { s: "ontime", j: true },
          qazo: { peshin: 4 } },
      },
    }, SARDOR, false);
    assert.strictEqual(rich.debt, bare.debt, "a debt is a debt");
  },

  "last month's debt does not follow you into this one"(assert) {
    const c = client();
    const s = c.score(
      span("2026-07-25", "2026-08-27", { "2026-07-26": 5 }), SARDOR, false);
    assert.strictEqual(s.oylar["2026-07"], 5 * c.P_MISS, "July owed five");
    assert.strictEqual(s.debt, 0, "and August starts clean");
    assert.strictEqual(s.penalty, 5 * c.P_MISS, "the lifetime count still holds them");
  },

  "the punishment grows in three steps"(assert) {
    const c = client();
    assert.strictEqual(c.jazoDaraja(4.75), 0, "under five, nothing is due");
    assert.strictEqual(c.jazoDaraja(5), 1);
    assert.strictEqual(c.jazoDaraja(6.5), 1);
    assert.strictEqual(c.jazoDaraja(7), 2);
    assert.strictEqual(c.jazoDaraja(10), 3);
    assert.strictEqual(c.jazoDaraja(40), 3, "three is as far as it goes");
    assert.strictEqual(JSON.stringify(c.JAZO.map(j => [j.ball, j.rak, j.tas])),
      JSON.stringify([[5, 12, 500], [7, 20, 1000], [10, 26, 2000]]));
  },

  "a task is owed until it is ticked off"(assert) {
    const c = client();
    const u = owing(7);
    const owed = c.vazifaQarzi(u, SARDOR);
    assert.ok(owed, "seven points is a task");
    assert.strictEqual(owed.daraja, 2);
    assert.strictEqual(owed.oy, "2026-08");

    const done = c.vazifaQarzi(
      { ...u, tasks: [{ d: "2026-08-28", rak: 20, tas: 1000, lvl: 2, oy: "2026-08" }] },
      SARDOR);
    assert.strictEqual(done, null, "ticking it off clears it");
  },

  "growing past the next step owes the bigger task"(assert) {
    const c = client();
    const owed = c.vazifaQarzi(
      { ...owing(10), tasks: [{ d: "2026-08-25", rak: 12, tas: 500, lvl: 1, oy: "2026-08" }] },
      SARDOR);
    assert.ok(owed, "the debt has outgrown the task already done");
    assert.strictEqual(owed.daraja, 3);
    assert.strictEqual(owed.bajarilgan, 1);
  },

  "an unfinished task from last month follows you"(assert) {
    /* The debt resets, the punishment does not: that is the point of the mark. */
    const c = client();
    const owed = c.vazifaQarzi(
      span("2026-07-25", "2026-08-27", { "2026-07-26": 5 }), SARDOR);
    assert.ok(owed, "July's task is still owed in August");
    assert.strictEqual(owed.oy, "2026-07");
    assert.strictEqual(owed.daraja, 1);
  },

  "a child is never sent to do penalty work"(assert) {
    const c = client();
    assert.strictEqual(c.vazifaQarzi(owing(10), mk("aziz", "Aziz", { is_child: true })), null);
  },

  async "the whole circle sees who has a task outstanding"(assert) {
    const c = client({ data: { sardor: blank(), behruz: owing(7) } });
    await c.A.go("app");
    c.A.setTab("stats");
    const board = c.html;
    assert.ok(/VAZIFA/.test(board), "expected a mark somebody else can see");
    const at = board.indexOf("Behruz");
    assert.ok(board.slice(at - 500, at + 500).includes("VAZIFA"),
      "and it must sit by the name it belongs to");
  },

  async "somebody with nothing owed carries no mark"(assert) {
    const c = client({ data: { sardor: blank(), behruz: owing(2) } });
    await c.A.go("app");
    c.A.setTab("stats");
    assert.ok(!/VAZIFA/.test(c.html), "two points is not a task");
  },

  async "a day with nothing marked on it is never sent"(assert) {
    /* pull() replaces the local copy with the server's, so a queued write for a day
       the server no longer has would post an empty record — and an empty day that
       has closed is five missed prayers. That is a debt out of nothing. */
    const c = client();
    await c.A.go("app");
    await c.A.pushDayFor("2026-08-20");
    assert.ok(!c.calls.some(x => x.method === "PUT"), "nothing to say, nothing sent");

    c.A.mark("peshin", "pray", "2026-08-28");
    await c.A.pushDayFor("2026-08-28");
    assert.ok(c.calls.some(x => x.method === "PUT"), "a real mark still goes");
  },
};