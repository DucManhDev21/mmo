export default async function handler(req, res) {
    // Cấu hình CORS Header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Chỉ chấp nhận phương thức POST' });
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
        }

        const url = body?.url;
        if (!url) {
            return res.status(400).json({ success: false, message: 'Thiếu URL gốc' });
        }

        const apiToken = process.env.LINK4M_API_TOKEN;
        if (!apiToken) {
            return res.status(500).json({ 
                success: false, 
                message: 'Chưa cấu hình biến LINK4M_API_TOKEN trên Vercel' 
            });
        }

        const targetApi = `https://link4m.co/api-shorten?api=${encodeURIComponent(apiToken)}&url=${encodeURIComponent(url)}`;
        let data;

        try {
            // Thử gọi trực tiếp Link4M từ Server Backend
            const response = await fetch(targetApi, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            
            const rawText = await response.text();
            data = JSON.parse(rawText);
        } catch (err) {
            // Nếu bị Cloudflare chặn IP Vercel, Backend sẽ tự động gọi qua Proxy phụ
            const proxyApi = `https://corsproxy.io/?${encodeURIComponent(targetApi)}`;
            const proxyResponse = await fetch(proxyApi);
            data = await proxyResponse.json();
        }

        const shortUrl = data.shortenedUrl || data.url || data.shortedUrl;

        if (data.status === 'success' || shortUrl) {
            return res.status(200).json({ success: true, shortUrl: shortUrl });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: data.message || 'Lỗi từ Link4M (Kiểm tra lại Token hoặc Link nhập vào)' 
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: 'Lỗi máy chủ Backend: ' + error.message 
        });
    }
}
