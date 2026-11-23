import type { SupermarketAisle, SupermarketKey } from './types';

export interface StoreConfig {
  key: SupermarketKey;
  name: string;
  shortName: string;
  accentHex: string;
  pillActiveClass: string;
  linkClass: string;
  getSearchUrl: (query: string) => string;
}

export const STORES: Record<SupermarketKey, StoreConfig> = {
  tesco: {
    key: 'tesco',
    name: 'Tesco',
    shortName: 'Tesco',
    accentHex: '#00539F',
    pillActiveClass: 'bg-[#00539F] text-white border-[#00539F]',
    linkClass: 'text-[#00539F] bg-[#00539F]/8 hover:bg-[#00539F]/15 border-[#00539F]/20',
    getSearchUrl: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}`,
  },
  sainsburys: {
    key: 'sainsburys',
    name: "Sainsbury's",
    shortName: "Sainsbury's",
    accentHex: '#D95D00',
    pillActiveClass: 'bg-[#D95D00] text-white border-[#D95D00]',
    linkClass: 'text-[#B84E00] bg-[#D95D00]/10 hover:bg-[#D95D00]/18 border-[#D95D00]/25',
    getSearchUrl: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}`,
  },
  asda: {
    key: 'asda',
    name: 'Asda',
    shortName: 'Asda',
    accentHex: '#4F8A10',
    pillActiveClass: 'bg-[#4F8A10] text-white border-[#4F8A10]',
    linkClass: 'text-[#3F6F0D] bg-[#4F8A10]/10 hover:bg-[#4F8A10]/18 border-[#4F8A10]/25',
    getSearchUrl: (q) => `https://groceries.asda.com/search/${encodeURIComponent(q)}`,
  },
  aldi: {
    key: 'aldi',
    name: 'Aldi',
    shortName: 'Aldi',
    accentHex: '#00205B',
    pillActiveClass: 'bg-[#00205B] text-white border-[#00205B]',
    linkClass: 'text-[#00205B] bg-[#00205B]/8 hover:bg-[#00205B]/15 border-[#00205B]/20',
    getSearchUrl: (q) => `https://groceries.aldi.co.uk/en-GB/Search?keywords=${encodeURIComponent(q)}`,
  },
  lidl: {
    key: 'lidl',
    name: 'Lidl',
    shortName: 'Lidl',
    accentHex: '#0050AA',
    pillActiveClass: 'bg-[#0050AA] text-white border-[#0050AA]',
    linkClass: 'text-[#0050AA] bg-[#0050AA]/8 hover:bg-[#0050AA]/15 border-[#0050AA]/20',
    getSearchUrl: (q) => `https://www.lidl.co.uk/q/search?q=${encodeURIComponent(q)}`,
  },
};

export const STORE_LIST: StoreConfig[] = Object.values(STORES);

export const AISLE_ORDER: SupermarketAisle[] = [
  'Fresh Produce',
  'Meat & Poultry',
  'Fish & Seafood',
  'Dairy & Chilled',
  'Bakery',
  'Pantry & World Food',
  'Food Cupboard',
  'Frozen',
];
