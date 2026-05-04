# Deploy — LA FEFA (GitHub + Supabase + Vercel)

Stack:
- **GitHub** → código
- **Supabase** → banco Postgres (persistente)
- **Vercel** → hospedagem (serverless)

---

## 1) Supabase — criar banco

1. Acesse https://supabase.com → **New project**
2. Escolha região (sugestão: **South America (São Paulo)**), defina senha do DB e crie.
3. Aguarde o projeto subir (~1 min).
4. No menu lateral → **SQL Editor** → **New query** → cole o conteúdo de `supabase/schema.sql` → **Run**.
5. Pegue a connection string:
   - **Settings → Database → Connection string → URI**
   - Em **Mode**, selecione **Transaction** (porta `6543` — connection pooler, ideal pra serverless)
   - Copie a string completa, ex.:
     ```
     postgresql://postgres.xxxxxx:SUASENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
     ```

> ⚠️ Use sempre a porta **6543 (Transaction Pooler)** no Vercel. A 5432 (direct) não escala em serverless.

---

## 2) Local — testar antes de subir

```bash
cd /Users/sanmartin/Lafefa
npm install
cp .env.example .env
# edite .env e cole o DATABASE_URL da Supabase
# gere um JWT_SECRET com:  openssl rand -hex 32
npm start
```

Abra http://localhost:3000 → login `lafefa` / `adminlafe`.

Se conectar e logar, o banco tá ok.

---

## 3) GitHub — subir código

```bash
cd /Users/sanmartin/Lafefa
git init
git add .
git commit -m "lafefa: migração pra supabase + vercel"
# crie um repo privado em github.com (ou via gh CLI):
gh repo create lafefa --private --source=. --push
```

Confirme que `.env` e `*.db` **NÃO** foram commitados (o `.gitignore` cuida disso).

---

## 4) Vercel — deploy

1. Acesse https://vercel.com → **Add New → Project**.
2. **Import** o repo `lafefa` do GitHub.
3. **Framework Preset**: Other (não é Next.js).
4. **Root Directory**: deixe na raiz.
5. **Build Command**: deixe vazio (não precisa build).
6. **Output Directory**: deixe vazio.
7. **Environment Variables** — adicione todas:
   | Nome | Valor |
   |------|-------|
   | `DATABASE_URL` | a URI da Supabase (porta 6543) |
   | `JWT_SECRET` | string aleatória (`openssl rand -hex 32`) |
   | `ADMIN_USER` | `lafefa` (ou o que quiser) |
   | `ADMIN_PASS` | senha forte |
   | `NODE_ENV` | `production` |
8. **Deploy**.

Após o deploy a Vercel te dá uma URL tipo `lafefa.vercel.app`.

---

## 5) Domínio próprio (opcional)

Vercel → projeto → **Settings → Domains → Add** → siga as instruções de DNS.

---

## 6) Atualizações futuras

```bash
git add .
git commit -m "mudança X"
git push
```

A Vercel deploya automaticamente. A Supabase mantém os dados (não é resetada por deploy).

---

## Troubleshooting

- **"unauthorized" em todas as rotas**: cookie não está sendo setado. Confirme `NODE_ENV=production` e que está acessando via HTTPS.
- **Erro de conexão Postgres**: confira que está usando a string do **Transaction Pooler (6543)**, não a direct (5432).
- **Tabelas não existem**: rode novamente o `supabase/schema.sql` no SQL Editor.
- **Migrar dados do SQLite antigo**: dump o `lafefa.db` com `sqlite3 lafefa.db .dump`, ajuste pro Postgres (tipos `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGSERIAL`, etc.) e rode no SQL Editor.

---

## Estrutura do projeto

```
.
├── api/
│   └── index.js          ← entrypoint Vercel (re-exporta server.js)
├── public/               ← front estático (HTML/CSS/JS)
├── supabase/
│   └── schema.sql        ← DDL pra rodar no Supabase
├── server.js             ← Express app (local + serverless)
├── vercel.json
├── package.json
├── .env.example
└── .gitignore
```
