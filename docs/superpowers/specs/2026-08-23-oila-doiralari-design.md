# Oila doiralari — loyiha hujjati

**Sana:** 2026-08-23
**Holat:** kelishildi, amalga oshirilmagan

## Maqsad

Har bir a'zo o'z oilasini ilovaga qo'sha olsin. Oila do'stlar guruhidan butunlay ajratilgan
bo'lsin: Hikmatillaning oilasi Sardorga ham, Behruzga ham ko'rinmasin, oiladagilar esa
do'stlar guruhini ko'rmasin. Shu bilan birga Hikmatilla namozini **bir marta** belgilasin va
o'sha bitta yozuv ikkala joyda ham hisoblansin.

## Asosiy g'oya: ma'lumot joyidan qimirlamaydi

Hozir ham namoz, kitob, nishon va safar tarixi **odamga** bog'langan, guruhga emas. Shuning
uchun oila qo'shish uchun shaxsiy yozuvlarni ko'chirish shart emas — ular joyida qoladi,
ustiga faqat "kim kimni ko'radi" qatlami qo'shiladi.

```
Hikmatilla  ──┬──►  Do'stlar doirasi   (Sardor, Behruz ko'radi)
   bitta      │
   yozuv      └──►  O'z oilasi          (ayoli, onasi ko'radi)
```

Hamma narsa bitta tushuncha — **doira**. Do'stlar guruhi ham doira, oila ham doira. Farqi
faqat nomi va turida. Shu tanlov tufayli reyting, haftalik jamoa nishoni, kitob zametkalari
lentasi va taqqoslash **alohida yozilmaydi** — ular allaqachon doira darajasida ishlaydi,
faqat doiraga bog'lanadi.

## Ma'lumot tuzilishi

Ikkita yangi jadval. Mavjud jadvallarga (`members`, `day_records`, `books`, `places`,
`bonuses`, `tasks`) **tegilmaydi**.

```sql
CREATE TABLE circles (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL,           -- 'friends' | 'family'
    owner_id   TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    week_goal  INTEGER NOT NULL DEFAULT 25,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE circle_members (
    circle_id BIGINT NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
    member_id TEXT   NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (circle_id, member_id)
);
```

`week_goal` doira darajasida, chunki oilada norma do'stlar guruhidagi 25 dan boshqa
bo'lishi mumkin — bolalar va keksalar bor. Boshlang'ich qiymat 25, egasi o'zgartiradi.

Ko'chirish migratsiyasi hozirgi uch a'zoni `kind='friends'`, egasi `sardor` bo'lgan
"Do'stlar" doirasiga joylaydi. Ular uchun hech narsa o'zgarmaydi.

## Ruxsatlar

| | Egasi | Oddiy a'zo |
|---|---|---|
| Doirani ko'rish | ha | ha |
| O'z namozini belgilash | ha | ha |
| Odam qo'shish / chiqarish | ha | yo'q |
| A'zolarning PIN kodini ko'rish va tiklash | ha | yo'q |
| Doira nomi va haftalik maqsadi | ha | yo'q |
| **Boshqa doirani ko'rish** | **yo'q** | **yo'q** |

Bosh admin (`ADMIN_PASSWORD`) o'zi a'zo bo'lmagan doirani **ko'rmaydi**. U endi
"hamma narsaning admini" emas, do'stlar doirasining egasi.

> Halol eslatma: Railway hisobi va bazasi Sardorda. "Bosh admin ko'rmaydi" — bu ilova
> ichidagi kelishuv, texnik to'siq emas. Bazadan baribir o'qish mumkin. Bu qoida kundalik
> ishlatishda nima ko'rinishini belgilaydi, sirni himoya qilmaydi.

### Odam qo'shish

Ikki yo'l:

1. **Yangi odam.** Egasi ism va shaharni kiritadi, ilova login yaratadi (`zuhra`) va
   tasodifiy PIN beradi. Login band bo'lsa `zuhra2` qilib beriladi. Egasi ikkalasini
   ko'radi va odamga aytadi.
2. **Mavjud odam.** Login orqali qo'shiladi. Yangi hisob ochilmaydi — o'sha odam bitta
   yozuv bilan ikkala doirada qatnashadi.

## Nima o'zgaradi

Uchta narsa hozir ishlab turibdi va o'zgarishi shart.

**1. `/api/v1/state` doiraga bog'lanadi.** Hozir kirgan har bir odam hammaning ma'lumotini
oladi. Endi `GET /state?circle=<id>` faqat o'sha doiraning a'zolarini va ularning
yozuvlarini qaytaradi, so'rovchi o'sha doirada bo'lsagina. Bu eng katta texnik ish va
oilaning yopiqligi butunlay shunga bog'liq.

**2. Kirish sahifasi ismlar ro'yxatini yo'qotadi.** Hozir sahifani ochgan har kim uch
kishining ismini ko'radi (`GET /auth/members` ochiq). Oilalar qo'shilsa bu — begona odam
birovning ayoli va bolalari ismini ko'rishi. Shuning uchun ro'yxat olib tashlanadi, o'rniga
**login + PIN** yoziladi. Yumshatish: birinchi muvaffaqiyatli kirishdan keyin login
telefonda saqlanadi va keyingi safar o'zi to'ldirilib turadi, ya'ni yozish bir marta bo'ladi.

**3. Admin panel doiraga bog'lanadi.** Hozirgi `GET /admin/roster` hamma a'zoni PIN'i bilan
beradi. U "mening doiram a'zolari" ga aylanadi va har bir doira egasiga ochiladi.

## Bosqichlar

