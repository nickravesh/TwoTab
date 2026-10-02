import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { pipeline, env } from '@huggingface/transformers';
import { normalizeTab, hashString } from '@/lib/semantic/normalization';
import { clusterTabs } from '@/lib/semantic/clustering';
import type { Tab } from '@/lib/storage';

// Configure offline model loading
env.allowLocalModels = false;

interface CachedEmbedding {
  prompt: string;
  vector: number[];
}

export async function getOrComputeRealEmbeddings(
  prompts: string[],
  cacheFilePath: string,
  onProgress?: (done: number, total: number) => void
): Promise<Float32Array[]> {
  const cacheDir = path.dirname(cacheFilePath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  let cache: Record<string, CachedEmbedding> = {};
  if (fs.existsSync(cacheFilePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
    } catch {
      cache = {};
    }
  }

  const hashes = prompts.map((p) => hashString(p));
  const missingIndices: number[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const h = hashes[i];
    if (!cache[h] || !cache[h].vector || cache[h].vector.length !== 384) {
      missingIndices.push(i);
    }
  }

  if (missingIndices.length > 0) {
    console.log(`[Eval] Need to compute embeddings for ${missingIndices.length} prompts (${prompts.length - missingIndices.length} cached)...`);
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'fp32',
    });

    let doneCount = prompts.length - missingIndices.length;
    for (let m = 0; m < missingIndices.length; m++) {
      const idx = missingIndices[m];
      const p = prompts[idx];
      const h = hashes[idx];

      const output = await extractor(p, { pooling: 'mean', normalize: true });
      const flat = Array.from(output.data.slice(0, 384)) as number[];
      cache[h] = { prompt: p, vector: flat };

      if (output && typeof (output as any).dispose === 'function') {
        (output as any).dispose();
      }

      doneCount++;
      if (m % 100 === 0 || m === missingIndices.length - 1) {
        onProgress?.(doneCount, prompts.length);
        console.log(`[Eval] Progress: ${doneCount} / ${prompts.length} (${Math.round((doneCount / prompts.length) * 100)}%)`);
      }
    }

    fs.writeFileSync(cacheFilePath, JSON.stringify(cache));
    console.log(`[Eval] Saved updated embeddings cache to ${cacheFilePath}`);
  } else {
    console.log(`[Eval] All ${prompts.length} embeddings loaded from cache.`);
  }

  return hashes.map((h) => new Float32Array(cache[h].vector));
}

