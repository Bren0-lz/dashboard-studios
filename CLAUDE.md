# Painel de vendas — Studios Aryana

## Regras de Git (obrigatórias)

- **Toda alteração no código vai por pull request para a `main`.** O dono do repositório revisa e
  faz o merge manualmente; o agente nunca faz o merge.
- Nunca faça `git push` direto na `main` (nem force-push em qualquer branch).
- Comece cada tarefa da `main` atual: `git fetch origin main` e crie o branch a partir de
  `origin/main`.
- Ao abrir o PR, escolha a base **`main`** explicitamente (não confie no branch padrão do GitHub).
  Título curto e descrição em pt-BR: o que mudou, por quê e a saída do `npm run check`.
- Antes de abrir o PR, `npm run check` precisa terminar com exit code 0.
- A `main` é o branch que a Hostinger implanta: o que entra nela vai para produção.
