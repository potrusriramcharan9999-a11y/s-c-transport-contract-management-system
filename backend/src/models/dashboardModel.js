const { query } = require("../config/db");

async function summary() {
  const result = await query(
    `SELECT
      (SELECT COUNT(*)::int FROM contracts WHERE status = 'ACTIVE') AS active_contracts,
      (SELECT COUNT(*)::int FROM contracts WHERE status = 'PENDING_RENEWAL' OR renewal_date <= CURRENT_DATE + INTERVAL '30 days') AS pending_renewals,
      (SELECT COUNT(*)::int FROM payments WHERE payment_status = 'OVERDUE') AS overdue_payments,
      (SELECT COUNT(*)::int FROM alerts WHERE is_sent = FALSE AND alert_date >= CURRENT_DATE) AS upcoming_alerts,
      COALESCE(
        NULLIF((SELECT SUM(amount) FROM payments WHERE payment_status = 'PAID'), 0),
        NULLIF((SELECT SUM(amount) FROM payments), 0),
        (SELECT SUM(contract_value) FROM contracts),
        0
      )::numeric AS total_revenue`
  );

  return result.rows[0];
}

async function revenueChart() {
  const result = await query(
    `WITH months AS (
       SELECT generate_series(
         DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
         DATE_TRUNC('month', CURRENT_DATE),
         INTERVAL '1 month'
       ) AS month_start
     ),
     payment_months AS (
       SELECT
         DATE_TRUNC('month', COALESCE(payment_date, due_date, billing_period_end, created_at::date)) AS month_start,
         SUM(amount)::numeric AS revenue
       FROM payments
       WHERE COALESCE(payment_date, due_date, billing_period_end, created_at::date)
         >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
       GROUP BY 1
     ),
     contract_months AS (
       SELECT
         DATE_TRUNC('month', COALESCE(start_date, created_at::date)) AS month_start,
         SUM(contract_value)::numeric AS contract_value
       FROM contracts
       WHERE COALESCE(start_date, created_at::date)
         >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
       GROUP BY 1
     ),
     totals AS (
       SELECT COALESCE((SELECT SUM(revenue) FROM payment_months), 0)::numeric AS payment_total
     )
     SELECT
       TO_CHAR(months.month_start, 'Mon') AS month,
       months.month_start,
       CASE
         WHEN totals.payment_total > 0 THEN COALESCE(payment_months.revenue, 0)
         ELSE COALESCE(contract_months.contract_value, 0)
       END::numeric AS revenue
     FROM months
     CROSS JOIN totals
     LEFT JOIN payment_months ON payment_months.month_start = months.month_start
     LEFT JOIN contract_months ON contract_months.month_start = months.month_start
     ORDER BY months.month_start ASC`
  );

  return result.rows.map(({ month, revenue }) => ({ month, revenue: Number(revenue) }));
}

module.exports = {
  summary,
  revenueChart
};
