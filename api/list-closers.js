import { neon } from "@neondatabase/serverless";

export const config = {
  runtime: "nodejs"
};

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const result = await sql`
  SELECT 
    u.id,
    u.username,
    u.is_active,
    u.is_demo,
    u.created_at,
    u.baja_at,
    u.hidden_by_admin,
    u.phone,
    u.commission_start_at,
    u.last_login,
    u.last_activity,
    u.contract_signed_at,
    u.contract_version,
    u.contract_url,
    p.last_seen,

    CASE
      WHEN p.last_seen IS NOT NULL
           AND p.last_seen > NOW() - INTERVAL '6 seconds'
      THEN true
      ELSE false
    END AS online,

    -- Total ventas
    COUNT(sh.id) AS total_sales,

    -- Ticket medio
    COALESCE(AVG(sh.monthly_price), 0) AS avg_ticket,

    -- Distribución LOW
    COALESCE(
      ROUND(
        100.0 * SUM(CASE WHEN LOWER(sh.service_type) = 'low' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(sh.id),0)
      ,2),0
    ) AS low_percentage,

    -- Distribución MEDIUM
    COALESCE(
      ROUND(
        100.0 * SUM(CASE WHEN LOWER(sh.service_type) = 'medium' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(sh.id),0)
      ,2),0
    ) AS medium_percentage,

    -- Distribución HIGH
    COALESCE(
      ROUND(
        100.0 * SUM(CASE WHEN LOWER(sh.service_type) = 'high' THEN 1 ELSE 0 END)
        / NULLIF(COUNT(sh.id),0)
      ,2),0
    ) AS high_percentage

  FROM users u
  LEFT JOIN presence p ON u.id = p.user_id
  LEFT JOIN sales_history sh ON u.id = sh.closer_id

  WHERE u.role = 'closer'
AND u.hidden_by_admin IS NOT TRUE
AND u.deleted_at IS NULL

  GROUP BY 
    u.id,
    p.last_seen

  ORDER BY u.id DESC
`;

    return res.status(200).json(result);

  } catch (err) {
    console.error("LIST CLOSERS ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
