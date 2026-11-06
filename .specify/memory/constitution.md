# TKN Finance API Constitution

<!-- 
Sync Impact Report (v1.0.0 - Initial Constitution Release)
====================================================
- Version: N/A → 1.0.0 (Initial comprehensive constitution)
- Principles defined: 6 core principles for financial API
  • Data Integrity First
  • Test-Driven Development (NON-NEGOTIABLE)
  • Transaction Safety & Validation
  • API Versioning & Stability
  • Observability & Audit Logging
  • Code Quality Through Review
- Additional sections: Financial Data Protection, Development Workflow
- No deferred TODOs; all template values derived from project context
-->

A governance framework for the TKN Finance Control API—a NestJS-based backend for financial transaction management, account reconciliation, and category-based expense tracking.

## Core Principles

### I. Data Integrity First

Every financial transaction and account balance MUST be treated as immutable once committed. Database operations MUST:
- Use transactions to ensure atomic operations (all-or-nothing)
- Validate input before any state mutation
- Prevent race conditions through proper locking or isolation
- Maintain referential integrity across accounts, categories, and transactions
- Provide audit trails for all balance-affecting operations

Rationale: Financial systems cannot tolerate silent data corruption or partially applied changes. Integrity failures directly harm users and erode trust.

---

### II. Test-Driven Development (NON-NEGOTIABLE)

All features MUST follow TDD: tests written and approved → tests verified to fail → implementation → tests pass → refactor.

Mandatory coverage:
- Unit tests for all business logic (services, validators)
- Integration tests for API endpoints (controllers with database)
- Edge cases: boundary conditions, error paths, invalid state transitions
- Minimum 80% code coverage; exceptions require written justification

Test organization:
- Unit: `*.spec.ts` co-located with source files
- E2E: `test/app.e2e-spec.ts` and feature-specific test suites

Rationale: Financial logic is high-risk. Test-first catches errors before production and documents intended behavior. Tests also provide regression protection for future refactors.

---

### III. Transaction Safety & Validation

Financial transactions MUST be validated at multiple layers before processing:

**Input validation**:
- Use `class-validator` decorators on DTOs
- Validate amounts (positive, non-zero where required)
- Validate date ranges and account references exist
- Reject invalid state transitions (e.g., cannot close/reopen an already closed period)

**Business logic validation**:
- Services MUST verify business rules (e.g., sufficient account balance for transfers)
- Subcategory MUST belong to the nominated Category
- Transactions MUST reference existing accounts
- Prevent negative balances unless explicitly allowed by business logic

**Error responses**:
- Return HTTP 400 (Bad Request) for validation failures with clear error messages
- Return HTTP 404 for missing entities (accounts, categories)
- Return HTTP 409 (Conflict) for constraint violations (insufficient funds)
- Never expose internal error details in API responses

Rationale: Garbage in = garbage out. Early validation prevents cascading failures and protects database integrity.

---

### IV. API Versioning & Stability

API contracts MUST be stable and versioned to support client integration without surprise breaking changes:

- Version endpoints explicitly: `/api/v1/...` (current), `/api/v2/...` if breaking changes needed
- Document all breaking changes in release notes with migration guidance
- Maintain backward compatibility for at least 2 minor versions before deprecation
- Never remove or rename fields without deprecation period (mark as deprecated, add new field alongside)
- Response schemas MUST be formally documented (e.g., in OpenAPI/Swagger format)

Rationale: Financial apps often integrate with third-party systems and accounting software. Stability reduces integration burden and prevents downstream errors.

---

### V. Observability & Audit Logging

All financial operations MUST be logged for compliance, debugging, and forensic analysis:

**Structured logging**:
- Log all create/update/delete operations on transactions, accounts, and transfers
- Include timestamp, user (when auth added), action, old/new state, IP address
- Use structured format: timestamp, level (INFO/WARN/ERROR), component, message, context (JSON)

**Audit trails**:
- Maintain immutable audit log of balance-affecting operations
- Log successful validations and any validation failures
- Log concurrent conflicts or locking issues
- Retention: Keep logs for minimum 1 year

