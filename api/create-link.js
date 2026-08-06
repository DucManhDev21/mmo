import { db } from './init-firebase.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  // 1. Cấu hình CORS để tránh bị chặn khi gọi API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Xử lý request OPTIONS (Preflight check của trình duyệt)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Chặn các method không phải POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Hãy dùng phương thức POST.' });
  }

  try {
    // Kiểm tra biến môi trường LINK4M_API_KEY
    if (!process.env.LINK4M_API_KEY) {
      throw new Error('Thiếu biến môi trường LINK4M_API_KEY trên Vercel');
    }

    // 3. Tạo Token phiên làm việc (Hết hạn sau 10 phút)
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Lưu token vào Firestore
    await db.collection('sessions').doc(token).set({
      used: false,
      expiresAt: expiresAt,
      createdAt: Date.now()
    });

    // 4. Tạo URL đích gửi tới trang nhanma
    const destUrl = `https://nhanmathuong.vercel.app?token=${token}`;

    // Gọi API rút gọn link của Link4m
    const link4mRes = await fetch(
      `https://link4m.co/api-pack/process?api=${process.env.LINK4M_API_KEY}&url=${encodeURIComponent(destUrl)}`
    );

    if (!link4mRes.ok) {
      throw new Error(`Link4m API phản hồi lỗi status: ${link4mRes.status}`);
    }

    const data = await link4mRes.json();
    const shortUrl = data.shortenedUrl || data.url || (typeof data === 'string' ? data : null);

    if (!shortUrl) {
      throw new Error('Không nhận được link rút gọn hợp lệ từ Link4m');
    }

    return res.status(200).json({ url: shortUrl });

  } catch (err) {
    console.error('Lỗi create-link:', err);
    // Trả về lý do lỗi chi tiết để xử lý sự cố nhanh chóng
    return res.status(500).json({ 
      error: 'Lỗi khởi tạo nhiệm vụ phía Server', 
      message: err.message 
    });
  }
}
