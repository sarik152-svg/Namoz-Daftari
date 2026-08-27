# Qazo daftari, tahajjud tuzatishi va oilani o'chirish — loyiha hujjati

**Sana:** 2026-08-27
**Holat:** kelishildi (Sardor, 2026-08-27). Bajarilmagan.

Uchta alohida ish bitta hujjatda: ikkitasi kichik, biri yangi bo'lim. Uchalasi bitta
deploy bilan chiqadi.

---

## 1. Oilani o'chirish

### Muammo

Hikmatilla "Ismailovlar" nomli oilani ikki marta ochib qo'ygan. Ilovada oilani
o'chirishning **hech qanday yo'li yo'q**: `POST /circles` va `PATCH /circles/{id}` bor,
`DELETE` yo'q, Sozlamalardagi "Oilam" ro'yxatida esa faqat "Ochish" tugmasi turadi. Ortiqcha
oila abadiy qolib ketadi va egasining beshta doira limitidan joy yeydi.

Bazaga tashqaridan ulanib bir martalik o'chirish ham mumkin emas: Railway'dagi Postgres
faqat ichki tarmoqda, public TCP proxy yoqilmagan. Demak yechim ilovaning o'zida bo'lishi kerak.

### Yechim

```
DELETE /api/v1/circles/{circle_id}     → {"ok": true, "stranded": ["Nodira", "Aziz"]}
```

Uchta qoida, uchalasi ham serverda:

1. **Faqat egasi.** Mavjud `_require_owned_circle` ishlatiladi — `PATCH` ham shundan foydalanadi.
2. **Faqat oila.** `kind = 'friends'` bo'lsa 409 `friends_circle` qaytadi. Do'stlar doirasi
   backfill bilan yaratilgan yagona guruh: uni o'chirish hammani doirasiz qoldiradi, va bu
   xatoni bosib bo'lmaydigan qilib qo'yish arzonroq.
3. **Odamlar qolaveradi.** Doira o'chadi, undagi odamlarning hisobi, namoz tarixi, kitobi va
   PIN kodi tegilmaydi — ular `members` jadvalida, doirada emas. O'chirishdan **oldin**
   bitta so'rov bilan sanaladi: bu doiradan boshqa hech qaysi doirada bo'lmagan kim bor.
   Javobda ularning **ismlari** qaytadi (login emas): o'chirilgan doiraning ro'yxatini
   ilova endi so'rab ololmaydi, ya'ni ismni faqat server bera oladi.

Bazada migratsiya **kerak emas** — `circle_members`, `jamoat_calls`, `khatms` allaqachon
`ON DELETE CASCADE` bilan bog'langan, ya'ni bitta `DELETE FROM circles WHERE id = $1` yetarli.
Doiraning xatmi va "uyda jamoat" chaqiriqlari doira bilan birga o'chadi; bu to'g'ri, chunki
ular doiraning o'zi haqidagi yozuv.

### Ilovada

Sozlamalar → "Oilam" ro'yxatida har bir oila yonida kichik qizil **"O'chirish"** tugmasi.
Ro'yxatning o'zi allaqachon `owner_id === me` bo'yicha filtrlangan, ya'ni tugmani faqat egasi
ko'radi. Bosilganda kodda hamma joyda ishlatilgan `confirm()`:

> «Ismailovlar» oilasi o'chirilsinmi? Oiladagilarning namoz yozuvlari o'chmaydi, lekin
> oilaning xatmi va jamoat chaqiriqlari o'chadi. Buni qaytarib bo'lmaydi.

O'chgandan keyin doiralar ro'yxati qayta yuklanadi va agar o'sha oila ochiq turgan bo'lsa,
qolganlarning birinchisiga o'tiladi. Javobdagi `stranded` bo'sh bo'lmasa, xabar chiqadi:
«Oila o'chirildi. 2 kishi hech qaysi doirada qolmadi: Nodira, Aziz — yangi oilaga qo'shib qo'ying.»

---

## 2. Tahajjud "Shu kun bali"da ko'rinmayotgani

### Sabab

Tahajjud aslida hisoblanadi: `score()` uni qarzdan `NAFL_BALL` ga kamaytiradi, `prayerRange()`
esa reytingga `+0,25` qo'shadi. Faqat **Bugun sahifasining tepasidagi "Shu kun bali"** uni
ko'rmaydi:

