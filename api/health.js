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

const kpiResult = await sql`

SELECT
COUNT(sh.id) AS total_sales,
COALESCE(SUM(sh.monthly_price),0) AS total_revenue,
COALESCE(SUM(sh.monthly_price * sh.commission_percentage / 100),0) AS total_commissions,
COALESCE(AVG(sh.monthly_price),0) AS avg_ticket
FROM sales_history sh
LEFT JOIN users u ON sh.closer_id = u.id
WHERE sh.subscription_status = 'active'
${view === "disabled"
? sqlAND u.hidden_by_admin = true
: sqlAND (u.hidden_by_admin IS NOT TRUE OR u.id IS NULL)}
${closer_id ? sqlAND sh.closer_id = ${closer_id} : sql}   ${commission ? sql`AND sh.commission_percentage = ${commission}` : sql}
${month ? sqlAND EXTRACT(MONTH FROM sh.created_at) = ${month} : sql}   ${year ? sql`AND EXTRACT(YEAR FROM sh.created_at) = ${year}` : sql}
`;

const salesResult = await sql`

SELECT
sh.id,
sh.closer_id,
u.username,
sh.monthly_price,
sh.service_type,
sh.commission_percentage,
sh.subscription_status,
sh.created_at
FROM sales_history sh
LEFT JOIN users u ON sh.closer_id = u.id
WHERE sh.subscription_status = 'active'
${view === "disabled"
? sqlAND u.hidden_by_admin = true
: sqlAND (u.hidden_by_admin IS NOT TRUE OR u.id IS NULL)}
${closer_id ? sqlAND sh.closer_id = ${closer_id} : sql}   ${commission ? sql`AND sh.commission_percentage = ${commission}` : sql}
${month ? sqlAND EXTRACT(MONTH FROM sh.created_at) = ${month} : sql}   ${year ? sql`AND EXTRACT(YEAR FROM sh.created_at) = ${year}` : sql}
ORDER BY sh.created_at DESC
`;

return res.status(200).json({  
  kpis: kpiResult?.[0] || {  
    total_sales: 0,  
    total_revenue: 0,  
    total_commissions: 0,  
    avg_ticket: 0  
  },  
  sales: salesResult || []  
});

} catch (err) {
console.error("SALES ERROR:", err);
return res.status(500).json({ error: "Sales query failed" });
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

if (event.type === "checkout.session.completed") {  

  const session = event.data.object;  

  if (session.payment_status === "paid") {  

    const metadata = session.metadata || {};  

    try {

await sql  INSERT INTO sales_history (   closer_id,   client_id,   monthly_price,   service_type,   commission_percentage,   subscription_status,   created_at   )   VALUES (   ${metadata.closer_id || null},   ${metadata.client_id || null},   ${session.amount_total / 100},   ${metadata.service_type || null},   ${metadata.commission_percentage || 0},   'active',   NOW()   )  ;
} catch (dbError) {
console.error("DB insert error:", dbError);
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
