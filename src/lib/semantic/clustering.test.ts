import { describe, it, expect } from 'vitest';
import { clusterTabs, computeClusterCentroid } from './clustering';
import type { Tab } from '../storage';
import { l2Normalize } from './similarity';

describe('Deterministic Clustering Engine (clustering.ts)', () => {
  const makeVector = (angleDeg: number): Float32Array => {
    const rad = (angleDeg * Math.PI) / 180;
    const v = new Float32Array(384);
    v[0] = Math.cos(rad);
    v[1] = Math.sin(rad);
    return l2Normalize(v);
  };

  it('handles empty input array', () => {
    const res = clusterTabs([]);
    expect(res.clusters).toEqual([]);
    expect(res.ungroupedTabs).toEqual([]);
  });

  it('handles single tab: leaves it in ungroupedTabs with default minSize = 2', () => {
    const tab: Tab = { title: 'Solo Tab', url: 'https://solo.com' };
    const res = clusterTabs([{ tab, embedding: makeVector(0) }]);
    expect(res.clusters).toHaveLength(0);
    expect(res.ungroupedTabs).toHaveLength(1);
    expect(res.ungroupedTabs[0]).toEqual(tab);
  });

  it('clusters related tabs with similarity >= 0.70', () => {
    // 0 deg and 30 deg -> cos(30 deg) = 0.866 >= 0.70
    const tab1: Tab = { title: 'Django Auth', url: 'https://django.org/auth' };
    const tab2: Tab = { title: 'Django JWT', url: 'https://django.org/jwt' };

    const items = [
      { tab: tab1, embedding: makeVector(0) },
      { tab: tab2, embedding: makeVector(30) },
    ];

    const res = clusterTabs(items, { similarityThreshold: 0.70 });
    expect(res.clusters).toHaveLength(1);
    expect(res.clusters[0].tabs).toHaveLength(2);
    expect(res.ungroupedTabs).toHaveLength(0);
  });

  it('strictly prevents transitive chaining (A ~ B ~ C where A !~ C)', () => {
    // A at 0 deg, B at 40 deg, C at 80 deg.
    // cos(40 deg) = 0.766 >= 0.70.
    // BUT cos(80 deg) = 0.174 < 0.70.
    const tabA: Tab = { title: 'Topic A', url: 'https://a.com' };
    const tabB: Tab = { title: 'Topic B', url: 'https://b.com' };
    const tabC: Tab = { title: 'Topic C', url: 'https://c.com' };

    const items = [
      { tab: tabA, embedding: makeVector(0) },
      { tab: tabB, embedding: makeVector(40) },
      { tab: tabC, embedding: makeVector(80) },
    ];

    const res = clusterTabs(items, { similarityThreshold: 0.70 });
    // Under complete linkage, all 3 cannot merge into a single cluster
    expect(res.clusters.every((c) => c.tabs.length < 3)).toBe(true);
  });

  it('separates two distinct topics into two separate clusters', () => {
    // Group 1 (Python): 0 deg and 20 deg (sim 0.94)
    // Group 2 (Music): 100 deg and 110 deg (sim 0.98)
    // Cross-similarity: ~0.17 < 0.70
    const items = [
      { tab: { title: 'Python Tutorial', url: 'https://python.org' }, embedding: makeVector(0) },
      { tab: { title: 'Python Docs', url: 'https://docs.python.org' }, embedding: makeVector(20) },
      { tab: { title: 'Radiohead Spotify', url: 'https://spotify.com/radiohead' }, embedding: makeVector(100) },
      { tab: { title: 'Radiohead Discography', url: 'https://discogs.com/radiohead' }, embedding: makeVector(110) },
    ];

    const res = clusterTabs(items, { similarityThreshold: 0.70 });
    expect(res.clusters).toHaveLength(2);
    expect(res.clusters[0].tabs).toHaveLength(2);
    expect(res.clusters[1].tabs).toHaveLength(2);
    expect(res.ungroupedTabs).toHaveLength(0);
  });

  it('respects configurable minimumGroupSize and similarityThreshold', () => {
    const items = [
      { tab: { title: 'Tab 1', url: 'https://t1.com' }, embedding: makeVector(0) },
      { tab: { title: 'Tab 2', url: 'https://t2.com' }, embedding: makeVector(30) },
    ];

    // High threshold 0.95 -> cos(30 deg) = 0.866 < 0.95 -> no cluster
    const resHigh = clusterTabs(items, { similarityThreshold: 0.95 });
    expect(resHigh.clusters).toHaveLength(0);
    expect(resHigh.ungroupedTabs).toHaveLength(2);

    // minSize = 3 -> only 2 items -> no cluster
    const resMinSize = clusterTabs(items, { similarityThreshold: 0.70, minimumGroupSize: 3 });
    expect(resMinSize.clusters).toHaveLength(0);
    expect(resMinSize.ungroupedTabs).toHaveLength(2);
  });

  describe('Cluster Centroid & Vector Math', () => {
    it('computes L2-normalized cluster centroid accurately', () => {
      const v0 = makeVector(0);
      const v60 = makeVector(60);
      const centroid = computeClusterCentroid([v0, v60]);

      expect(centroid.length).toBe(384);
      // Normalized sum of (1,0) and (0.5, 0.866) -> angle is 30 deg
      const expected30 = makeVector(30);
      expect(Math.abs(centroid[0] - expected30[0])).toBeLessThan(1e-4);
      expect(Math.abs(centroid[1] - expected30[1])).toBeLessThan(1e-4);
    });

    it('handles empty embeddings array gracefully', () => {
      const centroid = computeClusterCentroid([]);
      expect(centroid.length).toBe(0);
    });
  });

  describe('Two-Tier Semantic Information Quality (SIQ) Clustering', () => {
    it('isolates generic platform tabs into a fallback platform group without contaminating informative topic clusters', () => {
      // Informative Topic 1: Life is Strange (angle 0, 15 deg -> sim 0.96)
      const lis1: Tab = {
        title: "Life is Strange: Max's Mixtape | Side B Folk Mix",
        url: 'https://youtube.com/watch?v=lis1',
      };
      const lis2: Tab = {
        title: "Life is Strange: Max's Mixtape | Side A Folk Mix",
        url: 'https://youtube.com/watch?v=lis2',
      };

      // Informative Topic 2: The Last of Us (angle 80, 90 deg -> sim 0.98)
      const tlou1: Tab = {
        title: 'The Last of Us Part 1 Walkthrough',
        url: 'https://youtube.com/watch?v=tlou1',
      };
      const tlou2: Tab = {
        title: 'The Last of Us Remastered Review',
        url: 'https://youtube.com/watch?v=tlou2',
      };

      // Low-Information / Platform tabs: generic YouTube homepages (angle 180)
      const ytHome1: Tab = { title: 'YouTube', url: 'https://www.youtube.com/' };
      const ytHome2: Tab = { title: 'YouTube', url: 'https://www.youtube.com/' };
      const ytHome3: Tab = { title: 'Trending - YouTube', url: 'https://www.youtube.com/feed/trending' };

      // Informative singleton: Sourdough baking (angle 270)
      const sourdough: Tab = {
        title: 'Artisan Sourdough Bread Masterclass',
        url: 'https://youtube.com/watch?v=bread',
      };

      const items = [
        { tab: lis1, embedding: makeVector(0) },
        { tab: lis2, embedding: makeVector(15) },
        { tab: tlou1, embedding: makeVector(80) },
        { tab: tlou2, embedding: makeVector(90) },
        { tab: ytHome1, embedding: makeVector(180) },
        { tab: ytHome2, embedding: makeVector(185) },
        { tab: ytHome3, embedding: makeVector(190) },
        { tab: sourdough, embedding: makeVector(270) },
      ];

      const result = clusterTabs(items, { similarityThreshold: 0.70 });

      // Expect exactly 2 topic clusters:
      // 1. Life is Strange (2 tabs)
      // 2. The Last of Us (2 tabs)
      // Low-information YouTube platform homepages/trending tabs are NOT forced into a platform group;
      // they remain safely in ungroupedTabs alongside the sourdough singleton.
      expect(result.clusters).toHaveLength(2);

      const clusterNames = result.clusters.map((c) => c.name);
      expect(clusterNames).toContain('Life is Strange Music');
      expect(clusterNames).toContain('The Last of Us');
      expect(clusterNames).not.toContain('YouTube');

      // The 3 generic YouTube tabs + sourdough singleton remain safely in ungroupedTabs
      expect(result.ungroupedTabs).toHaveLength(4);
      expect(result.ungroupedTabs.map((t) => t.title)).toContain('Artisan Sourdough Bread Masterclass');
    });

    it('leaves multiple generic low-information tabs ungrouped rather than creating artificial domain buckets', () => {
      const items = [
        { tab: { title: 'Instagram', url: 'https://instagram.com/' }, embedding: makeVector(0) },
        { tab: { title: 'Instagram', url: 'https://instagram.com/' }, embedding: makeVector(10) },
      ];

      const res = clusterTabs(items, { similarityThreshold: 0.70 });
      // Pure platform homepages lack semantic evidence and must not create an artificial domain group
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(2);
    });

    it('leaves single low-information tab in ungroupedTabs when it does not meet minSize', () => {
      const items = [
        { tab: { title: 'ChatGPT', url: 'https://chatgpt.com/' }, embedding: makeVector(0) },
      ];

      const res = clusterTabs(items, { similarityThreshold: 0.70, minimumGroupSize: 2 });
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(1);
      expect(res.ungroupedTabs[0].title).toBe('ChatGPT');
    });

    it('Maktabkhooneh regression: does NOT group unrelated courses (Git, Scrum, Marketing) into an "Osi" attractor', () => {
      // 2 Networking & OSI tabs (vectors at 0, 10 deg -> sim 0.98 >= 0.70)
      const osi1: Tab = {
        title: 'آموزش مفاهیم شبکه و مدل OSI | مکتب‌خونه',
        url: 'https://maktabkhooneh.org/course/networking-fundamentals/',
      };
      const osi2: Tab = {
        title: 'دوره آموزش معماری شبکه و لایه های OSI | مکتب‌خونه',
        url: 'https://maktabkhooneh.org/course/osi-architecture/',
      };

      // Unrelated courses on the same platform (vectors spread across 90, 150, 210, 270 deg)
      const git: Tab = {
        title: 'آموزش گیت و گیت هاب | مکتب‌خونه',
        url: 'https://maktabkhooneh.org/course/git-github/',
      };
      const scrum: Tab = {
        title: 'آموزش اسکرام و اجایل | مکتب‌خونه',
        url: 'https://maktabkhooneh.org/course/scrum-agile/',
      };
      const marketing: Tab = {
        title: 'آموزش تحلیل بازاریابی دیجیتال | مکتب‌خونه',
        url: 'https://maktabkhooneh.org/course/digital-marketing/',
      };

      const items = [
        { tab: osi1, embedding: makeVector(0) },
        { tab: osi2, embedding: makeVector(10) },
        { tab: git, embedding: makeVector(90) },
        { tab: scrum, embedding: makeVector(150) },
        { tab: marketing, embedding: makeVector(210) },
      ];

      const res = clusterTabs(items, { similarityThreshold: 0.70 });

      // Exactly 1 cluster formed: the 2 networking/OSI tabs
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(2);
      expect(res.clusters[0].name.toLowerCase()).toContain('osi');

      // The unrelated courses (Git, Scrum, Marketing) must NOT be grouped into an "Osi" monster!
      expect(res.ungroupedTabs).toHaveLength(3);
      const ungroupedUrls = res.ungroupedTabs.map((t) => t.url);
      expect(ungroupedUrls).toContain(git.url);
      expect(ungroupedUrls).toContain(scrum.url);
      expect(ungroupedUrls).toContain(marketing.url);
    });

    it('Pinterest regression: separates unrelated pins while preserving authentic entity clusters', () => {
      // 2 coherent Ellie Williams pins (angle 0, 15 deg -> sim 0.96)
      const ellie1: Tab = {
        title: 'Pin on Ellie Williams',
        url: 'https://www.pinterest.com/pin/111/',
      };
      const ellie2: Tab = {
        title: 'Ellie Williams Character Art | Pinterest',
        url: 'https://www.pinterest.com/pin/222/',
      };

      // Unrelated pins on Pinterest (angles 90, 150, 210, 270 deg)
      const pinMusic: Tab = {
        title: 'Pin on music aesthetic',
        url: 'https://www.pinterest.com/pin/333/',
      };
      const pinWallpapers: Tab = {
        title: 'Backgrounds & wallpapers',
        url: 'https://www.pinterest.com/pin/444/',
      };
      const quickSaves: Tab = {
        title: 'Quick Saves',
        url: 'https://www.pinterest.com/pin/555/',
      };

      const items = [
        { tab: ellie1, embedding: makeVector(0) },
        { tab: ellie2, embedding: makeVector(15) },
        { tab: pinMusic, embedding: makeVector(90) },
        { tab: pinWallpapers, embedding: makeVector(150) },
        { tab: quickSaves, embedding: makeVector(210) },
      ];

      const res = clusterTabs(items, { similarityThreshold: 0.70 });

      // Only the 2 coherent Ellie Williams pins form a group
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].name).toBe('Ellie Williams');
      expect(res.clusters[0].tabs).toHaveLength(2);

      // The 3 unrelated pins must NEVER form a 15-tab "Pin" bucket
      expect(res.ungroupedTabs).toHaveLength(3);
      const ungroupedUrls = res.ungroupedTabs.map((t) => t.url);
      expect(ungroupedUrls).toContain(pinMusic.url);
      expect(ungroupedUrls).toContain(pinWallpapers.url);
      expect(ungroupedUrls).toContain(quickSaves.url);
    });

    it('YouTube regression: does NOT bucket unrelated videos (VPN, Claude, MasterDNS) into "YouTube"', () => {
      // 4 unrelated YouTube videos
      const nipo: Tab = { title: 'NipoVPN Setup and Configuration - YouTube', url: 'https://youtube.com/watch?v=1' };
      const claude: Tab = { title: 'Claude 3.7 System Prompt Optimization - YouTube', url: 'https://youtube.com/watch?v=2' };
      const dns: Tab = { title: 'MasterDNS Server Tutorial - YouTube', url: 'https://youtube.com/watch?v=3' };
      const vercel: Tab = { title: 'Vercel XHTTP Edge Functions - YouTube', url: 'https://youtube.com/watch?v=4' };

      const items = [
        { tab: nipo, embedding: makeVector(0) },
        { tab: claude, embedding: makeVector(80) },
        { tab: dns, embedding: makeVector(160) },
        { tab: vercel, embedding: makeVector(240) },
      ];

      const res = clusterTabs(items, { similarityThreshold: 0.70 });

      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(4);
    });
  });
});
