import { db } from './init-firebase.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.LINK4M_API_KEY) {
      throw new Error('Thiếu biến môi trường LINK4M_API_KEY');
    }

    // 1. Tạo Token phiên xác thực
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000; // Hết hạn sau 10 phút

    // 2. Lưu thông tin phiên vào collection 'sessions'
    await db.collection('sessions').doc(token).set({
      used: false,
      createdAt: Date.now(),
      expiresAt: expiresAt
    });

    // 3. Chuẩn hóa URL trang đích chứa ?token= (đúng định dạng index.html yêu cầu)
    const destUrl = `https://nhanmathuong-nine.vercel.app/index.html?token=${token}`;

    // 4. Rút gọn link bằng Link4m
    const link4mRes = await fetch(
      `https://link4m.co/api-shorten/v2?api=${process.env.LINK4M_API_KEY}&url=${encodeURIComponent(destUrl)}`
    );

    if (!link4mRes.ok) throw new Error(`Link4m API lỗi: ${link4mRes.status}`);

    const data = await link4mRes.json();
    const shortUrl = data.shortenedUrl || data.url || data.shortened_url;

    if (!shortUrl) throw new Error('Không nhận được link rút gọn từ Link4m');

    return res.status(200).json({ url: shortUrl });

  } catch (err) {
    console.error('Lỗi create-link:', err);
    return res.status(500).json({ error: 'Lỗi Server', message: err.message });
  }
}
