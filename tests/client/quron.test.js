/* Qur'on. The old panel asked one question — did you read today — and could not
   answer the one Sardor actually wanted: who is where. This one records a place in
   a sura, so where somebody has got to and how much they read are both derived from
   the same log. */
const { loadClient } = require("./harness");

const mk = (id, name) => ({ id, name, city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18 });
const SARDOR = mk("sardor", "Sardor Valixanov");
const BEHRUZ = mk("behruz", "Behruz Qurbonov");
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
const oqidi = (member_id, sura, ayah, day) => ({ member_id, sura, ayah, day });

function client(patch = {}, at = "2026-09-09T07:00:00Z") {
  const loaded = loadClient({
    at,
    expose: ["quronOrni", "quronKunlik", "quronTugatgani", "quronJami",
             "quronHafta", "quronJamoaView", "prayerRange", "SURALAR",
             "QURON_BALL", "suraOyat"],
    routes: {
      "/me/quran": { ok: true },
      "/me/quran/done?on=true": { ok: true },
      "/me/quran/done?on=false": { ok: true },
      "/me/private": { zikrs: [], zikr_marks: [], todos: [], todo_marks: [] },
      "/state?circle=1": { members: [SARDOR, BEHRUZ],
        data: { sardor: blank(), behruz: blank() }, calls: [], khatm: null,
        duels: [], deeds: [], rewards: [], skills: [], medicines: [], doses: [],
        promises: [], quran: [], quran_done: [] },
    },
  });
  loaded.setState({
    members: [SARDOR, BEHRUZ], data: { sardor: blank(), behruz: blank() },
    me: "sardor", date: "2026-09-09", token: "tok", isAdmin: false, circleId: 1,
    circles: [{ id: 1, name: "Do'stlar", kind: "friends", owner_id: "sardor",
      week_goal: 25, bonus_easy: 20, bonus_mid: 50, bonus_hard: 100 }],
    deeds: [], rewards: [], skills: [], duels: [], medicines: [], doses: [],
    promises: [], quran: [], quranDone: [],
    ...patch,
  });
  return loaded;
}

