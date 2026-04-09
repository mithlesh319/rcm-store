import crypto from "crypto";

export default function handler(req, res) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body)
      .digest("hex");

    res.json({ success: expectedSignature === razorpay_signature });
  } catch {
    res.status(500).json({ success: false });
  }
}