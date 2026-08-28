/* The make-up notebook, and the day total that had been dropping tahajjud on the
   floor. Everything here drives the app: tap, save, read the painted screen. */
const { loadClient } = require("./harness");

const SARDOR = {
  id: "sardor", name: "Sardor Valixanov", city: "Toshkent",
  lat: 41.2995, lng: 69.2401, tz: 5, asr: 2, fa: 18, ia: 18,
};
const blank = () => ({ days: {}, bonuses: [], tasks: [], books: [], places: [] });
/* The backlog lives on the member, not in the document: the document is fanned out
   into five tables on the way in, and a field with no table came back as zero. */
const owing = (n) => ({ ...SARDOR, qazo_debt: n });

/* 09:00Z is 14:00 in Toshkent — after Peshin, before Asr. */
function client(at = "2026-08-22T09:00:00Z", patch = {}) {
  const loaded = loadClient({
    at,
    expose: ["score", "prayerRange", "jamoaHafta", "QAZO_BALL", "NAFL_BALL", "cfgNow", "qazoPace", "fmt"],
    routes: {
      "/members/sardor/days/2026-08-22": { ok: true },
      "/members/sardor/qazo-debt": { ok: true, qazo_debt: 9125 },
      "/members/sardor/data": { ok: true },
    },
  });
  loaded.setState({
    members: [SARDOR], data: { sardor: blank() },
    me: "sardor", date: "2026-08-22", token: "tok", isAdmin: false,
    ...patch,
  });
  return loaded;
}

/* The big number at the top of Bugun, with the class that colours it. */
function dayBall(html) {
  const found = html.match(/<b class="([^"]*)">([^<]*)<\/b><i>Shu kun bali<\/i>/);
  if (!found) throw new Error("no day total on the screen");
  return { colour: found[1], text: found[2] };
}

const withQazo = (qazo, extra = {}) => ({ ...blank(), ...extra, days: { "2026-08-22": { qazo } } });
const dayWith = (qazo, extra) => ({ sardor: withQazo(qazo, extra) });

