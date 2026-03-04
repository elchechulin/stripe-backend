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

  // ===============================
// TYPE VALIDATION
// ===============================

if (type !== "sales" && type !== "sale_detail") {
  return res.status(400).json({ error: "Invalid type" });
}

  const {
  id,
  closer_id,
  month,
  year,
  commission,
  view,
  compare_month_a,
  compare_year_a,
  compare_month_b,
  compare_year_b,
  compare_closer_id
} = req.query;

  try {
  
  // ===============================
// 🔎 DETALLE DE VENTA
// ===============================

if (type === "sale_detail") {

  if (!id) {
    return res.status(400).json({ error: "Missing sale id" });
  }

  const saleQuery = `
    SELECT
      sh.*,
      u.username,
      u.is_active,
      u.deleted_at,
      u.commission_start_at
    FROM sales_history sh
    LEFT JOIN users u ON sh.closer_id = u.id
    WHERE sh.id = ${Number(id)}
    LIMIT 1
  `;

  const result = await sql(saleQuery);

  if (!result || result.length === 0) {
    return res.status(404).json({ error: "Sale not found" });
  }

  const sale = result[0];

  let stripeData = {};

  try {

    if (sale.stripe_subscription_id) {

  const subscription = await stripe.subscriptions.retrieve(
    sale.stripe_subscription_id
  );

  // ===============================
  // FACTURAS STRIPE
  // ===============================

  const invoices = await stripe.invoices.list({
    subscription: sale.stripe_subscription_id,
    limit: 20
  });

  stripeData.invoices = invoices.data.map(inv => ({
    id: inv.id,
    number: inv.number,
    amount_paid: inv.amount_paid,
    status: inv.status,
    created: inv.created,
    hosted_invoice_url: inv.hosted_invoice_url,
    invoice_pdf: inv.invoice_pdf
  }));

  stripeData.subscription = {
    id: subscription.id,
    status: subscription.status,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    cancel_at: subscription.cancel_at,
    cancel_at_period_end: subscription.cancel_at_period_end
  };

}

    if (sale.stripe_payment_intent_id) {

      const paymentIntent = await stripe.paymentIntents.retrieve(
        sale.stripe_payment_intent_id
      );

      stripeData.payment_intent = {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount_received: paymentIntent.amount_received
      };

    }

    if (sale.stripe_charge_id) {

      const charge = await stripe.charges.retrieve(
        sale.stripe_charge_id
      );

      stripeData.charge = {
        id: charge.id,
        receipt_url: charge.receipt_url,
        amount_refunded: charge.amount_refunded
      };

    }

  } catch (stripeErr) {
    console.error("Stripe detail error:", stripeErr.message);
  }

  return res.status(200).json({
    sale,
    stripe: stripeData
  });

}

    let where = `
WHERE 
  sh.subscription_status = 'active'
  AND COALESCE(sh.is_fully_refunded,false) = false
`;

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
    COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS total_revenue,
    COALESCE(SUM(
  CASE
    WHEN sh.created_at >= COALESCE(u.commission_start_at, '1970-01-01')
    THEN (sh.monthly_price - COALESCE(sh.refund_amount,0)) * sh.commission_percentage / 100
    ELSE 0
  END
),0) AS total_commissions,
    COALESCE(AVG(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS avg_ticket,

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

// ===============================
// KPI BENEFICIO BRUTO
// ===============================

const revenue = Number(kpisData.total_revenue || 0);
const commissions = Number(kpisData.total_commissions || 0);

kpisData.gross_profit = Number((revenue - commissions).toFixed(2));

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
      COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS total_revenue,

      COALESCE(SUM(
  (sh.monthly_price - COALESCE(sh.refund_amount,0)) * sh.commission_percentage / 100
),0) AS total_commissions,

      COALESCE(AVG(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS avg_ticket,

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
  AND COALESCE(sh.is_fully_refunded,false) = false
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

// ===============================
// 🏆 RANKING MENSUAL PONDERADO
// ===============================

let monthlyRanking = [];

if (view === "closers") {

  const rankingQuery = `
    SELECT
      u.id AS closer_id,
      u.username,
      COUNT(sh.id) AS monthly_sales,
      COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS monthly_revenue
    FROM sales_history sh
    JOIN users u ON sh.closer_id = u.id
    WHERE
      DATE_TRUNC('month', sh.created_at) = DATE_TRUNC('month', NOW())
      AND COALESCE(sh.is_fully_refunded,false) = false
      AND u.deleted_at IS NULL
      AND u.is_active = true
    GROUP BY u.id, u.username
  `;

  const rankingResult = await sql(rankingQuery);

  if (rankingResult.length > 0) {

    const maxRevenue = Math.max(...rankingResult.map(r => Number(r.monthly_revenue)));
    const maxSales   = Math.max(...rankingResult.map(r => Number(r.monthly_sales)));

    monthlyRanking = rankingResult.map(r => {

      const revenueNorm = maxRevenue > 0 ? Number(r.monthly_revenue) / maxRevenue : 0;
      const salesNorm   = maxSales > 0 ? Number(r.monthly_sales) / maxSales : 0;

      const score = (revenueNorm * 0.7) + (salesNorm * 0.3);

      return {
        ...r,
        score: Number(score.toFixed(4))
      };

    }).sort((a, b) => b.score - a.score)
      .map((r, index) => ({
        position: index + 1,
        ...r
      }));
  }
}

// ===============================
// 📊 VISTA ANUAL ESTRUCTURADA
// ===============================

let annualSummary = null;
let annualRanking = [];
let annualMonthlyBreakdown = [];

// ===============================
// 📈 YTD (Year To Date) PRO
// ===============================

let ytdData = null;

// ===============================
// 📊 COMPARATIVA AVANZADA
// ===============================

let comparisonData = null;

if (
  view === "closers" &&
  compare_month_a &&
  compare_year_a &&
  compare_month_b &&
  compare_year_b
) {

  const monthA = Number(compare_month_a);
  const yearA  = Number(compare_year_a);
  const monthB = Number(compare_month_b);
  const yearB  = Number(compare_year_b);

  const closerFilter =
    compare_closer_id
      ? `AND sh.closer_id = ${Number(compare_closer_id)}`
      : "";

  async function getMonthData(month, year) {

    const query = `
      SELECT
        COUNT(sh.id) AS total_sales,
        COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS total_revenue,
        COALESCE(SUM(
          (sh.monthly_price - COALESCE(sh.refund_amount,0)) * sh.commission_percentage / 100
        ),0) AS total_commissions,
        COALESCE(AVG(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS avg_ticket
      FROM sales_history sh
      JOIN users u ON sh.closer_id = u.id
      WHERE
        EXTRACT(MONTH FROM sh.created_at) = ${month}
        AND EXTRACT(YEAR FROM sh.created_at) = ${year}
        AND sh.subscription_status = 'active'
        AND COALESCE(sh.is_fully_refunded,false) = false
        AND u.deleted_at IS NULL
        AND u.is_active = true
        AND sh.created_at >= COALESCE(u.commission_start_at,'1970-01-01')
        ${closerFilter}
    `;

    const result = await sql(query);
    return result?.[0] || {
      total_sales: 0,
      total_revenue: 0,
      total_commissions: 0,
      avg_ticket: 0
    };
  }

  const monthAData = await getMonthData(monthA, yearA);
  const monthBData = await getMonthData(monthB, yearB);

  function calcGrowth(current, previous) {
    if (Number(previous) > 0) {
      return ((Number(current) - Number(previous)) / Number(previous)) * 100;
    }
    if (Number(current) > 0) return 100;
    return 0;
  }

  comparisonData = {
    scope: compare_closer_id ? "closer" : "global",
    month_a: monthAData,
    month_b: monthBData,
    growth: {
      sales_growth_percentage:
        Number(calcGrowth(monthBData.total_sales, monthAData.total_sales).toFixed(1)),
      revenue_growth_percentage:
        Number(calcGrowth(monthBData.total_revenue, monthAData.total_revenue).toFixed(1)),
      commissions_growth_percentage:
        Number(calcGrowth(monthBData.total_commissions, monthAData.total_commissions).toFixed(1)),
      ticket_growth_percentage:
        Number(calcGrowth(monthBData.avg_ticket, monthAData.avg_ticket).toFixed(1))
    }
  };

}

if (view === "closers") {

  const selectedYear = year ? Number(year) : new Date().getFullYear();

  // 🔹 RESUMEN ANUAL GLOBAL
  const annualSummaryQuery = `
    SELECT
      COUNT(sh.id) AS total_sales,
      COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS total_revenue,
      COALESCE(AVG(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS avg_ticket
    FROM sales_history sh
    JOIN users u ON sh.closer_id = u.id
    WHERE
      EXTRACT(YEAR FROM sh.created_at) = ${selectedYear}
      AND COALESCE(sh.is_fully_refunded,false) = false
      AND u.deleted_at IS NULL
      AND u.is_active = true
  `;

  const annualSummaryResult = await sql(annualSummaryQuery);
  annualSummary = annualSummaryResult?.[0] || null;

  // 🔹 RANKING ANUAL PONDERADO
  const annualRankingQuery = `
    SELECT
      u.id AS closer_id,
      u.username,
      COUNT(sh.id) AS yearly_sales,
      COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS yearly_revenue
    FROM sales_history sh
    JOIN users u ON sh.closer_id = u.id
    WHERE
      EXTRACT(YEAR FROM sh.created_at) = ${selectedYear}
      AND COALESCE(sh.is_fully_refunded,false) = false
      AND u.deleted_at IS NULL
      AND u.is_active = true
    GROUP BY u.id, u.username
  `;

  const rankingYearResult = await sql(annualRankingQuery);

  if (rankingYearResult.length > 0) {

    const maxRevenue = Math.max(...rankingYearResult.map(r => Number(r.yearly_revenue)));
    const maxSales   = Math.max(...rankingYearResult.map(r => Number(r.yearly_sales)));

    annualRanking = rankingYearResult.map(r => {

      const revenueNorm = maxRevenue > 0 ? Number(r.yearly_revenue) / maxRevenue : 0;
      const salesNorm   = maxSales > 0 ? Number(r.yearly_sales) / maxSales : 0;

      const score = (revenueNorm * 0.7) + (salesNorm * 0.3);

      return {
        ...r,
        score: Number(score.toFixed(4))
      };

    }).sort((a, b) => b.score - a.score)
      .map((r, index) => ({
        position: index + 1,
        ...r
      }));
  }

  // 🔹 DESGLOSE MES A MES
  const monthlyBreakdownQuery = `
    SELECT
      EXTRACT(MONTH FROM sh.created_at) AS month,
      COUNT(sh.id) AS total_sales,
      COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS total_revenue
    FROM sales_history sh
    JOIN users u ON sh.closer_id = u.id
    WHERE
      EXTRACT(YEAR FROM sh.created_at) = ${selectedYear}
      AND COALESCE(sh.is_fully_refunded,false) = false
      AND u.deleted_at IS NULL
      AND u.is_active = true
    GROUP BY month
    ORDER BY month ASC
  `;

  annualMonthlyBreakdown = await sql(monthlyBreakdownQuery);
  
  // ===============================
// 📈 YTD ACTUAL
// ===============================

const ytdCurrentQuery = `
  SELECT
    COUNT(sh.id) AS total_sales,
    COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS total_revenue,
    COALESCE(SUM(
      (sh.monthly_price - COALESCE(sh.refund_amount,0)) * sh.commission_percentage / 100
    ),0) AS total_commissions,
    COALESCE(AVG(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS avg_ticket
  FROM sales_history sh
  JOIN users u ON sh.closer_id = u.id
  WHERE
    sh.created_at >= DATE_TRUNC('year', NOW())
    AND sh.subscription_status = 'active'
    AND COALESCE(sh.is_fully_refunded,false) = false
    AND u.deleted_at IS NULL
    AND u.is_active = true
`;

const ytdCurrentResult = await sql(ytdCurrentQuery);
const ytdCurrent = ytdCurrentResult?.[0] || {
  total_sales: 0,
  total_revenue: 0,
  total_commissions: 0,
  avg_ticket: 0
};

// ===============================
// 📈 YTD AÑO ANTERIOR MISMO PERIODO
// ===============================

const ytdPreviousQuery = `
  SELECT
    COUNT(sh.id) AS total_sales,
    COALESCE(SUM(sh.monthly_price - COALESCE(sh.refund_amount,0)),0) AS total_revenue,
    COALESCE(SUM(
      (sh.monthly_price - COALESCE(sh.refund_amount,0)) * sh.commission_percentage / 100
    ),0) AS total_commissions
  FROM sales_history sh
  JOIN users u ON sh.closer_id = u.id
  WHERE
    sh.created_at >= DATE_TRUNC('year', NOW() - INTERVAL '1 year')
    AND sh.created_at <= NOW() - INTERVAL '1 year'
    AND sh.subscription_status = 'active'
    AND COALESCE(sh.is_fully_refunded,false) = false
    AND u.deleted_at IS NULL
    AND u.is_active = true
`;

const ytdPreviousResult = await sql(ytdPreviousQuery);
const ytdPrevious = ytdPreviousResult?.[0] || {
  total_sales: 0,
  total_revenue: 0,
  total_commissions: 0
};

// ===============================
// 📊 CÁLCULO CRECIMIENTO
// ===============================

function calcGrowth(current, previous) {
  if (previous > 0) {
    return ((current - previous) / previous) * 100;
  }
  if (current > 0) return 100;
  return 0;
}

const revenueGrowth = calcGrowth(
  Number(ytdCurrent.total_revenue),
  Number(ytdPrevious.total_revenue)
);

const salesGrowth = calcGrowth(
  Number(ytdCurrent.total_sales),
  Number(ytdPrevious.total_sales)
);

const commissionsGrowth = calcGrowth(
  Number(ytdCurrent.total_commissions),
  Number(ytdPrevious.total_commissions)
);

// ===============================
// 🔮 FORECAST FIN DE AÑO
// ===============================

const now = new Date();
const startOfYear = new Date(now.getFullYear(), 0, 1);
const daysPassed = Math.max(
  1,
  Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24))
);

const dailyRevenueAvg =
  Number(ytdCurrent.total_revenue) / daysPassed;

const dailySalesAvg =
  Number(ytdCurrent.total_sales) / daysPassed;

const dailyCommissionAvg =
  Number(ytdCurrent.total_commissions) / daysPassed;

const projectedRevenue = dailyRevenueAvg * 365;
const projectedSales = dailySalesAvg * 365;
const projectedCommissions = dailyCommissionAvg * 365;

// ===============================
// 📦 ESTRUCTURA FINAL YTD
// ===============================

ytdData = {
  current: {
    ...ytdCurrent
  },
  previous: {
    ...ytdPrevious
  },
  growth: {
    revenue_growth_percentage: Number(revenueGrowth.toFixed(1)),
    sales_growth_percentage: Number(salesGrowth.toFixed(1)),
    commissions_growth_percentage: Number(commissionsGrowth.toFixed(1))
  },
  forecast: {
    projected_revenue: Number(projectedRevenue.toFixed(2)),
    projected_sales: Number(projectedSales.toFixed(1)),
    projected_commissions: Number(projectedCommissions.toFixed(2))
  }
};
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
  closer_kpis: closerKpis,
  monthly_ranking: monthlyRanking,
  annual_summary: annualSummary,
  annual_ranking: annualRanking,
  annual_monthly_breakdown: annualMonthlyBreakdown,
  ytd: ytdData,
  comparison: comparisonData,
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

      // 🔹 Recuperar sesión expandida para obtener charge real
      const fullSession = await stripe.checkout.sessions.retrieve(
        session.id,
        {
          expand: ["payment_intent.charges"]
        }
      );

      const paymentIntent = fullSession.payment_intent;
      const charge =
        paymentIntent &&
        paymentIntent.charges &&
        paymentIntent.charges.data.length > 0
          ? paymentIntent.charges.data[0]
          : null;

      await sql`
  INSERT INTO sales_history (
    closer_id,
    client_id,
    monthly_price,
    service_type,
    commission_percentage,
    subscription_status,
    stripe_subscription_id,
    stripe_payment_intent_id,
    stripe_charge_id,
    created_at,

    restaurant_name,
    restaurant_cp,
    restaurant_city,
    restaurant_country,
    google_reviews,
    google_rating,
    setup_fee,
    discount_percentage
  )
  VALUES (
    ${metadata.closer_id || null},
    ${metadata.client_id || null},
    ${session.amount_total / 100},
    ${metadata.service_type || null},
    ${metadata.commission_percentage || 0},
    'active',
    ${session.subscription || null},
    ${paymentIntent ? paymentIntent.id : null},
    ${charge ? charge.id : null},
    NOW(),

    ${metadata.restaurant_name || null},
    ${metadata.restaurant_cp || null},
    ${metadata.restaurant_city || null},
    ${metadata.restaurant_country || null},
    ${metadata.google_reviews || null},
    ${metadata.google_rating || null},
    ${metadata.setup_fee || false},
    ${metadata.discount_percentage || 0}
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

// ==========================================
// REFUNDS (TOTALES Y PARCIALES)
// ==========================================

if (event.type === "charge.refunded") {

  const charge = event.data.object;

  try {

    // Buscar venta por stripe_charge_id
    const saleResult = await sql`
      SELECT id, monthly_price, refund_amount
      FROM sales_history
      WHERE stripe_charge_id = ${charge.id}
      LIMIT 1
    `;

    if (saleResult.length === 0) {
      console.log("Refund recibido pero no se encontró venta asociada");
      return res.status(200).json({ received: true });
    }

    const sale = saleResult[0];

    // Stripe devuelve amount_refunded en centimos
    const refundedAmount = charge.amount_refunded / 100;

    const newRefundTotal =
      Number(sale.refund_amount || 0) + Number(refundedAmount);

    const fullyRefunded =
      newRefundTotal >= Number(sale.monthly_price);

    await sql`
      UPDATE sales_history
      SET
        refund_amount = ${newRefundTotal},
        is_fully_refunded = ${fullyRefunded},
        refunded_at = NOW()
      WHERE id = ${sale.id}
    `;

    console.log("Refund aplicado correctamente:", charge.id);

  } catch (err) {
    console.error("Error procesando refund:", err);
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
