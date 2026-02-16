import { Pool } from "pg";

export const config = {
  runtime: "nodejs"
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    // Verificar si existe y si es demo
const check = await pool.query(
  "SELECT id, is_demo FROM users WHERE id = $1",
  [user_id]
);

if (check.rows.length === 0) {
  return res.status(404).json({ error: "User not found" });
}

const user = check.rows[0];

// Solo permitir eliminación DEFINITIVA si es demo
if (user.is_demo === true) {

  await pool.query(
    "DELETE FROM users WHERE id = $1",
    [user_id]
  );

  return res.status(200).json({ success: true });
}

// Si NO es demo → no se elimina nunca
return res.status(403).json({
  error: "No se puede eliminar un closer real"
});


  } catch (err) {
    console.error("DELETE CLOSER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
