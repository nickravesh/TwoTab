/**
 * Real-World Tab Corpus Validation Runner
 *
 * Runs TwoTab's complete production pipeline:
 * Tab Normalization -> SIQ Low-Info Quarantine -> Deduplication -> Complete-Linkage HAC ->
 * Second-Stage Conservative Merge -> Duplicate Restoration -> Vector-Guided Conceptual Naming.
 *
 * Exercises the complete real-world corpus and outputs the exact preview structure for audit.
 */

import { describe, it, expect } from 'vitest';
import { clusterTabs } from '@/lib/semantic/clustering';
import { l2Normalize } from '@/lib/semantic/similarity';
import type { Tab } from '@/lib/storage';
import type { ClusterGroup } from '@/lib/semantic/types';

describe('Real-World Tab Corpus Validation Runner', () => {
  const makeTopicVector = (topicId: number, subAngleDeg: number = 0): Float32Array => {
    const v = new Float32Array(384);
    const baseDim = (topicId * 4) % 380;
    const rad = (subAngleDeg * Math.PI) / 180;
    v[baseDim] = Math.cos(rad);
    v[baseDim + 1] = Math.sin(rad);
    return l2Normalize(v);
  };

  const REAL_WORLD_CORPUS: Array<{ tab: Tab; embedding: Float32Array }> = [
    // 1. 9Router AI Infrastructure
    {
      tab: { title: '9Router - AI Infrastructure Management', url: 'http://198.55.103.161/dashboard' },
      embedding: makeTopicVector(1, 0),
    },
    {
      tab: { title: '9Router - AI Infrastructure Management', url: 'http://198.55.103.161/clusters' },
      embedding: makeTopicVector(1, 5),
    },

    // 2. Life is Strange Music
    {
      tab: {
        title: "Life is Strange: Max's Mixtape | Side B 🎵 Folk & Indie Pop Mix | Music & Ambiance🌙📼 - YouTube",
        url: 'https://youtube.com/watch?v=lis1',
      },
      embedding: makeTopicVector(2, 0),
    },
    {
      tab: {
        title: "(33) Life is Strange: Max's Mixtape | Side A 🎵 Folk & Indie Pop Mix | Music & Ambiance🌞📼 - YouTube",
        url: 'https://youtube.com/watch?v=lis2',
      },
      embedding: makeTopicVector(2, 10),
    },
    {
      tab: {
        title: 'Life is Strange Ambient Acoustic Guitar Soundtrack | Relaxing Music - YouTube',
        url: 'https://youtube.com/watch?v=lis3',
      },
      embedding: makeTopicVector(2, 18),
    },

    // 3. Prompt Engineering / ChatGPT
    {
      tab: { title: 'AI display assessment prompt', url: 'https://chatgpt.com/c/prompt1' },
      embedding: makeTopicVector(3, 0),
    },
    {
      tab: { title: 'ChatGPT - System Prompt Generator', url: 'https://chatgpt.com/g/g-sysprompt' },
      embedding: makeTopicVector(3, 8),
    },

    // 4. The Last of Us Ambience
    {
      tab: {
        title: 'A Quiet Break Near Jackson: Ellie & Joel Waterfall Ambiance | Relaxing Music 4K - YouTube',
        url: 'https://youtube.com/watch?v=tlou1',
      },
      embedding: makeTopicVector(4, 0),
    },
    {
      tab: {
        title: 'A Calm Day in Jackson with Ellie | Relaxing Rain Sounds & Ambient Music 4K - YouTube',
        url: 'https://youtube.com/watch?v=tlou2',
      },
      embedding: makeTopicVector(4, 12),
    },

    // 5. Gemini Flash Models
    {
      tab: { title: 'gemeni 3.7 flash vs 3.6 flash - Google Search', url: 'https://google.com/search?q=1' },
      embedding: makeTopicVector(5, 0),
    },
    {
      tab: { title: 'gemeni 3.6 flash vs gemeni 3.1 pro benchmark - Google Search', url: 'https://google.com/search?q=2' },
      embedding: makeTopicVector(5, 10),
    },

    // 6. Gemini Announcement Articles
    {
      tab: { title: 'Gemini 3.7 Flash: our most intelligent workhorse model', url: 'https://blog.google/technology/ai/gemini-3-7-flash/' },
      embedding: makeTopicVector(6, 0),
    },
    {
      tab: { title: 'Gemini Omni experts answer key questions about the model', url: 'https://blog.google/technology/ai/gemini-omni/' },
      embedding: makeTopicVector(6, 12),
    },

    // 7. LiquidGlass WebGL
    {
      tab: { title: 'LiquidGlass — WebGL Glass Effects for the Web', url: 'https://liquid-glass.ybouane.com/' },
      embedding: makeTopicVector(7, 0),
    },
    {
      tab: {
        title: 'ybouane/liquidglass: A liquid glass effect library for the web. Apply realistic glass refraction, blur, chromatic aberration, and lighting effects to any HTML element using WebGL shaders.',
        url: 'https://github.com/ybouane/liquidglass',
      },
      embedding: makeTopicVector(7, 10),
    },

    // 8. Hermes Agent
    {
      tab: { title: 'Hermes agent terminal backend', url: 'https://chatgpt.com/c/hermes' },
      embedding: makeTopicVector(8, 0),
    },
    {
      tab: { title: 'Hermes Agent Terminal Backend Choices - Google Gemini', url: 'https://gemini.google.com/app/hermes' },
      embedding: makeTopicVector(8, 10),
    },

    // 9. Docker Documentation (Deduplication Test)
    {
      tab: { title: 'Install Docker Engine on Ubuntu | Docker Docs', url: 'https://docs.docker.com/engine/install/ubuntu/' },
      embedding: makeTopicVector(9, 0),
    },
    {
      tab: { title: 'Install Docker Engine on Ubuntu | Docker Docs', url: 'https://docs.docker.com/engine/install/ubuntu/' },
      embedding: makeTopicVector(9, 0),
    },

    // 10. AI Model Benchmarks
    {
      tab: {
        title: 'AI Leaderboard 2026: Compare & Rank 300+ Top AI Models by Intelligence, Speed & Price',
        url: 'https://llm-stats.com/',
      },
      embedding: makeTopicVector(10, 0),
    },
    {
      tab: {
        title: 'LLM Leaderboard & AI Model Benchmarks — August 2026 | 381 Models Compared | BenchLM.ai',
        url: 'https://benchlm.ai/',
      },
      embedding: makeTopicVector(10, 10),
    },

    // 11. Bange Laptop Bags
    {
      tab: {
        title: 'کوله پشتی بنج مدل Bange BG-7216 مناسب برای لپ تاپ 15.6 اینچی - دیجی‌کالا',
        url: 'https://www.digikala.com/product/dkp-12345/bange-backpack/',
      },
      embedding: makeTopicVector(11, 0),
    },
    {
      tab: {
        title: 'کوله پشتی لپ تاپ بنج مدل BG-1908 - دیجی‌کالا',
        url: 'https://www.digikala.com/product/dkp-67890/bange-laptop-bag/',
      },
      embedding: makeTopicVector(11, 12),
    },

    // 12. Metallica T-Shirts
    {
      tab: {
        title: 'تیشرت مردانه طرح متالیکا مدل Metallica Master of Puppets - دیجی‌کالا',
        url: 'https://www.digikala.com/product/dkp-1111/metallica-tshirt/',
      },
      embedding: makeTopicVector(12, 0),
    },
    {
      tab: {
        title: 'تیشرت متالیکا طرح Ride the Lightning - دیجی‌کالا',
        url: 'https://www.digikala.com/product/dkp-2222/metallica-tee/',
      },
      embedding: makeTopicVector(12, 12),
    },

    // 13. Learned Cardinality Estimation
    {
      tab: {
        title: 'A Lightweight Learned Cardinality Estimation Model with Error Bounds - IEEE Xplore',
        url: 'https://ieeexplore.ieee.org/document/9123456',
      },
      embedding: makeTopicVector(13, 0),
    },
    {
      tab: {
        title: 'A Lightweight Learned Cardinality Estimation Model with Error Bounds | arXiv',
        url: 'https://arxiv.org/abs/2203.54321',
      },
      embedding: makeTopicVector(13, 10),
    },

    // 14. LSM-Tree Cost Estimation
    {
      tab: {
        title: 'A Dual-Layer End-to-End Cost Estimation Model for LSM-Tree-Based Database Systems',
        url: 'https://dl.acm.org/doi/10.1145/3514221',
      },
      embedding: makeTopicVector(14, 0),
    },
    {
      tab: {
        title: 'A Dual-Layer End-to-End Cost Estimation Model for LSM-Tree-Based Database Systems | arXiv',
        url: 'https://arxiv.org/abs/2112.09876',
      },
      embedding: makeTopicVector(14, 10),
    },

    // 15. Battlefield Music (Defragmentation Test)
    // Sub-cluster 1 (BF1): angle 0, 8 deg
    // Sub-cluster 2 (BF2/1942): angle 20, 24 deg
    // Both sub-clusters share Battlefield Music topic concept (centroid sim >= 0.80)
    {
      tab: {
        title: 'Battlefield 1 Official Soundtrack - Dawn of a New World OST',
        url: 'https://youtube.com/watch?v=bf1',
      },
      embedding: makeTopicVector(15, 0),
    },
    {
      tab: {
        title: 'Battlefield 1 Ambient War Music & Relaxing Rain Mix',
        url: 'https://youtube.com/watch?v=bf1b',
      },
      embedding: makeTopicVector(15, 8),
    },
    {
      tab: {
        title: 'Battlefield 2 Theme - Extended Orchestral OST | Battlefield Music',
        url: 'https://youtube.com/watch?v=bf2',
      },
      embedding: makeTopicVector(15, 20),
    },
    {
      tab: {
        title: 'Battlefield 1942 Original Game Soundtrack Orchestral Suite',
        url: 'https://youtube.com/watch?v=bf42',
      },
      embedding: makeTopicVector(15, 24),
    },

    // 16. Shadcn UI
    {
      tab: { title: 'Button Component - shadcn/ui', url: 'https://ui.shadcn.com/docs/components/button' },
      embedding: makeTopicVector(16, 0),
    },
    {
      tab: { title: 'Dialog Component - shadcn/ui', url: 'https://ui.shadcn.com/docs/components/dialog' },
      embedding: makeTopicVector(16, 10),
    },

    // 17. TwoTab Chrome Extension
    {
      tab: { title: 'nickravesh/TwoTab: Privacy-first, lightweight tab organizer', url: 'https://github.com/nickravesh/TwoTab' },
      embedding: makeTopicVector(17, 0),
    },
    {
      tab: { title: 'TwoTab - Intelligent Tab Grouping Architecture', url: 'https://github.com/nickravesh/TwoTab/pull/42' },
      embedding: makeTopicVector(17, 10),
    },

    // 18. Mac Software Downloads
    {
      tab: { title: 'Proxifier for Mac - Download Free Latest Version', url: 'https://macapp.example.com/proxifier' },
      embedding: makeTopicVector(18, 0),
    },
    {
      tab: { title: 'IconJar for macOS - Direct Download DMG', url: 'https://macapp.example.com/iconjar' },
      embedding: makeTopicVector(18, 10),
    },

    // -------------------------------------------------------------------------
    // Negative / Heterogeneous / Low-Information Tabs (Must NOT contaminate)
    // -------------------------------------------------------------------------

    // A. Unrelated Digikala products
    {
      tab: { title: 'مشخصات، قیمت و خرید اسپرسوساز دلونگی مدل EC685', url: 'https://www.digikala.com/product/dkp-101/delonghi' },
      embedding: makeTopicVector(20, 0),
    },
    {
      tab: { title: 'مشخصات، قیمت و خرید ماوس بی سیم باسئوس مدل F01B', url: 'https://www.digikala.com/product/dkp-102/baseus' },
      embedding: makeTopicVector(21, 0),
    },
    {
      tab: { title: 'مشخصات، قیمت و خرید چوب لباسی چوبی ایکیا', url: 'https://www.digikala.com/product/dkp-103/ikea' },
      embedding: makeTopicVector(22, 0),
    },
    {
      tab: { title: 'فروشگاه اینترنتی دیجی‌کالا', url: 'https://www.digikala.com/' },
      embedding: makeTopicVector(23, 0),
    },

    // B. Maktabkhooneh unrelated courses & homepage
    {
      tab: { title: 'آموزش مفاهیم شبکه و مدل OSI | مکتب‌خونه', url: 'https://maktabkhooneh.org/course/networking-fundamentals/' },
      embedding: makeTopicVector(24, 0),
    },
    {
      tab: { title: 'مدارک لازم برای پذیرش دانشگاهی و اپلای تحصیلی | مکتب‌خونه', url: 'https://maktabkhooneh.org/mag/university-admission/' },
      embedding: makeTopicVector(25, 0),
    },
    {
      tab: { title: 'مکتب‌خونه | آکادمی آنلاین یادگیری مهارت‌ها', url: 'https://maktabkhooneh.org/' },
      embedding: makeTopicVector(26, 0),
    },

    // C. X-UI vs OSINT
    {
      tab: { title: 'آموزش نصب و کانفیگ پنل X-UI روی سرور ابری اوبونتو', url: 'https://github.com/vaxilu/x-ui' },
      embedding: makeTopicVector(27, 0),
    },
    {
      tab: { title: 'Introduction to Open Source Intelligence (OSINT) Framework', url: 'https://osintframework.com/' },
      embedding: makeTopicVector(28, 0),
    },

    // D. Generic YouTube & Unrelated Videos
    {
      tab: { title: 'YouTube', url: 'https://www.youtube.com/' },
      embedding: makeTopicVector(29, 0),
    },
    {
      tab: { title: 'Trending - YouTube', url: 'https://www.youtube.com/feed/trending' },
      embedding: makeTopicVector(29, 10),
    },
    {
      tab: { title: 'NipoVPN Setup and Configuration - YouTube', url: 'https://youtube.com/watch?v=nipo1' },
      embedding: makeTopicVector(30, 0),
    },
    {
      tab: { title: 'BBC Global News Podcast - YouTube', url: 'https://youtube.com/watch?v=bbc1' },
      embedding: makeTopicVector(31, 0),
    },

    // E. Generic Pinterest Pins
    {
      tab: { title: 'Pin by Sarah on Art & Design | Pinterest', url: 'https://www.pinterest.com/pin/p1/' },
      embedding: makeTopicVector(32, 0),
    },
    {
      tab: { title: 'Pin on DIY Home Decor | Pinterest', url: 'https://www.pinterest.com/pin/p2/' },
      embedding: makeTopicVector(33, 0),
    },
    {
      tab: { title: 'Quick Saves | Pinterest', url: 'https://www.pinterest.com/pin/p3/' },
      embedding: makeTopicVector(34, 0),
    },

    // F. Error 403 / 404 Pages
    {
      tab: {
        title: "403. That’s an error. Your client does not have permission to get URL / from this server.",
        url: 'https://gemini.google.com/403',
      },
      embedding: makeTopicVector(35, 0),
    },
    {
      tab: {
        title: 'Error 403 (Forbidden) - Google Cloud Console',
        url: 'https://console.cloud.google.com/error403',
      },
      embedding: makeTopicVector(35, 5),
    },
    {
      tab: {
        title: 'Domain Blocked by Administrator',
        url: 'https://blocked.example.com/',
      },
      embedding: makeTopicVector(36, 0),
    },
  ];

  it('runs complete real-world corpus through production pipeline and asserts on zero-contamination', () => {
    const result = clusterTabs(REAL_WORLD_CORPUS, {
      similarityThreshold: 0.70,
      minimumGroupSize: 2,
    });

    console.log('\n==================================================');
    console.log('REAL-WORLD TAB CORPUS GROUPING RESULT');
    console.log('==================================================\n');

    for (const group of result.clusters) {
      console.log(`${group.name}\n`);
      console.log(`${group.tabs.length} tabs\n`);
      for (const tab of group.tabs) {
        console.log(`${tab.title}`);
        try {
          const u = new URL(tab.url);
          console.log(`${u.hostname.replace(/^(www\.|m\.)/, '')}\n`);
        } catch {
          console.log(`${tab.url}\n`);
        }
      }
      console.log('--------------------------------------------------\n');
    }

    console.log('==================================================');
    console.log(`UNGROUPED TABS (${result.ungroupedTabs.length} tabs)`);
    console.log('==================================================\n');
    for (const tab of result.ungroupedTabs) {
      console.log(`- ${tab.title} (${tab.url})`);
    }

    const clusterNames = result.clusters.map((c) => c.name);

    // Negative Verification: Zero-contamination invariants
    expect(clusterNames).not.toContain('Pinterest');
    expect(clusterNames).not.toContain('Pin');
    expect(clusterNames).not.toContain('YouTube');
    expect(clusterNames).not.toContain('Error 403');
    expect(clusterNames).not.toContain('Domain Blocked');
    expect(clusterNames).not.toContain('Digikala Product');
    expect(clusterNames).not.toContain('Digikala');
    expect(clusterNames).not.toContain('Maktabkhooneh');

    // Positive Verification: High-precision topics
    expect(clusterNames).toContain('Life is Strange Music');
    expect(clusterNames).toContain('The Last of Us Ambience');
    expect(clusterNames).toContain('Gemini Flash Models');
    expect(clusterNames).toContain('Hermes Agent');
    expect(clusterNames).toContain('Bange Laptop Bags');
    expect(clusterNames).toContain('Metallica T-Shirts');
    expect(clusterNames).toContain('Learned Cardinality Estimation Research');
    expect(clusterNames).toContain('LSM-Tree Cost Estimation Research');
    expect(clusterNames).toContain('Shadcn UI');
    expect(clusterNames).toContain('Mac Software Downloads');
    expect(clusterNames.some((n) => n.includes('Battlefield'))).toBe(true);

    // Defragmentation Verification: Battlefield is ONE unified cluster, not fragmented
    const battlefieldClusters = result.clusters.filter((c) => c.name.toLowerCase().includes('battlefield'));
    expect(battlefieldClusters).toHaveLength(1);
    expect(battlefieldClusters[0].tabs).toHaveLength(4);

    // Deduplication Verification: Docker docs (2 identical tabs) unified in 1 group
    const dockerCluster = result.clusters.find((c) => c.name.toLowerCase().includes('docker'));
    expect(dockerCluster).toBeDefined();
    expect(dockerCluster?.tabs).toHaveLength(2);

    // Purity Metrics Verification
    for (const group of result.clusters) {
      expect(group.metrics).toBeDefined();
      expect(group.metrics!.meanPairwiseSimilarity).toBeGreaterThanOrEqual(0.70);
      expect(group.metrics!.minPairwiseSimilarity).toBeGreaterThanOrEqual(0.58);
    }
  });

  it('guarantees bare Pinterest pins with numeric URLs and no titles are quarantined to ungroupedTabs', () => {
    const barePins = [
      { tab: { title: '', url: 'https://nl.pinterest.com/pin/1052294269198576897/' }, embedding: makeTopicVector(50, 0) },
      { tab: { title: '', url: 'https://nl.pinterest.com/pin/1052294269198576898/' }, embedding: makeTopicVector(50, 1) },
      { tab: { title: '', url: 'https://nl.pinterest.com/pin/1052294269198576899/' }, embedding: makeTopicVector(50, 2) },
      { tab: { title: 'nl.pinterest.com/pin/1052294269198576900/', url: 'https://nl.pinterest.com/pin/1052294269198576900/' }, embedding: makeTopicVector(50, 3) },
      { tab: { title: 'Pin', url: 'https://nl.pinterest.com/pin/1052294269198576901/' }, embedding: makeTopicVector(50, 4) },
      { tab: { title: 'nl.pinterest.com/pin/1052294269198576902/', url: 'https://nl.pinterest.com/pin/1052294269198576902/' }, embedding: makeTopicVector(50, 5) },
      { tab: { title: '', url: 'https://nl.pinterest.com/pin/1052294269198576903/' }, embedding: makeTopicVector(50, 6) },
    ];

    const res = clusterTabs(barePins, { similarityThreshold: 0.70 });
    // Under SIQ quarantine, bare pins without substantive titles are NEVER clustered into a 7-tab "Pinterest" bucket
    expect(res.clusters).toHaveLength(0);
    expect(res.ungroupedTabs).toHaveLength(7);
  });
});
