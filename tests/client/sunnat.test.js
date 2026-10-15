const { loadClient } = require("./harness");

const MEMBER = { id: "sardor", name: "Sardor", city: "Toshkent", lat: 41.3, lng: 69.2, tz: 5, asr: 2, fa: 18, ia: 18 };

module.exports = {
  "bajarilgan kun sunnati reytingga bir ball qo'shadi": (assert) => {
    const c = loadClient({ at: "2026-09-30T09:00:00Z", expose: ["prayerRange"] });
    const u = { days: { "2026-09-29": { sunnat: "done" } } };
    const o = c.prayerRange(u, MEMBER, "2026-09-29", "2026-09-29");
    assert.strictEqual(o.sunnat, 1);
    assert.strictEqual(o.sunnatBall, 1);
    assert.strictEqual(o.ball, -4);
  },
};
