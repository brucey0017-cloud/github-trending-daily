import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClassifiedProject, ScraperResult } from '../../lib/types';
import { logInfo, logWarn } from '../../lib/utils';

const KEYWORDS: Record<string, string[]> = {
  finance: ['finance', 'trading', 'stock', 'investment', '金融', '交易'],
  quant: ['quant', 'quantitative', 'backtest', 'strategy', '量化', '回测'],
  ai: ['ai', 'llm', 'gpt', 'claude', 'machine learning', 'deep learning', '人工智能', '大模型'],
  web3: ['web3', 'blockchain', 'ethereum', 'solana', 'defi', '区块链'],
  crypto: ['crypto', 'bitcoin', 'cryptocurrency', '加密货币'],
  skills: ['skill', 'agent', 'automation', 'workflow', '技能', '自动化'],
  agent: ['agent', 'autonomous', 'agentic', 'multi-agent', '智能体'],
  content: ['content', 'writing', 'blog', 'cms', '内容创作', '写作', '博客'],
};

const TAG_LABELS: Record<string, string> = {
  finance: '金融',
  quant: '量化',
  ai: 'AI',
  web3: 'Web3',
  crypto: 'Crypto',
  skills: 'Skills',
  agent: 'Agent',
  content: '内容创作',
};

function normalize(input: string): string {
  return input.toLowerCase().trim();
}

function extractTags(project: ScraperResult): string[] {
  const corpus = normalize(`${project.name} ${project.description} ${project.language}`);
  const tags: string[] = [];

  for (const [tagKey, words] of Object.entries(KEYWORDS)) {
    const hit = words.some((word) => corpus.includes(normalize(word)));
    if (hit) {
      tags.push(TAG_LABELS[tagKey] ?? tagKey);
    }
  }

  return tags.slice(0, 3);
}

function classifyProject(project: ScraperResult, tags: string[]): 'hot' | 'gem' | null {
  const isHot = project.stars_today > 100 || project.stars_this_week > 500;
  const isGem = project.stars > 100 && project.stars < 5000;

  if (isHot) {
    return 'hot';
  }

  if (isGem && tags.length > 0) {
    return 'gem';
  }

  return null;
}

export function filterAndClassifyProjects(input: ScraperResult[]): ClassifiedProject[] {
  const scopedProjects = input
    .map((project) => {
      const id = `${project.owner}/${project.name}`;
      const tags = extractTags(project);
      const category = classifyProject(project, tags);

      if (!category || tags.length === 0) {
        return null;
      }

      return {
        ...project,
        id,
        category,
        tags,
      } satisfies ClassifiedProject;
    })
    .filter((project): project is ClassifiedProject => project !== null);

  const hotProjects = scopedProjects
    .filter((project) => project.category === 'hot')
    .sort((a, b) => {
      if (b.stars_today !== a.stars_today) {
        return b.stars_today - a.stars_today;
      }
      return b.stars_this_week - a.stars_this_week;
    });

  const gemProjects = scopedProjects
    .filter((project) => project.category === 'gem')
    .sort((a, b) => {
      if (b.stars_this_week !== a.stars_this_week) {
        return b.stars_this_week - a.stars_this_week;
      }
      return b.stars - a.stars;
    });

  const selected = [...hotProjects, ...gemProjects].slice(0, 15);

  if (selected.length < 5) {
    logWarn(
      `Filtered projects are fewer than expected (${selected.length}/5). Consider expanding keyword coverage.`,
    );
  }

  logInfo(
    `Filter done. total=${input.length}, in_scope=${scopedProjects.length}, selected=${selected.length}, hot=${hotProjects.length}, gem=${gemProjects.length}`,
  );

  return selected;
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  logInfo('Filter module is intended to be used by scripts/main.ts');
}
