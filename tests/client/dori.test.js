/* Oilaviy dorilar. A course is a plan; a dose is what happened. On time or late is a
   comparison made when it is read, never a verdict written down. */
const { loadClient } = require("./harness");

const mk = (id, name) => ({ id, name, city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18 });
const SARDOR = mk("sardor", "Sardor Valixanov");
const ZUHRA = mk("zuhra", "Zuhra");
const OILA = { id: 2, name: "Oilam", kind: "family", owner_id: "sardor",
  week_goal: 25, bonus_easy: 20, bonus_mid: 50, bonus_hard: 100 };
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const DORI = { id: 1, member_id: "zuhra", name: "Vitamin D",
  times: ["08:00", "20:00"], starts: "2026-09-01", ends: "2026-09-30" };

/* 2026-09-07 09:20Z is 14:20 in Toshkent — the morning dose is due and overdue. */
function client(at = "2026-09-07T09:20:00Z", patch = {}) {
  const loaded = loadClient({
    at, expose: ["doriHolat", "DORI_KECHIKISH", "doriKunlik"],
    routes: {
      "/circles/2/medicines": DORI,
      "/medicines/1/doses": { ok: true },
      "/state?circle=2": { members: [], data: {}, calls: [], khatm: null, duels: [],
        deeds: [], rewards: [], skills: [], medicines: [], doses: [] },
    },
  });
  loaded.setState({
    members: [SARDOR, ZUHRA], data: { sardor: blank(), zuhra: blank() },
    me: "sardor", date: "2026-09-07", token: "tok", isAdmin: false, circleId: 2,
    circles: [OILA], deeds: [], rewards: [], skills: [], duels: [],
    medicines: [DORI], doses: [],
    ...patch,
  });
  return loaded;
}
const dose = (day, slot, taken) => ({ medicine_id: 1, day, slot, taken });

module.exports = {
  "a dose swallowed near its hour is on time"(assert) {
    const c = client("2026-09-07T09:20:00Z",
      { doses: [dose("2026-09-07", "08:00", "08:10")] });
    const k = c.doriKunlik(DORI, "2026-09-07");
    const ertalab = k.find(x => x.slot === "08:00");
    assert.strictEqual(ertalab.holat, "vaqtida");
  },

  "well after it, it is late"(assert) {
    const c = client("2026-09-07T09:20:00Z",
      { doses: [dose("2026-09-07", "08:00", "11:30")] });
    assert.strictEqual(c.doriKunlik(DORI, "2026-09-07")
      .find(x => x.slot === "08:00").holat, "kechikkan");
  },

  "an hour still to come today is simply waiting"(assert) {
    const c = client();
    assert.strictEqual(c.doriKunlik(DORI, "2026-09-07")
      .find(x => x.slot === "20:00").holat, "kutilmoqda");
  },

  "an hour gone by today with nothing taken is overdue, not missed"(assert) {
    /* The day is still open — there is time to swallow it and be late rather than
       have missed it, which is a different thing to tell somebody. */
    const c = client();
    assert.strictEqual(c.doriKunlik(DORI, "2026-09-07")
      .find(x => x.slot === "08:00").holat, "kechikmoqda");
  },

  "a closed day with nothing taken is a missed dose"(assert) {
    const c = client();
    assert.strictEqual(c.doriKunlik(DORI, "2026-09-05")
      .find(x => x.slot === "08:00").holat, "ichilmagan");
  },

  "the tally counts each kind over the course so far"(assert) {
    const c = client("2026-09-07T09:20:00Z", {
      doses: [dose("2026-09-05", "08:00", "08:05"), dose("2026-09-05", "20:00", "22:40"),
              dose("2026-09-06", "08:00", "08:00")],
    });
    const h = c.doriHolat(DORI);
    assert.strictEqual(h.vaqtida, 3 - 1, "two near their hour");
    assert.strictEqual(h.kechikkan, 1);
    assert.ok(h.ichilmagan >= 3, "the other closed slots are missed");
  },

  async "the section sits on Sunnat, and only in a family"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("sunnat");
    const h = c.html;
    assert.ok(h.includes("Dorilar"), "expected the medicines section");
    assert.ok(h.indexOf("Kunning sunnati") < h.indexOf("Dorilar"), "after the sunnah");
    assert.ok(h.indexOf("Dorilar") < h.indexOf("Ball va vazifa"), "before the task block");

    const dostlar = client("2026-09-07T09:20:00Z",
      { circles: [{ ...OILA, kind: "friends", name: "Do'stlar" }] });
    await dostlar.A.go("app");
    dostlar.A.setTab("sunnat");
    assert.ok(!dostlar.html.includes("Dorilar"), "friends do not share a medicine box");
  },

  async "ticking a dose records the hour it actually went down"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("sunnat");
    await c.A.takeDose(1, "08:00");
    const sent = c.calls.find(x => x.path === "/medicines/1/doses");
    assert.ok(sent, "expected the dose to be sent");
    assert.strictEqual(sent.body.slot, "08:00");
    assert.strictEqual(sent.body.taken, "14:20", "the hour now, not the hour due");
    assert.strictEqual(sent.body.day, "2026-09-07");
  },

  async "a course is added with its hours and its length"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("sunnat");
    c.setFields({ dori_name: "Temir dori", dori_times: "09:00, 21:00", dori_days: "14" });
    c.A.setDoriKim("zuhra");
    await c.A.addMedicine();
    const sent = c.calls.find(x => x.path === "/circles/2/medicines");
    assert.ok(sent, "expected the course to be created");
    assert.strictEqual(sent.body.name, "Temir dori");
    assert.strictEqual(JSON.stringify(sent.body.times), JSON.stringify(["09:00", "21:00"]));
    assert.strictEqual(sent.body.days, 14);
    assert.strictEqual(sent.body.member_id, "zuhra");
  },
};
