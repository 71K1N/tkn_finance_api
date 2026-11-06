# Changelog

Todas as mudanças relevantes deste projeto. Gerado por `npm run release` — não edite as seções de versões já publicadas.

## [0.1.0](https://github.com/71K1N/tkn_finance_api/compare/v0.0.2...v0.1.0) (2026-11-06)


### Funcionalidades

* add global HTTP exception filter and audit fields; tests updated ([80f0a80](https://github.com/71K1N/tkn_finance_api/commit/80f0a8090bdd144bcafbf03404cad7a13e602299))
* **audit:** add audit fields to Category and Subcategory and wire controllers ([c743bd4](https://github.com/71K1N/tkn_finance_api/commit/c743bd4a3a587573b8ad8b13af893cb970e3c40f))
* **audit:** add created_by/updated_by and wire from authenticated user ([1808556](https://github.com/71K1N/tkn_finance_api/commit/18085563aecf0f6b8c9290fabab2bc99cbfe8c20))
* **categoria:** ajusta categoria ([57a20b3](https://github.com/71K1N/tkn_finance_api/commit/57a20b3717637e529ac0040f48c24fb645df4216))
* **date:** implement month and day range utilities with timezone support ([4325013](https://github.com/71K1N/tkn_finance_api/commit/4325013a9f4c066f46b41104c00feaebe7ddf7a3))
* **dto:** expose audit fields in response DTOs for all entities ([878d6fe](https://github.com/71K1N/tkn_finance_api/commit/878d6fe3add67d22ec5c2009ce71cd1cf9c93e42))
* **expense-group:** implement expense management features including settlements, splits, and group expenses ([351618a](https://github.com/71K1N/tkn_finance_api/commit/351618a37793e32bdf700352c3ffc40a261c8278))
* implement pagination and seeding functionality for categories and subcategories ([2bd6102](https://github.com/71K1N/tkn_finance_api/commit/2bd610274f4c730b4c7a38a15821dd3d908e3829))
* **insights:** add InsightSnapshot entity, service, and controller for user insights management ([c11002f](https://github.com/71K1N/tkn_finance_api/commit/c11002f515374b078f18cfd291854b3ae6950918))
* **p2-p3-p4-p5:** Implement Phase 4 webhook event emission and Phase 5 comprehensive test suites ([8a77f27](https://github.com/71K1N/tkn_finance_api/commit/8a77f2791c82d9d6aea2bab0b4407d5d32fabbbc))
* **p2-phase1:** Create Budget, BudgetAlert, WishItem, SavingsGoal entities ([abf4f93](https://github.com/71K1N/tkn_finance_api/commit/abf4f939d292239815d3220e89debd4f6e1193a5))
* **p2-phase2-complete:** Implement comprehensive integration tests for budget workflow ([03bbd5c](https://github.com/71K1N/tkn_finance_api/commit/03bbd5c6e68827b3cdedff328e041e122749d48b))
* **p2-phase2-task1:** Implement Budget service with CRUD and threshold calculations ([86a4e72](https://github.com/71K1N/tkn_finance_api/commit/86a4e72c87dbfccfeb6b9ef5c7479ada57683ef5))
* **p2-phase2-task2:** Implement Budget controller with REST endpoints and common infrastructure ([d87b887](https://github.com/71K1N/tkn_finance_api/commit/d87b887f12098dd0fcba94e8d0ca3b61eb5268c3))
* **p2-phase2-task3:** Wire transaction service to budget alert threshold checks ([fa84f7a](https://github.com/71K1N/tkn_finance_api/commit/fa84f7ac6a26cb3269e9fc57c54435adfe55be65))
* refactor services and DTOs to use MongoDB ObjectId ([4347652](https://github.com/71K1N/tkn_finance_api/commit/434765246a10dbe7febc87d8b72fad8b78ac6e2c))
* **release:** add versioning, GET /version and release flow ([a28e4c6](https://github.com/71K1N/tkn_finance_api/commit/a28e4c6d77baedfd6ca9711e551caaad5d38c5ce))
* **transaction:** add GET /transaction/due for overdue and upcoming (TKN-59) ([c6886e8](https://github.com/71K1N/tkn_finance_api/commit/c6886e873ded3e143fdb931b7154f7cbde34664e))
* **transaction:** add transaction parsing service and related functionality ([d96fc4f](https://github.com/71K1N/tkn_finance_api/commit/d96fc4f2f9f0a6fc4b2886093eea296218d16206))
* **transaction:** enhance payment handling with conflict and not found exceptions ([53e7a40](https://github.com/71K1N/tkn_finance_api/commit/53e7a405dc467259d68bd740b782a87066be8f20))
* **transaction:** enhance transaction retrieval with date range and category filtering ([d96ae2d](https://github.com/71K1N/tkn_finance_api/commit/d96ae2d27d96e98bc1e9989f9cad25d83b4524ee))
* **transaction:** implement transaction intent tracking with planned vs unplanned classification ([1860bf4](https://github.com/71K1N/tkn_finance_api/commit/1860bf4e7d54510a884752386572e8774efd4504))
* **transaction:** split /transaction/due totals into income and expense (TKN-60) ([0ada816](https://github.com/71K1N/tkn_finance_api/commit/0ada8168c86b800952aa2fbd13bb3217f5aa5132))


### Correções

* adiciona transfomacao para subcategoria ([323f24c](https://github.com/71K1N/tkn_finance_api/commit/323f24c58ada77473067c0de2b10a4f51e18a679))
* corrigir queries MongoDB usando _id em vez de id nos services ([c849ecd](https://github.com/71K1N/tkn_finance_api/commit/c849ecd9dfe9ee2cdba5fd1d25135bd5f0504039))
* **insights:** use an available Groq model and make it configurable ([355c2ac](https://github.com/71K1N/tkn_finance_api/commit/355c2ac83dcc28a879707596385e08a16d98f51b))
* **transaction:** resolve TypeScript build errors in intent tracking ([f26e7a0](https://github.com/71K1N/tkn_finance_api/commit/f26e7a0acb7682fd5f47bba635123e304420560b))
