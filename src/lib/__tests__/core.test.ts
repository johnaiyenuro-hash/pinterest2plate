import { describe, expect, it } from 'vitest';
import { consolidateBasket, formatScaledIngredientQty } from '../consolidate';
import { FOOD_TABS } from '../foodTags';
import { decryptToken, encryptToken } from '../pinterestOAuth';
import { mapPinterestV5Pin, parseImportTarget } from '../pinterestResolver';
import { SEED_RECIPES } from '../seedRecipes';

describe('consolidateBasket', () => {
  it('sums compatible mass, count, and spoon units cleanly across recipes', () => {
    const basket = consolidateBasket(SEED_RECIPES, ['sliders', 'fondant_leeks', 'crispy_salmon_bites']);
    expect(basket.recipesCount).toBe(3);

    const dairy = basket.aisles['Dairy & Chilled'] || [];
    const butter = dairy.find((i) => i.ukSearchQuery === 'unsalted butter');
    expect(butter?.combinedQty).toBe('185g');
    expect(butter?.fromRecipes).toHaveLength(2);

    const produce = basket.aisles['Fresh Produce'] || [];
    const garlic = produce.find((i) => i.ukSearchQuery === 'fresh garlic');
    expect(garlic?.combinedQty).toBe('9 cloves');

    const cupboard = basket.aisles['Food Cupboard'] || [];
    const oil = cupboard.find((i) => i.ukSearchQuery === 'olive oil');
    expect(oil?.combinedQty).toBe('3 tbsp');
  });

  it('promotes >= 1000g to kg and respects serving multipliers', () => {
    const basket = consolidateBasket(SEED_RECIPES, ['sliders', 'marry_me_chicken_soup']);
    const meat = basket.aisles['Meat & Poultry'] || [];
    const chicken = meat.find((i) => i.ukSearchQuery === 'chicken breast fillets');
    expect(chicken?.combinedQty).toBe('1.1kg');

    const scaledBasket = consolidateBasket(SEED_RECIPES, ['sliders'], { sliders: 8 });
    const doubledChicken = (scaledBasket.aisles['Meat & Poultry'] || []).find(
      (i) => i.ukSearchQuery === 'chicken breast fillets',
    );
    expect(doubledChicken?.combinedQty).toBe('1.2kg');
  });

  it('scales individual ingredient display quantities cleanly', () => {
    const salmon = SEED_RECIPES.find((r) => r.id === 'crispy_salmon_bites')!;
    const fillets = salmon.ingredients[0];
    expect(formatScaledIngredientQty(fillets, 2)).toBe('800g');
    expect(formatScaledIngredientQty(fillets, 0.5)).toBe('200g');
  });
});

describe('pinterestResolver', () => {
  it('parses Pinterest board URLs, shorthand handles, single pins, and blog URLs', () => {
    const board = parseImportTarget('https://uk.pinterest.com/shalom_x/food/');
    expect(board.kind).toBe('board');
    expect(board.boardSlug).toBe('shalom_x/food');

    const shorthand = parseImportTarget('@shalom_x/food');
    expect(shorthand.kind).toBe('board');
    expect(shorthand.boardId).toBe('board_shalom_x_food');

    const pin = parseImportTarget('https://www.pinterest.com/pin/9876543210/');
    expect(pin.kind).toBe('pin');
    expect(pin.pinId).toBe('9876543210');

    const blog = parseImportTarget('https://www.bbcgoodfood.com/recipes/chicken-curry');
    expect(blog.kind).toBe('blog');
  });

  it('maps Pinterest v5 video pins preferring 720p MP4 over HLS', () => {
    const raw = mapPinterestV5Pin(
      {
        id: '112233',
        title: 'Crispy Garlic Noodles',
        description: 'Quick 10 minute weeknight noodles',
        media: {
          media_type: 'video',
          cover_image_url: 'https://i.pinimg.com/736x/ab/cd/ef.jpg',
          video_list: {
            V_HLSV4: { url: 'https://v1.pinimg.com/videos/hls/test.m3u8', duration: 32000 },
            V_720P: { url: 'https://v1.pinimg.com/videos/mc/720p/test.mp4', duration: 32000 },
          },
        },
      },
      'v5_board1',
    );
    expect(raw.mediaType).toBe('video');
    expect(raw.videoUrl).toBe('https://v1.pinimg.com/videos/mc/720p/test.mp4');
    expect(raw.durationSec).toBe(32);
  });
});

describe('pinterestOAuth session encryption', () => {
  it('encrypts and decrypts access tokens losslessly', () => {
    const token = 'pina_test_token_1234567890_abcdef';
    const sealed = encryptToken(token);
    expect(sealed).not.toContain(token);
    expect(decryptToken(sealed)).toBe(token);
  });
});

describe('FOOD_TABS ingredient categorization', () => {
  it('accurately categorizes chicken, beef/goat, seafood, pasta, rice, and veggie recipes', () => {
    const byId = (id: string) => FOOD_TABS.find((t) => t.id === id)!;
    expect(SEED_RECIPES.filter(byId('chicken').matches).length).toBeGreaterThanOrEqual(3);
    expect(SEED_RECIPES.filter(byId('beef').matches).some((r) => r.id === 'curry_goat')).toBe(true);
    expect(SEED_RECIPES.filter(byId('seafood').matches).some((r) => r.id === 'crispy_salmon_bites')).toBe(true);
    expect(SEED_RECIPES.filter(byId('pasta').matches).some((r) => r.id === 'marry_me_chicken_soup')).toBe(true);
    expect(SEED_RECIPES.filter(byId('rice').matches).some((r) => r.id === 'jollof_chicken')).toBe(true);
    expect(SEED_RECIPES.filter(byId('veggie').matches).some((r) => r.id === 'gochujang_tofu')).toBe(true);
  });
});
