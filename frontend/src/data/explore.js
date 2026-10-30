// "Explore Brahmanbaria" cards, shown at the top of the heritage page (the home page's "Explore Brahmanbaria" button leads there).

// The three discovery cards, each opening the heritage list it describes.
export const DISCOVER = [
  { to: '/heritage', img: '/images/bariura-bridge-640.webp', bn: 'ঐতিহ্য ও নিদর্শন', en: 'Heritage & Landmarks', dbn: 'ঐতিহাসিক স্থান ও সাংস্কৃতিক নিদর্শন ঘুরে দেখুন।', den: 'Explore historic places and cultural landmarks.' },
  { to: '/heritage?category=mosque', img: '/images/bswa/mosque.webp', bn: 'ইসলামী সংস্কৃতি ও ঐতিহ্য', en: 'Islamic Culture & Traditions', dbn: 'বিশ্বাস, উৎসব ও স্থানীয় ঐতিহ্য জানুন।', den: 'Discover faith, festivals and local traditions.' },
  { to: '/heritage?category=river', img: '/images/bswa/river.webp', bn: 'নদী ও প্রকৃতি', en: 'Rivers & Nature', dbn: 'শান্ত নদী, প্রকৃতি ও মনোরম দৃশ্য।', den: 'Experience serene rivers, natural beauty and scenic landscapes.' },
]

// The cultural pillars of the district, each opening the page that really holds it.
export const CULTURE = [
  { img: 'mosque', w: 530, h: 500, bn: 'ইসলামী ঐতিহ্য', en: 'Islamic Heritage', sbn: 'মসজিদ ও স্থাপত্য', sen: 'Mosques & architecture', to: '/heritage?category=mosque' },
  { img: 'baul', w: 382, h: 400, bn: 'বাউল ও লোকসংস্কৃতি', en: 'Baul & Folk Culture', sbn: 'গান, গল্প ও যন্ত্র', sen: 'Music, stories & instruments', to: '/gallery' },
  { img: 'puppets', w: 395, h: 512, bn: 'পুতুল নাচ', en: 'Putul Nach', sbn: 'ঐতিহ্যবাহী পুতুল নাচ', sen: 'Traditional puppet dance', to: '/gallery' },
  { img: 'river', w: 740, h: 421, bn: 'নদী ও প্রকৃতি', en: 'Rivers & Nature', sbn: 'তিতাস, মেঘনা ও আরও', sen: 'The Titas, the Meghna and more', to: '/heritage?category=river' },
]
