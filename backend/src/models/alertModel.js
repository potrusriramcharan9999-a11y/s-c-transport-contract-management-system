const { query } = require("../config/db");

async function create(data) {
  const result = await query(
    `INSERT INTO alerts (contract_id, alert_type, alert_date, message, is_sent, sent_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, FALSE), $6)
     RETURNING *`,
    [
      data.contract_id,
      data.alert_type,
      data.alert_date,
      data.message,
      data.is_sent || false,
      data.sent_at || null
    ]
  );

  return result.rows[0];
}

async function createIfMissing(data) {
  const existing = await query(
    `SELECT id FROM alerts
     WHERE contract_id = $1 AND alert_type = $2 AND is_sent = FALSE
     LIMIT 1`,
    [data.contract_id, data.alert_type]
  );

  if (existing.rows[0]) {
    return { created: false, alert: existing.rows[0] };
  }

  const alert = await create(data);
  return { created: true, alert };
}

async function findAll({ status }) {
  const values = [];
  const filters = ["a.alert_type = 'RENEWAL'"];

  if (status === "sent") {
    filters.push("a.is_sent = TRUE");
  }

  if (status === "pending" || status === "new") {
    filters.push("a.is_sent = FALSE");
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await query(
    `SELECT a.*, c.contract_number, i.institution_name
     FROM alerts a
     JOIN contracts c ON c.id = a.contract_id
     LEFT JOIN institutions i ON i.id = c.institution_id
     ${whereClause}
     ORDER BY a.alert_date ASC, a.created_at DESC`,
    values
  );

  return result.rows;
}

async function upcoming(limit = 10) {
  const result = await query(
    `WITH generated_alerts AS (
       SELECT
         a.id::text,
         a.contract_id,
         a.alert_type,
         a.alert_date,
         a.message,
         a.is_sent,
         a.sent_at,
         a.created_at,
         c.contract_number,
         i.institution_name
       FROM alerts a
       JOIN contracts c ON c.id = a.contract_id
       LEFT JOIN institutions i ON i.id = c.institution_id
       WHERE a.is_sent = FALSE AND a.alert_type = 'RENEWAL'
     ),
     contract_renewals AS (
       SELECT
         CONCAT('contract-renewal-', c.id)::text AS id,
         c.id AS contract_id,
         'RENEWAL' AS alert_type,
         c.renewal_date AS alert_date,
         CONCAT('Renewal is due for contract ', c.contract_number, ' on ', TO_CHAR(c.renewal_date, 'DD Mon YYYY'), '.') AS message,
         FALSE AS is_sent,
         NULL::timestamp AS sent_at,
         CURRENT_TIMESTAMP AS created_at,
         c.contract_number,
         i.institution_name
       FROM contracts c
       LEFT JOIN institutions i ON i.id = c.institution_id
       WHERE c.status = 'PENDING_RENEWAL'
         AND c.renewal_date <= CURRENT_DATE + INTERVAL '90 days'
         AND NOT EXISTS (
           SELECT 1 FROM generated_alerts ga
           WHERE ga.contract_id = c.id AND ga.alert_type = 'RENEWAL'
         )
     )
     SELECT *
     FROM (
       SELECT * FROM generated_alerts
       UNION ALL SELECT * FROM contract_renewals
     ) active_alerts
     ORDER BY alert_date ASC, created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

async function findById(id) {
  const result = await query("SELECT * FROM alerts WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function markSent(id) {
  const result = await query(
    `UPDATE alerts
     SET is_sent = TRUE, sent_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  create,
  createIfMissing,
  findAll,
  upcoming,
  findById,
  markSent
};
