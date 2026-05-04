-- ============================================================
-- LA FEFA — Supabase / Postgres schema
-- Rode este arquivo no SQL Editor do Supabase (uma vez só).
-- ============================================================

CREATE TABLE IF NOT EXISTS holders (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  instagram   TEXT,
  telefone    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aniversariantes (
  id           BIGSERIAL PRIMARY KEY,
  nome         TEXT NOT NULL,
  instagram    TEXT,
  telefone     TEXT,
  data_evento  DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pessoas_restritas (
  id         BIGSERIAL PRIMARY KEY,
  nome       TEXT NOT NULL,
  motivo     TEXT,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS convidados_frequentes (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL UNIQUE,
  instagram   TEXT,
  telefone    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- tipo: 'holder' | 'aniversariante' | 'convidado'
CREATE TABLE IF NOT EXISTS listas (
  id                 BIGSERIAL PRIMARY KEY,
  holder_id          BIGINT REFERENCES holders(id) ON DELETE SET NULL,
  aniversariante_id  BIGINT REFERENCES aniversariantes(id) ON DELETE CASCADE,
  convidado_id       BIGINT REFERENCES convidados_frequentes(id) ON DELETE SET NULL,
  data               DATE NOT NULL,
  tipo               TEXT NOT NULL,
  dia_semana         TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listas_data_idx ON listas(data);
CREATE INDEX IF NOT EXISTS listas_tipo_idx ON listas(tipo);
CREATE INDEX IF NOT EXISTS listas_holder_idx ON listas(holder_id);

CREATE TABLE IF NOT EXISTS convidados (
  id            BIGSERIAL PRIMARY KEY,
  lista_id      BIGINT NOT NULL REFERENCES listas(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  instagram     TEXT,
  telefone      TEXT,
  quem_convida  TEXT,
  chegou        BOOLEAN DEFAULT FALSE,
  added_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS convidados_lista_idx ON convidados(lista_id);
CREATE INDEX IF NOT EXISTS convidados_nome_idx ON convidados(LOWER(TRIM(nome)));
