import { MongoClient } from "mongodb";
import Razorpay from "razorpay";
import crypto from "crypto";

const uri = process.env.MONGODB_URI;

let client;
let clientPromise;

// ✅ Reuse MongoDB connection
if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

// ✅ Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    const mongo = await clientPromise;
    const db = mongo.db("rcmstore");

    // ✅ Safe body parse (GLOBAL FIX)
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // 🔐 ADMIN LOGIN
    if (action === "admin-login") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, message: "Method not allowed" });
      }

      const { username, password } = body || {};

      if (!username || !password) {
        return res.status(400).json({ success: false, message: "Missing credentials" });
      }

      if (
        username === process.env.ADMIN_USER &&
        password === process.env.ADMIN_PASS
      ) {
        res.setHeader(
          "Set-Cookie",
          "admin=true; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400"
        );

        return res.status(200).json({ success: true });
      }

      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // 🔓 ADMIN LOGOUT
    else if (action === "admin-logout") {
      res.setHeader(
        "Set-Cookie",
        "admin=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
      );

      return res.status(200).json({ success: true });
    }

    // 🔐 CHECK ADMIN
    else if (action === "check-admin") {
      const cookies = req.headers.cookie || "";

      return res.status(200).json({
        loggedIn: cookies.includes("admin=true"),
      });
    }

    // 📩 SAVE CONTACT
    else if (action === "contact") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, message: "Only POST allowed" });
      }

      if (!body || !body.fname || !body.email || !body.message) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields",
        });
      }

      await db.collection("contacts").insertOne({
        ...body,
        createdAt: new Date(),
      });

      return res.status(200).json({
        success: true,
        message: "Contact saved",
      });
    }

    // 📥 GET CONTACTS
    else if (action === "get-contacts") {
      if (req.method !== "GET") {
        return res.status(405).json({
          success: false,
          message: "Only GET allowed",
        });
      }

      const data = await db
        .collection("contacts")
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        contacts: data,
      });
    }

    // 💳 CREATE ORDER
    else if (action === "create-order") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const { amount } = body || {};

      const order = await razorpay.orders.create({
        amount,
        currency: "INR",
        receipt: "rcm_" + Date.now(),
      });

      return res.json(order);
    }

    // 🔑 GET KEY
    else if (action === "get-key") {
      return res.json({ key: process.env.RAZORPAY_KEY_ID });
    }

    // 📦 GET ORDERS
    else if (action === "get-orders") {
      if (req.method !== "GET") {
        return res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
      }

      const orders = await db
        .collection("orders")
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        orders,
      });
    }

    // 💾 SAVE ORDER
    else if (action === "save-order") {
      if (req.method !== "POST") {
        return res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
      }

      if (!body || !body.orderId) {
        return res.status(400).json({
          success: false,
          message: "Invalid order data",
        });
      }

      await db.collection("orders").insertOne({
        ...body,
        createdAt: new Date(),
      });

      return res.status(200).json({ success: true });
    }

    // 🔍 TRACK ORDER
    else if (action === "track-order") {
      if (req.method !== "POST") {
        return res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
      }

      const { orderId } = body || {};

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: "Order ID required",
        });
      }

      const order = await db.collection("orders").findOne({ orderId });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.status(200).json({
        success: true,
        order,
      });
    }

    // 🔄 UPDATE STATUS
    else if (action === "update-status") {
      if (req.method !== "POST") {
        return res.status(405).json({
          success: false,
          message: "Only POST allowed",
        });
      }

      const { orderId, status } = body || {};

      if (!orderId || !status) {
        return res.status(400).json({
          success: false,
          message: "Missing orderId or status",
        });
      }

      const result = await db.collection("orders").updateOne(
        { orderId },
        { $set: { status } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Status updated",
      });
    }

    // ✅ VERIFY PAYMENT
    else if (action === "verify-payment") {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false });
      }

      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      } = body || {};

      const text = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_SECRET)
        .update(text)
        .digest("hex");

      return res.json({
        success: expectedSignature === razorpay_signature,
      });
    }

    // ❌ DEFAULT
    else {
      return res.status(404).json({ message: "Invalid API route" });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}