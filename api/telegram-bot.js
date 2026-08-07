import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');
  
  const { message } = req.body;
  if (!message || !message.text) return res.status(200).send('OK');

  const chatId = message.chat.id.toString();
  const adminId = process.env.ADMIN_CHAT_ID; // Lấy ID admin từ biến môi trường trên Vercel

  // Kiểm tra nếu không phải Admin gửi lệnh thì bỏ qua
  if (adminId && chatId !== adminId) {
    return res.status(200).json({ ok: true });
  }

  const text = message.text.trim();
  
  // Cú pháp: /add [NHÀ MẠNG] [MỆNH GIÁ] [PIN] [SERIAL]
  if (text.startsWith('/add')) {
    const parts = text.split(' ');
    if (parts.length < 5) {
      return res.status(200).json({ ok: true });
    }

    const network = parts[1].toUpperCase();
    const amount = parseInt(parts[2], 10);
    const pin = parts[3];
    const serial = parts[4];

    try {
      // Lưu thẻ vào kho trên Firestore
      await db.collection('card_warehouse').add({
        network,
        amount,
        pin,
        serial,
        isUsed: false,
        createdAt: new Date().toISOString()
      });

      // (Tùy chọn) Gửi thông báo lại Telegram xác nhận đã thêm thành công
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ Đã nạp thành công thẻ ${network} - ${amount.toLocaleString('vi-VN')}đ vào kho!`
          })
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  return res.status(200).json({ ok: true });
}
