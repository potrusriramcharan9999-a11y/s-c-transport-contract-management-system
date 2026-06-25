const { query } = require("../config/db");

async function revenueTrend(startDate, endDate) {
  const result = await query(
    `WITH bounds AS (
       SELECT
         COALESCE(
           DATE_TRUNC('month', $1::date),
           CASE
             WHEN $2::date IS NOT NULL THEN DATE_TRUNC('month', $2::date) - INTERVAL '5 months'
             ELSE DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
           END
         ) AS start_month,
         COALESCE(DATE_TRUNC('month', $2::date), DATE_TRUNC('month', CURRENT_DATE)) AS end_month
     ),
     months AS (
       SELECT generate_series(bounds.start_month, bounds.end_month, INTERVAL '1 month') AS month_start
       FROM bounds
     ),
     payment_months AS (
       SELECT
         DATE_TRUNC('month', COALESCE(payment_date, due_date, billing_period_end, created_at::date)) AS month_start,
         SUM(amount)::numeric AS revenue
       FROM payments, bounds
       WHERE COALESCE(payment_date, due_date, billing_period_end, created_at::date) >= bounds.start_month
         AND COALESCE(payment_date, due_date, billing_period_end, created_at::date) < bounds.end_month + INTERVAL '1 month'
       GROUP BY 1
     ),
     contract_months AS (
       SELECT
         DATE_TRUNC('month', COALESCE(start_date, created_at::date)) AS month_start,
         SUM(contract_value)::numeric AS contract_value
       FROM contracts, bounds
       WHERE COALESCE(start_date, created_at::date) >= bounds.start_month
         AND COALESCE(start_date, created_at::date) < bounds.end_month + INTERVAL '1 month'
       GROUP BY 1
     ),
     totals AS (
       SELECT COALESCE((SELECT SUM(revenue) FROM payment_months), 0)::numeric AS payment_total
     )
     SELECT
       TO_CHAR(months.month_start, 'YYYY-MM') AS month,
       months.month_start,
       CASE
         WHEN totals.payment_total > 0 THEN COALESCE(payment_months.revenue, 0)
         ELSE COALESCE(contract_months.contract_value, 0)
       END::numeric AS revenue
     FROM months
     CROSS JOIN totals
     LEFT JOIN payment_months ON payment_months.month_start = months.month_start
     LEFT JOIN contract_months ON contract_months.month_start = months.month_start
     ORDER BY months.month_start`,
    [startDate || null, endDate || null]
  );

  return result.rows.map((row) => ({
    month: row.month,
    revenue: Number(row.revenue)
  }));
}

async function contractStatus(startDate, endDate) {
  const params = [];
  const filters = [];

  if (startDate) {
    params.push(startDate);
    filters.push(`start_date >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    filters.push(`start_date <= $${params.length}`);
  }

  const whereClause = filters.length 
    ? `WHERE ${filters.join(" AND ")}` 
    : "";

  const result = await query(
    `SELECT status, COUNT(*)::int AS count
     FROM contracts
     ${whereClause}
     GROUP BY status
     ORDER BY status`,
    params
  );

  return result.rows;
}

async function exportRows(type, startDate, endDate) {
  if (type === "contract-status") {
    return contractStatus(startDate, endDate);
  }

  return revenueTrend(startDate, endDate);
}

module.exports = {
  revenueTrend,
  contractStatus,
  exportRows
};
