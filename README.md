# Painel de vendas — Studios Aryana

Dashboard comercial do **Studios Aryana** (fisioterapia, Pilates, dançaterapia e estética),
separado do [CRM principal](https://github.com/Bren0-lz/crm-studios) e ligado a ele pela API
externa. Cada tela responde a uma pergunta de venda e termina numa ação:

- **O que temos para vender?** Vagas livres por turma, mapa de ocupação por dia e horário.
- **O que está entrando?** Vendas do mês, ticket médio, comparação com o mês anterior e meta.
- **O que está em risco?** Clientes em atraso por faixa, turmas vazias, leads parados e lista de
  espera sem atendimento.
- **O que fazer agora?** Inscrever na turma, vender plano, cobrar ou oferecer vaga pelo WhatsApp
  com mensagem pronta, promover da lista de espera.

**Autor:** Breno Luiz · **Início:** outubro de 2026 · **Implantação:** Hostinger (Node.js), com a
`main` indo para produção.

---

## Como o projeto comprova a experiência técnica

| Área                                  | Onde ver no projeto                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub**                            | Toda mudança entra por pull request revisado manualmente antes do merge; branch por tarefa; regras do fluxo em [CLAUDE.md](CLAUDE.md).                                                                |
| **TypeScript**                        | 100% TypeScript em modo `strict`, com tipos compartilhados entre servidor e site em [`packages/shared`](packages/shared/src).                                                                          |
| **React**                             | React 19 + react-router, páginas em [`apps/web/src/pages`](apps/web/src/pages), hooks próprios para dados remotos e ações ([`useRemote`](apps/web/src/lib/useRemote.ts), [`useAction`](apps/web/src/lib/useAction.ts)). |
| **Back-end / integração de sistemas** | Servidor Fastify no padrão **BFF** (_backend for frontend_) que consome a API do CRM, monta cada tela pronta e esconde as credenciais do navegador.                                                    |
| **Dados e validação**                 | Respostas do CRM validadas com Zod ([`crm-schemas.ts`](packages/shared/src/crm-schemas.ts)); regras de negócio puras e testadas ([`rules.ts`](packages/shared/src/rules.ts)); exportação CSV.          |
| **Segurança**                         | Sessão em cookie `httpOnly`/`SameSite`, proteção **CSRF** com comparação em tempo constante, chave da API só no servidor e ações filtradas pelas permissões do usuário no CRM.                        |
| **Testes automatizados**              | 96 testes com Vitest: regras de negócio, BFF contra um CRM simulado e telas com Testing Library usando o BFF real em memória.                                                                          |
| **Visualização de dados e design**    | Gráficos com Recharts, mapa de calor de ocupação, cores com significado fixo (ocupado, parcial, vazio, faixas de atraso) e os mesmos tokens visuais do CRM.                                            |

---

## Arquitetura

```text
Navegador (React)  ──►  Servidor do dashboard (Fastify, BFF)  ──►  CRM /api/external/v1
   cookie httpOnly          guarda a chave crm_… e o token do usuário     chave + X-CRM-User-Token
                            cache de 45 s, limpo a cada gravação
```

Decisões que vale destacar:

- **BFF em vez de chamar o CRM direto do navegador**: a chave de integração nunca chega ao
  cliente; o servidor agrega várias chamadas do CRM em uma resposta por tela
  ([`services/screens.ts`](apps/bff/src/services/screens.ts)), o que deixa o site simples e rápido.
- **Cache curto com invalidação na escrita** ([`cache.ts`](apps/bff/src/cache.ts)): leituras ficam
  em cache por segundos, e qualquer gravação (inscrição, cancelamento, venda) limpa tudo, para a
  tela nunca mostrar dado velho depois de uma ação.
- **Contrato validado na fronteira**: os tipos da API do CRM são espelhados em
  [`crm-types.ts`](packages/shared/src/crm-types.ts) e validados com Zod na chegada. Se o CRM
  mudar o formato, o erro aparece no servidor, não como tela quebrada.
- **Degradação elegante**: quando o CRM ainda não oferece um recurso (linha de negócio, filiais,
  promoção da espera), o painel esconde a ação ou mostra um aviso, sem quebrar.
- **CRM simulado** ([`apps/bff/src/mock-crm`](apps/bff/src/mock-crm)): servidor com dados de
  demonstração que implementa a API completa. Permite rodar o painel sem o CRM e é a base dos testes.
- **Um processo em produção**: o mesmo servidor Node atende a API (`/api`) e o site compilado.

| Pasta                   | O quê                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/shared`       | Tipos e validação da API do CRM, regras de faturamento e ocupação, faixas de atraso, mensagens de WhatsApp |
| `apps/bff`              | Servidor: login, sessão, CSRF, cache, telas prontas, CSV, metas; em produção também serve o site          |
| `apps/bff/src/mock-crm` | CRM simulado com dados de demonstração, para desenvolvimento e testes                                     |
| `apps/web`              | Site em React: Visão geral, Turmas, Calendário, Lista de espera e Inadimplência                           |

---

## Testes

```bash
npm run check
```

Roda `typecheck`, `lint` (ESLint sem avisos), os testes e o build. Camadas de teste:

| Camada            | Ferramenta                      | O que cobre                                                              |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------ |
| Regras de negócio | Vitest                          | ocupação, ticket, receita parada, metas, oportunidades, faixas de atraso |
| Servidor (BFF)    | Vitest + `app.inject` (Fastify) | login, cookie, CSRF, permissões e telas contra o CRM simulado            |
| Interface         | Testing Library + jsdom         | telas e ações de ponta a ponta, usando o BFF real em memória             |

---

## Rodar localmente

Requisitos: Node.js 22 ou mais recente.

```bash
npm install
cp .env.example .env
npm run dev:mock
```

Abre o CRM simulado (porta 4100), o servidor (4000) e o site em http://localhost:5180.
Entre com `admin@aryana.com` / `senha123` (tudo liberado) ou `vendas@aryana.com` / `senha123`
(sem inscrever, financeiro nem contato dos alunos, para ver as ações e dados escondidos).

Contra um CRM de verdade: ajuste `CRM_API_URL` e `CRM_API_KEY` no `.env` e rode `npm run dev`.

## Deploy na Hostinger (app Node.js)

1. `npm ci && npm run build`
2. Variáveis de ambiente: as do `.env.example`, com `COOKIE_SECURE=true`, um `SESSION_SECRET`
   longo e aleatório e a chave criada em **CRM → Configurações → Integrações** (escopos
   `sales:read` e `sales:write`).
3. Arquivo de entrada: `apps/bff/dist/server.js` (`npm start`). O mesmo processo serve a API
   (`/api`) e o site (`apps/web/dist`).
4. As metas ficam em `GOALS_FILE` (padrão `data/goals.json`); mantenha essa pasta fora do
   diretório que o deploy apaga.

---

## Integração com o CRM

O painel usa a API externa do CRM ([PR #180](https://github.com/Bren0-lz/crm-studios/pull/180)).
Em 03/11/2026 o CRM já oferece o login pelo painel (`POST /external/v1/auth/login` com o
cabeçalho `X-CRM-User-Token`) e a inadimplência (`GET /external/v1/overdue`). O CRM simulado já
implementa também os recursos abaixo, no formato de
[`crm-types.ts`](packages/shared/src/crm-types.ts) (campos marcados "fase 0"); enquanto o CRM
real não os oferece, o painel se adapta:

| Recurso no CRM                                    | Enquanto não existir                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `businessLine` em serviços, turmas e vendas       | Tudo aparece como Studio, com aviso na tela                                                      |
| `services`/`productLines` em vendas e atrasos (PX5) | A linha volta a sair da venda ou da turma do cliente; com serviços escolhidos, as vendas zeram (com aviso) |
| `POST /groups/:id/waitlist/:enrollmentId/promote` | O botão "Promover" avisa que o CRM ainda não oferece; cancelar uma inscrição continua promovendo |
| `GET /external/v1/plan-templates`                 | "Vender plano" some; fica só "inscrever"                                                         |
| `GET /external/v1/branches`                       | O seletor de filial some e o painel mostra a rede toda                                           |
| Profissional da venda em `SaleMovement`           | O ranking por profissional fica vazio                                                            |
| Calendário de encontros (`/group-sessions`)       | O calendário usa os horários fixos das turmas                                                    |

Filtro do topo: linha (Tudo, Studio, Estética, Outros = sem classificação no CRM) e serviços do
CRM (vários ao mesmo tempo, agrupados por linha; o inativo que ainda tem turma aparece marcado),
em `?linha=` e `?servicos=` na URL, valendo em todas as telas. Plano com serviços de duas linhas
aparece nas duas com o valor inteiro, e o total de uma seleção conta cada venda uma vez; produto
entra pela linha do próprio produto; atraso sem vínculo (parcela lançada à mão) só aparece em "Tudo"
(`UNLINKED_LINE` em [`business-line.ts`](packages/shared/src/business-line.ts)).

Filiais: com mais de uma filial, o seletor no topo (`?filial=` na URL) manda `X-Branch-Id` em
todas as chamadas, e o servidor também filtra turmas e lista de espera pelo `branchId`.
