/**
 * Tier 1 Feature Coverage: Section 11 Comprehensive Real-World Clustering Quality
 *
 * Exercises BOTH:
 * - Negative clustering scenarios (tabs that MUST NOT be grouped together)
 * - Positive clustering & defragmentation scenarios (tabs that MUST form high-precision clusters)
 *
 * Verifies production pipeline invariants directly via clusterTabs.
 */

import { describe, it, expect } from 'vitest';
import { clusterTabs } from '@/lib/semantic/clustering';
import { l2Normalize } from '@/lib/semantic/similarity';
import type { Tab } from '@/lib/storage';

describe('Tier 1: Section 11 Real-World Clustering Quality & Negative Test Suite', () => {
  const makeVector = (angleDeg: number): Float32Array => {
    const rad = (angleDeg * Math.PI) / 180;
    const v = new Float32Array(384);
    v[0] = Math.cos(rad);
    v[1] = Math.sin(rad);
    return l2Normalize(v);
  };

  // ---------------------------------------------------------------------------
  // Negative Clustering Scenarios (Tabs that MUST NOT form false clusters)
  // ---------------------------------------------------------------------------
  describe('Negative Clustering Scenarios', () => {
    it('1. Generic Pinterest pins without topical substance remain ungrouped', () => {
      const pins = [
        {
          tab: {
            title: 'Pin by Sarah on Art & Design | Pinterest',
            url: 'https://www.pinterest.com/pin/101/',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'Pin on DIY Home Decor | Pinterest',
            url: 'https://www.pinterest.com/pin/102/',
          },
          embedding: makeVector(90),
        },
        {
          tab: {
            title: 'Quick Saves | Pinterest',
            url: 'https://www.pinterest.com/pin/103/',
          },
          embedding: makeVector(180),
        },
      ];

      const res = clusterTabs(pins);
      // Unrelated Pinterest pins with zero shared topic remain ungrouped
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(3);
    });

    it('2. Unrelated YouTube videos on different topics do not form an artificial "YouTube" cluster', () => {
      const videos = [
        {
          tab: {
            title: 'NipoVPN Setup and Configuration - YouTube',
            url: 'https://youtube.com/watch?v=1',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'MasterDNS Linux Server Tutorial - YouTube',
            url: 'https://youtube.com/watch?v=2',
          },
          embedding: makeVector(90),
        },
        {
          tab: {
            title: 'BBC Global News Podcast - YouTube',
            url: 'https://youtube.com/watch?v=3',
          },
          embedding: makeVector(180),
        },
      ];

      const res = clusterTabs(videos);
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(3);
    });

    it('3. Unrelated Digikala e-commerce products do not cluster into a false shopping grab-bag', () => {
      const products = [
        {
          tab: {
            title: 'مشخصات، قیمت و خرید اسپرسوساز دلونگی مدل EC685',
            url: 'https://www.digikala.com/product/dkp-101/delonghi-coffee',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'مشخصات، قیمت و خرید ماوس بی سیم باسئوس مدل F01B',
            url: 'https://www.digikala.com/product/dkp-102/baseus-mouse',
          },
          embedding: makeVector(90),
        },
        {
          tab: {
            title: 'مشخصات، قیمت و خرید چوب لباسی چوبی ایکیا',
            url: 'https://www.digikala.com/product/dkp-103/ikea-hanger',
          },
          embedding: makeVector(180),
        },
        {
          tab: {
            title: 'فروشگاه اینترنتی دیجی‌کالا',
            url: 'https://www.digikala.com/',
          },
          embedding: makeVector(270),
        },
      ];

      const res = clusterTabs(products);
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(4);
    });

    it('4. Maktabkhooneh university admission pages do not cluster with technical networking course', () => {
      const courses = [
        {
          tab: {
            title: 'آموزش مفاهیم شبکه و مدل OSI | مکتب‌خونه',
            url: 'https://maktabkhooneh.org/course/networking-fundamentals/',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'مدارک لازم برای پذیرش دانشگاهی و اپلای تحصیلی | مکتب‌خونه',
            url: 'https://maktabkhooneh.org/mag/university-admission/',
          },
          embedding: makeVector(120),
        },
        {
          tab: {
            title: 'مکتب‌خونه | آکادمی آنلاین یادگیری مهارت‌ها',
            url: 'https://maktabkhooneh.org/',
          },
          embedding: makeVector(240),
        },
      ];

      const res = clusterTabs(courses);
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(3);
    });

    it('5. Distinct technical subjects (X-UI vs OSI vs OSINT) remain separated', () => {
      const tabs = [
        {
          tab: {
            title: 'آموزش نصب و کانفیگ پنل X-UI روی سرور ابری اوبونتو',
            url: 'https://github.com/vaxilu/x-ui',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'آموزش مدل ۷ لایه OSI و پروتکل‌های شبکه',
            url: 'https://fa.wikipedia.org/wiki/OSI',
          },
          embedding: makeVector(85),
        },
        {
          tab: {
            title: 'Introduction to Open Source Intelligence (OSINT) Framework',
            url: 'https://osintframework.com/',
          },
          embedding: makeVector(170),
        },
      ];

      const res = clusterTabs(tabs);
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(3);
    });

    it('6. VPN / cloud tunneling tools with distinct architectures remain separated', () => {
      const tabs = [
        {
          tab: {
            title: 'NipoVPN: Lightweight Wireguard Tunnel Client for Linux',
            url: 'https://github.com/nipo/vpn',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'Vercel XHTTP Edge Functions and Serverless Gateway',
            url: 'https://vercel.com/docs/xhttp',
          },
          embedding: makeVector(75),
        },
      ];

      const res = clusterTabs(tabs);
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(2);
    });

    it('12. Error 403, 404, and domain blocked pages are quarantined and never form error groups', () => {
      const errorPages = [
        {
          tab: {
            title: "403. That’s an error. Your client does not have permission to get URL / from this server.",
            url: 'https://gemini.google.com/403',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'Error 403 (Forbidden) - Google Cloud Console',
            url: 'https://console.cloud.google.com/error403',
          },
          embedding: makeVector(10),
        },
        {
          tab: {
            title: 'Domain Blocked by Administrator',
            url: 'https://blocked.example.com/',
          },
          embedding: makeVector(20),
        },
        {
          tab: {
            title: '404 Not Found - Nginx Server',
            url: 'https://example.com/404',
          },
          embedding: makeVector(30),
        },
      ];

      const res = clusterTabs(errorPages);
      // All 4 error pages quarantined as isLowInformation = true
      expect(res.clusters).toHaveLength(0);
      expect(res.ungroupedTabs).toHaveLength(4);
    });
  });

  // ---------------------------------------------------------------------------
  // Positive Clustering & Defragmentation Scenarios
  // ---------------------------------------------------------------------------
  describe('Positive Clustering & Defragmentation Scenarios', () => {
    it('7. Battlefield music: unifies sub-tracks into a single cohesive group without fragmentation', () => {
      const items = [
        {
          tab: {
            title: 'Battlefield 1 Official Soundtrack - Dawn of a New World OST',
            url: 'https://youtube.com/watch?v=bf1',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'Battlefield 1 Ambient War Music & Relaxing Rain Mix',
            url: 'https://youtube.com/watch?v=bf1b',
          },
          embedding: makeVector(10),
        },
        {
          tab: {
            title: 'Battlefield 2 Theme - Extended Orchestral OST | Battlefield Music',
            url: 'https://youtube.com/watch?v=bf2',
          },
          embedding: makeVector(20),
        },
        {
          tab: {
            title: 'Battlefield 1942 Original Game Soundtrack Orchestral Suite',
            url: 'https://youtube.com/watch?v=bf42',
          },
          embedding: makeVector(25),
        },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(4);
      expect(['Battlefield Music', 'Battlefield Soundtracks']).toContain(res.clusters[0].name);
      expect(res.ungroupedTabs).toHaveLength(0);
    });

    it('8. Life is Strange music: unifies mixtapes and acoustic ambient music into one group', () => {
      const items = [
        {
          tab: {
            title: "Life is Strange: Max's Mixtape | Side A Folk & Indie Pop Mix",
            url: 'https://youtube.com/watch?v=lisA',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: "Life is Strange: Max's Mixtape | Side B Folk & Indie Pop Mix",
            url: 'https://youtube.com/watch?v=lisB',
          },
          embedding: makeVector(12),
        },
        {
          tab: {
            title: 'Life is Strange Ambient Acoustic Guitar Soundtrack',
            url: 'https://youtube.com/watch?v=lisC',
          },
          embedding: makeVector(20),
        },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(3);
      expect(res.clusters[0].name).toBe('Life is Strange Music');
    });

    it('9. The Last of Us ambience: groups ambient music for Jackson & Ellie', () => {
      const items = [
        {
          tab: {
            title: 'A Quiet Break Near Jackson: Ellie & Joel Waterfall Ambiance | Relaxing Music 4K',
            url: 'https://youtube.com/watch?v=tlou1',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'A Calm Day in Jackson with Ellie | Relaxing Rain Sounds & Ambient Music 4K',
            url: 'https://youtube.com/watch?v=tlou2',
          },
          embedding: makeVector(15),
        },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(2);
      expect(res.clusters[0].name).toBe('The Last of Us Ambience');
    });

    it('10. Bange laptop bags: groups specific product models into a dedicated category cluster', () => {
      const items = [
        {
          tab: {
            title: 'کوله پشتی بنج مدل Bange BG-7216 مناسب برای لپ تاپ 15.6 اینچی - دیجی‌کالا',
            url: 'https://www.digikala.com/product/dkp-12345/bange-backpack/',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'کوله پشتی لپ تاپ بنج مدل BG-1908 - دیجی‌کالا',
            url: 'https://www.digikala.com/product/dkp-67890/bange-laptop-bag/',
          },
          embedding: makeVector(14),
        },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(2);
      expect(res.clusters[0].name).toBe('Bange Laptop Bags');
    });

    it('11. Metallica shirts: groups band apparel into a dedicated shopping cluster', () => {
      const items = [
        {
          tab: {
            title: 'تیشرت مردانه طرح متالیکا مدل Metallica Master of Puppets - دیجی‌کالا',
            url: 'https://www.digikala.com/product/dkp-1111/metallica-tshirt/',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'تیشرت متالیکا طرح Ride the Lightning - دیجی‌کالا',
            url: 'https://www.digikala.com/product/dkp-2222/metallica-tee/',
          },
          embedding: makeVector(12),
        },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(2);
      expect(res.clusters[0].name).toBe('Metallica T-Shirts');
    });

    it('13. Gemini research tabs: groups official Google Gemini model announcements', () => {
      const items = [
        {
          tab: {
            title: 'Gemini 3.7 Flash: Our Most Intelligent Workhorse Model - Google Blog',
            url: 'https://blog.google/technology/ai/gemini-3-7-flash/',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'Gemini 3.6 Flash vs Gemini 3.1 Pro Benchmark Comparison',
            url: 'https://blog.google/technology/ai/gemini-benchmark/',
          },
          embedding: makeVector(15),
        },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(2);
      expect(res.clusters[0].name).toBe('Gemini Flash Models');
    });

    it('14. Hermes Agent: groups cross-platform agent architecture conversations', () => {
      const items = [
        {
          tab: {
            title: 'Hermes agent terminal backend architecture',
            url: 'https://chatgpt.com/c/1',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'Hermes Agent Terminal Backend Choices - Google Gemini',
            url: 'https://gemini.google.com/app',
          },
          embedding: makeVector(10),
        },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(2);
      expect(res.clusters[0].name).toBe('Hermes Agent');
    });

    it('15. Academic paper clusters: groups database cardinality estimation papers', () => {
      const items = [
        {
          tab: {
            title: 'A Lightweight Learned Cardinality Estimation Model with Error Bounds - IEEE Xplore',
            url: 'https://ieeexplore.ieee.org/document/9123456',
          },
          embedding: makeVector(0),
        },
        {
          tab: {
            title: 'Learned Cardinality Estimation in Relational Databases: A Comprehensive Survey - ACM',
            url: 'https://dl.acm.org/doi/10.1145/3456789',
          },
          embedding: makeVector(15),
        },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      expect(res.clusters[0].tabs).toHaveLength(2);
      expect(res.clusters[0].name).toBe('Learned Cardinality Estimation Research');
    });
  });

  // ---------------------------------------------------------------------------
  // Tab Deduplication Invariant
  // ---------------------------------------------------------------------------
  describe('Tab Deduplication & Restoration Invariant', () => {
    it('deduplicates identical tabs prior to HAC and restores them accurately into the formed cluster', () => {
      const repeatedTab: Tab = {
        title: 'Hermes agent terminal backend architecture',
        url: 'https://chatgpt.com/c/1',
      };
      const companionTab: Tab = {
        title: 'Hermes Agent Terminal Backend Choices - Google Gemini',
        url: 'https://gemini.google.com/app',
      };

      // 3 identical instances of repeatedTab + 1 companion
      const items = [
        { tab: repeatedTab, embedding: makeVector(0) },
        { tab: repeatedTab, embedding: makeVector(0) },
        { tab: repeatedTab, embedding: makeVector(0) },
        { tab: companionTab, embedding: makeVector(10) },
      ];

      const res = clusterTabs(items);
      expect(res.clusters).toHaveLength(1);
      // All 4 tabs are present in the final cluster
      expect(res.clusters[0].tabs).toHaveLength(4);
      expect(res.clusters[0].name).toBe('Hermes Agent');
      expect(res.ungroupedTabs).toHaveLength(0);
    });
  });
});
