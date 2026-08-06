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

    // 1. Tạo Token phiên & Mã xác minh 6 chữ số
    const token = crypto.randomBytes(16).toString('hex');
    const secretCode = 'TDM' + Math.floor(100000 + Math.random() * 900000); // Ví dụ: TDM654321
    const expiresAt = Date.now() + 10 * 60 * 1000; // Hết hạn sau 10 phút

    // 2. Ghi Mã vào collection 'codes' để verify-code.js kiểm tra
    await db.collection('codes').doc(secretCode).set({
      isUsed: false,
      expiresAt: expiresAt,
      createdAt: Date.now(),
      token: token
    });

    // 3. Đưa code vào tham số URL để trang đích hiển thị cho người dùng copy
    const destUrl = `https://nhanmathuong-nine.vercel.app/index.html?code=${secretCode}`;

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
