export type ProjectCategory = 'hot' | 'gem';

export interface SecurityDetails {
  author_age_days: number;
  repo_age_days: number;
  has_license: boolean;
  has_readme: boolean;
  issue_count: number;
  pr_count: number;
  star_fork_ratio: number;
}

export interface GitHubProject {
  id: string; // "owner/repo"
  name: string;
  owner: string;
  url: string;
  description: string;
  ai_summary: string;
  language: string;
  stars: number;
  forks: number;
  stars_today: number;
  stars_this_week: number;
  category: ProjectCategory;
  tags: string[];
  security_score: number; // 0-100
  security_details: SecurityDetails;
  trending_days: number;
  first_seen: string; // ISO date
}

export interface DailyData {
  date: string; // YYYY-MM-DD
  generated_at: string; // ISO timestamp
  projects: GitHubProject[];
  stats: {
    total: number;
    hot: number;
    gem: number;
    by_tag: Record<string, number>;
  };
}

export interface ScraperResult {
  name: string;
  owner: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  stars_today: number;
  stars_this_week: number;
}

export interface ClassifiedProject extends ScraperResult {
  id: string;
  category: ProjectCategory;
  tags: string[];
}

export interface TrendingPageProject {
  id: string;
  name: string;
  owner: string;
  url: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  stars_period: number;
}
