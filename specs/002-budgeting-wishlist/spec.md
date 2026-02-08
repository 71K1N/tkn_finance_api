# Feature Specification: Budgeting & Wish List (P2)

**Feature Branch**: `002-budgeting-wishlist`  
**Created**: 2026-02-07  
**Status**: Draft  
**Extends**: Personal Finance API (P1 completed)

## User Scenarios & Testing

### User Story 2 - Budgeting & Alerts (Priority: P2)

User can create monthly category budgets, receive alerts when approaching or exceeding budgets, and view budget vs actual reports.

**Why this priority**: Important for user financial control and retention; useful after core flows are stable.

**Independent Test**: Create budget for category "Groceries" of 400 for current month, add transactions totaling 360, verify alert triggered at configured threshold (e.g., 90%).

**Acceptance Scenarios**:
1. **Given** an authenticated user with transactions in category X totaling 200, **When** the user creates a monthly budget of 400 for category X, **Then** the budget is created and starting balance is recorded.
2. **Given** a monthly budget of 400 for category X, **When** cumulative expenses reach 360 (90%), **Then** an alert event is generated and webhook with `event_type: "budget.threshold_exceeded"` is fired if subscribed.
3. **Given** a monthly budget of 400 for category X, **When** a transaction causes expenses to exceed 400, **Then** the budget shows overage and alert is marked as "exceeded".
4. **Given** month has ended, **When** querying budget analytics for previous month, **Then** budget status shows "closed" with final spent and remainder amounts; **And** rollover policy (if configured) applies remaining to next month.

---

### User Story 3 - Wish List & Savings (Priority: P2)

User can add wish items with target amount and target date, link to savings goals, and track progress.

**Why this priority**: Engages users with future planning and motivations; complements budgeting.

**Independent Test**: Create a wish item for 1000 with target date 6 months out, allocate monthly contribution 100, verify projected completion and percentage funded.

**Acceptance Scenarios**:
1. **Given** a user with no wish items, **When** the user creates a wish item with name "Vacation", cost 1000, target date 2026-08-07, **Then** wish item exists with status "active" and 0% funded.
2. **Given** a wish item with cost 1000 and no savings goal, **When** the user links it to a new savings goal with monthly allocation 100, **Then** linked goal exists and projected completion is calculated (~10 months).
3. **Given** a wish item linked to a savings goal with 300 saved, **When** querying the wish item, **Then** progress shows 30% funded, amount remaining 700, and months to completion is ~7.
4. **Given** a wish item with target date in the past and status "active", **When** the user marks it "completed" or "abandoned", **Then** wish item status updates and linked savings goal is deactivated (or transferred if user chooses).

---

## Requirements

### Functional Requirements

- **FR-101**: Users MUST be able to create monthly budgets per category with amount and optional rollover policy.
- **FR-102**: System MUST calculate cumulative expenses per budget for the budget month and compare against threshold; alerts fire at configurable thresholds (default 90%, 100%, >100%).
- **FR-103**: System MUST expose budget reporting endpoints: monthly budget vs actual, alert history, and multi-month trend.
- **FR-104**: Users MUST be able to create, update, and delete wish items with name, target cost, target date, and priority.
- **FR-105**: Wish items MUST support linkage to savings goals; progress calculated as (savings_goal.current_saved / wish_item.cost).
- **FR-106**: Users MUST be able to create savings goals with target amount, monthly allocation, and current saved amount.
- **FR-107**: System MUST calculate and expose: projected completion date, months remaining, and percentage funded for wish items.
- **FR-108**: Wish items MUST support lifecycle: active, completed, abandoned, on-hold.
- **FR-109**: System MUST emit webhooks for budget threshold events and wish item status changes.

### Key Entities

- **Budget**: id, userId, categoryId, month (YYYY-MM), amount, spent, alerts[], rolloverPolicy, createdAt, updatedAt
- **BudgetAlert**: id, budgetId, threshold (%), triggeredAt, alertLevel (warning / exceeded / overage), acknowledged
- **WishItem**: id, userId, name, estimatedCost, targetDate, status (active/completed/abandoned/on-hold), priority, linkedGoalId, createdAt, updatedAt
- **SavingsGoal**: id, userId, targetAmount, currentSaved, monthlyAllocation, completionDate (projected), createdAt, updatedAt
- **WishItemHistory**: id, wishItemId, statusChange, amount (if partial), timestamp

### Success Criteria

- **SC-101**: Budget alerts trigger within 60 seconds of transaction that causes threshold breach in 95% of cases.
- **SC-102**: Budget vs actual report returns within 500ms for user with 100+ budgets.
- **SC-103**: Wish item progress updates immediately on savings goal deposit.
- **SC-104**: Users can create budget and wish item in under 30 seconds each with intuitive API/UI.

---

## Implementation Plan (Tasks)

### Phase 1: Data Layer & Core Entities
- [x] Create Budget, BudgetAlert, WishItem, SavingsGoal entities
- [ ] Add migration scripts for schema
- [ ] Add repository/service layer for budgets and wish items

### Phase 2: Budget Management
- [ ] Create budget CRUD endpoints (POST, GET, PATCH, DELETE)
- [ ] Implement budget calculation logic (spent per month)
- [ ] Add budget alert firing on transaction creation/update
- [ ] Create budget reporting endpoint (vs actual, trends)

### Phase 3: Wish List & Savings
- [ ] Create wish item CRUD endpoints
- [ ] Create savings goal CRUD endpoints
- [ ] Implement wish item progress calculation
- [ ] Add wish item lifecycle management

### Phase 4: Webhooks & Notifications
- [ ] Wire budget alert events to webhook subscriptions
- [ ] Wire wish item status change events to webhooks
- [ ] Add webhook delivery and retry logic

### Phase 5: Testing
- [ ] E2E tests for budget workflows
- [ ] E2E tests for wish list workflows
- [ ] Integration tests for alert triggering
- [ ] Load tests for reporting endpoints

---

## Assumptions & Clarifications

- Budgets are monthly and cycle resets on the 1st of each month.
- If a budget's rollover policy is "carry_balance", any unspent amount carries to next month.
- Wish items are user-scoped; no sharing in MVP.
- Savings goals are independent of accounts; manual updates are used (or automated deposits can be added later).
- Budget alerts are advisory and do not block transactions.