**Error observability**:
- Log all exceptions with full stack traces (at ERROR level)
- Log unusual patterns: duplicate transactions, out-of-sequence dates, suspicious amounts
- Expose metrics: request count, error rate, operation latencies via logs or monitoring endpoints

Rationale: Financial regulators expect audit trails. Logs are invaluable for debugging production issues and investigating fraud.

---

### VI. Code Quality Through Review

Every code change affecting financial logic MUST pass peer review before merging:

**Mandatory review gates**:
- Minimum 1 peer review approval for all PRs
- Minimum 2 reviews required for: transaction logic, account/balance updates, validation changes, API schema changes
- Reviewer must verify: test coverage, validation completeness, audit logging, no hardcoded values
- Tests MUST pass and coverage MUST not decrease

**Code standards**:
- ESLint + Prettier formatting for consistency
- No `any` types in TypeScript; use explicit types
- Const-by-default; var forbidden
- No console.log outside of local development (use structured logging instead)
- Comments MUST explain "why," not "what" (code is self-documenting via naming)

Rationale: Financial systems are high-stakes. Peer review catches edge cases, ensures knowledge sharing, and prevents one-person blindspots.

---

## Financial Data Protection

All financial information MUST be treated as sensitive:

- **No PII in logs**: Never log full account numbers, passwords, or sensitive digits
- **Encryption in transit**: All API endpoints use HTTPS (enforce in production)
- **Database protection**: Use parameterized queries to prevent SQL injection (TypeORM handles this)
- **Input sanitization**: Reject or escape any user input that could be interpreted as code
- **Readonly endpoints**: GET endpoints MUST NOT modify any state

Rationale: Financial theft and fraud are serious crimes. Data protection is a legal and ethical requirement.

---

## Development Workflow

### Local Development

```bash
npm install                    # Install dependencies
npm run dev                    # Start watch mode (auto-reload)
npm run test                   # Run all tests
npm run test:cov               # Run tests with coverage report
npm run lint                   # Check and fix ESLint issues
npm run build                  # Compile to dist/
```

### Branching Strategy

- `main` branch: Production-ready code, must be stable
- Feature branches: `feat/###-description` (e.g., `feat/101-category-management`)
- Bug fixes: `fix/###-description` (e.g., `fix/205-balance-calculation`)
- Hotfixes: `hotfix/description` for urgent production fixes

### Pre-commit Checklist

Before pushing any branch:
1. All tests pass: `npm run test`
2. Coverage minimum met: `npm run test:cov` (≥80%)
3. Lint passes: `npm run lint`
4. Commit messages are clear: `type(scope): description` (e.g., `feat(transaction): add payment reversal`)
5. No console.log or debug code left in

---

## Governance

### Constitution Authority

This Constitution supersedes all other project guidance. It defines non-negotiable principles that all contributors MUST follow. Deviations from principles MUST be documented, justified, and approved by project maintainers.

### Amendment Process

- **Proposed changes** MUST be documented in a PR with rationale
- **Review period**: Minimum 48 hours for community feedback
- **Approval**: Requires consensus from project maintainers
- **Migration plan**: If amendment affects existing code, a migration plan MUST be provided
- **Version bump**: Constitution version increments per semantic versioning rules:
  - **MAJOR**: Principle removals or backward-incompatible requirement changes
  - **MINOR**: New principle/section additions or materially expanded guidance
  - **PATCH**: Clarifications, wording refinements, non-semantic updates

### Compliance Review

- All PRs MUST reference which principles they uphold (add to PR description)
- Code review MUST explicitly verify principle compliance before approval
- Quarterly reviews of principle adherence; surface any systemic violations to maintainers

### Runtime Development Guidance

For detailed implementation patterns, testing strategies, and common workflows, refer to:
- `.specify/templates/plan-template.md` — Feature planning checklist
- `.specify/templates/spec-template.md` — User story and requirements template
- `.specify/templates/tasks-template.md` — Task decomposition and execution

---

**Version**: 1.0.0 | **Ratified**: 2026-02-07 | **Last Amended**: 2026-02-07
