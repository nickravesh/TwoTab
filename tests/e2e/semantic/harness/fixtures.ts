/**
 * Realistic Tab Fixture Datasets for Offline E2E Testing
 *
 * Covers:
 * - Technical domains: Python, React, Machine Learning, GitHub
 * - Lifestyle domains: Recipes / Cooking
 * - E-commerce: Heavy tracking & affiliate query parameters
 * - Edge & Boundary tabs: Dormant tabs, massive URLs, unicode, special schemes
 */

import type { Tab, TabGroup } from '@/lib/storage';

// ---------------------------------------------------------------------------
// 1. Python Topic Tabs
// ---------------------------------------------------------------------------
export const PYTHON_TABS: Tab[] = [
  {
    title: 'Python 3.12 Documentation — Tutorial & Language Reference',
    url: 'https://docs.python.org/3/tutorial/index.html?utm_source=python_org&ref=docs',
  },
  {
    title: 'FastAPI — Modern, Fast Python Web Framework for APIs',
    url: 'https://fastapi.tiangolo.com/tutorial/first-steps/',
  },
  {
    title: 'Pandas DataFrames Tutorial — Data Analysis in Python',
    url: 'https://pandas.pydata.org/docs/user_guide/10min.html?source=data_analytics',
  },
  {
    title: 'PyPI · The Python Package Index — Search and Publish Packages',
    url: 'https://pypi.org/search/?q=asyncio&utm_medium=internal',
  },
  {
    title: 'Asyncio in Python: Complete Guide to Asynchronous Programming',
    url: 'https://realpython.com/async-io-python/?fbclid=IwAR234567890abcdef',
  },
  {
    title: 'PEP 8 — Style Guide for Python Code | peps.python.org',
    url: 'https://peps.python.org/pep-0008/#naming-conventions',
  },
];

// ---------------------------------------------------------------------------
// 2. React Topic Tabs
// ---------------------------------------------------------------------------
export const REACT_TABS: Tab[] = [
  {
    title: 'React 19 Hooks & Server Components Documentation',
    url: 'https://react.dev/reference/react/useActionState?utm_campaign=react19_launch',
  },
  {
    title: 'React Router v7 — Client-Side Routing and Data Loading',
    url: 'https://reactrouter.com/en/main/start/tutorial?gclid=ReactRouterAd123',
  },
  {
    title: 'Redux Toolkit Query (RTK Query) — State Management & Caching',
    url: 'https://redux-toolkit.js.org/rtk-query/overview',
  },
  {
    title: 'TanStack Virtual — Headless UI Virtualization for React Lists',
    url: 'https://tanstack.com/virtual/latest/docs/introduction?ref=tanstack_hub',
  },
  {
    title: 'Tailwind CSS v4 Integration with React & Vite',
    url: 'https://tailwindcss.com/docs/guides/vite?mc_eid=12345abcdef',
  },
  {
    title: 'Next.js 15 App Router Architecture & Server Actions Guide',
    url: 'https://nextjs.org/docs/app/building-your-application/routing',
  },
];

// ---------------------------------------------------------------------------
// 3. Machine Learning Topic Tabs
// ---------------------------------------------------------------------------
export const MACHINE_LEARNING_TABS: Tab[] = [
  {
    title: 'Transformers.js: Run Hugging Face Models Directly in the Browser',
    url: 'https://huggingface.co/docs/transformers.js/index?source=landing_page',
  },
  {
    title: 'Xenova/all-MiniLM-L6-v2 · Hugging Face ONNX Model Hub',
    url: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2?utm_content=onnx_fp32',
  },
  {
    title: 'PyTorch Deep Learning Tensors & Autograd Tutorial',
    url: 'https://pytorch.org/tutorials/beginner/blitz/tensor_tutorial.html',
  },
  {
    title: 'ONNX Runtime Web: High-Performance In-Browser ML with WASM & WebGPU',
    url: 'https://onnxruntime.ai/docs/tutorials/web/?trk=linkedin_share',
  },
  {
    title: 'Attention Is All You Need — Transformer Architecture arXiv Paper',
    url: 'https://arxiv.org/abs/1706.03762',
  },
  {
    title: 'Scikit-Learn Hierarchical Agglomerative Clustering Algorithm Guide',
    url: 'https://scikit-learn.org/stable/modules/clustering.html#hierarchical-clustering',
  },
];

