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
        p.last_seen,
        CASE
          WHEN p.last_seen > NOW() - INTERVAL '5 seconds'
          THEN true
          ELSE false
        END AS online
      FROM users u
      LEFT JOIN presence p ON u.id = p.user_id
      WHERE u.role = 'closer'
      AND u.hidden_by_admin IS NOT TRUE
      ORDER BY u.id DESC
    `;

    return res.status(200).json(result);

  } catch (err) {
    console.error("LIST CLOSERS ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
