# P2 Budgeting & Wish List - Task Breakdown

## Phase 1: Data Layer & Core Entities

### Task 1.1: Create Budget Entity & Migration
- **File**: `src/budget/entities/budget.entity.ts`
- **Scope**: PrimaryGeneratedColumn id, userId, categoryId, month (string YYYY-MM), amount, spent (computed), alert rules, rolloverPolicy
- **Audit**: created_at, updated_at, created_by, updated_by
- **Tests**: Entity instantiation, TypeORM sync
- **Est. Time**: 1 hour

### Task 1.2: Create BudgetAlert Entity
- **File**: `src/budget/entities/budget-alert.entity.ts`
- **Scope**: id, budgetId (FK), threshold (%), triggeredAt, alertLevel enum (warning, exceeded, overage), acknowledged
- **Tests**: Entity relations, constraints
- **Est. Time**: 30 min

### Task 1.3: Create WishItem Entity
- **File**: `src/wish-item/entities/wish-item.entity.ts`
- **Scope**: id, userId, name, estimatedCost, targetDate, status enum, priority, linkedGoalId (nullable), createdAt, updatedAt, created_by, updated_by
- **Tests**: Entity validation, date constraints
- **Est. Time**: 45 min

### Task 1.4: Create SavingsGoal Entity
- **File**: `src/savings-goal/entities/savings-goal.entity.ts`
- **Scope**: id, userId, targetAmount, currentSaved, monthlyAllocation, projectedCompletionDate (computed), createdAt, updatedAt, created_by, updated_by
- **Tests**: Calculation logic for completion date
- **Est. Time**: 45 min

### Task 1.5: Register Entities in AppModule
- **File**: `src/app.module.ts`
- **Scope**: Import and add Budget, BudgetAlert, WishItem, SavingsGoal to TypeOrmModule.forFeature() and imports
- **Tests**: AppModule compiles without error
- **Est. Time**: 20 min

---

## Phase 2: Budget Management API & Logic

### Task 2.1: Create Budget Service
- **File**: `src/budget/budget.service.ts`
- **Methods**: 
  - `create(userId, categoryId, month, amount, rolloverPolicy)` → Budget
  - `findByMonth(userId, month)` → Budget[]
  - `calculateSpent(budgetId)` → number (sum of expenses for category in month)
  - `updateSpent(budgetId)` → void (recompute after transaction)
  - `checkThresholds(budgetId)` → BudgetAlert[] (fired alerts)
- **Tests**: Spending calculation, threshold detection
- **Est. Time**: 2 hours

### Task 2.2: Create Budget Controller & Endpoints
- **File**: `src/budget/budget.controller.ts`
- **Endpoints**:
  - `POST /budget`: Create monthly budget
  - `GET /budget?month=YYYY-MM`: List budgets for month
  - `GET /budget/:id`: Single budget + spent + alerts
  - `PATCH /budget/:id`: Update amount or rollover
  - `DELETE /budget/:id`: Soft delete (or hard)
- **Guards**: AuthGuard, user isolation
- **Tests**: E2E for all endpoints
- **Est. Time**: 1.5 hours

### Task 2.3: Hook Transaction Service to Budget Alerts
- **File**: `src/transaction/transaction.service.ts` (update `create` method)
- **Logic**: After transaction saved, find affected budgets and call `budgetService.checkThresholds()`
- **Emit**: Alert events to webhook subscribers
- **Tests**: E2E transaction → budget alert flow
- **Est. Time**: 1 hour

### Task 2.4: Create Budget Reporting Endpoint
- **File**: `src/budget/budget.controller.ts` (add new endpoint)
- **Endpoint**: `GET /budget/report?month=YYYY-MM&range=YYYY-MM:YYYY-MM`
- **Response**: `{ budgets: [...], spent, remaining, alerts, trend (last 6 months) }`
- **Tests**: Report accuracy, trend calculation
- **Est. Time**: 1.5 hours

---

## Phase 3: Wish List & Savings Goals

### Task 3.1: Create WishItem Service
- **File**: `src/wish-item/wish-item.service.ts`
- **Methods**:
  - `create(userId, name, estimatedCost, targetDate, priority)`
  - `update(id, { name, estimatedCost, targetDate, status, linkedGoalId })`
  - `linkToGoal(wishItemId, goalId)` → WishItem
  - `getProgress(wishItemId)` → { funded: %, remaining: $, projectedCompletion: date }
  - `updateStatus(id, newStatus)` → WishItem
