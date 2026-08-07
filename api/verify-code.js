import admin from 'firebase-admin';
import { db } from './init-firebase.js';

export default async function handler(req, res) {
  // 1. Cấu hình CORS Header
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Hãy dùng phương thức POST.' });
  }

  const { code, uid } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: 'Vui lòng nhập mã xác nhận từ trang đích!' });
  }
  if (!uid) {
    return res.status(400).json({ error: 'Thiếu thông tin tài khoản (UID). Vui lòng đăng nhập lại.' });
  }

  try {
    const cleanCode = code.trim().toUpperCase();
    const rewardAmount = 200; // Thưởng 200 VNĐ mỗi lần vượt link thành công

    // 2. Sử dụng Transaction để chống Race-Condition (ngăn spam request xác thực cùng 1 mã)
    const newBalance = await db.runTransaction(async (transaction) => {
      const codeRef = db.collection('codes').doc(cleanCode);
      const userRef = db.collection('users').doc(uid);

      const codeDoc = await transaction.get(codeRef);
      const userDoc = await transaction.get(userRef);

      // Kiểm tra sự tồn tại của mã
      if (!codeDoc.exists) {
        throw new Error('Mã không tồn tại trên hệ thống!');
      }

      const codeData = codeDoc.data();

      // Kiểm tra xem mã đã dùng chưa
      if (codeData.isUsed) {
        throw new Error('Mã này đã được sử dụng trước đó rồi!');
      }

      // Kiểm tra thời hạn mã
      if (codeData.expiresAt && Date.now() > codeData.expiresAt) {
        throw new Error('Mã xác nhận đã hết hạn sử dụng!');
      }

      // Kiểm tra sự tồn tại của user
      if (!userDoc.exists) {
        throw new Error('Tài khoản người dùng không tồn tại trên hệ thống.');
      }

      const currentBalance = userDoc.data().balance || 0;
      const updatedBalance = currentBalance + rewardAmount;

      // Đánh dấu mã đã dùng
      transaction.update(codeRef, { 
        isUsed: true, 
        usedBy: uid, 
        usedAt: Date.now() 
      });

      // Tăng số dư tài khoản an toàn tuyệt đối bằng FieldValue.increment
      transaction.update(userRef, { 
        balance: admin.firestore.FieldValue.increment(rewardAmount) 
      });

      return updatedBalance;
    });

    return res.status(200).json({ 
      success: true, 
      message: `Xác nhận mã thành công! Đã cộng +${rewardAmount} VNĐ vào ví.`,
      newBalance: newBalance
    });

  } catch (err) {
    console.error('Lỗi xác minh mã:', err);

    // Xử lý thông báo lỗi từ Transaction
    const errorMessage = err.message || 'Lỗi xử lý phía Server';
    const isClientError = [
      'Mã không tồn tại',
      'đã được sử dụng',
      'đã hết hạn',
      'Tài khoản người dùng không tồn tại'
    ].some(msg => errorMessage.includes(msg));

    return res.status(isClientError ? 400 : 500).json({ 
      error: errorMessage 
    });
  }
}
