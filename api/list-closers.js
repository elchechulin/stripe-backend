import { Pool } from "pg";

export const config = {
  runtime: "nodejs"
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const result = await pool.query(`
  SELECT 
    id,
    username,
    is_active,
    is_demo,
    created_at,
    baja_at,
    hidden_by_admin
  FROM users
  WHERE role = 'closer'
  AND hidden_by_admin IS NOT TRUE
  AND (
        is_demo = true
        OR is_active = true
        OR (
            is_active = false
            AND baja_at IS NOT NULL
            AND baja_at > NOW() - INTERVAL '1 hour'
        )
      )
  ORDER BY id DESC
`);

    return res.status(200).json(result.rows);

  } catch (err) {
    console.error("LIST CLOSERS ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
