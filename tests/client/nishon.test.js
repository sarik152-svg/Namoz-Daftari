/* Badges, and the weekly team task that changes every week. The rotation is
   derived from the week itself rather than stored, like every other badge here. */
const { loadClient } = require("./harness");

const SARDOR = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

function client(patch = {}) {
  const loaded = loadClient({
    at: "2026-08-22T09:00:00Z",
    expose: ["haftaTopshiriq", "haftaJamoa", "HAFTALIK", "nishonStat", "NISHONLAR"],
  });
  loaded.setState({
    members: [SARDOR], data: { sardor: blank() },
    me: "sardor", date: "2026-08-22", token: "tok", isAdmin: false,
    ...patch,
  });
  return loaded;
}

const badge = (c, name) => c.NISHONLAR.find(x => x.n === name);

module.exports = {
  async "the weekly team task is a different one the following week"(assert) {
    const c = client();
    const bu = c.haftaTopshiriq("2026-08-17", "2026-08-23");
    const keyingi = c.haftaTopshiriq("2026-08-24", "2026-08-30");
    assert.ok(bu && keyingi, "every week must have a task");
    assert.notStrictEqual(bu.n, keyingi.n, "a new week must bring a new task");
  },

  async "the same week always gives the same task to everyone"(assert) {
    const c = client();
    assert.strictEqual(
      c.haftaTopshiriq("2026-08-17", "2026-08-23").n,
      c.haftaTopshiriq("2026-08-17", "2026-08-23").n,
    );
  },

  async "the rotation comes back around rather than running out"(assert) {
    const c = client();
    const seen = new Set();
    let day = "2026-08-17";
    for (let i = 0; i < c.HAFTALIK.length + 2; i += 1) {
      seen.add(c.haftaTopshiriq(day, day).n);
      day = new Date(new Date(day + "T12:00:00").getTime() + 7 * 86400000)
        .toISOString().slice(0, 10);
    }
    assert.strictEqual(seen.size, c.HAFTALIK.length, "every task must come up");
  },

  async "the badges page shows this week's task next to the standing agreement"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("nishon");
    assert.ok(c.html.includes("Hammamiz uchun") || c.html.includes("Nishon olindi"),
      "the standing weekly agreement must stay");
    const task = c.haftaTopshiriq("2026-08-17", "2026-08-23");
    assert.ok(c.html.includes(task.n), "expected this week's task: " + task.n);
  },

  async "making up an old prayer earns a badge of its own"(assert) {
    const c = client({
      data: { sardor: { ...blank(), days: { "2026-08-22": { qazo: { bomdod: 1 } } } } },
    });
    const t = c.nishonStat(SARDOR);
    const first = badge(c, "Qazo boshlandi");
    assert.ok(first, "expected a first-make-up badge");
    assert.ok(first.v(t) >= first.kerak, "one made-up prayer must earn it");
  },

  async "clearing the whole backlog is its own badge"(assert) {
    const owing = { ...SARDOR, qazo_debt: 10 };
    const c = client({
      members: [owing],
      data: { sardor: { ...blank(), days: { "2026-08-22": { qazo: { bomdod: 10 } } } } },
    });
    const done = badge(c, "Qazosiz");
    assert.ok(done, "expected a cleared-backlog badge");
    assert.ok(done.v(c.nishonStat(owing)) >= done.kerak);
    /* Somebody who never stated a backlog has not cleared one. */
    const quiet = client();
    assert.ok(done.v(quiet.nishonStat(SARDOR)) < done.kerak);
  },

  async "a night-prayer streak is a badge, not only a count"(assert) {
    const days = {};
    for (let i = 0; i < 7; i += 1) {
      days["2026-08-" + String(16 + i).padStart(2, "0")] = { tahajjud: { s: "ontime" } };
    }
    const c = client({ data: { sardor: { ...blank(), days } } });
    const streak = badge(c, "Tun odati");
    assert.ok(streak, "expected a tahajjud streak badge");
    assert.ok(streak.v(c.nishonStat(SARDOR)) >= streak.kerak);
  },
};
