import { db } from './init-firebase.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000; // Hết hạn sau 10 phút

    await db.collection('sessions').doc(token).set({
      used: false,
      expiresAt: expiresAt,
    });

    const destUrl = `https://nhanmathuong.vercel.app?token=${token}`;
    const link4mRes = await fetch(`https://link4m.co/api-pack/process?api=${process.env.LINK4M_API_KEY}&url=${encodeURIComponent(destUrl)}`);
    const data = await link4mRes.json();

    return res.status(200).json({ url: data.shortenedUrl || data.url || data });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khởi tạo nhiệm vụ phía Server' });
  }
}
