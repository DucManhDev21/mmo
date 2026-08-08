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

  const { uid, method, account, name, amount, recaptchaToken } = req.body || {};

  // 2. Validate & làm sạch dữ liệu đầu vào
  if (!uid) {
    return res.status(400).json({ error: 'Thiếu thông tin tài khoản (UID). Vui lòng đăng nhập lại.' });
  }

  const cleanMethod = method?.trim();
  const cleanAccount = account?.trim();
  const cleanName = name?.trim().toUpperCase();
  const withdrawAmount = Number(amount);

  if (!cleanMethod || !cleanAccount || !cleanName || !amount) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin rút tiền!' });
  }

  if (!Number.isInteger(withdrawAmount) || withdrawAmount < 10000) {
    return res.status(400).json({ error: 'Số tiền rút không hợp lệ. Tối thiểu là 10.000 VNĐ và phải là số nguyên.' });
  }

  // 3. Xác minh reCAPTCHA chuẩn Google API
  if (process.env.RECAPTCHA_SECRET_KEY) {
    if (!recaptchaToken) {
      return res.status(400).json({ error: 'Vui lòng xác minh reCAPTCHA trước khi rút tiền!' });
    }
    try {
      const captchaRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: recaptchaToken
        }).toString()
      });
      const captchaData = await captchaRes.json();

      if (!captchaData.success) {
        return res.status(400).json({ error: 'Xác minh reCAPTCHA thất bại, vui lòng thử lại!' });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Lỗi xác minh reCAPTCHA phía Server.' });
    }
  }

  try {
    // 4. Chạy Transaction: Kiểm tra số dư, trừ tiền & tạo lệnh rút
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('Tài khoản người dùng không tồn tại.');
      }

      const currentBalance = userDoc.data().balance || 0;

      if (currentBalance < withdrawAmount) {
        throw new Error(`Số dư không đủ! Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VNĐ.`);
      }

      // Trừ tiền tài khoản người dùng
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(-withdrawAmount)
      });

      // Tạo Document trong collection withdraw_requests cho Admin duyệt
      const withdrawRef = db.collection('withdraw_requests').doc();
      transaction.set(withdrawRef, {
        uid: uid,
        email: userDoc.data().email || '',
        method: cleanMethod,
        account: cleanAccount,
        name: cleanName,
        amount: withdrawAmount,
        status: 'PENDING',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        newBalance: currentBalance - withdrawAmount
      };
    });

    // 5. Phản hồi kết quả về Client
    return res.status(200).json({
      success: true,
      message: `Lệnh rút ${withdrawAmount.toLocaleString('vi-VN')} VNĐ đã được chuyển tới hệ thống thành công!`,
      newBalance: result.newBalance
    });

  } catch (err) {
    console.error('Lỗi withdraw:', err);
    const errorMessage = err.message || 'Lỗi xử lý phía Server';
    const isClientError = ['không tồn tại', 'không đủ', 'không hợp lệ'].some(msg => errorMessage.includes(msg));

    return res.status(isClientError ? 400 : 500).json({
      error: errorMessage
    });
  }
}
