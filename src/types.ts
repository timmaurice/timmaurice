export interface Repository {
  id: number;
  name: string;
  description: string;
  html_url: string;
  stargazers_count: number;
  updated_at: string;
  topics: string[];
  default_branch: string;
  hacs_name?: string;
  icon_url?: string;
  screenshot_url?: string;
  download_count?: number;
}

export interface CacheData {
  timestamp: number;
  repos: Repository[];
  rateLimit?: {
    limit: string;
    remaining: string;
    reset: string;
  };
}
