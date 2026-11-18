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

function guessCategory(title = '', desc = '') {
  const text = (title + ' ' + desc).toLowerCase();
  if (text.includes('soup') || text.includes('stew') || text.includes('broth') || text.includes('chowder')) return 'Soups & Stews';
  if (text.includes('salad') || text.includes('tofu') || text.includes('vegan') || text.includes('spinach') || text.includes('veggie')) return 'Healthy & Veggie';
  if (text.includes('bite') || text.includes('dip') || text.includes('snack') || text.includes('wing') || text.includes('marinade')) return 'Appetizers & Bites';
  if (text.includes('quick') || text.includes('15 min') || text.includes('air fryer') || text.includes('salmon') || text.includes('10 min')) return 'Quick & Easy';
  return 'Comfort Food';
}

function guessTag(title = '', desc = '') {
  const text = (title + ' ' + desc).toLowerCase();
  if (text.includes('protein')) return 'High Protein';
  if (text.includes('air fryer')) return 'Air Fryer';
  if (text.includes('one pot') || text.includes('one-pot')) return 'One-Pot';
  if (text.includes('comfort') || text.includes('creamy')) return 'Comfort Food';
  if (text.includes('budget') || text.includes('cheap')) return 'Budget Friendly';
  return 'Crowd Favorite';
}

function extractIngredientsFromText(text = '', title = '') {
  const keywords = [
    { word: 'chicken', name: 'Chicken Breast Fillets', qty: '500g', aisle: 'Meat & Poultry', search: 'chicken breast fillets' },
    { word: 'beef', name: 'Lean Beef Steak Mince', qty: '500g', aisle: 'Meat & Poultry', search: 'beef mince' },
    { word: 'salmon', name: 'Fresh Salmon Fillets', qty: '2 fillets', aisle: 'Meat & Poultry', search: 'salmon fillets' },
    { word: 'shrimp', name: 'Raw King Prawns', qty: '180g pack', aisle: 'Meat & Poultry', search: 'king prawns' },
    { word: 'prawn', name: 'Raw King Prawns', qty: '180g pack', aisle: 'Meat & Poultry', search: 'king prawns' },
    { word: 'cheese', name: 'Mature Cheddar Cheese', qty: '200g', aisle: 'Dairy & Chilled', search: 'cheddar cheese' },
    { word: 'parmesan', name: 'Grated Parmesan', qty: '60g', aisle: 'Dairy & Chilled', search: 'parmesan cheese' },
    { word: 'cream', name: 'Double Cream', qty: '300ml pot', aisle: 'Dairy & Chilled', search: 'double cream' },
    { word: 'butter', name: 'Unsalted Butter', qty: '250g', aisle: 'Dairy & Chilled', search: 'unsalted butter' },
    { word: 'garlic', name: 'Fresh Garlic', qty: '1 bulb', aisle: 'Fresh Produce', pantry: true, search: 'fresh garlic' },
    { word: 'onion', name: 'Brown Onions', qty: '3 pack', aisle: 'Fresh Produce', pantry: true, search: 'brown onions' },
    { word: 'rice', name: 'Jasmine Fragrant Rice', qty: '1kg bag', aisle: 'Food Cupboard', search: 'jasmine rice' },
    { word: 'pasta', name: 'Penne or Rigatoni Pasta', qty: '500g pack', aisle: 'Food Cupboard', search: 'pasta 500g' },
    { word: 'potato', name: 'Baking Potatoes', qty: '4 pack', aisle: 'Fresh Produce', search: 'baking potatoes' },
    { word: 'tortellini', name: 'Fresh Tortellini', qty: '250g pack', aisle: 'Dairy & Chilled', search: 'fresh tortellini' },
    { word: 'spinach', name: 'Baby Spinach Bag', qty: '150g', aisle: 'Fresh Produce', search: 'baby spinach' },
    { word: 'pepper', name: 'Mixed Bell Peppers', qty: '3 pack', aisle: 'Fresh Produce', search: 'mixed bell peppers' },
    { word: 'tomato', name: 'Chopped Tomatoes Can', qty: '1 can', aisle: 'Food Cupboard', pantry: true, search: 'chopped tomatoes' },
    { word: 'oil', name: 'Extra Virgin Olive Oil', qty: '500ml', aisle: 'Food Cupboard', pantry: true, search: 'olive oil' },
    { word: 'honey', name: 'Clear Runny Honey', qty: '340g jar', aisle: 'Food Cupboard', pantry: true, search: 'runny honey' }
  ];

  const fullText = (title + ' ' + text).toLowerCase();
  const found = [];
  const seen = new Set();

  for (const k of keywords) {
    if (fullText.includes(k.word) && !seen.has(k.name)) {
      found.push({
        name: k.name,
        qty: k.qty,
        aisle: k.aisle,
        pantry: !!k.pantry,
        search: k.search
      });
      seen.add(k.name);
    }
  }

  if (found.length === 0) {
    found.push(
      { name: 'Fresh Produce & Seasonings', qty: 'As needed', aisle: 'Fresh Produce', pantry: false, search: title.slice(0, 30) },
      { name: 'Pantry Essentials (Salt, Oil, Spices)', qty: 'To taste', aisle: 'Food Cupboard', pantry: true, search: 'olive oil' }
    );
  }

  return found;
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
    const { token, boardId } = body || {};
    if (!token || !boardId) {
      return res.status(400).json({ error: 'token and boardId are required' });
    }

    let allPins = [];
    let bookmark = null;
    let page = 0;

    do {
      page++;
      let endpoint = `/v5/boards/${boardId}/pins?page_size=250`;
      if (bookmark) endpoint += `&bookmark=${encodeURIComponent(bookmark)}`;

      const apiRes = await callPinterestApi(endpoint, token.trim());
      if (apiRes.status !== 200) {
        throw new Error(apiRes.data?.message || `Pinterest returned status ${apiRes.status}`);
      }

      const items = apiRes.data.items || [];
      allPins = allPins.concat(items);
      bookmark = apiRes.data.bookmark;
    } while (bookmark && page < 5);

    const recipes = allPins.map((pin, i) => {
      const title = pin.title || pin.grid_title || `Saved Pin #${i + 1}`;
      const image = pin.media?.images?.['600x']?.url || pin.media?.images?.originals?.url || 'https://i.pinimg.com/736x/ec/1a/44/ec1a442062e322cd3ce7765206ee147a.jpg';
      const desc = pin.description || '';

      return {
        id: `pin_${pin.id || i}`,
        title: title.length > 70 ? title.slice(0, 67) + '...' : title,
        creator: pin.link ? (new URL(pin.link).hostname.replace('www.', '')) : 'Pinterest Saved',
        category: guessCategory(title, desc),
        tag: guessTag(title, desc),
        prepTime: '25 mins',
        servings: 4,
        imageUrl: image,
        ingredients: extractIngredientsFromText(desc, title),
        instructions: desc ? [desc] : ['Check original pin for step-by-step video instructions.']
      };
    });

    return res.status(200).json({
      success: true,
      pinsFetched: allPins.length,
      recipes: recipes
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