// ---------------------------------------------------------------------------
// 4. Recipes & Cooking Topic Tabs
// ---------------------------------------------------------------------------
export const RECIPES_TABS: Tab[] = [
  {
    title: 'Authentic Italian Spaghetti Carbonara Recipe — NYT Cooking',
    url: 'https://cooking.nytimes.com/recipes/1017360-classic-carbonara?utm_source=nyt_newsletter&utm_medium=email',
  },
  {
    title: 'The Best Neapolitan Pizza Dough Recipe by Kenji López-Alt',
    url: 'https://www.seriouseats.com/basic-neapolitan-pizza-dough-recipe?utm_campaign=food_digest&fbclid=SeriousEats1',
  },
  {
    title: 'Best Fudgy Chocolate Chip Cookies — Allrecipes',
    url: 'https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/?gclid=BakeSaleAds',
  },
  {
    title: 'Simple Sourdough Bread Step-by-Step — Bon Appétit',
    url: 'https://www.bonappetit.com/recipe/simple-sourdough-bread?source=editorial_picks',
  },
  {
    title: 'How to Maintain a Healthy Sourdough Starter — King Arthur Baking',
    url: 'https://www.kingarthurbaking.com/recipes/sourdough-starter-recipe?utm_medium=cpc',
  },
  {
    title: 'Spiced Red Lentil Dal with Coconut Milk — Food52 Recipes',
    url: 'https://food52.com/recipes/84321-spiced-red-lentil-dal-recipe',
  },
];

// ---------------------------------------------------------------------------
// 5. Shopping Tabs with Heavy Tracking Parameters
// ---------------------------------------------------------------------------
export const SHOPPING_TABS: Tab[] = [
  {
    title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black',
    url: 'https://www.amazon.com/dp/B09XS7JWHH?tag=affiliate01-20&linkCode=ogi&th=1&psc=1&utm_source=facebook&utm_medium=cpc&utm_campaign=deals&fbclid=IwAR999888777',
  },
  {
    title: 'Vintage 35mm Rangefinder Camera (Near Mint Condition) | eBay',
    url: 'https://www.ebay.com/itm/123456789012?hash=item1c2b3a4d:g:xyzAAOSw&_trkparms=ispr%3D1&gclid=Cj0KCQjwlCamera123&si=tracking_session_id_456',
  },
  {
    title: 'LG C3 65-Inch OLED 4K UHD Smart TV | Best Buy',
    url: 'https://www.bestbuy.com/site/lg-65-class-c3-series-oled-4k-uhd/6535929.p?skuId=6535929&ref=212&loc=1&msclkid=BestBuyClickId789',
  },
  {
    title: 'Ninja Professional Plus Kitchen Blender System 1400 Peak Watts',
    url: 'https://www.walmart.com/ip/Ninja-Professional-Blender/123456?selected=true&utm_source=walmart_aff&mc_eid=walmart_email_id_99',
  },
  {
    title: 'Nespresso VertuoPlus Coffee and Espresso Machine by DeLonghi',
    url: 'https://www.target.com/p/nespresso-vertuoplus-coffee-machine/-/A-52467389?ref=tgt_soc_pdp&_hsenc=p2ANqtz-TargetHsEnc',
  },
  {
    title: 'NVIDIA GeForce RTX 4080 Super 16GB Gaming Graphics Card',
    url: 'https://www.newegg.com/asus-geforce-rtx-4080-super/p/N82E16814126700?Item=N82E16814126700&cm_sp=Homepage-TopDeals',
  },
];

// ---------------------------------------------------------------------------
// 6. GitHub Single-Domain Multi-Topic Tabs
// ---------------------------------------------------------------------------
export const GITHUB_TABS: Tab[] = [
  {
    title: 'nickravesh/TwoTab: Privacy-first Chrome tab manager and session stasher',
    url: 'https://github.com/nickravesh/TwoTab',
  },
  {
    title: 'facebook/react: The library for web and native user interfaces',
    url: 'https://github.com/facebook/react',
  },
  {
    title: 'xenova/transformers.js: State-of-the-art Machine Learning for the web',
    url: 'https://github.com/xenova/transformers.js/issues/450',
  },
  {
    title: 'pytorch/pytorch: Tensors and Dynamic neural networks in Python with strong GPU acceleration',
    url: 'https://github.com/pytorch/pytorch/pull/99887',
  },
  {
    title: 'torvalds/linux: Linux kernel source tree releases and commits',
    url: 'https://github.com/torvalds/linux/commit/1a2b3c4d5e6f',
  },
  {
    title: 'microsoft/vscode: Visual Studio Code settings, extensions and workbench',
    url: 'https://github.com/microsoft/vscode/releases/tag/1.95.0',
  },
];

