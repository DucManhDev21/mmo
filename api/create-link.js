import admin from 'firebase-admin';
import { db } from './init-firebase.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Thiếu token xác thực!' });
  }

  let uid = '';
  try {
    const decodedToken = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    uid = decodedToken.uid;
  } catch (err) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }

  try {
    // Tạo token ngẫu nhiên 16 bytes (32 ký tự hex)
    const sessionToken = crypto.randomBytes(16).toString('hex');
    
    // Lưu vào collection 'sessions'
    await db.collection('sessions').add({
      uid: uid,
      token: sessionToken,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Trả về link trang đích kèm token
    const targetUrl = `https://nhanmathuong-nine.vercel.app/?token=${sessionToken}`;

    return res.status(200).json({
      success: true,
      link: targetUrl
    });

  } catch (err) {
    console.error('Lỗi create-link:', err);
    return res.status(500).json({ error: 'Không thể tạo liên kết lúc này.' });
  }
}
