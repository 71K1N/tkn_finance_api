/**
 * Which transactions a summary request counts toward its totals.
 *
 * Not a persisted field — this is a query-time concept shared by the controller
 * (which validates the incoming value) and the service (which turns it into a
 * `$match` and picks the amount field to sum).
 */
export enum SummaryStatus {
  /** Due in the period OR paid in the period; valued at the planned `amount`. */
  ALL = 'all',
  /** Paid in the period, whenever it was due; valued at the settled amount. */
  PAID = 'paid',
  /** Due in the period and not yet paid; valued at the planned `amount`. */
  PENDING = 'pending',
}
