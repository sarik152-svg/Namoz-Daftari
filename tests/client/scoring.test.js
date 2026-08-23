const { loadClient } = require("./harness");

const TOSHKENT = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });

/* Toshkent is UTC+5, so 09:00Z is 14:00 local — after Peshin, before Asr. */
function client(at = "2026-08-22T09:00:00Z") {
  const loaded = loadClient({
    at,
    expose: ["daySchedule", "calcTimes", "hm", "liveDay", "winState", "score", "todayFor", "JAMOAT_BALL"],
  });
  loaded.setState({
    members: [TOSHKENT], data: { sardor: blank() },
    me: "sardor", date: "2026-08-22", token: "tok", isAdmin: false,
  });
  return loaded;
}

module.exports = {
  "xufton closes at tomorrow's fajr, not today's"(assert) {
    const c = client();
    const schedule = c.daySchedule(new Date("2026-08-22T12:00:00"), TOSHKENT);
    const today = c.calcTimes(new Date("2026-08-22T12:00:00"), TOSHKENT);
    const tomorrow = c.calcTimes(new Date("2026-08-23T12:00:00"), TOSHKENT);
    assert.ok(schedule.endXufton < schedule.xufton, "window must wrap past midnight");
    /* The two fajrs are about a minute apart, so asserting the wrap alone passes
       even with the old bug in place. Pin the actual value. */
    assert.strictEqual(schedule.endXufton, tomorrow.fajr, "must be tomorrow's fajr");
    assert.notStrictEqual(schedule.endXufton, today.fajr, "must not be today's fajr");
  },

  "a xufton prayed after midnight belongs to yesterday"(assert) {
    const c = client("2026-08-21T20:00:00Z"); // 01:00 Toshkent on the 22nd
    assert.strictEqual(c.liveDay("xufton", TOSHKENT), "2026-08-21");
    assert.strictEqual(c.liveDay("shom", TOSHKENT), "2026-08-22");
  },

  "a fard prayer cannot be marked before its time"(assert) {
    const c = client("2026-08-22T05:00:00Z"); // 10:00 Toshkent, before Peshin
    c.A.mark("peshin", "pray", "2026-08-22");
    assert.strictEqual(c.__day(), undefined);
  },

  "tahajjud may be marked at any hour"(assert) {
    const c = client(); // 14:00 Toshkent
    c.A.mark("tahajjud", "pray", "2026-08-22");
    assert.strictEqual(c.__day("tahajjud").s, "ontime");
  },

  "a mark cannot be changed once made"(assert) {
    const c = client();
    c.A.mark("peshin", "pray", "2026-08-22");
    const first = JSON.stringify(c.__day("peshin"));
    c.A.mark("peshin", "miss", "2026-08-22");
    assert.strictEqual(JSON.stringify(c.__day("peshin")), first);
  },

  "congregation is worth half a point more"(assert) {
    const c = client();
    c.A.mark("peshin", "jamoat", "2026-08-22");
    assert.strictEqual(c.__day("peshin").j, true);
    assert.strictEqual(c.JAMOAT_BALL, 0.5);
  },
};
