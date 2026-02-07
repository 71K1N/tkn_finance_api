---
description: "Generated task list for Personal Finance API (feature 001)"
---

# Tasks: Personal Finance API (001)

**Input**: `specs/001-personal-finance-api/spec.md`

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create `.env.example` and runtime config loader in `src/config/` (file: specs/001-personal-finance-api/tasks.md)
- [ ] T002 Initialize database connection config (TypeORM) and a local SQLite dev config in `src/database/ormconfig.ts`
- [ ] T003 [P] Add JWT auth skeleton: `src/common/auth.guard.ts`, `src/common/jwt.strategy.ts`, `src/common/user.decorator.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T004 Setup base entities and migrations: create `FinancialAccount` and `Transaction` entities in `src/bank-account/entities/bank-account.entity.ts` and `src/transaction/entities/transaction.entity.ts`
- [ ] T005 [P] Implement shared error handling and validation pipeline: `src/common/filters/http-exception.filter.ts`, `src/common/interceptors/validation.interceptor.ts`
- [ ] T006 [P] Add structured logging and audit fields to transactional entities: update `src/transaction/entities/transaction.entity.ts` and `src/bank-account/entities/bank-account.entity.ts`
- [ ] T007 Setup CI test job skeleton: update `.github/workflows/ci.yml` (or create) to run `npm run test` and `npm run lint`

---

## Phase 3: User Story 1 - Core Financial Flow (Priority: P1) 🎯 MVP

**Goal**: Allow authenticated users to create accounts, post transactions (income/expense/transfer), and view balances.

**Independent Test**: Integration test exercise: create user → create account → post income, expense, transfer → assert balances and transactions.

### Tests

- [ ] T008 [P] [US1] Add integration test for core flow in `test/app.e2e-spec.ts`

### Implementation

- [ ] T009 [P] [US1] Create `FinancialAccount` entity in `src/bank-account/entities/bank-account.entity.ts`
- [ ] T010 [P] [US1] Create `Transaction` entity in `src/transaction/entities/transaction.entity.ts` (support splits and transfer linking)
- [ ] T011 [US1] Implement DTOs: `src/transaction/dto/create-transaction.dto.ts`, `src/transaction/dto/update-transaction.dto.ts`
- [ ] T012 [US1] Implement `BankAccountService` in `src/bank-account/bank-account.service.ts` (balance read/update helpers)
- [ ] T013 [US1] Implement `TransactionService` in `src/transaction/transaction.service.ts` with atomic balance updates (use TypeORM transactions)
- [ ] T014 [US1] Implement `TransactionController` endpoints in `src/transaction/transaction.controller.ts` (create, list, get)
- [ ] T015 [US1] Add validation and clear HTTP 400/404/409 responses in `src/transaction/transaction.service.ts` and `src/transaction/transaction.controller.ts`
- [ ] T016 [US1] Add audit logging for balance-affecting operations in `src/transaction/transaction.service.ts`

**Checkpoint**: After T016, the core flow should be end-to-end testable independently.

---

## Phase 4: User Story 2 - Budgeting & Alerts (Priority: P2)

**Goal**: Category budgets, threshold alerts, and budget vs actual reporting.

- [ ] T017 [P] [US2] Create `Budget` entity in `src/budget/entities/budget.entity.ts`
- [ ] T018 [US2] Implement `BudgetService` in `src/budget/budget.service.ts` and `BudgetController` in `src/budget/budget.controller.ts`
- [ ] T019 [US2] Implement alerting hookup: webhook emitter in `src/notifications/webhook.service.ts` and budget threshold checker in `src/budget/budget.service.ts`
- [ ] T020 [US2] Add unit/integration tests for budget thresholds in `test/budget.spec.ts`

---

## Phase 5: User Story 3 - Wish List & Savings (Priority: P2)

**Goal**: Manage wish items, link to savings goals, track progress.

- [ ] T021 [P] [US3] Create `WishItem` entity in `src/wishlist/entities/wish-item.entity.ts`
- [ ] T022 [US3] Implement `WishService` and `WishController` (`src/wishlist/wish.service.ts`, `src/wishlist/wish.controller.ts`)
- [ ] T023 [US3] Link wish items to `Goal` entity: `src/goals/entities/goal.entity.ts` and service tasks
- [ ] T024 [US3] Add tests for wish progress calculations in `test/wishlist.spec.ts`

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Add API versioning scaffolding and OpenAPI docs: `src/main.ts` and `src/docs/swagger.ts`
- [ ] T026 [P] Add rate-limiting middleware config: `src/common/limits/rate-limit.ts`
- [ ] T027 [ ] Security review: ensure JWT, password policy, and audit logging are enforced (files: `src/common/*`, `src/auth/*`)
- [ ] T028 [ ] Update docs: `specs/001-personal-finance-api/quickstart.md` and `README.md` additions

---

## Dependencies

- Story order (must complete before next unless parallelized): US1 → US2 & US3 (can run in parallel after foundational tasks)
- Blocking foundational tasks: T004, T005, T006 must be completed before US1 implementation begins

## Parallel Execution Examples

- Entities creation (T009, T010, T017, T021) are parallelizable across files — mark as `[P]` where appropriate.
- DTOs & controllers for unrelated features (budget vs wishlist) can be implemented in parallel after foundational tasks.

## Implementation Strategy

- MVP: Deliver only US1 (Core Financial Flow) first — focus efforts on T009–T016 and T008 tests.
- Iterative: Once US1 passes integration tests, deliver US2 and US3 in parallel, keeping service contracts stable.
- Testing: Follow TDD for service and business logic; integration tests for controllers and database interactions.

---

**Files created/edited**: specs/001-personal-finance-api/spec.md, specs/001-personal-finance-api/tasks.json, specs/001-personal-finance-api/tasks.md, src/* (as listed in tasks)

**MVP suggestion**: Implement and validate US1 only for first release.
