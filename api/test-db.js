import sql from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const result = await sql`
      INSERT INTO restaurants (name, scenario, monthly_price, original_price)
      VALUES ('Restaurante Test', 'medium', 50, 63)
      RETURNING *;
    `;

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
