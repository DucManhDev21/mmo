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

  const { uid, network, amount, recaptchaToken } = req.body || {};

  // 2. Validate dữ liệu đầu vào
  if (!uid) {
    return res.status(400).json({ error: 'Thiếu thông tin tài khoản (UID). Vui lòng đăng nhập lại.' });
  }
  if (!network || !amount) {
    return res.status(400).json({ error: 'Vui lòng chọn nhà mạng và mệnh giá thẻ!' });
  }

  const cardAmount = Number(amount);
  if (isNaN(cardAmount) || cardAmount <= 0) {
    return res.status(400).json({ error: 'Mệnh giá thẻ không hợp lệ.' });
  }

  // 3. Xác minh reCAPTCHA (nếu có cấu hình)
  if (process.env.RECAPTCHA_SECRET_KEY) {
    if (!recaptchaToken) {
      return res.status(400).json({ error: 'Vui lòng xác minh reCAPTCHA trước khi đổi thẻ!' });
    }
    try {
      const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
      const captchaRes = await fetch(verifyUrl, { method: 'POST' });
      const captchaData = await captchaRes.json();

      if (!captchaData.success) {
        return res.status(400).json({ error: 'Xác minh reCAPTCHA thất bại, vui lòng thử lại!' });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Lỗi xác minh reCAPTCHA phía Server' });
    }
  }

  try {
    // 4. Chạy Transaction: Kiểm tra số dư & Trừ tiền an toàn
    const result = await db.runTransaction(async (transaction) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) {
        throw new Error('Tài khoản người dùng không tồn tại.');
      }

      const currentBalance = userDoc.data().balance || 0;

      if (currentBalance < cardAmount) {
        throw new Error(`Số dư không đủ! Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VNĐ.`);
      }

      // Giả lập/Tạo dữ liệu Mã thẻ & Seri (Nếu tích hợp API đối tác đổi thẻ thật thì gọi HTTP Request tại đây)
      const pinCode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
      const serialCode = '84' + Math.floor(1000000000 + Math.random() * 9000000000).toString();

      // Trừ tiền tài khoản người dùng
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(-cardAmount)
      });

      // Lưu lịch sử giao dịch mua thẻ vào collection 'transactions'
      const txRef = db.collection('transactions').doc();
      transaction.set(txRef, {
        uid: uid,
        type: 'BUY_CARD',
        network: network.toUpperCase(),
        amount: cardAmount,
        pin: pinCode,
        serial: serialCode,
        status: 'SUCCESS',
        createdAt: Date.now()
      });

      return {
        newBalance: currentBalance - cardAmount,
        pin: pinCode,
        serial: serialCode
      };
    });

    // 5. Phản hồi thành công về Client
    return res.status(200).json({
      success: true,
      message: `Đổi thẻ ${network.toUpperCase()} ${cardAmount.toLocaleString('vi-VN')} VNĐ thành công!`,
      newBalance: result.newBalance,
      card: {
        network: network.toUpperCase(),
        amount: cardAmount,
        pin: result.pin,
        serial: result.serial
      }
    });

  } catch (err) {
    console.error('Lỗi buy-card:', err);
    const errorMessage = err.message || 'Lỗi xử lý phía Server';
    const isClientError = ['không tồn tại', 'không đủ', 'không hợp lệ'].some(msg => errorMessage.includes(msg));

    return res.status(isClientError ? 400 : 500).json({
      error: errorMessage
    });
  }
}