// ---------------------------------------------------------------------------
// 7. Dormant Tabs
// ---------------------------------------------------------------------------
export const DORMANT_TABS: Tab[] = [
  {
    title: 'Dormant Tab — GitHub',
    url: 'chrome-extension://twotab-test-extension/dormant.html?url=https%3A%2F%2Fgithub.com%2Fnickravesh%2FTwoTab&title=TwoTab%20Repository',
  },
  {
    title: 'Dormant Tab — Python Docs',
    url: 'chrome-extension://twotab-test-extension/dormant.html?url=https%3A%2F%2Fdocs.python.org%2F3%2F&title=Python%20Documentation',
  },
  {
    title: 'Dormant Tab — React',
    url: 'chrome-extension://twotab-test-extension/dormant.html?url=https%3A%2F%2Freact.dev%2F&title=React%20Home',
  },
  {
    title: 'Dormant Tab — NYT Carbonara',
    url: 'chrome-extension://twotab-test-extension/dormant.html?url=https%3A%2F%2Fcooking.nytimes.com%2Frecipes%2Fcarbonara&title=NYT%20Carbonara',
  },
];

// ---------------------------------------------------------------------------
// 8. Boundary & Corner Case Tabs
// ---------------------------------------------------------------------------
export const BOUNDARY_TABS: Record<string, Tab> = {
  emptyTitle: {
    title: '',
    url: 'https://example.com/deeply/nested/path/to/interesting-resource.html',
  },
  emptyUrl: {
    title: 'Tab with Missing URL',
    url: '',
  },
  bothEmpty: {
    title: '',
    url: '',
  },
  massiveUrl: {
    title: 'Massive Query String Tab',
    url: `https://example.com/search?q=${'a'.repeat(2500)}&tracking=${'b'.repeat(2500)}`,
  },
  massiveTitle: {
    title: 'Very Long Semantic Title '.repeat(100),
    url: 'https://example.com/article',
  },
  unicodeTitle: {
    title: '🚀 TwoTab Local AI Tab-Grouping 分类 & グループ化! 😊 🌟',
    url: 'https://example.com/i18n-unicode-test',
  },
  specialBrowserSchemes: {
    title: 'Chrome Browser Internal Settings',
    url: 'chrome://settings/system',
  },
  aboutBlank: {
    title: 'New Blank Tab',
    url: 'about:blank',
  },
  edgeScheme: {
    title: 'Edge Experimental Flags',
    url: 'edge://flags',
  },
  encodedSpecialCharacters: {
    title: 'C++ & C# vs Go: Performance & Memory Analysis [2026 Edition] | Tech Blog',
    url: 'https://techblog.com/posts/c%2B%2B-vs-c%23-benchmark?view=full&session=active#conclusions',
  },
};

// ---------------------------------------------------------------------------
// 9. Full Realistic Library Fixture
// ---------------------------------------------------------------------------
export function createRealisticTabGroups(): TabGroup[] {
  return [
    {
      id: 'group-dev-work',
      name: 'Development & Research',
      color: 'blue',
      createdDate: Date.now() - 3600000 * 24,
      tabs: [...PYTHON_TABS.slice(0, 3), ...REACT_TABS.slice(0, 3)],
    },
    {
      id: 'group-ai-ml',
      name: 'AI & Machine Learning',
      color: 'purple',
      createdDate: Date.now() - 3600000 * 12,
      tabs: [...MACHINE_LEARNING_TABS.slice(0, 4)],
    },
    {
      id: 'group-weekend',
      name: 'Weekend Cooking & Shopping',
      color: 'green',
      createdDate: Date.now() - 3600000 * 6,
      tabs: [...RECIPES_TABS.slice(0, 3), ...SHOPPING_TABS.slice(0, 3)],
    },
  ];
}
