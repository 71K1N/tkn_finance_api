# Contribuindo

Resumo do fluxo de trabalho. O processo completo de release está em [docs/RELEASE.md](docs/RELEASE.md).

## Branches

| Branch | Origem | Destino | Uso |
|---|---|---|---|
| `main` | — | — | Produção. Cada merge aqui corresponde a uma tag `vX.Y.Z`. |
| `develop` | — | — | Integração (branch padrão). |
| `TKN-<n>` | `develop` | `develop` | Uma branch por task, com o código da task (ex.: `TKN-6`), qualquer que seja o tipo (feature, bug, chore). O tipo da mudança fica no commit, não no nome da branch. |
| `release/X.Y.Z` | `develop` | `main` + `develop` | Estabilização e geração da versão. |
| `hotfix/X.Y.Z` | `main` | `main` + `develop` | Correção urgente em produção. |

Todo merge em `develop`/`main` passa por Pull Request com o CI verde (lint, build e validação dos commits) e **aprovação de 71k1n**.

Não há ambiente de homologação: a validação acontece na `release/*` (local/CI) antes do merge em `main`.

## Commits (Conventional Commits)

```
<tipo>(<escopo opcional>): <descrição no imperativo>

[corpo opcional]

[BREAKING CHANGE: descrição]   # ou "!" após o tipo: feat(api)!: ...
```

| Tipo | Quando | Efeito na versão |
|---|---|---|
| `feat` | funcionalidade nova | minor (patch enquanto `0.x`, ver abaixo) |
| `fix` | correção de bug | patch |
| `perf` | melhoria de performance | patch |
| `refactor` | mudança interna sem alterar comportamento | patch |
| `docs`, `style`, `test`, `build`, `ci`, `chore` | sem impacto no usuário | nenhum (fora do changelog) |
| qualquer tipo com `!` ou `BREAKING CHANGE:` | quebra de compatibilidade | major (minor enquanto `0.x`) |

Enquanto a versão for `0.x`, a ferramenta de release calcula `feat` como *patch*; para uma release com funcionalidades, force o minor com `npm run release -- --release-as minor`.


O hook do `husky` valida a mensagem no `git commit`; o CI valida de novo no PR.
O escopo usa `kebab-case` e geralmente é a área (`transaction`, `budget`, `auth`, `insights`).
