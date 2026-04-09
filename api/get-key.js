export default function handler(req, res) {
  res.json({ key: process.env.RAZORPAY_KEY_ID });
}