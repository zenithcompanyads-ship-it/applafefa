-- Migration 001 — novas colunas em listas
-- Cole isso no Supabase → SQL Editor → Run

ALTER TABLE listas ADD COLUMN IF NOT EXISTS capacidade INTEGER DEFAULT 25;
ALTER TABLE listas ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aberta' CHECK (status IN ('aberta', 'encerrada', 'lotada'));
ALTER TABLE listas ADD COLUMN IF NOT EXISTS hora_limite TEXT DEFAULT '22:00';
ALTER TABLE listas ADD COLUMN IF NOT EXISTS token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS listas_token_idx ON listas(token) WHERE token IS NOT NULL;

-- CPF nos convidados
ALTER TABLE convidados ADD COLUMN IF NOT EXISTS cpf TEXT DEFAULT '';
