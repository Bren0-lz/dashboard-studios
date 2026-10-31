# Painel de vendas — Studios Aryana

Dashboard **100% comercial** separado do CRM: o que temos para vender (vagas e turmas), o que está
entrando (vendas, ticket, meta) e o que está em risco (atrasos, turmas vazias, leads parados, espera
sem atendimento). Cada tela responde a uma pergunta de venda e termina numa ação (inscrever, cobrar
no WhatsApp, oferecer vaga).

```
Navegador (React)  ──►  Servidor do dashboard (Fastify, BFF)  ──►  CRM /api/external/v1
   cookie httpOnly          guarda a chave crm_… e o token do usuário     chave + X-CRM-User-Token
                            cache de 45 s, limpo a cada gravação
```

## Estrutura

| Pasta | O quê |
|---|---|
| `packages/shared` | Tipos copiados da API externa do CRM (`crm-types.ts`), validação zod das respostas (`crm-schemas.ts`), regras de faturamento (`rules.ts`), faixas de atraso, mensagens de WhatsApp |
| `apps/bff` | Servidor: login, sessão, CSRF, cache, telas prontas (`services/screens.ts`), CSV, metas; em produção também serve o site |
| `apps/bff/src/mock-crm` | CRM simulado com dados de demonstração (já com a fase 0), para rodar sem o CRM e para os testes |
| `apps/web` | Site em React: Visão geral, Turmas, Calendário, Lista de espera, Inadimplência, Funil de leads, Vendas |

## Rodar localmente

```bash
npm install
cp .env.example .env
npm run dev:mock
```

Abre o CRM simulado (porta 4100), o servidor (4000) e o site em http://localhost:5180.
Entre com `admin@aryana.com` / `senha123` (tudo liberado) ou `vendas@aryana.com` / `senha123`
(sem inscrever nem financeiro, para ver as ações escondidas).

Contra um CRM de verdade: ajuste `CRM_API_URL` e `CRM_API_KEY` no `.env` e rode `npm run dev`.

## Verificação

```bash
npm run check
```

Roda `typecheck`, `lint`, os testes (regras, BFF contra o CRM simulado, telas com Testing Library
usando o BFF real em memória) e o build.

## Deploy na Hostinger (app Node.js)

1. `npm ci && npm run build`
2. Variáveis de ambiente: as do `.env.example`, com `COOKIE_SECURE=true`, um `SESSION_SECRET`
   longo e aleatório e a chave criada em **CRM → Configurações → Integrações** (escopos
   `sales:read` e `sales:write`).
3. Arquivo de entrada: `apps/bff/dist/server.js` (`npm start`). O mesmo processo serve a API
   (`/api`) e o site (`apps/web/dist`).
4. As metas ficam em `GOALS_FILE` (padrão `data/goals.json`); mantenha essa pasta fora do
   diretório que o deploy apaga.

## Dependências do CRM (fase 0 do planejamento)

O painel usa a API externa do [PR #180](https://github.com/Bren0-lz/crm-studios/pull/180) e
mais quatro mudanças ainda a fazer no CRM. O CRM simulado já implementa todas, no formato descrito
em `packages/shared/src/crm-types.ts` (campos marcados "fase 0"):

| Mudança no CRM | Sem ela |
|---|---|
| 3.4 `POST /external/v1/auth/login` + cabeçalho `X-CRM-User-Token` | **Obrigatória**: sem ela não há login ("o CRM ainda não aceita o login pelo painel") |
| 3.1 `businessLine` em serviços, turmas e vendas | Tudo aparece como Studio, com aviso na tela |
| 3.2 `GET /external/v1/overdue` e `overdue` nos inscritos | Inadimplência e selos de atraso somem, com aviso |
| 3.3 `POST /groups/:id/waitlist/:enrollmentId/promote` | O botão "Promover" responde que o CRM ainda não oferece; cancelar uma inscrição continua promovendo |
| `GET /external/v1/plan-templates` (não estava no planejamento) | "Vender plano" some; fica só "inscrever" |

Também não existe ainda na API externa: lista de filiais (o BFF já repassa `X-Branch-Id`),
profissional da venda em `SaleMovement` (o ranking por profissional fica vazio) e o calendário
de encontros (`/group-sessions`); o calendário usa os horários fixos das turmas.