Har bir bosqich **o'z ishlash rejasini** oladi va alohida yakunlanadi. Bu hujjat uchalasining
umumiy shakli; reja faqat boshlanayotgan bosqich uchun yoziladi.

### 1-bosqich — poydevor

Ko'rinadigan yangilik deyarli yo'q, lekin busiz qolgani qurilmaydi. Ishlab turgan narsaga
tegadigan yagona bosqich, shuning uchun eng ehtiyotkorlik talab qiladi.

- `circles` va `circle_members` jadvallari, migratsiya bilan hozirgi uch a'zoni "Do'stlar"
  doirasiga ko'chirish
- `/state`, `/admin/roster` doiraga bog'lanadi; doiraga a'zo bo'lmagan 403 oladi
- Kirish sahifasi login + PIN ga o'tadi, `GET /auth/members` olib tashlanadi
- Tepada doira almashtirgichi (hozircha bitta doira ko'rinadi)

**Tekshirish:** uch a'zo uchun ekranlar va ballar 1-bosqichdan oldingi holat bilan bir xil
chiqishi kerak.

### 2-bosqich — oila

Shu bosqich oxirida so'ralgan narsa to'liq ishlaydi.

- Oila yaratish, a'zo qo'shish (yangi yoki mavjud), chiqarish
- Doira sozlamalari: nom, haftalik maqsad
- Almashtirgich ishlaydi: Reyting, Nishon va Kitob lentasi tanlangan doiraga o'tadi
- Bugun va Sunnat o'zgarmaydi — ular shaxsiy

**Nishonlar semantikasi.** Shaxsiy nishonlar ikkala doirada bir xil, chunki ular odamning
o'z mehnati. Doiraga qarab o'zgaradigani — kimning nishonlarini ko'rish va **haftalik jamoa
nishoni**, chunki u doiradagi hammaga bog'liq va har doirada alohida hisoblanadi.

### 3-bosqich — oilaviy imkoniyatlar

**Uyda jamoat namozi.** Bir kishi "birga o'qiymiz" deb boshlaydi, oila a'zolariga o'sha namoz
oynasi ichida taklif ko'rinadi, har biri "men ham" deb bir marta bosadi va **o'z** yozuviga
jamoat bali tushadi. Boshqa birov uchun yozilmaydi — "har kim o'zi belgilaydi" va "bir marta
belgilangandan keyin o'zgarmaydi" qoidalari buzilmaydi.

**Bolalar rejimi.** A'zo darajasidagi belgi, doira egasi qo'yadi. Bolaga qarz va jarima
yozilmaydi — faqat yulduzcha yig'adi. Kattalar tizimi bolani ilovadan qo'rqitib qo'yadi.

**Oilaviy xatm.** 30 pora oila a'zolari orasida bo'linadi, umumiy progress chizig'i xatmga
qarab boradi. Kitob modulining bet va tezlik hisobi shu yerda qayta ishlatiladi.

**Oilaviy namoz tahlili.** "Oilada eng ko'p bomdod qoldirilyapti", "Aziz o'rtacha 40 daqiqa
kechikadi". Do'stlar doirasidan olib tashlangan edi (hech kim o'qimasdi), oilada esa
ota-onaga haqiqiy ma'lumot beradi. Faqat oila turidagi doirada ko'rinadi.

## Qabul qilingan qarorlar

Bular Sardorning qarorlari — so'ramasdan "tuzatilmasin".

- **Har kim o'zi kiradi va o'zi belgilaydi.** Vakil orqali yozish yo'q. Bola ham o'z
  logini bilan kiradi (bitta telefonda bo'lsa ham).
- **Har kim o'z doirasining egasi.** Oila qo'shish uchun bosh admindan ruxsat so'ralmaydi.
- **Oila yopiq, bosh admin ham ko'rmaydi.**
- **Uzr mexanizmi yo'q.** Namoz farz bo'lmagan kunlarda ayollar o'qigandek belgilab
  ketaveradi — ham tartib saqlanadi, ham hech narsa oshkor bo'lmaydi. Buning evaziga
  o'qilmagan namoz yozuvga "o'qilgan" bo'lib tushadi va umrlik nishonlar biroz aniq
  bo'lmaydi; bu ongli tanlov.
- **Bir odam nechta doirada bo'lsa ham bo'ladi.**
- **Almashtirgich tepada**, pastda ettinchi bo'lim emas — ekranlar takrorlanmasligi uchun.

## Ochiq savollar

Amalga oshirish paytida hal qilinadi, hozir to'sqinlik qilmaydi:

- Oila uchun haftalik maqsad 25 dan boshqa bo'lsinmi? (bir-ikki hafta ishlatib ko'rgach
  ma'lum bo'ladi)
- Bolalar rejimidagi a'zo doira reytingida qatnashadimi yoki alohida ko'rsatiladimi?
- Doiradan chiqib ketgan a'zoning eski yozuvlari doira tarixida qoladimi?

## Xavflar

- **1-bosqich ishlab turgan ilovaga tegadi.** `/state` va kirish oqimi o'zgaradi. Testlar
  yo'q (`tests/` tiklab bo'lmagan), shuning uchun bu bosqichda avval test yozish kerak —
  aks holda uch kishining ishlab turgan ilovasi qimor ostida qoladi.
- **Login ro'yxatining yo'qolishi** — qulaylikdan yo'qotish. Saqlangan login bilan
  yumshatiladi.
- **Ma'lumot hajmi.** Doira kattalashsa `/state` bitta so'rovda hammasini beradi. Hozirgi
  o'lchamda muammo emas, 20-30 a'zodan keyin sahifalash kerak bo'ladi.