module.exports = {
  "the whole book is there, sura by sura"(assert) {
    const c = client();
    assert.strictEqual(c.SURALAR.length, 114);
    assert.strictEqual(c.SURALAR.reduce((n, x) => n + x.oyat, 0), 6236,
      "the Kufan count the Uzbek mus'haf uses");
    assert.strictEqual(c.suraOyat(1), 7, "Fotiha");
    assert.strictEqual(c.suraOyat(2), 286, "Baqara");
    assert.strictEqual(c.suraOyat(114), 6, "Nos");
  },

  "where somebody is, is the furthest they have logged"(assert) {
    const c = client({ quran: [
      oqidi("sardor", 1, 10, "2026-09-07"),
      oqidi("sardor", 1, 25, "2026-09-08"),
    ]});
    assert.strictEqual(c.quronOrni("sardor")[1], 25, "the further of the two");
  },

  "a day's reading is the step it made, not the ayah it ended on"(assert) {
    /* Fotiha to 10 yesterday and to 25 today is fifteen ayahs read today — the
       whole point of logging a place rather than a tick. */
    const c = client({ quran: [
      oqidi("sardor", 1, 10, "2026-09-08"),
      oqidi("sardor", 1, 25, "2026-09-09"),
    ]});
    assert.strictEqual(c.quronKunlik("sardor", "2026-09-09"), 15);
    assert.strictEqual(c.quronKunlik("sardor", "2026-09-08"), 10, "the first day is all of it");
  },

  "two suras on one day add up"(assert) {
    const c = client({ quran: [
      oqidi("sardor", 1, 7, "2026-09-09"),
      oqidi("sardor", 114, 6, "2026-09-09"),
    ]});
    assert.strictEqual(c.quronKunlik("sardor", "2026-09-09"), 13);
  },

  "reading a sura again does not count twice"(assert) {
    /* Going back over Fotiha is reading, but it is not new ground, and the tally
       says how far the reader has come. */
    const c = client({ quran: [
      oqidi("sardor", 1, 7, "2026-09-08"),
      oqidi("sardor", 1, 3, "2026-09-09"),
    ]});
    assert.strictEqual(c.quronKunlik("sardor", "2026-09-09"), 0);
    assert.strictEqual(c.quronOrni("sardor")[1], 7, "still at the end of it");
  },

  /* ------------------------------------------------------------ ball */
  "each finished sura is five points, on the day it was finished"(assert) {
    const c = client({ quranDone: [
      { member_id: "sardor", sura: 1, day: "2026-09-09" },
      { member_id: "sardor", sura: 114, day: "2026-09-09" },
    ]});
    const r = c.prayerRange(blank(), SARDOR, "2026-09-09", "2026-09-09");
    assert.strictEqual(r.quron, 2, "two suras");
    assert.strictEqual(r.ball, 2 * c.QURON_BALL, "and ten points");
  },

  "the points land in the period that contains the day"(assert) {
    /* Compared against the same weeks with nothing finished, because unprayed days
       inside a window carry their own penalties and would drown the five. */
    const yoq = client();
    const bor = client({ quranDone: [
      { member_id: "sardor", sura: 1, day: "2026-09-02" },
    ]});
    const hafta = (c) => c.prayerRange(blank(), SARDOR, "2026-09-01", "2026-09-07").ball;
    const keyin = (c) => c.prayerRange(blank(), SARDOR, "2026-09-08", "2026-09-09").ball;
    assert.strictEqual(hafta(bor) - hafta(yoq), bor.QURON_BALL, "in its own week");
    assert.strictEqual(keyin(bor) - keyin(yoq), 0, "and not in the next one");
  },

  "somebody else's finished sura is not mine"(assert) {
    const c = client({ quranDone: [
      { member_id: "behruz", sura: 1, day: "2026-09-09" },
    ]});
    assert.strictEqual(
      c.prayerRange(blank(), SARDOR, "2026-09-09", "2026-09-09").ball, 0);
  },

  "a sura finished costs nothing to somebody who marks no prayers"(assert) {
    /* The reading is scored on its own. If a finished sura opened the prayer ledger,
       a person who only reads would collect a penalty for every unmarked prayer
       since the day they read — the opposite of what the five points are for. */
    const c = client({ quranDone: [
      { member_id: "sardor", sura: 1, day: "2026-09-02" },
    ]});
    assert.strictEqual(
      c.prayerRange(blank(), SARDOR, "2026-09-01", "2026-09-09").ball, c.QURON_BALL);
  },

  /* ------------------------------------------------------------ panel */
  async "the panel sits on Bugun and says where you are"(assert) {
    const c = client({ quran: [oqidi("sardor", 1, 5, "2026-09-09")] });
    await c.A.go("app");
    const h = c.html;
    assert.ok(h.includes("Qur'on"), "expected the panel");
    assert.ok(h.includes("Fotiha"), "with the sura named");
    assert.ok(h.includes("5</b> / 7 oyat"), "and the place in it");
    assert.ok(h.indexOf("Xufton") < h.indexOf("Qur'on"), "after the prayers");
    assert.ok(h.indexOf("Qur'on") < h.indexOf("Haftalik vazifa"), "before the weekly deed");
  },

  async "saving an ayah sends the sura, the ayah and the day"(assert) {
    const c = client();
    await c.A.go("app");
    c.setFields({ q_ayah: "5" });
    await c.A.addQuran();
    const sent = c.calls.find(x => x.path === "/me/quran");
    assert.ok(sent, "expected the reading to be sent");
    assert.strictEqual(sent.body.sura, 1);
    assert.strictEqual(sent.body.ayah, 5);
    assert.strictEqual(sent.body.day, "2026-09-09");
  },

  async "an ayah the sura does not have is refused before it is sent"(assert) {
    const c = client();
    await c.A.go("app");
    c.setFields({ q_ayah: "40" });
    await c.A.addQuran();
    assert.ok(!c.calls.some(x => x.path === "/me/quran"), "Fotiha has seven");
    assert.ok(c.html.includes("1 dan 7 gacha"), "and says so");
  },

  async "going backwards is refused — it would erase how far you have come"(assert) {
    const c = client({ quran: [oqidi("sardor", 1, 5, "2026-09-08")] });
    await c.A.go("app");
    c.setFields({ q_ayah: "3" });
    await c.A.addQuran();
    assert.ok(!c.calls.some(x => x.path === "/me/quran"));
    assert.ok(c.html.includes("5-oyatgacha"), "and says where you already are");
  },

  async "the finish button appears only at the end of the sura"(assert) {
    const yarim = client({ quran: [oqidi("sardor", 1, 5, "2026-09-09")] });
    await yarim.A.go("app");
    assert.ok(!yarim.html.includes("Surani tugatdim"), "not half way");

    const oxir = client({ quran: [oqidi("sardor", 1, 7, "2026-09-09")] });
    await oxir.A.go("app");
    assert.ok(oxir.html.includes("Surani tugatdim"), "at the last ayah it does");
  },

  async "finishing a sura sends it with the day"(assert) {
    const c = client({ quran: [oqidi("sardor", 1, 7, "2026-09-09")] });
    await c.A.go("app");
    await c.A.finishSura(true);
    const sent = c.calls.find(x => x.path.indexOf("/me/quran/done") === 0);
    assert.ok(sent, "expected the finish to be sent");
    assert.ok(sent.path.includes("on=true"));
    assert.strictEqual(sent.body.sura, 1);
    assert.strictEqual(sent.body.day, "2026-09-09");
  },

  async "a sura already finished offers to be un-finished"(assert) {
    const c = client({ quran: [oqidi("sardor", 1, 7, "2026-09-09")],
      quranDone: [{ member_id: "sardor", sura: 1, day: "2026-09-09" }] });
    await c.A.go("app");
    assert.ok(!c.html.includes("Surani tugatdim"), "not offered twice");
    assert.ok(c.html.includes("tugatilgan belgisini olib tashlash"));
    await c.A.finishSura(false);
    assert.ok(c.calls.some(x => x.path.includes("on=false")));
  },

  /* ------------------------------------------------------------ jamoa */
  "the board says where each person is and what they read this week"(assert) {
    const c = client({ quran: [
      oqidi("sardor", 1, 7, "2026-09-08"),
      oqidi("behruz", 2, 40, "2026-09-09"),
    ], quranDone: [{ member_id: "sardor", sura: 1, day: "2026-09-08" }] });
    assert.strictEqual(c.quronJami("behruz"), 40, "every sura's furthest ayah, added up");
    assert.strictEqual(c.quronTugatgani("sardor"), 1);
    assert.strictEqual(c.quronHafta("behruz", "2026-09-09"), 40);
    const h = c.quronJamoaView();
    assert.ok(h.includes("Behruz"), "everybody reading is on it");
    assert.ok(h.includes("Baqara"), "with the sura they are in");
    assert.ok(!h.includes("o'rin"), "no places — this is not a race");
  },

  "nobody reading yet means no board at all"(assert) {
    assert.strictEqual(client().quronJamoaView(), "");
  },

  async "the board is on Reyting, and the old qazo board is gone"(assert) {
    const c = client({ quran: [oqidi("sardor", 1, 7, "2026-09-09")] });
    await c.A.go("app");
    c.A.setTab("stats");
    const h = c.html;
    assert.ok(h.includes("Qur'on · jamoa"), "expected the reading board");
    assert.ok(!h.includes("Qazo daftari · jamoa"), "the qazo board was removed");
  },

  /* ------------------------------------------------- ko'chirilgan bo'limlar */
  async "the book penalty task is gone from Kitob"(assert) {
    /* Sardor took it out: the book is read for its own sake, and a punishment
       task for falling behind on it was one debt too many. */
    const c = client();
    await c.A.go("app");
    c.A.setTab("book");
    assert.ok(c.html.includes("O'qiyotganlarim"), "on the book page");
    assert.ok(!c.html.includes("Jazo vazifasi"), "no penalty task");
    assert.ok(!c.html.includes("Kitob qarzi"), "and no book debt on the page");
  },

  async "the book scoring rules moved to the bottom of Nishon"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setTab("book");
    assert.ok(c.html.includes("O'qiyotganlarim"), "on the book page");
    assert.ok(!c.html.includes("Umuman o'qilmagan kun"), "not on Kitob any more");
    c.A.setTab("nishon");
    const h = c.html;
    assert.ok(h.includes("Kitob bali"), "on Nishon instead");
    assert.ok(h.includes("Umuman o'qilmagan kun"), "with the rules themselves");
    assert.ok(h.indexOf("Kitob bali") > h.indexOf("Nishonlar"), "at the bottom");
  },
};
