import admin from 'firebase-admin';
import { db } from './init-firebase.js';

export default async function handler(req, res) {
  // 1. Cấu hình CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  // 2. Xác thực Token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Thiếu token xác thực!' });
  }

  let uid = '';
  try {
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }

  const ATTENDANCE_REWARD = 500; // Số tiền thưởng điểm danh: 500 VNĐ

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('Tài khoản không tồn tại.');
      }

      const userData = userDoc.data();
      const lastAttendance = userData.lastAttendance ? userData.lastAttendance.toDate() : null;
      const now = new Date();
      
      // Kiểm tra xem hôm nay đã điểm danh chưa (theo giờ Việt Nam hoặc UTC tuỳ chỉnh)
      if (lastAttendance && 
          lastAttendance.getDate() === now.getDate() && 
          lastAttendance.getMonth() === now.getMonth() && 
          lastAttendance.getFullYear() === now.getFullYear()) {
        throw new Error('Bạn đã điểm danh hôm nay rồi. Hãy quay lại vào ngày mai nhé!');
      }

      const currentBalance = userData.balance || 0;
      const newBalance = currentBalance + ATTENDANCE_REWARD;

      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(ATTENDANCE_REWARD),
        lastAttendance: admin.firestore.FieldValue.serverTimestamp()
      });

      return { newBalance, reward: ATTENDANCE_REWARD };
    });

    return res.status(200).json({
      success: true,
      message: `Điểm danh thành công! Bạn nhận được ${result.reward} VNĐ.`,
      newBalance: result.newBalance
    });

  } catch (err) {
    console.error('Lỗi daily-attendance:', err);
    const isClientError = err.message.includes('điểm danh') || err.message.includes('tồn tại');
    return res.status(isClientError ? 400 : 500).json({ error: err.message || 'Lỗi hệ thống.' });
  }
}
