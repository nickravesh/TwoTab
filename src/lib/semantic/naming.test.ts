import { describe, it, expect } from 'vitest';
import { generateGroupName, toTitleCase } from './naming';
import { clusterTabs } from './clustering';
import type { Tab } from '../storage';

describe('Deterministic Group Naming Engine (naming.ts)', () => {
  it('handles empty tab array', () => {
    const res = generateGroupName([]);
    expect(res.name).toBe('Empty Collection');
    expect(res.color).toBe('grey');
  });

  it('generates title-cased name from prominent title terms', () => {
    const tabs: Tab[] = [
      { title: 'Django REST Framework Authentication Guide', url: 'https://django-rest-framework.org/api-guide/authentication/' },
      { title: 'JWT Authentication with Django SimpleJWT', url: 'https://github.com/jazzband/djangorestframework-simplejwt' },
      { title: 'Django Permissions and Authentication', url: 'https://docs.djangoproject.com/en/5.0/topics/auth/' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toContain('django');
    expect(res.name.toLowerCase()).toContain('authentication');
  });

  it('strips stopwords cleanly', () => {
    const tabs: Tab[] = [
      { title: 'The Guide To Modern Web Development For Beginners', url: 'https://example.com/guide' },
      { title: 'A Complete Tutorial On Modern Web Development', url: 'https://example.com/tutorial' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toContain('modern');
    expect(res.name.toLowerCase()).toContain('development');
  });

  it('recognizes branded domains and sets appropriate color', () => {
    const tabs: Tab[] = [
      { title: 'TwoTab Repository', url: 'https://github.com/nickravesh/TwoTab' },
      { title: 'React Core Repository', url: 'https://github.com/facebook/react' },
    ];
    const res = generateGroupName(tabs);
    expect(res.color).toBe('purple'); // GitHub is purple in BRANDED_DOMAINS
    expect(res.name).toContain('GitHub');
  });

  it('falls back to domain when titles are uninformative or empty', () => {
    const tabs: Tab[] = [
      { title: '', url: 'https://stackoverflow.com/questions/12345' },
      { title: '', url: 'https://stackoverflow.com/questions/67890' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toContain('stack overflow');
    expect(res.color).toBe('orange');
  });

  it('augments brief identical titles with shared path keywords', () => {
    const tabs: Tab[] = [
      { title: 'Documentation', url: 'https://fastapi.tiangolo.com/tutorial/security/' },
      { title: 'Documentation', url: 'https://fastapi.tiangolo.com/tutorial/cors/' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toMatch(/fastapi|tutorial/);
  });

  it('handles IP address hostnames properly', () => {
    const tabs: Tab[] = [
      { title: '', url: 'http://192.168.1.1/dashboard' },
      { title: '', url: 'http://192.168.1.1/settings' },
    ];
    const res = generateGroupName(tabs);
    expect(res.name.toLowerCase()).toMatch(/192\.168\.1\.1|dashboard|settings/);
  });

  it('is 100% deterministic across multiple runs', () => {
    const tabs: Tab[] = [
      { title: 'PostgreSQL Indexing Explained', url: 'https://postgres.org/index' },
      { title: 'PostgreSQL Query Optimization with EXPLAIN', url: 'https://postgres.org/explain' },
    ];
    const first = generateGroupName(tabs);
    for (let i = 0; i < 20; i++) {
      const next = generateGroupName(tabs);
      expect(next.name).toBe(first.name);
      expect(next.color).toBe(first.color);
    }
  });

  it('toTitleCase formats words correctly', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
    expect(toTitleCase('dJaNgO aUtH')).toBe('Django Auth');
    expect(toTitleCase('')).toBe('');
  });

  describe('Redesigned Phrase-Aware Naming Regression Suite (Section 21)', () => {
    it('Case 1: preserves source word order for Gemini / Flash without brand prefix', () => {
      const tabs: Tab[] = [
        { title: 'gemeni 3.7 flash vs 3.6 flash - Google Search', url: 'https://google.com/search?q=1' },
        { title: 'gemeni 3.6 flash vs gemeni 3.1 pro benchmark - Google Search', url: 'https://google.com/search?q=2' },
      ];
      const { name, color } = generateGroupName(tabs);
      expect(name).not.toMatch(/flash gemeni/i);
      expect(name.toLowerCase()).toMatch(/gem(i|e)ni flash/);
      expect(name).toBe('Gemini Flash Models');
      expect(name).not.toContain('Google —');
      expect(color).toBe('blue');
    });

    it("Case 2: prioritizes core subject Life is Strange / Max Mixtape over generic ambiance/folk descriptors", () => {
      const tabs: Tab[] = [
        { title: "Life is Strange: Max's Mixtape | Side B | Folk & Indie Pop Mix | Music & Ambiance", url: 'https://youtube.com/watch?v=b' },
        { title: "Life is Strange: Max's Mixtape | Side A | Folk & Indie Pop Mix | Music & Ambiance", url: 'https://youtube.com/watch?v=a' },
      ];
      const { name, color } = generateGroupName(tabs);
      expect(name).not.toContain('YouTube —');
      expect(name).not.toMatch(/ambiance folk/i);
      expect(name.toLowerCase()).toMatch(/life is strange|max's mixtape|life strange/);
      expect(color).toBe('red');
    });

    it('Case 3: does not label group after one person when two unrelated people are clustered', () => {
      const tabs: Tab[] = [
        { title: '(43) Ali Sharifi Zarchi - YouTube', url: 'https://youtube.com/channel/ali' },
        { title: 'sima shahverdi - YouTube', url: 'https://youtube.com/channel/sima' },
      ];
      const { name, color } = generateGroupName(tabs);
      expect(name).not.toBe('Ali');
      expect(name).not.toBe('YouTube — Ali');
      expect(name).toContain('YouTube');
      expect(color).toBe('red');
    });

    it('Case 4: derives clean domain label from URL-only tabs without TLD leakage', () => {
      const tabs: Tab[] = [
        { title: 'www.moviesho.com', url: 'https://moviesho.com' },
        { title: 'www.moviesho.com', url: 'https://moviesho.com' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name).not.toMatch(/com moviesho/i);
      expect(name.toLowerCase()).toContain('moviesho');
    });

    it('Case 5: preserves meaningful short acronyms like AI in technical titles', () => {
      const tabs: Tab[] = [
        { title: '9Router - AI Infrastructure Management', url: 'http://198.55.103.161/dashboard' },
        { title: '9Router - AI Infrastructure Management', url: 'http://198.55.103.161/settings' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name).toContain('AI');
      expect(name.toLowerCase()).toMatch(/9router|infrastructure/);
    });

    it('Case 6: preserves project topic Hermes Agent Backend rather than isolated unigram', () => {
      const tabs: Tab[] = [
        { title: 'Hermes agent terminal backend', url: 'https://chatgpt.com/c/1' },
        { title: 'Hermes Agent Terminal Backend Choices - Google Gemini', url: 'https://gemini.google.com/app' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name.toLowerCase()).toContain('hermes');
      expect(name.toLowerCase()).toMatch(/agent|backend/);
    });

    it('Case 7: favors Docker Engine over generic Docs boilerplate', () => {
      const tabs: Tab[] = [
        { title: 'Install Docker Engine on Ubuntu - Docker Docs', url: 'https://docs.docker.com/engine/install/ubuntu/' },
        { title: 'Install Docker Engine on Ubuntu - Docker Docs', url: 'https://docs.docker.com/engine/install/ubuntu/' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name.toLowerCase()).toContain('docker');
      expect(name.toLowerCase()).toContain('engine');
    });

    it('Case 8: preserves subject phrase Chloe Price without forced brand prefix', () => {
      const tabs: Tab[] = [
        { title: 'chloe price - Google Search', url: 'https://google.com/search?q=chloe+price' },
        { title: 'chloe price profile photo - Google Search', url: 'https://google.com/search?q=chloe+price+photo' },
      ];
      const { name, color } = generateGroupName(tabs);
      expect(name).toBe('Chloe Price');
      expect(name).not.toContain('Google —');
      expect(color).toBe('blue');
    });

    it('Case 9: preserves shared product model concept Gemini Model', () => {
      const tabs: Tab[] = [
        { title: 'Gemini 3.7 Flash: our most intelligent workhorse model', url: 'https://blog.google/technology/ai/gemini-3-7-flash/' },
        { title: 'Gemini Omni experts answer key questions about the model', url: 'https://blog.google/technology/ai/gemini-omni-qa/' },
      ];
      const { name } = generateGroupName(tabs);
      expect(name.toLowerCase()).toContain('gemini');
      expect(name.toLowerCase()).toContain('model');
    });

    it('Case 10: produces 100% identical naming across 50 repeated runs', () => {
      const tabs: Tab[] = [
        { title: 'LiquidGlass — WebGL Glass Effects for the Web', url: 'https://liquid-glass.ybouane.com' },
        { title: 'ybouane/liquidglass: A liquid glass effect library for the web', url: 'https://github.com/ybouane/liquidglass' },
      ];
      const first = generateGroupName(tabs);
      for (let i = 0; i < 50; i++) {
        const next = generateGroupName(tabs);
        expect(next.name).toBe(first.name);
        expect(next.color).toBe(first.color);
      }
    });
  });

  describe('V2 Semantic Quality: Stopword Preservation & Vector Centroid Naming Suite', () => {
    it('V2.1 preserves exact phrase "Life is Strange" with interior stopword "is" in proper Title Case', () => {
      const tabs: Tab[] = [
        {
          title: "Life is Strange: Max's Mixtape | Side B 🎵 Folk & Indie Pop Mix | Music & Ambiance🌙📼 - YouTube",
          url: 'https://www.youtube.com/watch?v=mix_b',
        },
        {
          title: "(33) Life is Strange: Max's Mixtape | Side A 🎵 Folk & Indie Pop Mix | Music & Ambiance🌞📼 - YouTube",
          url: 'https://www.youtube.com/watch?v=mix_a',
        },
      ];

      const { name, color } = generateGroupName(tabs);
      // Must preserve authentic entity with conceptual synthesis "Life is Strange Music"
      expect(name).toBe('Life is Strange Music');
      expect(name).not.toMatch(/life strange/i);
      expect(color).toBe('red');
    });

    it('V2.2 preserves exact phrase "The Last of Us" and avoids synthetic recombination like "Ellie Last"', () => {
      const tabs: Tab[] = [
        {
          title: 'The Last of Us Part 1 — Ellie & Joel Walkthrough Chapter 1',
          url: 'https://youtube.com/watch?v=tlou1',
        },
        {
          title: 'The Last of Us Remastered — Full Gameplay Review with Ellie',
          url: 'https://youtube.com/watch?v=tlou2',
        },
      ];

      const { name } = generateGroupName(tabs);
      // Strictly preserves natural entity "The Last of Us", forbids synthetic "Ellie Last"
      expect(name).toBe('The Last of Us');
      expect(name).not.toMatch(/ellie last/i);
      expect(name).not.toMatch(/last ellie/i);
    });

    it('V2.3 forbids arbitrary unigram recombination across titles when a natural contiguous phrase exists', () => {
      const tabs: Tab[] = [
        {
          title: 'A Quiet Break Near Jackson: Ellie & Joel Waterfall Ambiance | Relaxing Music 4K - YouTube',
          url: 'https://youtube.com/watch?v=j1',
        },
        {
          title: 'A Calm Day in Jackson with Ellie | Relaxing Rain Sounds & Ambient Music 4K - YouTube',
          url: 'https://youtube.com/watch?v=j2',
        },
      ];

      const { name } = generateGroupName(tabs);
      // Must not generate synthetic Frankenstein "Jackson Ellie" or "Ellie Jackson"
      // Should pick single prominent topic or clean subject
      expect(name).not.toMatch(/jackson ellie/i);
      expect(name).not.toMatch(/ellie last/i);
      expect(name.length).toBeGreaterThan(0);
    });

    it('V2.4 integrates vector centroid and medoid alignment to rank representative phrases higher', () => {
      const tabs: Tab[] = [
        {
          title: 'The Last of Us Part 1 Official Guide',
          url: 'https://example.com/guide',
        },
        {
          title: 'The Last of Us Remastered Review',
          url: 'https://example.com/review',
        },
        {
          title: 'Ellie Waterfall Ambiance 4K Relaxing Music',
          url: 'https://example.com/music',
        },
      ];

      // Simulate 384-dimensional embeddings:
      // Tab 0 & Tab 1 are close to centroid (angle 0 & 10 deg)
      // Tab 2 is peripheral (angle 45 deg)
      const rad0 = (0 * Math.PI) / 180;
      const v0 = new Float32Array(384);
      v0[0] = Math.cos(rad0);
      v0[1] = Math.sin(rad0);

      const rad1 = (10 * Math.PI) / 180;
      const v1 = new Float32Array(384);
      v1[0] = Math.cos(rad1);
      v1[1] = Math.sin(rad1);

      const rad2 = (45 * Math.PI) / 180;
      const v2 = new Float32Array(384);
      v2[0] = Math.cos(rad2);
      v2[1] = Math.sin(rad2);

      const centroid = new Float32Array(384);
      centroid[0] = 1.0;

      const { name } = generateGroupName(tabs, undefined, {
        clusterCentroid: centroid,
        tabEmbeddings: [v0, v1, v2],
      });

      expect(name).toBe('The Last of Us');
    });

    it('V3.1 synthesizes conceptual research label for Learned Cardinality Estimation papers', () => {
      const tabs: Tab[] = [
        {
          title: 'A Lightweight Learned Cardinality Estimation Model | IEEE Xplore',
          url: 'https://ieeexplore.ieee.org/document/9876543',
        },
        {
          title: '[2201.12345] A Lightweight Learned Cardinality Estimation Model',
          url: 'https://arxiv.org/abs/2201.12345',
        },
        {
          title: 'Learned Cardinality Estimation in Modern Database Systems',
          url: 'https://arxiv.org/abs/2203.54321',
        },
      ];

      const { name } = generateGroupName(tabs);
      // Must NOT blindly copy the title with leading indefinite article "A Lightweight Learned Cardinality"
      expect(name).not.toMatch(/^A /i);
      expect(name).not.toBe('A Lightweight Learned Cardinality');
      // Must synthesize conceptual research label
      expect(name.toLowerCase()).toContain('learned cardinality estimation');
      expect(name.toLowerCase()).toContain('research');
      expect(name).toBe('Learned Cardinality Estimation Research');
    });

    it('V3.2 synthesizes conceptual research label for LSM-Tree Cost Estimation papers without truncation', () => {
      const tabs: Tab[] = [
        {
          title: 'A Dual-Layer End-to-End Cost Estimation Model for LSM-Tree-Based Database Systems',
          url: 'https://dl.acm.org/doi/10.1145/3514221',
        },
        {
          title: 'A Dual-Layer End-to-End Cost Estimation Model for LSM-Tree-Based Database Systems | arXiv',
          url: 'https://arxiv.org/abs/2112.09876',
        },
      ];

      const { name } = generateGroupName(tabs);
      // Must NOT truncate to "Dual Layer End"
      expect(name).not.toBe('Dual Layer End');
      expect(name).not.toMatch(/^A /i);
      // Must preserve LSM-Tree acronym casing and synthesize research label
      expect(name).toContain('LSM-Tree');
      expect(name.toLowerCase()).toContain('cost estimation');
      expect(name.toLowerCase()).toContain('research');
      expect(name).toBe('LSM-Tree Cost Estimation Research');
    });

    it('V3.3 preserves authentic entities (Life is Strange, Ellie Williams, Shadcn UI) without over-abstracting', () => {
      const lisTabs: Tab[] = [
        {
          title: "Life is Strange: Max's Mixtape | Side B Folk & Indie Pop Mix - YouTube",
          url: 'https://youtube.com/watch?v=lis1',
        },
        {
          title: "Life is Strange: Max's Mixtape | Side A Folk & Indie Pop Mix - YouTube",
          url: 'https://youtube.com/watch?v=lis2',
        },
      ];
      expect(generateGroupName(lisTabs).name).toBe('Life is Strange Music');

      const ellieTabs: Tab[] = [
        {
          title: 'Ellie Williams | The Last of Us Wiki - Fandom',
          url: 'https://thelastofus.fandom.com/wiki/Ellie_Williams',
        },
        {
          title: 'Ellie Williams (Character) - Giant Bomb',
          url: 'https://giantbomb.com/ellie-williams',
        },
      ];
      expect(generateGroupName(ellieTabs).name).toBe('Ellie Williams');

      const shadcnTabs: Tab[] = [
        {
          title: 'Button Component - shadcn/ui',
          url: 'https://ui.shadcn.com/docs/components/button',
        },
        {
          title: 'Dialog Component - shadcn/ui',
          url: 'https://ui.shadcn.com/docs/components/dialog',
        },
      ];
      expect(generateGroupName(shadcnTabs).name).toBe('Shadcn UI');
    });

    it('V3.4 formats OSI and technical acronyms in all-caps, never "Osi"', () => {
      const osiTabs: Tab[] = [
        {
          title: 'OSI Model Layers Explained',
          url: 'https://example.com/osi-layers',
        },
        {
          title: 'Networking Fundamentals and OSI Architecture',
          url: 'https://example.com/networking-osi',
        },
      ];

      const { name } = generateGroupName(osiTabs);
      expect(name).not.toContain('Osi');
      expect(name).toContain('OSI');
    });
  });

  describe('Section 19: Comprehensive 15-Case Conceptual Naming Regression Suite', () => {
    it('1. Life is Strange music mix -> Life is Strange Music', () => {
      const tabs: Tab[] = [
        {
          title: "Life is Strange: Max's Mixtape | Side B 🎵 Folk & Indie Pop Mix | Music & Ambiance🌙📼 - YouTube",
          url: 'https://youtube.com/watch?v=lis1',
        },
        {
          title: "(33) Life is Strange: Max's Mixtape | Side A 🎵 Folk & Indie Pop Mix | Music & Ambiance🌞📼 - YouTube",
          url: 'https://youtube.com/watch?v=lis2',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Life is Strange Music');
    });

    it('2. The Last of Us ambience -> The Last of Us Ambience', () => {
      const tabs: Tab[] = [
        {
          title: 'A Quiet Break Near Jackson: Ellie & Joel Waterfall Ambiance | Relaxing Music 4K - YouTube',
          url: 'https://youtube.com/watch?v=j1',
        },
        {
          title: 'A Calm Day in Jackson with Ellie | Relaxing Rain Sounds & Ambient Music 4K - YouTube',
          url: 'https://youtube.com/watch?v=j2',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('The Last of Us Ambience');
    });

    it('3. Learned cardinality estimation -> Learned Cardinality Estimation Research', () => {
      const tabs: Tab[] = [
        {
          title: 'A Lightweight Learned Cardinality Estimation Model | IEEE Xplore',
          url: 'https://ieeexplore.ieee.org/document/9876543',
        },
        {
          title: 'Learned Cardinality Estimation in Modern Database Systems',
          url: 'https://arxiv.org/abs/2203.54321',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Learned Cardinality Estimation Research');
    });

    it('4. LSM-tree cost estimation -> LSM-Tree Cost Estimation Research', () => {
      const tabs: Tab[] = [
        {
          title: 'A Dual-Layer End-to-End Cost Estimation Model for LSM-Tree-Based Database Systems',
          url: 'https://dl.acm.org/doi/10.1145/3514221',
        },
        {
          title: 'A Dual-Layer End-to-End Cost Estimation Model for LSM-Tree-Based Database Systems | arXiv',
          url: 'https://arxiv.org/abs/2112.09876',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('LSM-Tree Cost Estimation Research');
    });

    it('5. Bange laptop products -> Bange Laptop Bags', () => {
      const tabs: Tab[] = [
        {
          title: 'کوله پشتی بنج مدل Bange BG-7216 مناسب برای لپ تاپ 15.6 اینچی - دیجی‌کالا',
          url: 'https://www.digikala.com/product/dkp-12345/bange-backpack/',
        },
        {
          title: 'کوله پشتی لپ تاپ بنج مدل BG-1908 - دیجی‌کالا',
          url: 'https://www.digikala.com/product/dkp-67890/bange-laptop-bag/',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Bange Laptop Bags');
    });

    it('6. Mac software download pages -> Mac Software Downloads', () => {
      const tabs: Tab[] = [
        {
          title: 'Proxifier for Mac - Download Free Latest Version',
          url: 'https://macapp.example.com/proxifier-download',
        },
        {
          title: 'IconJar for macOS - Direct Download DMG',
          url: 'https://macapp.example.com/iconjar-download',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Mac Software Downloads');
    });

    it('7. Metallica shirts -> Metallica T-Shirts', () => {
      const tabs: Tab[] = [
        {
          title: 'تیشرت مردانه طرح متالیکا مدل Metallica Master of Puppets - دیجی‌کالا',
          url: 'https://www.digikala.com/product/dkp-1111/metallica-tshirt/',
        },
        {
          title: 'تیشرت متالیکا طرح Ride the Lightning - دیجی‌کالا',
          url: 'https://www.digikala.com/product/dkp-2222/metallica-tee/',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Metallica T-Shirts');
    });

    it('8. Gemini Flash comparison searches -> Gemini Flash Models', () => {
      const tabs: Tab[] = [
        {
          title: 'gemeni 3.7 flash vs 3.6 flash - Google Search',
          url: 'https://google.com/search?q=1',
        },
        {
          title: 'gemeni 3.6 flash vs gemeni 3.1 pro benchmark - Google Search',
          url: 'https://google.com/search?q=2',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Gemini Flash Models');
    });

    it('9. Chrome tab manager research -> Chrome Tab Managers', () => {
      const tabs: Tab[] = [
        {
          title: 'Toby for Tabs - Chrome Web Store',
          url: 'https://chromewebstore.google.com/detail/toby/1',
        },
        {
          title: 'Tabby - Window & Tab Manager - Chrome Web Store',
          url: 'https://chromewebstore.google.com/detail/tabby/2',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Chrome Tab Managers');
    });

    it('10. Generic Pinterest pins -> kept ungrouped', () => {
      const pinItems = [
        { tab: { title: 'Pin', url: 'https://www.pinterest.com/pin/1/' }, embedding: new Float32Array(384).fill(0.1) },
        { tab: { title: 'Pins', url: 'https://www.pinterest.com/pin/2/' }, embedding: new Float32Array(384).fill(0.1) },
      ];
      const res = clusterTabs(pinItems);
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(2);
    });

    it('11. Generic YouTube pages -> kept ungrouped', () => {
      const ytItems = [
        { tab: { title: 'YouTube', url: 'https://www.youtube.com/' }, embedding: new Float32Array(384).fill(0.1) },
        { tab: { title: 'YouTube - Subscriptions', url: 'https://www.youtube.com/feed/subscriptions' }, embedding: new Float32Array(384).fill(0.1) },
      ];
      const res = clusterTabs(ytItems);
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(2);
    });

    it('12. Error 403 / Domain Blocked -> kept ungrouped', () => {
      const errItems = [
        { tab: { title: 'Domain Blocked', url: 'https://example1.com/blocked' }, embedding: new Float32Array(384).fill(0.1) },
        { tab: { title: 'Error 403 (Forbidden)', url: 'https://example2.com/403' }, embedding: new Float32Array(384).fill(0.1) },
      ];
      const res = clusterTabs(errItems);
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(2);

      const directName = generateGroupName([errItems[0].tab]);
      expect(directName.name).toBe('Domain Blocked');
    });

    it('13. Hermes Agent -> Hermes Agent', () => {
      const tabs: Tab[] = [
        {
          title: 'Hermes agent terminal backend',
          url: 'https://chatgpt.com/c/1',
        },
        {
          title: 'Hermes Agent Terminal Backend Choices - Google Gemini',
          url: 'https://gemini.google.com/app',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Hermes Agent');
    });

    it('14. shadcn/ui -> Shadcn UI', () => {
      const tabs: Tab[] = [
        {
          title: 'Button Component - shadcn/ui',
          url: 'https://ui.shadcn.com/docs/components/button',
        },
        {
          title: 'Dialog Component - shadcn/ui',
          url: 'https://ui.shadcn.com/docs/components/dialog',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('Shadcn UI');
    });

    it('15. The Last of Us / Ellie gameplay -> The Last of Us', () => {
      const tabs: Tab[] = [
        {
          title: 'The Last of Us Part 1 — Ellie & Joel Walkthrough Chapter 1',
          url: 'https://youtube.com/watch?v=tlou1',
        },
        {
          title: 'The Last of Us Remastered — Full Gameplay Review with Ellie',
          url: 'https://youtube.com/watch?v=tlou2',
        },
      ];
      expect(generateGroupName(tabs).name).toBe('The Last of Us');
    });
  });

  describe('Degenerate & Cryptic Name Elimination Regression Suite', () => {
    it('rejects alphanumeric internal database slugs (e.g. Ch15659) in favor of descriptive topic words', () => {
      const tabs: Tab[] = [
        {
          title: 'Database Systems Architecture Ch15659 Guide',
          url: 'https://example.com/ch15659/guide',
        },
        {
          title: 'Database Systems Architecture Principles Ch15659',
          url: 'https://example.com/ch15659/principles',
        },
      ];
      const { name } = generateGroupName(tabs);
      expect(name).not.toMatch(/ch15659/i);
      expect(name).toContain('Database Systems Architecture');
    });

    it('rejects appliance model numbers (e.g. Nc-Ts201) when descriptive product nouns exist', () => {
      const tabs: Tab[] = [
        {
          title: 'Nutricook Smart Toaster Nc-Ts201 User Manual',
          url: 'https://example.com/nc-ts201/manual',
        },
        {
          title: 'Nutricook Smart Toaster Nc-Ts201 Features & Recipes',
          url: 'https://example.com/nc-ts201/features',
        },
      ];
      const { name } = generateGroupName(tabs);
      expect(name).not.toMatch(/nc-ts201/i);
      expect(name).toContain('Nutricook Smart Toaster');
    });

    it('rejects conversational pronouns and question words as leading tokens (e.g. You\'re, Why)', () => {
      const tabs: Tab[] = [
        {
          title: "You're Doing Python Dependency Management Wrong",
          url: 'https://example.com/p1',
        },
        {
          title: "You're Structuring Python Projects Inefficiently",
          url: 'https://example.com/p2',
        },
      ];
      const { name } = generateGroupName(tabs);
      expect(name).not.toMatch(/^you('?re)?\b/i);
      expect(name).toContain('Python');
    });

    it('prefers descriptive service branding over raw IP addresses', () => {
      const tabs: Tab[] = [
        {
          title: '9Router - AI Infrastructure Management',
          url: 'http://198.55.103.161/dashboard',
        },
        {
          title: '9Router - AI Infrastructure Management',
          url: 'http://198.55.103.161/clusters',
        },
      ];
      const { name } = generateGroupName(tabs);
      expect(name).not.toContain('198.55.103.161');
      expect(name).toBe('9Router AI Infrastructure');
    });
  });
});
