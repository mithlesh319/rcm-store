import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

let client;
let clientPromise;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export default async function handler(req, res) {
  try {
    // ✅ Allow only POST
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        message: "Method not allowed"
      });
    }

    // ✅ FIX: Get body properly
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const { orderId } = body || {};

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID required"
      });
    }

    const client = await clientPromise;
    const db = client.db("rcmstore");
    const orders = db.collection("orders");

    // ✅ Find order
    const order = await orders.findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    return res.status(200).json({
      success: true,
      order
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
}