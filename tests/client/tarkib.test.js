/* "Ball qayerdan" — the week's points broken into their parts, side by side. The
   sum of the parts must equal the score itself; a breakdown that disagrees with the
   number above it is worse than no breakdown. */
const { loadClient } = require("./harness");

const mk = (id, name, over = {}) => ({
  id, name, city: "Toshkent", lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
  ...over,
});
const SARDOR = mk("sardor", "Sardor Valixanov");
const HIKMAT = mk("hikmat", "Hikmatilla Ismailov");
const ZUHRA = mk("zuhra", "Zuhra", { woman_mode: true });
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const FARD = ["bomdod", "peshin", "asr", "shom", "xufton"];

/* A week of whole days, so nothing is owed except what the test asks for. */
const span = (over = {}) => {
  const days = {};
  for (let i = 24; i <= 27; i += 1) {
    const ds = "2026-08-" + i;
    days[ds] = Object.fromEntries(FARD.map(k => [k, { s: "ontime" }]));
  }
  Object.entries(over).forEach(([d, marks]) => { days[d] = { ...days[d], ...marks }; });
  return { ...blank(), days };
};

function client(patch = {}) {
  const loaded = loadClient({
    at: "2026-08-28T09:00:00Z",
    expose: ["prayerRange", "ballTarkib", "TARKIB"],
  });
  loaded.setState({
    members: [SARDOR, HIKMAT], data: { sardor: span(), hikmat: span() },
    me: "sardor", date: "2026-08-28", token: "tok", isAdmin: false, circleId: 1,
    ...patch,
  });
  return loaded;
}
const sum = (c, m, u) => {
  const o = c.prayerRange(u, m, "2026-08-24", "2026-08-30");
  return c.TARKIB.reduce((n, row) => n + c.ballTarkib(m, o, row.k), 0);
};

module.exports = {
  "the parts add up to the score"(assert) {
    const c = client();
    const u = span({
      "2026-08-24": { bomdod: { s: "ontime", j: true } },
      "2026-08-25": { peshin: { s: "qazo" }, qazo: { asr: 6 } },
      "2026-08-26": { shom: { s: "missed" } },
    });
    const o = c.prayerRange(u, SARDOR, "2026-08-24", "2026-08-30");
    assert.strictEqual(Math.round(sum(c, SARDOR, u) * 100) / 100, o.ball,
      "a breakdown that disagrees with the total is worse than none");
  },

  "it adds up for the women's concession too"(assert) {
    /* Her caught-up prayer earns instead of costing, so that row changes sign. */
    const c = client({ members: [SARDOR, ZUHRA], data: { sardor: span(), zuhra: span() } });
    const u = span({ "2026-08-25": { peshin: { s: "qazo" } } });
    const o = c.prayerRange(u, ZUHRA, "2026-08-24", "2026-08-30");
    assert.ok(c.ballTarkib(ZUHRA, o, "qazo") > 0, "hers is a plus");
    assert.ok(c.ballTarkib(SARDOR, o, "qazo") < 0, "his is a minus");
    assert.strictEqual(Math.round(sum(c, ZUHRA, u) * 100) / 100, o.ball);
  },

  "it adds up on a work shift, where a caught-up prayer is on time"(assert) {
    const ISH = mk("shax", "Shahriddin", { work_shift: true });
    const c = client({ members: [ISH], data: { shax: span() } });
    const u = span({ "2026-08-25": { peshin: { s: "qazo" }, asr: { s: "qazo" } } });
    const o = c.prayerRange(u, ISH, "2026-08-24", "2026-08-30");
    assert.strictEqual(Math.round(sum(c, ISH, u) * 100) / 100, o.ball);
  },

  async "the ranking shows everyone's parts side by side"(assert) {
    const c = client({
      data: {
        sardor: span({ "2026-08-24": { bomdod: { s: "ontime", j: true } } }),
        hikmat: span({ "2026-08-25": { bomdod: { s: "missed" } } }),
      },
    });
    await c.A.go("app");
    c.A.setTab("stats");
    c.A.tarkibOch(true);
    const h = c.html;
    assert.ok(h.includes("Ball qayerdan"), "expected the breakdown panel");
    const at = h.indexOf("Ball qayerdan");
    const block = h.slice(at, at + 3000);
    assert.ok(block.includes("Sardor") && block.includes("Hikmatilla"), "both people");
    assert.ok(block.includes("Jamoat"), "and the rows that made the difference");
  },

  /* ------------------------------------------------ Bugun uses the same scale */
  async "the day's own total is the ball the ranking would give it"(assert) {
    /* It used to be on the debt scale, where praying on time is worth nothing and
       congregation is only the half point on top — so a prayer said with the
       congregation showed +0,5 on Bugun and +1,5 in the ranking. */
    const c = client({
      data: { sardor: { ...blank(), days: { "2026-08-28": {
        bomdod: { s: "qazo", t: "09:10" },
        peshin: { s: "ontime", t: "13:05", j: true },
        qazo: { asr: 2 },
      } } }, hikmat: span() },
      date: "2026-08-28",
    });
    const day = c.prayerRange(c.__me(), SARDOR, "2026-08-28", "2026-08-28");
    assert.strictEqual(day.ball, 1.75, "-0,25 for the late Bomdod, +1,5 for Peshin in congregation, +0,5 for two made up");
    await c.A.go("app");
    const shown = c.html.match(/<b class="[^"]*">([^<]*)<\/b><i>Shu kun bali<\/i>/);
    assert.ok(shown, "expected the day total on the screen");
    assert.strictEqual(shown[1], "+1,75", "the two must never say different things");
  },

  async "every row on the card shows the ball that total counts"(assert) {
    const c = client({
      data: { sardor: { ...blank(), days: { "2026-08-28": {
        bomdod: { s: "qazo", t: "09:10" },
        peshin: { s: "ontime", t: "13:05", j: true },
        asr: { s: "ontime", t: "17:05" },
      } } }, hikmat: span() },
      date: "2026-08-28",
    });
    await c.A.go("app");
    const shown = (c.html.match(/([+-]?[\d,]+) ball/g) || []).map(x => x.replace(" ball", ""));
    assert.ok(shown.includes("+1,5"), "congregation is worth a point and a half: " + shown);
    assert.ok(shown.includes("+1"), "and praying on time is worth one");
    assert.ok(shown.includes("-0,25"), "a late prayer still costs a quarter");
  },

  /* ------------------------------------------------ folded away by default */
  async "the breakdown stays folded until it is asked for"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("stats");
    assert.ok(c.html.includes("Ball qayerdan"), "the heading is always there");
    assert.ok(c.html.includes("A.tarkibOch(true)"), "with a way to open it");
    assert.ok(!c.html.includes("Jamoat</td>"), "but no table until then");
  },

  async "opening it shows every column without scrolling sideways"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("stats");
    c.A.tarkibOch(true);
    const at = c.html.indexOf("Ball qayerdan");
    const block = c.html.slice(at, at + 4000);
    assert.ok(block.includes("Sardor") && block.includes("Hikmatilla"), "both columns");
    assert.ok(block.includes("table-layout:fixed"), "the table must fit, not scroll");
    assert.ok(!block.includes("belgilanmagan"), "the long label was asked to go");
  },
};