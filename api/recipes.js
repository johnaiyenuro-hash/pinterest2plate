const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const filePath = path.join(process.cwd(), 'recipes.json');
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return res.status(200).json(JSON.parse(data));
    }
    const publicPath = path.join(process.cwd(), 'public', 'recipes.json');
    if (fs.existsSync(publicPath)) {
      const data = fs.readFileSync(publicPath, 'utf-8');
      return res.status(200).json(JSON.parse(data));
    }
  } catch (e) {
    console.error('Error reading recipes:', e);
  }

  // Fallback
  return res.status(200).json([]);
};
