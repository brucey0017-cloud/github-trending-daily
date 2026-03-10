import axios, { AxiosInstance } from 'axios';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SecurityDetails } from '../../lib/types';
import { logError, logInfo, logWarn, withRetry } from '../../lib/utils';

interface ProjectCore {
  id: string;
  owner: string;
  name: string;
  stars: number;
  forks: number;
}

interface RepoApiResponse {
  created_at?: string;
  open_issues_count?: number;
  license?: unknown;
}

interface UserApiResponse {
  created_at?: string;
}

interface SearchPrResponse {
  total_count?: number;
}

export interface SecurityScoredProject {
  id: string;
  security_score: number;
  security_details: SecurityDetails;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDaysSince(isoDate?: string): number {
  if (!isoDate) {
    return 0;
  }

  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs <= 0) {
    return 0;
  }

  return Math.floor(diffMs / DAY_MS);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateSecurityScore(details: SecurityDetails): number {
  let score = 50;

  if (details.author_age_days > 365) {
    score += 10;
  }
  if (details.author_age_days > 1825) {
    score += 10;
  }

  if (details.repo_age_days > 180) {
    score += 5;
  }
  if (details.repo_age_days > 365) {
    score += 5;
  }

  if (details.has_license) {
    score += 5;
  }
  if (details.has_readme) {
    score += 5;
  }

  if (details.issue_count > 10) {
    score += 5;
  }
  if (details.pr_count > 20) {
    score += 5;
  }

  if (details.star_fork_ratio < 5) {
    score -= 10;
  }
  if (details.star_fork_ratio > 10 && details.star_fork_ratio < 50) {
    score += 10;
  }

  return clampScore(score);
}

function createGitHubClient(): AxiosInstance {
  const token = process.env.GITHUB_TOKEN;

  return axios.create({
    baseURL: 'https://api.github.com',
    timeout: 20_000,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'github-trending-daily-bot',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

async function requestData<T>(client: AxiosInstance, url: string): Promise<T> {
  return withRetry(
    async () => {
      const response = await client.get<T>(url);
      return response.data;
    },
    3,
    2_000,
  );
}

async function requestReadmeExists(client: AxiosInstance, owner: string, repo: string): Promise<boolean> {
  try {
    return await withRetry(
      async () => {
        const response = await client.get(`/repos/${owner}/${repo}/readme`, {
          validateStatus: (status) => status === 200 || status === 404,
        });
        return response.status === 200;
      },
      3,
      2_000,
    );
  } catch (error) {
    logWarn(`Failed to detect README for ${owner}/${repo}.`, error);
    return false;
  }
}

async function fetchSecurityDetails(
  client: AxiosInstance,
  project: ProjectCore,
  ownerAgeCache: Map<string, number>,
): Promise<SecurityDetails> {
  const repoPath = `/repos/${project.owner}/${project.name}`;
  const issueQuery = `/search/issues?q=${encodeURIComponent(`repo:${project.owner}/${project.name} type:pr`)}`;

  const repoData = await requestData<RepoApiResponse>(client, repoPath);

  let authorAgeDays = ownerAgeCache.get(project.owner) ?? 0;
  if (authorAgeDays === 0) {
    try {
      const ownerData = await requestData<UserApiResponse>(client, `/users/${project.owner}`);
      authorAgeDays = toDaysSince(ownerData.created_at);
      ownerAgeCache.set(project.owner, authorAgeDays);
    } catch (error) {
      logWarn(`Failed to fetch owner profile for ${project.owner}.`, error);
    }
  }

  let prCount = 0;
  try {
    const prData = await requestData<SearchPrResponse>(client, issueQuery);
    prCount = prData.total_count ?? 0;
  } catch (error) {
    logWarn(`Failed to fetch PR count for ${project.id}.`, error);
  }

  const hasReadme = await requestReadmeExists(client, project.owner, project.name);

  const starForkRatio = project.stars / Math.max(project.forks, 1);

  return {
    author_age_days: authorAgeDays,
    repo_age_days: toDaysSince(repoData.created_at),
    has_license: Boolean(repoData.license),
    has_readme: hasReadme,
    issue_count: repoData.open_issues_count ?? 0,
    pr_count: prCount,
    star_fork_ratio: Number(starForkRatio.toFixed(2)),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index] as T, index);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function scoreProjectSecurity(projects: ProjectCore[]): Promise<SecurityScoredProject[]> {
  if (projects.length === 0) {
    return [];
  }

  const client = createGitHubClient();
  const ownerAgeCache = new Map<string, number>();

  logInfo(`Start security scoring for ${projects.length} project(s).`);

  return mapWithConcurrency(projects, 3, async (project) => {
    try {
      const details = await fetchSecurityDetails(client, project, ownerAgeCache);
      const score = calculateSecurityScore(details);

      return {
        id: project.id,
        security_score: score,
        security_details: details,
      };
    } catch (error) {
      logError(`Security scoring failed for ${project.id}, fallback to neutral score.`, error);

      const fallbackDetails: SecurityDetails = {
        author_age_days: 0,
        repo_age_days: 0,
        has_license: false,
        has_readme: false,
        issue_count: 0,
        pr_count: 0,
        star_fork_ratio: project.stars / Math.max(project.forks, 1),
      };

      return {
        id: project.id,
        security_score: calculateSecurityScore(fallbackDetails),
        security_details: fallbackDetails,
      };
    }
  });
}

const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  logInfo('Security module is intended to be called from scripts/main.ts');
}
