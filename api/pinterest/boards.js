const https = require('https');

function callPinterestApi(endpointPath, accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.pinterest.com',
      path: endpointPath,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PinterestToPlateApp/1.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const token = body?.token;
    if (!token) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    const apiRes = await callPinterestApi('/v5/boards?page_size=50', token.trim());
    if (apiRes.status !== 200) {
      return res.status(apiRes.status).json({ error: apiRes.data?.message || 'Pinterest API error', details: apiRes.data });
    }

    const boards = (apiRes.data.items || []).map(b => ({
      id: b.id,
      name: b.name,
      pin_count: b.pin_count,
      description: b.description
    }));

    return res.status(200).json({ boards });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
