import { MongoClient } from "mongodb";

let cachedClient = null;

export default async function handler(req, res) {
  // ✅ Allow only POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
    });
  }

  try {
    const uri = process.env.MONGODB_URI;

    // ❗ Check ENV inside handler (prevents crash)
    if (!uri) {
      return res.status(500).json({
        success: false,
        message: "MONGODB_URI is missing",
      });
    }

    // ✅ Create / reuse client safely
    if (!cachedClient) {
      cachedClient = new MongoClient(uri);
      await cachedClient.connect();
      console.log("✅ MongoDB Connected");
    }

    const db = cachedClient.db("rcmstore");
    const orders = db.collection("orders");

    const orderData = req.body;

    // ❗ Validate data
    if (!orderData || !orderData.orderId) {
      return res.status(400).json({
        success: false,
        message: "Invalid order data",
      });
    }

    await orders.insertOne({
      ...orderData,
      createdAt: new Date(),
    });

    return res.status(200).json({
      success: true,
    });

  } catch (err) {
    console.error("❌ FULL ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
}