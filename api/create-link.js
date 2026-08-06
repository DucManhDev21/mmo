import { db } from './init-firebase.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  // 1. Cấu hình CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Hãy dùng phương thức POST.' });
  }

  try {
    if (!process.env.LINK4M_API_KEY) {
      throw new Error('Thiếu biến môi trường LINK4M_API_KEY trên Vercel');
    }

    // 2. Tạo Token phiên làm việc (Hết hạn sau 10 phút)
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await db.collection('sessions').doc(token).set({
      used: false,
      expiresAt: expiresAt,
      createdAt: Date.now()
    });

    // 3. Tạo URL đích gửi tới trang nhanma
    const destUrl = `https://nhanmathuong.vercel.app?token=${token}`;

    // 4. Gọi API rút gọn link (Phiên bản v2 chính xác của Link4m)
    const link4mRes = await fetch(
      `https://link4m.co/api-shorten/v2?api=${process.env.LINK4M_API_KEY}&url=${encodeURIComponent(destUrl)}`
    );

    if (!link4mRes.ok) {
      throw new Error(`Link4m API phản hồi lỗi status: ${link4mRes.status}`);
    }

    const data = await link4mRes.json();
    const shortUrl = data.shortenedUrl || data.url || data.shortened_url || (typeof data === 'string' ? data : null);

    if (!shortUrl) {
      throw new Error('Không nhận được link rút gọn hợp lệ từ Link4m');
    }

    return res.status(200).json({ url: shortUrl });

  } catch (err) {
    console.error('Lỗi create-link:', err);
    return res.status(500).json({ 
      error: 'Lỗi khởi tạo nhiệm vụ phía Server', 
      message: err.message 
    });
  }
}
