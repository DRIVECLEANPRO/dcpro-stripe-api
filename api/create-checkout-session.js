import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 🚚 Livraison offerte à partir de :
const SHIP_FREE_FROM = 220;

/*
IMPORTANT :
Remplis ici EXACTEMENT les IDs produits envoyés par ton panier.
Exemple :
"gs-1l": { name: "Green Star 1L", price: 14.90 }
*/

const CATALOG = {
  // Exemple test (à remplacer par tes vrais produits)
  "test-1": { name: "Produit Test", price: 10.00 }
};


// =============================
// 🔎 Utilitaires
// =============================

function parseSizeToLiters(sizeStr = "") {
  const s = String(sizeStr).trim().toLowerCase();
  if (!s) return 0;

  const ml = s.match(/(\d+(?:\.\d+)?)\s*ml/);
  if (ml) return (parseFloat(ml[1]) || 0) / 1000;

  const l = s.match(/(\d+(?:\.\d+)?)\s*l/);
  if (l) return parseFloat(l[1]) || 0;

  return 0;
}

function shippingCost(subtotal, liters) {
  if (subtotal <= 0) return 0;
  if (subtotal >= SHIP_FREE_FROM) return 0;

  if (liters <= 2) return 6.90;
  if (liters <= 5) return 9.90;
  return 14.90;
}


// =============================
// 🚀 API Handler
// =============================

export default async function handler(req, res) {

  // ✅ CORS (Systeme.io compatible)
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const origin = req.headers.origin;
  const allowOrigin =
    allowed.length === 0 ? "*" : (allowed.includes(origin) ? origin : allowed[0]);

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { items = [], success_url, cancel_url } = req.body;

    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    let subtotal = 0;
    let totalLiters = 0;

    const line_items = [];

    for (const item of items) {
      const product = CATALOG[item.id];

      if (!product) {
        return res.status(400).json({ error: `Unknown product id: ${item.id}` });
      }

      const qty = Math.max(1, parseInt(item.qty || 1));
      const price = product.price;
      const liters = parseSizeToLiters(item.size);

      subtotal += price * qty;
      totalLiters += liters * qty;

      line_items.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: product.name + (item.size ? ` - ${item.size}` : "")
          },
          unit_amount: Math.round(price * 100)
        },
        quantity: qty
      });
    }

    // 🚚 Ajouter frais de port si nécessaire
    const ship = shippingCost(subtotal, totalLiters);

    if (ship > 0) {
      line_items.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: "Frais de livraison"
          },
          unit_amount: Math.round(ship * 100)
        },
        quantity: 1
      });
    }

    // 💳 Création session Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      success_url: success_url || "https://example.com/success",
      cancel_url: cancel_url || "https://example.com/cancel"
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
