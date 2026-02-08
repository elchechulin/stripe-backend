import crypto from "crypto";

export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const SECRET = process.env.PAYMENT_TOKEN_SECRET;
  if (!SECRET) {
    return res.status(500).json({
      error: "Server misconfiguration: missing PAYMENT_TOKEN_SECRET"
    });
  }

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  const [payloadB64, signature] = token.split(".");

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(payloadB64)
    .digest("hex");

  if (signature !== expected) {
    return res.status(403).json({ error: "Invalid token" });
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString()
  );

  if (Date.now() > payload.exp) {
    return res.status(410).json({ error: "Token expired" });
  }

  return res.status(200).json({
    mensualidad: payload.mensualidad,
    setup: payload.setup
  });
}
