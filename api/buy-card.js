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

      // 2. Tìm thẻ trong kho (collection: card_stock) còn trống
      const stockQuery = db.collection('card_stock')
        .where('telecom', '==', telecom)
        .where('value', '==', String(cardValue)) // Đã sửa lỗi cú pháp và chuyển thành chuỗi để khớp Firestore
        .where('status', '==', 'AVAILABLE')
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

      // 4. Cập nhật trạng thái thẻ trong kho thành 'SOLD' và gán cho người mua
      transaction.update(cardDoc.ref, {
        status: 'SOLD',
        soldTo: uid,
        soldAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Lưu lịch sử giao dịch mua thẻ
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
        email: userDoc.data().email,
        serial: cardData.serial,
        pin: cardData.pin
      };
    });

    // Thông báo Telegram (Tuỳ chọn)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const teleMsg = `📱 *MUA THẺ CÀO THÀNH CÔNG*\n👤 UID: \`${uid}\`\n📧 Email: ${result.email}\n🏷️ Nhà mạng: ${telecom}\n💰 Mệnh giá: ${cardValue.toLocaleString()} VNĐ\n🔢 Seri: \`${result.serial}\`\n🔑 Mã thẻ: \`${result.pin}\``;
      fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: teleMsg, parse_mode: 'Markdown' })
      }).catch(console.error);
    }

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
