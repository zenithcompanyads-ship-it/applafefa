-- Migration 002 — tabela mestre de pessoas
-- Cole isso no Supabase → SQL Editor → Run
-- (rode DEPOIS da migration-001.sql)

-- 1. Tabela mestre de pessoas
CREATE TABLE IF NOT EXISTS pessoas (
  id        BIGSERIAL PRIMARY KEY,
  nome      TEXT NOT NULL,
  instagram TEXT DEFAULT '',
  telefone  TEXT DEFAULT '',
  cpf       TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pessoas_nome_idx ON pessoas(LOWER(TRIM(nome)));
CREATE UNIQUE INDEX IF NOT EXISTS pessoas_cpf_idx ON pessoas(REGEXP_REPLACE(cpf, '[^0-9]', '', 'g'))
  WHERE REGEXP_REPLACE(cpf, '[^0-9]', '', 'g') <> '';

-- 2. FK em convidados
ALTER TABLE convidados ADD COLUMN IF NOT EXISTS pessoa_id BIGINT REFERENCES pessoas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS convidados_pessoa_id_idx ON convidados(pessoa_id) WHERE pessoa_id IS NOT NULL;

-- 3. Backfill: para cada convidado existente, cria/vincula uma pessoa
--    Agrupa por nome normalizado; o CPF, se houver, é considerado único.
INSERT INTO pessoas (nome, instagram, telefone, cpf)
SELECT DISTINCT ON (LOWER(TRIM(nome)))
  MIN(nome)       AS nome,
  MIN(instagram)  AS instagram,
  MIN(telefone)   AS telefone,
  COALESCE(MIN(NULLIF(cpf, '')), '') AS cpf
FROM convidados
WHERE pessoa_id IS NULL
GROUP BY LOWER(TRIM(nome))
ON CONFLICT DO NOTHING;

-- Vincula pelos que já foram inseridos (match por nome normalizado)
UPDATE convidados c
SET pessoa_id = p.id
FROM pessoas p
WHERE c.pessoa_id IS NULL
  AND LOWER(TRIM(c.nome)) = LOWER(TRIM(p.nome));
