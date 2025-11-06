const cloudinary = require('cloudinary').v2;

// Cloudinary 설정
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = async (req, res) => {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // 인증 확인 (Firebase Auth 토큰 검증)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: '인증이 필요합니다.' });
      return;
    }

    // Firebase Admin SDK로 토큰 검증
    const admin = require('firebase-admin');
    
    // Firebase Admin 초기화 (한 번만)
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 요청 본문 확인
    const { publicId } = req.body;
    if (!publicId) {
      res.status(400).json({ error: 'publicId가 필요합니다.' });
      return;
    }

    // 보안: 사용자가 자신의 이미지만 삭제할 수 있도록 확인
    if (!publicId.startsWith(`users/${uid}/`)) {
      res.status(403).json({ error: '권한이 없습니다.' });
      return;
    }

    // Cloudinary에서 이미지 삭제
    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true, // CDN 캐시도 무효화
    });

    if (result.result === 'ok') {
      res.status(200).json({
        success: true,
        message: '이미지가 삭제되었습니다.',
        result,
      });
    } else {
      res.status(400).json({
        error: '이미지 삭제에 실패했습니다.',
        result,
      });
    }
  } catch (error) {
    console.error('이미지 삭제 오류:', error);
    res.status(500).json({
      error: '서버 오류가 발생했습니다.',
      message: error.message,
    });
  }
};
