import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Element } from 'domhandler';
import type { ScraperResult, TrendingPageProject } from '../../lib/types';
import { logError, logInfo, logWarn, parseNumber, safeText, withRetry } from '../../lib/utils';

type TrendingSince = 'daily' | 'weekly';

const SELECTORS = {
  project: 'article.Box-row',
  name: 'h2 a',
  description: 'p.col-9',
  language: '[itemprop="programmingLanguage"]',
  stars: 'a[href$="/stargazers"]',
  forks: 'a[href$="/forks"]',
  starsPeriod: 'span.d-inline-block.float-sm-right',
} as const;

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function buildTrendingUrl(since: TrendingSince): string {
  return `https://github.com/trending?since=${since}`;
}

function parseRepoRef(rawHref: string | undefined): {
  id: string;
  owner: string;
  name: string;
  url: string;
} | null {
  if (!rawHref) {
    return null;
  }

  const cleanedPath = rawHref.replace(/^\/+/, '').split('?')[0]?.trim();
  if (!cleanedPath) {
    return null;
  }

  const [owner, name] = cleanedPath.split('/').filter(Boolean);
  if (!owner || !name) {
    return null;
  }

  const id = `${owner}/${name}`;
  return {
    id,
    owner,
    name,
    url: `https://github.com/${id}`,
  };
}

function parseStarsPeriod(rawText: string): number {
  const normalized = safeText(rawText);
  const match = normalized.match(/([\d,]+)\s+stars?\s+(today|this\s+week)/i);
  if (!match?.[1]) {
    return 0;
  }

  return parseNumber(match[1]);
}

function parseTrendingProject(
  $: cheerio.CheerioAPI,
  article: Element,
): TrendingPageProject | null {
  const row = $(article);
  const rawHref = row.find(SELECTORS.name).attr('href');
  const repo = parseRepoRef(rawHref);

  if (!repo) {
    return null;
  }

  const description =
    safeText(row.find(SELECTORS.description).first().text()) || safeText(row.find('p').first().text());

  const language = safeText(row.find(SELECTORS.language).first().text());
  const stars = parseNumber(row.find(SELECTORS.stars).first().text());
  const forks = parseNumber(row.find(SELECTORS.forks).first().text());

  const starsPeriodText =
    safeText(row.find(SELECTORS.starsPeriod).first().text()) || safeText(row.text() ?? '');
  const stars_period = parseStarsPeriod(starsPeriodText);

  return {
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    url: repo.url,
    description,
    language,
    stars,
    forks,
    stars_period,
  };
}

async function fetchTrendingPage(since: TrendingSince): Promise<TrendingPageProject[]> {
  const url = buildTrendingUrl(since);

  try {
    const html = await withRetry(
      async () => {
        const response = await axios.get<string>(url, {
          headers: REQUEST_HEADERS,
          timeout: 15_000,
          responseType: 'text',
          validateStatus: (status) => status >= 200 && status < 300,
        });
        return response.data;
      },
      3,
      5_000,
    );

    const $ = cheerio.load(html);
    const projects: TrendingPageProject[] = [];

    $(SELECTORS.project).each((_, article) => {
      try {
        const project = parseTrendingProject($, article);
        if (project) {
          projects.push(project);
        }
      } catch (error) {
        logWarn(`Failed to parse a trending project for ${since}`, error);
      }
    });

    logInfo(`Fetched ${projects.length} projects from ${since} trending.`);
    return projects;
  } catch (error) {
    logError(`Failed to fetch ${since} trending page after retries.`, error);
    return [];
  }
}

function mergeTrendingResults(
  dailyProjects: TrendingPageProject[],
  weeklyProjects: TrendingPageProject[],
): ScraperResult[] {
  const mergedMap = new Map<string, ScraperResult>();

  for (const project of dailyProjects) {
    mergedMap.set(project.id, {
      name: project.name,
      owner: project.owner,
      url: project.url,
      description: project.description,
      language: project.language,
      stars: project.stars,
      forks: project.forks,
      stars_today: project.stars_period,
      stars_this_week: 0,
    });
  }

  for (const project of weeklyProjects) {
    const existing = mergedMap.get(project.id);

    if (existing) {
      existing.stars_this_week = project.stars_period;
      existing.stars = Math.max(existing.stars, project.stars);
      existing.forks = Math.max(existing.forks, project.forks);
      if (!existing.description) {
        existing.description = project.description;
      }
      if (!existing.language) {
        existing.language = project.language;
      }
      continue;
    }

    mergedMap.set(project.id, {
      name: project.name,
      owner: project.owner,
      url: project.url,
      description: project.description,
      language: project.language,
      stars: project.stars,
      forks: project.forks,
      stars_today: 0,
      stars_this_week: project.stars_period,
    });
  }

  return Array.from(mergedMap.values()).sort((a, b) => {
    if (b.stars_today !== a.stars_today) {
      return b.stars_today - a.stars_today;
    }
    if (b.stars_this_week !== a.stars_this_week) {
      return b.stars_this_week - a.stars_this_week;
    }
    return b.stars - a.stars;
  });
}

export async function scrapeTrending(): Promise<ScraperResult[]> {
  logInfo('Start scraping GitHub Trending (daily + weekly).');

  const [dailyProjects, weeklyProjects] = await Promise.all([
    fetchTrendingPage('daily'),
    fetchTrendingPage('weekly'),
  ]);

  const merged = mergeTrendingResults(dailyProjects, weeklyProjects);
  logInfo(`Merged ${merged.length} unique projects from daily and weekly trending.`);
  return merged;
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  scrapeTrending()
    .then((projects) => {
      logInfo(`Scraper completed with ${projects.length} projects.`);
      console.log(JSON.stringify(projects.slice(0, 5), null, 2));
    })
    .catch((error) => {
      logError('Scraper failed unexpectedly.', error);
      process.exitCode = 1;
    });
}