describe('Real-World Tab Export Baseline Evaluation', () => {
  it('runs complete real-world export (1,679 tabs) through production pipeline', async (ctx) => {
    const exportPath = path.resolve(process.cwd(), 'twotab-export-2026-10-02.json');
    if (!fs.existsSync(exportPath)) {
      ctx.skip();
      return;
    }
    const raw = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    const allTabs: Tab[] = raw.tabGroups.flatMap((g: any) => g.tabs);

    console.log(`[Eval] Total tabs to group: ${allTabs.length}`);

    // Step 1: Normalization & Prompts
    const normalizedMetas = allTabs.map((t) => normalizeTab(t));
    const prompts = normalizedMetas.map((m) => m.semanticPrompt);
    const lowInfoCount = normalizedMetas.filter((m) => m.isLowInformation).length;
    console.log(`[Eval] Low-information tabs quarantined: ${lowInfoCount} (${Math.round((lowInfoCount / allTabs.length) * 100)}%)`);

    // Step 2: Embeddings
    const cacheFile = path.resolve(process.cwd(), '.cache/real_world_embeddings_cache.json');
    const embeddings = await getOrComputeRealEmbeddings(prompts, cacheFile);

    // Step 3: Production Complete-Linkage Clustering & Conceptual Naming
    const items = allTabs.map((tab, idx) => ({
      tab,
      embedding: embeddings[idx],
    }));

    const startTime = Date.now();
    const clusteringResult = clusterTabs(items, {
      similarityThreshold: 0.70,
      minimumGroupSize: 2,
    });
    const elapsedMs = Date.now() - startTime;

    console.log(`[Eval] Clustering completed in ${elapsedMs}ms`);

    // Calculate detailed statistics
    let totalTabsInGroups = 0;
    const groupSizes: number[] = [];
    const groupSummaries = clusteringResult.clusters.map((c) => {
      totalTabsInGroups += c.tabs.length;
      groupSizes.push(c.tabs.length);
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        tabCount: c.tabs.length,
        meanSimilarity: c.metrics?.meanPairwiseSimilarity,
        minSimilarity: c.metrics?.minPairwiseSimilarity,
        centroidSimilarity: c.metrics?.centroidSimilarity,
        domainDiversity: c.metrics?.domainDiversity,
        sampleTabs: c.tabs.slice(0, 3).map((t) => ({ title: t.title, url: t.url })),
      };
    });

    const evalReport = {
      timestamp: new Date().toISOString(),
      totalInputTabs: allTabs.length,
      quarantinedLowInfoTabs: lowInfoCount,
      totalGeneratedGroups: clusteringResult.clusters.length,
      totalGroupedTabs: totalTabsInGroups,
      totalUngroupedTabs: clusteringResult.ungroupedTabs.length,
      averageGroupSize: clusteringResult.clusters.length > 0 ? (totalTabsInGroups / clusteringResult.clusters.length).toFixed(1) : 0,
      groupSizes: groupSizes.sort((a, b) => b - a),
      clusteringElapsedMs: elapsedMs,
      clusters: clusteringResult.clusters.map((c) => ({
        name: c.name,
        color: c.color,
        tabCount: c.tabs.length,
        metrics: c.metrics,
        tabs: c.tabs.map((t) => ({ title: t.title, url: t.url })),
      })),
      ungroupedTabsSample: clusteringResult.ungroupedTabs.slice(0, 50).map((t) => ({ title: t.title, url: t.url })),
    };

    const outDir = path.resolve(process.cwd(), 'eval_results');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const reportPath = path.resolve(outDir, 'optimized_grouping.json');
    fs.writeFileSync(reportPath, JSON.stringify(evalReport, null, 2));
    console.log(`[Eval] Saved full evaluation report to ${reportPath}`);

    // Load baseline report if present for side-by-side comparison
    const baselinePath = path.resolve(outDir, 'baseline_grouping.json');
    let baselineData: any = null;
    if (fs.existsSync(baselinePath)) {
      try {
        baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
      } catch {
        // baseline not available
      }
    }

    console.log('\n======================================================');
    console.log('REAL-WORLD PIPELINE: BEFORE vs AFTER COMPARISON');
    console.log('======================================================');
    if (baselineData) {
      console.log(`Metric                     | Baseline (V2) | Optimized (V3)`);
      console.log(`---------------------------+---------------+---------------`);
      console.log(`Total Input Tabs           | ${String(baselineData.totalInputTabs).padEnd(13)} | ${String(evalReport.totalInputTabs).padEnd(13)}`);
      console.log(`Low-Info Quarantined Tabs  | ${String(baselineData.quarantinedLowInfoTabs).padEnd(13)} | ${String(evalReport.quarantinedLowInfoTabs).padEnd(13)}`);
      console.log(`Generated Groups           | ${String(baselineData.totalGeneratedGroups).padEnd(13)} | ${String(evalReport.totalGeneratedGroups).padEnd(13)}`);
      console.log(`Total Grouped Tabs         | ${String(baselineData.totalGroupedTabs).padEnd(13)} | ${String(evalReport.totalGroupedTabs).padEnd(13)}`);
      console.log(`Total Ungrouped Tabs       | ${String(baselineData.totalUngroupedTabs).padEnd(13)} | ${String(evalReport.totalUngroupedTabs).padEnd(13)}`);
      console.log(`Average Group Size         | ${String(baselineData.averageGroupSize).padEnd(13)} | ${String(evalReport.averageGroupSize).padEnd(13)}`);
      console.log(`Clustering Elapsed Time    | ${(baselineData.clusteringElapsedMs + 'ms').padEnd(13)} | ${(evalReport.clusteringElapsedMs + 'ms').padEnd(13)}`);
    } else {
      console.log(`Generated Groups:   ${evalReport.totalGeneratedGroups}`);
      console.log(`Grouped Tabs:       ${evalReport.totalGroupedTabs}`);
      console.log(`Average Group Size: ${evalReport.averageGroupSize}`);
    }

    console.log('\nTop 25 Group Names & Sizes (Optimized):');
    for (const g of evalReport.clusters.slice(0, 25)) {
      console.log(`  - [${g.tabCount} tabs] "${g.name}" (minSim: ${g.metrics?.minPairwiseSimilarity?.toFixed(2)}, meanSim: ${g.metrics?.meanPairwiseSimilarity?.toFixed(2)}, domainDiv: ${g.metrics?.domainDiversity?.toFixed(2)})`);
    }

    // Quality assertions
    expect(clusteringResult.clusters.length).toBeGreaterThan(0);

    // 1. Defragmentation assertion: Hermes Agent is consolidated into a single group >= 10 tabs
    const hermesGroups = clusteringResult.clusters.filter((c) => c.name.toLowerCase() === 'hermes agent');
    expect(hermesGroups).toHaveLength(1);
    expect(hermesGroups[0].tabs.length).toBeGreaterThanOrEqual(10);

    // 2. Multi-domain grab-bag rejection: Ctb cluster disbanded
    const ctbGroup = clusteringResult.clusters.find((c) => c.name.toLowerCase() === 'ctb');
    expect(ctbGroup).toBeUndefined();

    // 3. Generic page-type quarantine: Pricing cluster disbanded
    const pricingGroup = clusteringResult.clusters.find((c) => c.name.toLowerCase() === 'pricing');
    expect(pricingGroup).toBeUndefined();

    // 4. Proper canonical naming: "Anna's Archive", "The Housemaid", "Apple ID"
    const annasGroup = clusteringResult.clusters.find((c) => c.name.toLowerCase().includes('anna'));
    if (annasGroup) {
      expect(annasGroup.name).toBe("Anna's Archive");
    }
    const appleGroup = clusteringResult.clusters.find((c) => c.name.toLowerCase().includes('apple id'));
    if (appleGroup) {
      expect(appleGroup.name).not.toBe('Apple ID Without');
      expect(appleGroup.name).toBe('Apple ID');
    }
  }, 180000);

  it('diagnoses specific anomalous clusters in baseline', () => {
    const anomalousTabs = [
      { title: 'مدارک لازم جهت تشکیل پرونده پذیرفته شدگان کارشناسی 1404 -', url: 'https://ctb.iau.ir/file/download/page/1759565689-68e0d779c0275-69cd548d-04fb-4b32-9178-b20e5191cee0.pdf' },
      { title: 'خرید تیشرت آستین کوتاه ساده مردانه | تیشرت آستین کوتاه', url: 'https://patanjameh.ir/product/gi-53310/pi-2707846/MEN-TSHIRT-157000' },
      { title: 'تحریم شکن شلتر - بهترین دی ان اس ( DNS ) گیمینگ در ایران', url: 'https://www.sheltertm.com/#Plan' },
      { title: 'Pricing', url: 'https://mullvad.net/en/pricing' },
      { title: 'Pricing - ZenMux', url: 'https://zenmux.ai/pricing/overview' },
      { title: 'آپلود عکس و فایل رایگان با لینک مستقیم - تولزچی', url: 'https://toolschi.com/tools/upload-center' },
    ];

    console.log('\n=== DIAGNOSTIC INSPECTION OF ANOMALOUS TABS ===');
    for (const t of anomalousTabs) {
      const meta = normalizeTab(t);
      console.log(`Tab: "${t.title}" (${t.url})`);
      console.log(`  cleanTitle: "${meta.cleanTitle}"`);
      console.log(`  domain: "${meta.domain}"`);
      console.log(`  pathSegments: [${meta.pathSegments.join(', ')}]`);
      console.log(`  prompt: "${meta.semanticPrompt}"`);
      console.log(`  isLowInfo: ${meta.isLowInformation}, informativeness: ${meta.informativeness}`);
    }
  });

  it('diagnoses fragmented clusters with same name', async (ctx) => {
    const exportPath = path.resolve(process.cwd(), 'twotab-export-2026-10-02.json');
    if (!fs.existsSync(exportPath)) {
      ctx.skip();
      return;
    }
    const raw = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    const allTabs: Tab[] = raw.tabGroups.flatMap((g: any) => g.tabs);
    const normalizedMetas = allTabs.map((t) => normalizeTab(t));
    const prompts = normalizedMetas.map((m) => m.semanticPrompt);
    const cacheFile = path.resolve(process.cwd(), '.cache/real_world_embeddings_cache.json');
    const embeddings = await getOrComputeRealEmbeddings(prompts, cacheFile);

    const items = allTabs.map((tab, idx) => ({ tab, embedding: embeddings[idx] }));
    const result = clusterTabs(items, { similarityThreshold: 0.70, minimumGroupSize: 2 });

    const nameMap = new Map<string, typeof result.clusters>();
    for (const c of result.clusters) {
      if (!nameMap.has(c.name)) nameMap.set(c.name, []);
      nameMap.get(c.name)!.push(c);
    }

    console.log('\n=== DUPLICATE GROUP NAMES ANALYSIS ===');
    for (const [name, list] of nameMap.entries()) {
      if (list.length > 1) {
        console.log(`\nGroup Name: "${name}" (${list.length} clusters)`);
        for (let i = 0; i < list.length; i++) {
          console.log(`  Cluster ${i + 1} (${list[i].tabs.length} tabs):`);
          for (const t of list[i].tabs) {
            console.log(`    - ${t.title} [${t.url}]`);
          }
        }

        // Compute cross metrics between cluster 0 and cluster 1
        const c1 = list[0];
        const c2 = list[1];
        const v1 = c1.tabs.map(t => embeddings[allTabs.indexOf(t)]);
        const v2 = c2.tabs.map(t => embeddings[allTabs.indexOf(t)]);
        let sum = 0, count = 0, min = 1.0;
        for (const a of v1) {
          for (const b of v2) {
            let dot = 0;
            for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
            sum += dot;
            count++;
            if (dot < min) min = dot;
          }
        }
        const mean = sum / count;

        // Centroid sim
        const cent1 = new Float32Array(384);
        for (const a of v1) for (let k = 0; k < 384; k++) cent1[k] += a[k] / v1.length;
        let n1 = 0; for (let k = 0; k < 384; k++) n1 += cent1[k] * cent1[k]; n1 = Math.sqrt(n1);
        for (let k = 0; k < 384; k++) cent1[k] /= n1;

        const cent2 = new Float32Array(384);
        for (const b of v2) for (let k = 0; k < 384; k++) cent2[k] += b[k] / v2.length;
        let n2 = 0; for (let k = 0; k < 384; k++) n2 += cent2[k] * cent2[k]; n2 = Math.sqrt(n2);
        for (let k = 0; k < 384; k++) cent2[k] /= n2;

        let centSim = 0;
        for (let k = 0; k < 384; k++) centSim += cent1[k] * cent2[k];

        console.log(`  => Pair (1, 2) Similarity: centroidSim = ${centSim.toFixed(4)}, crossMean = ${mean.toFixed(4)}, crossMin = ${min.toFixed(4)}`);
      }
    }
  });
});