module.exports = {
  /* ---------------------------------------------------------- tahajjud */
  async "tahajjud moves the day's own total, not only the ledger"(assert) {
    const c = client();
    c.A.mark("tahajjud", "pray", "2026-08-22");
    await c.A.go("app");
    /* Pinned to the constant rather than a number: the night prayer's worth is
       Sardor's to set, and it has already moved once. */
    assert.strictEqual(dayBall(c.html).text, "+" + c.fmt(c.NAFL_BALL));
  },

  async "a day that only gained points is not painted as a loss"(assert) {
    const c = client();
    c.A.mark("tahajjud", "pray", "2026-08-22");
    await c.A.go("app");
    assert.strictEqual(dayBall(c.html).colour, "jade");
  },

  async "a day that lost points is still painted as a loss"(assert) {
    const c = client("2026-08-22T09:00:00Z");
    c.A.mark("bomdod", "miss", "2026-08-22");
    await c.A.go("app");
    const shown = dayBall(c.html);
    assert.strictEqual(shown.text, "-1");
    assert.strictEqual(shown.colour, "clay");
  },

  /* ---------------------------------------------------------- counting */
  async "tapping a make-up prayer does not reach the server yet"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.addQazo("bomdod");
    c.A.addQazo("bomdod");
    assert.strictEqual(c.__day("qazo"), undefined, "nothing written before saving");
    assert.ok(!c.calls.some(x => x.method === "PUT"), "and nothing sent");
  },

  async "saving writes the count and sends the day"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.addQazo("bomdod");
    c.A.addQazo("bomdod");
    c.A.addQazo("xufton");
    await c.A.saveQazo();
    /* The object comes back from the vm sandbox, so its prototype is not this
       realm's Object — compare the content, not the reference. */
    assert.strictEqual(JSON.stringify(c.__day("qazo")), JSON.stringify({ bomdod: 2, xufton: 1 }));
    const sent = c.calls.find(x => x.method === "PUT");
    assert.ok(sent, "the day must be pushed");
    assert.strictEqual(sent.body.qazo.bomdod, 2);
  },

  async "a saved count can be added to but never lowered"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.addQazo("asr");
    c.A.addQazo("asr");
    await c.A.saveQazo();
    c.A.subQazo("asr");
    c.A.subQazo("asr");
    await c.A.saveQazo();
    assert.strictEqual(c.__day("qazo").asr, 2, "saved make-ups cannot be taken back");
    c.A.addQazo("asr");
    await c.A.saveQazo();
    assert.strictEqual(c.__day("qazo").asr, 3);
  },

  /* ---------------------------------------------------------- scoring */
  async "each make-up prayer lifts a quarter point off the debt"(assert) {
    const c = client();
    const none = c.score({ ...blank(), days: { "2026-08-22": {} } }, SARDOR, false);
    const four = c.score(withQazo({ bomdod: 4 }), SARDOR, false);
    assert.strictEqual(none.debt - four.debt, 4 * c.QAZO_BALL);
  },

  async "make-up prayers count in the ranking too"(assert) {
    const c = client();
    const range = c.prayerRange(withQazo({ shom: 3 }), SARDOR, "2026-08-22", "2026-08-22");
    assert.strictEqual(range.eski, 3);
    assert.strictEqual(range.ball, 3 * c.QAZO_BALL);
  },

  async "make-up prayers do not count toward the weekly team badge"(assert) {
    const c = client("2026-08-22T09:00:00Z", { data: dayWith({ bomdod: 20, asr: 20 }) });
    const week = c.jamoaHafta("2026-08-16", "2026-08-22");
    assert.strictEqual(week.rows[0].ontime, 0, "the badge counts fard prayed on time");
    assert.strictEqual(week.ok, false);
  },

  async "the day's own total includes make-up prayers"(assert) {
    const c = client("2026-08-22T09:00:00Z", { data: dayWith({ peshin: 2 }) });
    await c.A.go("app");
    assert.strictEqual(dayBall(c.html).text, "+0,5");
  },

  async "the debt page adds up: penalty minus relief is the debt"(assert) {
    /* The middle stat had been leaving the congregation bonus out, so the three
       numbers on that row never quite reconciled. A new kind of relief makes that
       worse, so the row is checked rather than eyeballed. */
    const c = client("2026-08-22T09:00:00Z", {
      data: { sardor: { ...blank(), days: {
        "2026-08-21": { bomdod: { s: "missed" }, tahajjud: { s: "ontime" },
                        qazo: { peshin: 2 } },
        "2026-08-22": { bomdod: { s: "ontime", t: "04:05", j: true } },
      } } },
    });
    await c.A.go("app");
    c.A.setTab("sunnat");
    const nums = c.html.match(/<b class="clay">([^<]*)<\/b><i>Jamg'arilgan minus<\/i>[\s\S]*?<b class="jade">\u2212([^<]*)<\/b>[\s\S]*?<b class="[^"]*">([^<]*)<\/b><i>(Qolgan qarz|Zaxira)<\/i>/);
    assert.ok(nums, "expected the three debt figures on the page");
    const num = (t) => Number(String(t).replace(",", ".").replace("+", ""));
    const [, minus, relief, left, label] = nums;
    const debt = label === "Zaxira" ? -num(left) : num(left);
    assert.strictEqual(num(minus) - num(relief), debt);
  },

  /* ---------------------------------------------------------- the circle */
  async "the ranking page shows who is making up what, without ranking it"(assert) {
    const BEHRUZ = { ...SARDOR, id: "behruz", name: "Behruz Qurbonov" };
    const c = client("2026-08-22T09:00:00Z", {
      members: [SARDOR, BEHRUZ],
      data: {
        sardor: { ...blank(), days: { "2026-08-22": { qazo: { bomdod: 12, asr: 5 } } } },
        behruz: { ...blank(), days: { "2026-08-20": { qazo: { peshin: 4 } } } },
      },
    });
    await c.A.go("app");
    c.A.setTab("stats");
    const from = c.html.indexOf("Qazo daftari");
    assert.ok(from > 0, "expected a make-up section on the ranking page");
    const block = c.html.slice(from);
    assert.ok(block.includes("Bomdod 12"), "expected each prayer named with its count");
    assert.ok(block.includes("Peshin 4"), "expected the other member's too");
    assert.ok(!/\d+-o'rin/.test(block), "no places: this is not a contest");
  },

  /* ---------------------------------------------------------- backlog */
  async "what is left is the stated backlog minus everything made up"(assert) {
    const c = client("2026-08-22T09:00:00Z", {
      members: [owing(100)],
      data: { sardor: { ...blank(), days: { "2026-08-22": { qazo: { bomdod: 8 } } } } },
    });
    await c.A.go("app");
    assert.ok(c.html.includes("92 qoldi"), "expected 100 - 8 to be shown as what is left");
  },

  async "stating the backlog goes to its own route, not the document"(assert) {
    const c = client();
    await c.A.go("app");
    c.setFields({ q_debt: "9125" });
    await c.A.setQazoDebt();
    const sent = c.calls.find(x => x.path === "/members/sardor/qazo-debt");
    assert.ok(sent, "expected the backlog to be posted on its own");
    assert.strictEqual(sent.body.qazo_debt, 9125);
    assert.ok(!c.calls.some(x => x.path === "/members/sardor/data"),
      "the whole document must not be the carrier");
  },

  async "a stated backlog survives on the screen it was typed into"(assert) {
    const c = client();
    await c.A.go("app");
    c.setFields({ q_debt: "9125" });
    await c.A.setQazoDebt();
    assert.ok(c.html.includes("9125 tadan"), "the backlog must still be shown after saving");
  },

  /* ---------------------------------------------------------- picker */
  async "the plus counts up whichever prayer is chosen"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setQazoPick("asr");
    c.A.addQazo();
    c.A.addQazo();
    await c.A.saveQazo();
    assert.strictEqual(JSON.stringify(c.__day("qazo")), JSON.stringify({ asr: 2 }));
  },

  async "switching prayer keeps what the previous one had"(assert) {
    const c = client();
    await c.A.go("app");
    c.A.setQazoPick("shom");
    c.A.addQazo();
    c.A.setQazoPick("bomdod");
    c.A.addQazo();
    c.A.addQazo();
    await c.A.saveQazo();
    const saved = c.__day("qazo");
    assert.strictEqual(saved.shom, 1);
    assert.strictEqual(saved.bomdod, 2);
  },

  /* ---------------------------------------------------------- pace */
  async "the backlog says how long it will take at this pace"(assert) {
    /* Ten made up over the two days since the first entry, so five a day, and
       ninety left: eighteen days at that rate. Averaged over calendar days rather
       than only the days something was read, the way the book pace already is. */
    const c = client("2026-08-22T09:00:00Z", {
      members: [owing(100)],
      data: { sardor: { ...blank(), days: {
        "2026-08-21": { qazo: { bomdod: 5 } },
        "2026-08-22": { qazo: { bomdod: 5 } },
      } } },
    });
    await c.A.go("app");
    assert.ok(c.html.includes("18 kun"), "expected the finish estimate, got: "
      + (c.html.match(/Shu tezlikda[^<]*/) || ["nothing"])[0]);
  },

  async "no estimate is offered before there is a pace to measure"(assert) {
    const c = client("2026-08-22T09:00:00Z", { members: [owing(100)] });
    await c.A.go("app");
    assert.ok(!c.html.includes("Shu tezlikda"), "nothing read yet means nothing to project");
  },
};