```js
let dayBall=0;PRAYERS.forEach(p=>{const r=day[p.k];
 if(r&&STATUS[r.s])dayBall+=STATUS[r.s].ball+(r.j&&r.s==="ontime"?JAMOAT_BALL:0)});
```

Tahajjud doim `ontime` deb yoziladi, `STATUS.ontime.ball` esa `0`. Jamoat bali bu yerga
qo'shilgan, nafl bali qo'shilmay qolgan. Natijada tahajjud qatorining o'zida "+0,25 ball" deb
turadi-yu, tepadagi raqam qimirlamaydi.

Shu qatorda ikkinchi kamchilik ham bor: ball musbat bo'lsa ham qizil chiqadi
(`dayBall===0?"jade":"clay"`), ya'ni jamoat bilan o'qigan odam "+0,5" ni jarima rangida ko'radi.

### Tuzatish

`dayBall` ga nafl bali (va 3-bo'limdagi qazo bali) qo'shiladi; rang `dayBall < 0` bo'lgandagina
qizil, aks holda yashil va musbat son "+" bilan chiqadi.

---

## 3. Qazo daftari

### Maqsad

Yoshlikda o'qilmagan namozlarni uzish uchun alohida joy. Bu bugungi namozni kechikib o'qish
(`s: "qazo"`, −0,25) bilan **butunlay boshqa narsa**: u minus, bu plyus. Shuning uchun ilovada
bo'lim "Qazo daftari" deb ataladi va hech qaerda oddiy "Qazo" deb yozilmaydi.

### Ma'lumot tuzilishi

Kun yozuviga bitta yangi kalit. Namoz belgilariga tegilmaydi:

```json
{ "bomdod": {"s":"ontime","t":"05:12"},
  "qazo":   {"bomdod":3, "peshin":2, "asr":1, "shom":0, "xufton":0} }
```

Odamning umumiy qarzi esa hujjat darajasida:

```json
{ "days": {...}, "bonuses": [], "tasks": [], "books": [], "places": [], "qazo_debt": 9125 }
```

- `QazoCount` — beshta farz vaqti, har biri `0 … MAX_QAZO_PER_PRAYER_PER_DAY` (20).
  Tahajjud yo'q: nafl namozning qazosi bo'lmaydi. Vitr ham yo'q (kelishuv: hozircha 5 vaqt).
- `qazo_debt` — `0 … MAX_QAZO_DEBT` (100 000, taxminan 55 yil). Bu **o'zgartirsa bo'ladigan**
  qiymat: u o'tmish haqidagi da'vo emas, odamning o'z taxmini.

Migratsiya kerak emas — kun yozuvi `JSONB`, `MemberData` esa butun hujjat sifatida yoziladi.

### Faqat ko'payadi, kamaymaydi

Ilovaning asosiy qoidasi — yozilgan belgi o'zgarmaydi (`_keep_existing_marks`). Qazo sanog'i
kun davomida o'sishi kerak, shuning uchun unga alohida, lekin shu ruhdagi qoida qo'yiladi:

> saqlangan son bilan kelgan sonning **kattasi** qoladi.

Serverda, `_keep_existing_marks` yonida, har vaqt bo'yicha `max(kelgan, saqlangan)`. Shunda
telefon eskirgan holatni yuborsa ham, yoki kimdir sonni qo'lda kamaytirmoqchi bo'lsa ham,
o'qilgan qazo yo'qolmaydi. `upsert_day` ham, `replace_member_data` ham shu yo'ldan o'tadi.

### Ball

Yangi doimiy: `QAZO_BALL = 0.25`. Tahajjudning `NAFL_BALL` idan alohida — ikkalasi bugun teng,
lekin ular boshqa-boshqa qoidalar va keyin mustaqil o'zgarishi mumkin.

| Qayerda | Ta'siri |
|---|---|
| Umumiy qarz (`score`) | har qazo qarzni `0,25` ga kamaytiradi, tahajjud kabi |
| Haftalik/oylik kursi (`prayerRange`) | har qazo `+0,25` ball |
| "Shu kun bali" | o'sha kuni saqlangan qazolar `+0,25` dan |
| Haftalik jamoa nishoni | **qo'shilmaydi** — nishon "25 ta farzni vaqtida" degan ahd |
| Bolalar rejimi | qarz yo'q, qazo bo'limi ham ko'rsatilmaydi |

`prayerRange` ichida `o.qazo` allaqachon band (kun ichida kechikib o'qilganlar soni), shuning
uchun yangi hisoblagich `o.eski` deb ataladi. Bu ikki tushunchani chalkashtirish eng ehtimoliy
xato, shuning uchun nom darajasida ajratiladi.

### Ilovada

Bugun sahifasida, Xufton kartasidan keyin, "Bugun Qur'on o'qidim" dan oldin:

```
QAZO DAFTARI                         bugun: 7 ta
──────────────────────────────────────────────
Bomdod   −  3  +        Shom     −  1  +
Peshin   −  2  +        Xufton   −  0  +
Asr      −  1  +
                              [ Saqlash ]
──────────────────────────────────────────────
9125 tadan 342 tasi o'qildi · 8783 qoldi
████░░░░░░░░░░░░░░░░  3,7%
```

**Nega "Saqlash" bor.** Har bosishda darhol serverga yozilsa, xato bosilgan raqamni qaytarib
bo'lmaydi. Shuning uchun sanoq avval faqat ekranda turadi — xuddi vazifa sahifasidagi tasbeh
sanog'i (`A.tas`) kabi — va "Saqlash" bosilgandagina kun yozuviga qo'shiladi. Saqlangandan
keyin kamaytirib bo'lmaydi, lekin ustiga yana qo'shsa bo'ladi.

`−` tugmasi faqat saqlanmagan sanoqni kamaytiradi va hech qachon saqlangan sondan pastga
tushmaydi.

**Umumiy qarz.** `qazo_debt` belgilanmagan bo'lsa panel tagida bitta qator: "Qazo qarzingiz
taxminan qancha?" va son kiritish. Belgilangach progress chizig'i chiqadi, yonida
"o'zgartirish" havolasi.

`qazo_debt` — **boshlang'ich son**, qolgani emas. Qolgan har doim shundan hisoblanadi:

    qolgan = qazo_debt − (ilovada belgilangan barcha qazolar)

Shuning uchun "o'zgartirish" bosilganda maydonda o'sha boshlang'ich son turadi va tagida
"hozir shundan N tasi o'qilgan" deb ko'rsatiladi. Aks holda odam qolgan sonni qayta kiritib
yuborsa, o'qilganlari ikki marta ayrilib ketardi. Qolgan manfiy chiqsa 0 ko'rsatiladi va
"hammasi uzildi" deb yoziladi.

### Testlar

**pytest**

- `DayRecord` `qazo` kalitini qabul qiladi; 20 dan katta son rad etiladi; noma'lum vaqt nomi rad etiladi
- `qazo_debt` hujjatda saqlanadi va qaytadi; manfiy son rad etiladi
- kichrayib kelgan qazo sanog'i saqlanganini bosib o'tmaydi (`upsert_day` ham, `replace_member_data` ham)
- namoz belgilarining write-once qoidasi buzilmaganini tasdiqlovchi mavjud testlar o'tadi

**client (`tests/client/`)**

- tahajjud belgilangach "Shu kun bali" `+0,25` ko'rsatadi *(hozir yiqiladi)*
- jamoat bilan o'qilgan kun bali yashil, qizil emas *(hozir yiqiladi)*
- qazo sanog'i "Saqlash" bosilgunicha serverga ketmaydi
- "Saqlash" bosilgach kun yozuviga `qazo` yoziladi va so'rov yuboriladi
- saqlangan sondan pastga tushirib bo'lmaydi
- qazo qarzdan `0,25` dan kamaytiradi va reyting baliga `0,25` dan qo'shadi
- qazo haftalik jamoa nishoniga ta'sir qilmaydi
- oilani o'chirish tugmasi `DELETE /circles/{id}` yuboradi va ro'yxatni yangilaydi

---

## Nima o'zgarmaydi

- Namoz belgilarining write-once qoidasi
- Ballar: vaqtida 0, qazo (kun ichida) −0,25, o'qilmagan −1, jamoat +0,5, tahajjud +0,25
- Haftalik jamoa nishoni va uning "hamma yetsin" sharti
- Bolalar rejimi qoidalari
- Do'stlar doirasi va uning egasi
- Kitob daftari, sunnat, safar tarixi

## Deploy

Avtomatik deploy o'chirilgan. Uchala ish tugab, ikkala test to'plami yashil bo'lgandan keyin
Railway agenti orqali `namoz-web` (`761a22d2-6991-4151-b20d-8ea547916e96`) bir marta qo'lda
deploy qilinadi.
