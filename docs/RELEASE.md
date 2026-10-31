# Fluxo de release

Vale para o front da API (`tkn_finance_api`); o front (`tkn_finance_next`) segue o mesmo modelo com versionamento **independente**.

## Versionamento

[SemVer](https://semver.org/lang/pt-BR/) `MAJOR.MINOR.PATCH` com o hash do commit como *build metadata*:

```
0.2.0+e7cbedf
```

- A **versão** vem do `package.json` e da tag git `vX.Y.Z` (fonte de verdade).
- O **hash** vem da variável `GIT_SHA` (build Docker) ou do `git rev-parse` em runtime. A API expõe os dois em `GET /version` → `{ "version": "0.2.0", "commit": "e7cbedf" }`; o build do front mostra o dele na Sidebar.
- Enquanto a versão for `0.x`, o bump automático trata `feat` como patch e quebras de compatibilidade como minor; para uma release com funcionalidades use `--release-as minor`. O `1.0.0` marca a primeira versão estável.
- Front e back versionam de forma independente. Compatibilidade entre eles: ver tabela abaixo.

| API | Front compatível |
|---|---|
| 0.0.2+ | 0.1.x |

## Release normal

1. Na `develop`, com tudo que entra na versão já mergeado:
   ```bash
   git checkout develop && git pull
   git checkout -b release/0.2.0
   ```
2. Estabilização: só `fix` na `release/0.2.0` (PR para ela, se houver revisão).
3. Gere versão, changelog, commit e tag (o bump é calculado pelos commits; `--release-as` força um valor; simule antes com `npm run release -- --dry-run`):
   ```bash
   npm run release -- --release-as minor   # ou --release-as 0.2.0
   ```
   Isso atualiza `package.json`, `CHANGELOG.md`, cria o commit `chore(release): 0.2.0` e a tag `v0.2.0`.
4. Abra PR de `release/0.2.0` para `main` e faça o merge com **merge commit** (não squash, para preservar a história e a tag).
5. Publique a tag e traga a versão de volta para a `develop`:
   ```bash
   git push origin v0.2.0
   git checkout develop && git merge --no-ff main && git push
   ```
   O push da tag dispara `.github/workflows/release.yml`, que cria a GitHub Release.
6. Deploy: ver `scripts/deploy-rasp.sh` ou `../deploy` (docker compose). No Docker, passe o commit:
   ```bash
   docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) -t tkn-finance-api:0.2.0 .
   ```
7. Confira em produção: `curl <host>/api/version` deve devolver a versão e o commit publicados.

> Migrations (`npm run migrate:*`) rodam manualmente e fazem parte do checklist da release: liste-as no PR de `release/*` e execute-as antes (se compatíveis com a versão anterior) ou junto do deploy.

## Hotfix

```bash
git checkout main && git pull
git checkout -b hotfix/0.2.1
# correção com commit `fix: ...`
npm run release            # gera 0.2.1 + tag v0.2.1
```
PR para `main`, push da tag e merge de `main` na `develop` (mesmos passos 4 e 5).

## Rollback

- Pi/pm2: `scripts/deploy-rasp.sh --rollback`.
- Docker: subir a imagem da tag anterior (`tkn-finance-api:0.0.2`).
- Migrations já aplicadas não são desfeitas pelo rollback: avalie a reversão de dados caso a caso.

## Decisões adotadas

- **Nome de branch:** o código da task (`TKN-6`); `release/X.Y.Z` e `hotfix/X.Y.Z` para releases.
- **Aprovação:** 71k1n aprova PRs e releases.
- **Homologação:** não existe; a `release/*` é o ponto de estabilização antes de `main`.

## Em aberto

- Proteção de branch em `main`/`develop` (exigir PR + CI verde + aprovação).
- Frequência/janela de release.
- Registry de imagens Docker, se for adotado.
