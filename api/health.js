import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false
  },
  runtime: "nodejs"
};

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

export default async function handler(req, res) {

res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

if (req.method === "OPTIONS") {
  return res.status(200).end();
}

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Stripe-Signature");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ==========================================
// GET
// ==========================================
if (req.method === "GET") {

  const { type } = req.query;

  if (!type) {
    return res.status(200).json({ ok: true });
  }

  if (type !== "sales") {
    return res.status(400).json({ error: "Invalid type" });
  }

  const {
    closer_id,
    month,
    year,
    commission,
    view
  } = req.query;

  try {

    let where = `WHERE sh.subscription_status = 'active'`;

// ===============================
// VISTA ESTRUCTURAL REAL
// ===============================

if (view === "closers") {
  // Solo ventas que siguen perteneciendo a closers activos
  where += `
    AND u.deleted_at IS NULL
    AND u.is_active = true
    AND sh.created_at >= COALESCE(u.commission_start_at, '1970-01-01')
  `;
} else {
  // Vista general (all o undefined)
  // Mostrar absolutamente todas las ventas activas
}

    if (closer_id) {
      where += ` AND sh.closer_id = ${Number(closer_id)}`;
    }

    if (commission) {
      where += ` AND sh.commission_percentage = ${Number(commission)}`;
    }

    if (month) {
      where += ` AND EXTRACT(MONTH FROM sh.created_at) = ${Number(month)}`;
    }

    if (year) {
      where += ` AND EXTRACT(YEAR FROM sh.created_at) = ${Number(year)}`;
    }

    const kpiQuery = `
  SELECT
    COUNT(sh.id) AS total_sales,
    COALESCE(SUM(sh.monthly_price),0) AS total_revenue,
    COALESCE(SUM(
  CASE
    WHEN sh.created_at >= COALESCE(u.commission_start_at, '1970-01-01')
    THEN sh.monthly_price * sh.commission_percentage / 100
    ELSE 0
  END
),0) AS total_commissions,
    COALESCE(AVG(sh.monthly_price),0) AS avg_ticket,

    COALESCE(SUM(
      CASE
        WHEN DATE_TRUNC('month', sh.created_at) = DATE_TRUNC('month', NOW())
        THEN 1 ELSE 0
      END
    ),0) AS new_sales_current_month,

    COALESCE(SUM(
      CASE
        WHEN DATE_TRUNC('month', sh.created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
        THEN 1 ELSE 0
      END
    ),0) AS new_sales_previous_month

  FROM sales_history sh
  LEFT JOIN users u ON sh.closer_id = u.id
  ${where}
`;

    const salesQuery = `
  SELECT
    sh.id,
    sh.closer_id,
    COALESCE(
  CASE
    WHEN u.deleted_at IS NOT NULL
      OR u.is_active = false
      OR sh.created_at < COALESCE(u.commission_start_at, '1970-01-01')
    THEN 'Administrador'
    ELSE u.username
  END,
  'Administrador'
) AS username,
    sh.monthly_price,
    sh.service_type,
    CASE
  WHEN u.deleted_at IS NOT NULL
    OR u.is_active = false
    OR sh.created_at < COALESCE(u.commission_start_at, '1970-01-01')
  THEN 100
  ELSE sh.commission_percentage
END AS commission_percentage,
    sh.subscription_status,
    sh.created_at
  FROM sales_history sh
  LEFT JOIN users u ON sh.closer_id = u.id
  ${where}
  ORDER BY sh.created_at DESC
`;

    const kpiResult = await sql(kpiQuery);
    let kpisData = kpiResult?.[0] || {};

const current = Number(kpisData.new_sales_current_month || 0);
const previous = Number(kpisData.new_sales_previous_month || 0);

let growth_percentage = 0;

if (previous > 0) {
  growth_percentage = ((current - previous) / previous) * 100;
} else if (current > 0) {
  growth_percentage = 100;
}

kpisData.growth_percentage = Number(growth_percentage.toFixed(1));
    const salesResult = await sql(salesQuery);
    
    // ===============================
// KPIs INDIVIDUALES POR CLOSER
// ===============================

let closerKpis = [];

if (view === "closers") {

  const closerKpiQuery = `
    SELECT
      u.id AS closer_id,
      u.username,

      COUNT(sh.id) AS total_sales,
      COALESCE(SUM(sh.monthly_price),0) AS total_revenue,

      COALESCE(SUM(
        sh.monthly_price * sh.commission_percentage / 100
      ),0) AS total_commissions,

      COALESCE(AVG(sh.monthly_price),0) AS avg_ticket,

      COALESCE(SUM(
        CASE
          WHEN DATE_TRUNC('month', sh.created_at) = DATE_TRUNC('month', NOW())
          THEN 1 ELSE 0
        END
      ),0) AS new_sales_current_month,

      COALESCE(SUM(
        CASE
          WHEN DATE_TRUNC('month', sh.created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          THEN 1 ELSE 0
        END
      ),0) AS new_sales_previous_month

    FROM sales_history sh
    JOIN users u ON sh.closer_id = u.id

    WHERE
      sh.subscription_status = 'active'
      AND u.deleted_at IS NULL
      AND u.is_active = true
      AND sh.created_at >= COALESCE(u.commission_start_at, '1970-01-01')

    GROUP BY u.id, u.username
    ORDER BY total_revenue DESC
  `;

  const result = await sql(closerKpiQuery);

  closerKpis = result.map(row => {

    const current = Number(row.new_sales_current_month || 0);
    const previous = Number(row.new_sales_previous_month || 0);

    let growth = 0;

    if (previous > 0) {
      growth = ((current - previous) / previous) * 100;
    } else if (current > 0) {
      growth = 100;
    }

    return {
      ...row,
      growth_percentage: Number(growth.toFixed(1))
    };
  });
}

    return res.status(200).json({
  kpis: kpisData || {
    total_sales: 0,
    total_revenue: 0,
    total_commissions: 0,
    avg_ticket: 0,
    new_sales_current_month: 0
  },
  sales: salesResult || [],
  closer_kpis: closerKpis
});

  } catch (err) {
  console.error("SALES ERROR FULL:", err);
  console.error("MESSAGE:", err.message);
  console.error("STACK:", err.stack);

  return res.status(500).json({
    error: "Sales query failed",
    details: err.message
  });
}
}

  // WEBHOOK STRIPE
  if (req.headers["stripe-signature"]) {

    let event;

    try {
      const rawBody = await buffer(req);
      const signature = req.headers["stripe-signature"];

      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

    } catch (err) {
      console.error("Webhook signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // IGNORAR TEST MODE
    if (!event.livemode) {
      return res.status(200).json({ ignored: "test mode" });
    }

    // ==========================================
// CHECKOUT COMPLETADO (CREAR VENTA)
// ==========================================

if (event.type === "checkout.session.completed") {

  const session = event.data.object;

  if (session.payment_status === "paid") {

    const metadata = session.metadata || {};

    try {

      await sql`
        INSERT INTO sales_history (
          closer_id,
          client_id,
          monthly_price,
          service_type,
          commission_percentage,
          subscription_status,
          stripe_subscription_id,
          created_at
        )
        VALUES (
          ${metadata.closer_id || null},
          ${metadata.client_id || null},
          ${session.amount_total / 100},
          ${metadata.service_type || null},
          ${metadata.commission_percentage || 0},
          'active',
          ${session.subscription || null},
          NOW()
        )
      `;

      console.log("Venta creada con subscription:", session.subscription);

    } catch (dbError) {
      console.error("DB insert error:", dbError);
    }
  }
}


// ==========================================
// CANCELACIONES REALES DE SUSCRIPCIÓN
// ==========================================

if (
  event.type === "customer.subscription.updated" ||
  event.type === "customer.subscription.deleted"
) {

  const subscription = event.data.object;

  if (subscription.status === "canceled") {

    try {

      await sql`
        UPDATE sales_history
        SET subscription_status = 'canceled'
        WHERE stripe_subscription_id = ${subscription.id}
      `;

      console.log("Subscription cancelada en DB:", subscription.id);

    } catch (err) {
      console.error("Error actualizando cancelación:", err);
    }
  }
}

    return res.status(200).json({ received: true });
  }

  // PRESENCE
  if (req.method === "POST") {

    let body = "";

    try {
      const raw = await buffer(req);
      body = JSON.parse(raw.toString());
    } catch {
      return res.status(400).json({ error: "Body inválido" });
    }

    const { user_id } = body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id requerido" });
    }

    try {
      await sql`
        INSERT INTO presence (user_id, last_seen)
        VALUES (${user_id}, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET last_seen = NOW()
      `;
    } catch (err) {
      console.error("Presence error:", err);
    }

    return res.status(200).json({ updated: true });
  }

  return res.status(405).json({ error: "Método no permitido" });
}