- **Tests**: Progress calculation, status transitions
- **Est. Time**: 1.5 hours

### Task 3.2: Create SavingsGoal Service
- **File**: `src/savings-goal/savings-goal.service.ts`
- **Methods**:
  - `create(userId, targetAmount, monthlyAllocation)`
  - `deposit(goalId, amount)` → SavingsGoal (updates currentSaved)
  - `calculateProjectedCompletion(goalId)` → date
  - `getWishItems(goalId)` → WishItem[]
- **Tests**: Completion date accuracy, deposit flow
- **Est. Time**: 1.5 hours

### Task 3.3: Create WishItem Controller & Endpoints
- **File**: `src/wish-item/wish-item.controller.ts`
- **Endpoints**:
  - `POST /wish-item`: Create
  - `GET /wish-item`: List all for user
  - `GET /wish-item/:id`: Single wish item + progress
  - `PATCH /wish-item/:id`: Update details or status
  - `DELETE /wish-item/:id`: Delete
- **Guards**: AuthGuard
- **Tests**: E2E CRUD, progress endpoint
- **Est. Time**: 1 hour

### Task 3.4: Create SavingsGoal Controller & Endpoints
- **File**: `src/savings-goal/savings-goal.controller.ts`
- **Endpoints**:
  - `POST /savings-goal`: Create
  - `GET /savings-goal`: List all for user
  - `GET /savings-goal/:id`: Single goal + wish items
  - `PATCH /savings-goal/:id`: Update allocation
  - `POST /savings-goal/:id/deposit`: Add funds (amount)
- **Guards**: AuthGuard
- **Tests**: E2E CRUD, deposit flow
- **Est. Time**: 1 hour

---

## Phase 4: Webhooks & Notifications

### Task 4.1: Emit Budget Alert Events to Webhooks
- **File**: `src/budget/budget.service.ts` (update `checkThresholds`)
- **Logic**: Query WebhookSubscription for `budget.threshold_exceeded` events and POST to endpoint
- **Payload**: `{ event_type: "budget.threshold_exceeded", budgetId, threshold, current_spent }`
- **Tests**: Webhook delivery, error handling
- **Est. Time**: 1 hour

### Task 4.2: Emit Wish Item Status Change Events
- **File**: `src/wish-item/wish-item.service.ts` (update `updateStatus`)
- **Logic**: Query WebhookSubscription for `wish_item.status_changed` and POST to endpoint
- **Payload**: `{ event_type: "wish_item.status_changed", wishItemId, oldStatus, newStatus }`
- **Tests**: Event emission, payload accuracy
- **Est. Time**: 45 min

---

## Phase 5: Testing & Validation

### Task 5.1: E2E Tests for Budget Workflow
- **File**: `test/budget.e2e-spec.ts`
- **Scenarios**:
  - Create budget, add transactions, verify threshold alert fires at 90%
  - Create multiple budgets for different categories in same month
  - Month rollover: verify old budget closed, new budgets created with rollover
- **Est. Time**: 2 hours

### Task 5.2: E2E Tests for Wish List Workflow
- **File**: `test/wish-list.e2e-spec.ts`
- **Scenarios**:
  - Create wish item, create savings goal, verify progress updates
  - Link wish to goal, verify projected completion date
  - Deposit to goal, verify progress percentage and remaining amount
  - Status transitions (active → completed, abandoned)
- **Est. Time**: 2 hours

### Task 5.3: Integration Tests for Alert Triggering
- **File**: `test/budget-alerts.integration-spec.ts`
- **Scenarios**: Transaction creates budget alert at threshold; alert payload correct
- **Est. Time**: 1 hour

### Task 5.4: Load Tests for Reporting
- **File**: `test/budget-reporting.load-spec.ts`
- **Scenarios**: Report endpoint response time <500ms with 100+ budgets
- **Est. Time**: 1.5 hours

---

## Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1: Data Layer | 5 tasks | 4 hours |
| 2: Budget API | 4 tasks | 5.5 hours |
| 3: Wish List | 4 tasks | 4.5 hours |
| 4: Webhooks | 2 tasks | 1.75 hours |
| 5: Testing | 4 tasks | 6.5 hours |
| **Total** | **19 tasks** | **~22 hours** |

**Priority Order**: Phase 1 → 2 & 3 (parallel) → 4 → 5

