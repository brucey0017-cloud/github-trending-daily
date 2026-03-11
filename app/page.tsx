import fs from 'fs';
import path from 'path';

import ProjectCard from '@/components/ProjectCard';
import { DailyData, GitHubProject } from '@/lib/types';

interface HistoryMonthData {
  month: string;
  days: DailyData[];
}

interface HomeData {
  latest: DailyData;
  historyDays: DailyData[];
}

function formatDateLabel(date: string): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

function formatDateShort(date: string): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getHomeData(): HomeData {
  const dataDir = path.join(process.cwd(), 'data');
  const latestPath = path.join(dataDir, 'latest.json');
  const latest = JSON.parse(fs.readFileSync(latestPath, 'utf-8')) as DailyData;

  const historyDir = path.join(dataDir, 'history');
  const historyDays: DailyData[] = [];

  if (fs.existsSync(historyDir)) {
    const files = fs
      .readdirSync(historyDir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse();

    for (const fileName of files) {
      const filePath = path.join(historyDir, fileName);
      const monthData = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HistoryMonthData;

      for (const day of monthData.days) {
        if (day.date !== latest.date) {
          historyDays.push(day);
        }
      }
    }
  }

  historyDays.sort((a, b) => b.date.localeCompare(a.date));

  return { latest, historyDays };
}

function renderCompactProject(project: GitHubProject, date: string): JSX.Element {
  return (
    <li
      key={`${date}-${project.id}`}
      className="rounded-lg border border-white/10 bg-white/[0.02] p-3 hover:border-white/20 transition-colors"
    >
      <a href={project.url} target="_blank" rel="noopener noreferrer" className="block">
        <div className="text-sm font-semibold">
          <span className="text-gray-500">{project.owner}/</span>
          <span className="text-gray-200">{project.name}</span>
        </div>
        <div className="mt-1 text-xs text-gray-400 line-clamp-2">{project.ai_summary}</div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs mono text-gray-500">
          <span>⭐ {project.stars.toLocaleString()}</span>
          <span>+{project.stars_today.toLocaleString()} 今日</span>
          <span>🛡️ {project.security_score}</span>
        </div>
      </a>
    </li>
  );
}

export default async function Home() {
  const { latest: data, historyDays } = getHomeData();
  const hotProjects = data.projects.filter((p) => p.category === 'hot');
  const gemProjects = data.projects.filter((p) => p.category === 'gem');

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <header className="relative overflow-hidden border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-20">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-cyan-500/10 pointer-events-none" />

          <div className="relative z-10">
            <div className="animate-slide-in-left opacity-0">
              <h1 className="text-6xl md:text-8xl font-bold mb-6 leading-tight">
                GitHub
                <br />
                <span className="gradient-text-hot">Trending</span>
                <br />
                Daily
              </h1>
            </div>

            <div className="animate-fade-in-up opacity-0 delay-200">
              <p className="text-xl text-gray-400 max-w-2xl mb-8">
                每日自动抓取 GitHub 热门项目，AI 智能总结，安全评分
                <br />
                助你发现最有价值的开源项目
              </p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 animate-fade-in-up opacity-0 delay-300">
              <div>
                <div className="text-4xl font-bold gradient-text-hot mono">{data.stats.total}</div>
                <div className="text-sm text-gray-500 mono">今日精选</div>
              </div>
              <div>
                <div className="text-4xl font-bold gradient-text-hot mono">{data.stats.hot}</div>
                <div className="text-sm text-gray-500 mono">热门项目</div>
              </div>
              <div>
                <div className="text-4xl font-bold gradient-text-gem mono">{data.stats.gem}</div>
                <div className="text-sm text-gray-500 mono">宝藏项目</div>
              </div>
            </div>

            {/* Date */}
            <div className="mt-8 animate-fade-in-up opacity-0 delay-400">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                <span className="text-gray-500">📅</span>
                <span className="mono text-sm">{formatDateLabel(data.date)}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Today Marker */}
      <section className="max-w-7xl mx-auto px-6 pt-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-cyan-200">
          <span>📍</span>
          <span className="mono text-sm">当日榜单：{formatDateShort(data.date)}</span>
        </div>
      </section>

      {/* Hot Projects Section */}
      {hotProjects.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="mb-8">
            <h2 className="text-4xl font-bold mb-2">
              <span className="gradient-text-hot">🔥 热门项目</span>
            </h2>
            <p className="text-gray-400">Star 增长迅速，社区活跃度高的项目</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hotProjects.map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} />
            ))}
          </div>
        </section>
      )}

      {/* Gem Projects Section */}
      {gemProjects.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="mb-8">
            <h2 className="text-4xl font-bold mb-2">
              <span className="gradient-text-gem">💎 宝藏项目</span>
            </h2>
            <p className="text-gray-400">小众但有价值，解决实际问题的创意项目</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {gemProjects.map((project, index) => (
              <ProjectCard key={project.id} project={project} index={index} />
            ))}
          </div>
        </section>
      )}

      {/* Collapsed History */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/10">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-200">🗂️ 历史日报（按日期折叠）</h2>
          <p className="text-sm text-gray-500 mt-2">昨天及更早的数据都在这里，按具体日期展开查看。</p>
        </div>

        {historyDays.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-gray-500">暂无历史数据。</div>
        ) : (
          <div className="space-y-4">
            {historyDays.map((day) => {
              const dayHot = day.projects.filter((project) => project.category === 'hot');
              const dayGem = day.projects.filter((project) => project.category === 'gem');

              return (
                <details key={day.date} className="group rounded-xl border border-white/10 bg-white/[0.02] open:border-white/20">
                  <summary className="list-none cursor-pointer px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-200">📅 {formatDateLabel(day.date)}</div>
                      <div className="text-xs text-gray-500 mono mt-1">{day.date}</div>
                    </div>
                    <div className="text-sm text-gray-400 mono">
                      {day.stats.total} 项 · 🔥 {day.stats.hot} · 💎 {day.stats.gem}
                    </div>
                  </summary>

                  <div className="border-t border-white/10 px-5 py-5 space-y-5">
                    {dayHot.length > 0 && (
                      <div>
                        <div className="mb-2 text-sm font-semibold text-orange-300">🔥 热门项目</div>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">{dayHot.map((project) => renderCompactProject(project, day.date))}</ul>
                      </div>
                    )}

                    {dayGem.length > 0 && (
                      <div>
                        <div className="mb-2 text-sm font-semibold text-cyan-300">💎 宝藏项目</div>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">{dayGem.map((project) => renderCompactProject(project, day.date))}</ul>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {/* Tags Cloud */}
      <section className="max-w-7xl mx-auto px-6 py-16 border-t border-white/10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">
            <span className="text-gray-300">🏷️ 热门标签</span>
          </h2>
        </div>

        <div className="flex flex-wrap gap-4">
          {Object.entries(data.stats.by_tag)
            .sort(([, a], [, b]) => b - a)
            .map(([tag, count]) => (
              <div
                key={tag}
                className="px-6 py-3 rounded-full bg-white/5 border border-white/10 hover:border-white/20 transition-all hover:scale-105"
              >
                <span className="font-bold">{tag}</span>
                <span className="ml-2 text-gray-500 mono text-sm">×{count}</span>
              </div>
            ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500 text-sm">
          <p className="mb-2">每天香港时间 09:15 自动更新</p>
          <p>数据来源：GitHub Trending | AI 总结：Kimi | 安全评分：启发式规则</p>
          <p className="mt-4">
            <a
              href="https://github.com/brucey0017-cloud/github-trending-daily"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors underline"
            >
              View on GitHub
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
