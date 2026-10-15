-- Haftalik sanoqli maqsad. Foydalanuvchi hafta davomida muayyan sonni yig'adi
-- (masalan, 4444 marta salavot aytish). Har kuni nechta bajarganini alohida
-- yozadi; hafta tugagach yangi hafta boshlanadi — eski yozuvlar saqlanib qoladi.
CREATE TABLE IF NOT EXISTS hafta_sanoqlar (
    id         BIGSERIAL   PRIMARY KEY,
    member_id  TEXT        NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 300),
    target     INTEGER     NOT NULL CHECK (target BETWEEN 1 AND 1000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hafta_sanoqlar_member_idx ON hafta_sanoqlar (member_id);

-- Kunlik yozuv: qaysi vazifa, qaysi kun, nechta bajarildi.
CREATE TABLE IF NOT EXISTS hafta_sanoq_kunlar (
    sanoq_id  BIGINT  NOT NULL REFERENCES hafta_sanoqlar (id) ON DELETE CASCADE,
    day       DATE    NOT NULL,
    amount    INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
    PRIMARY KEY (sanoq_id, day)
);
