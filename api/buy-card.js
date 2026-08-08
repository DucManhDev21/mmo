import admin from 'firebase-admin';
import { db } from './init-firebase.js';

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
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    uid = decodedToken.uid;
  } catch (err) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }

  const body = req.body || {};
  const telecom = body.telecom || body.network;
  const cardValue = Number(body.value !== undefined ? body.value : body.amount);

  if (!telecom || !cardValue) {
    return res.status(400).json({ error: 'Vui lòng chọn nhà mạng và mệnh giá.' });
  }
  
  if (![10000, 20000, 50000, 100000].includes(cardValue)) {
    return res.status(400).json({ error: 'Mệnh giá thẻ không hợp lệ.' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 1. Kiểm tra tài khoản và số dư
      const userRef = db.collection('users').doc(uid);
      const userDoc = await transaction.get(userRef);

      if (!userDoc.exists) throw new Error('Tài khoản không tồn tại.');

      const currentBalance = userDoc.data().balance || 0;
      if (currentBalance < cardValue) {
        throw new Error(`Số dư không đủ. Bạn cần ${cardValue.toLocaleString()} VNĐ.`);
      }

      // 2. Lấy thẻ từ `card_warehouse` (khớp hoàn toàn với lệnh /add của bot.js)[span_2](start_span)[span_2](end_span)
      const stockQuery = db.collection('card_warehouse')
        .where('network', '==', telecom.toUpperCase())
        .where('amount', '==', cardValue)
        .where('isUsed', '==', false)
        .limit(1);

      const stockSnapshot = await transaction.get(stockQuery);
      if (stockSnapshot.empty) {
        throw new Error(`Kho hiện đã hết thẻ ${telecom} mệnh giá ${cardValue.toLocaleString()}đ. Vui lòng thử lại sau!`);
      }

      const cardDoc = stockSnapshot.docs[0];
      const cardData = cardDoc.data();

      // 3. Trừ tiền người dùng
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(-cardValue)
      });

      // 4. Đánh dấu thẻ đã được dùng (kích hoạt onSnapshot trong bot.js tự động gửi thông báo cho Admin)[span_3](start_span)[span_3](end_span)
      transaction.update(cardDoc.ref, {
        isUsed: true,
        usedBy: uid,
        usedAt: Date.now()
      });

      // 5. Lưu lịch sử giao dịch vào `card_requests`
      const requestRef = db.collection('card_requests').doc();
      transaction.set(requestRef, {
        uid: uid,
        email: userDoc.data().email || '',
        telecom: telecom,
        value: cardValue,
        serial: cardData.serial,
        pin: cardData.pin,
        status: 'SUCCESS',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { 
        newBalance: currentBalance - cardValue, 
        serial: cardData.serial,
        pin: cardData.pin
      };
    });

    // Trả kết quả Seri và PIN về cho Frontend hiển thị
    return res.status(200).json({
      success: true,
      message: `Mua thẻ ${telecom} ${cardValue.toLocaleString()}đ thành công!`,
      newBalance: result.newBalance,
      card: {
        serial: result.serial,
        pin: result.pin
      }
    });

  } catch (err) {
    const isClientError = err.message.includes('không đủ') || err.message.includes('tồn tại') || err.message.includes('hết thẻ');
    return res.status(isClientError ? 400 : 500).json({ error: err.message || 'Lỗi Server.' });
  }
}
