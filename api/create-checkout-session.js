import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SHIP_FREE_FROM = 220;

const CATALOG = {
  // IMPORTANT : Mets ici TES produits
  // Exemple :
  // "gs-1l": { name: "Green Star 1L", price: 14.90 },
};

function parseSizeToLiters(sizeStr = "") {
  const s = String(sizeStr).trim().toLowerCase().replace(",", ".");
  if (!s) return 0;
  const ml = s.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (ml) return (parseFloat(ml[1]) || 0) / 1000;
  const l = s.match(/(\d+(?:\.\d+)?)\s*l\b/);
  if (l) return (parseFloat(l[1]) || 0);
  return 0;
}

function shippingCost(subtotal, liters) {
  if (subtotal <= 0) return 0;
  if (subtotal >= SHIP_FREE_FROM) return 0;
  const kg = liters;
  if (kg <= 6) return 6;
  if (kg <= 11) return 9;
  if (kg <= 16) return 11;
  if (kg <= 21) return 13;
  return 18;
}

const toCents = (eur) => Math.round((Number(eur) || 0) * 100);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { items = [] } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart empty" });
  }

  let subtotal = 0;
  let liters = 0;
  const line_items = [];

  for (const it of items) {
    const id = String(it.id || "");
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));

    const product = CATALOG[id];
    if (!product) {
      return res.status(400).json({ error: `Unknown product id: ${id}` });
    }

    subtotal += product.price * qty;
    liters += parseSizeToLiters(it.size || "") * qty;

    line_items.push({
      quantity: qty,
      price_data: {
        currency: "eur",
        unit_amount: toCents(product.price),
        product_data: {
          name: product.name,
        },
      },
    });
  }

  const ship = shippingCost(subtotal, liters);

  line_items.push({
    quantity: 1,
    price_data: {
      currency: "eur",
      unit_amount: toCents(ship),
      product_data: {
        name: ship > 0
          ? "Transport — GLS Domicile FR"
          : "Transport — Livraison offerte",
      },
    },
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items,
    automatic_payment_methods: { enabled: true },
    success_url: "https://TON-DOMAINE/pro/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://TON-DOMAINE/cart",
  });

  return res.status(200).json({ url: session.url });
}
