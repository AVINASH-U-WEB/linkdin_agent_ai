import React from 'react';
import { TrendingUp, CheckCircle2, Clock, Award } from 'lucide-react';

export interface HeaderProps {
  publishedCount?: number;
  upcomingCount?: number;
  avgScore?: number;
}

const Header = ({ publishedCount = 0, upcomingCount = 0, avgScore = 0 }: HeaderProps) => {
  const totalTarget = 7;
  const progress = Math.min(Math.round(((publishedCount + upcomingCount) / totalTarget) * 100), 100);

  return (
    <div className="mb-8">
      {/* Title row */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1" style={{ color: 'var(--foreground)' }}>
            Content Dashboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Manage your AI-powered LinkedIn publishing pipeline
          </p>
        </div>

        {/* Status pills */}
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(22,104,232,0.1)', color: '#1668e8' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-crex-blue animate-pulse" />
            Agent Online
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {upcomingCount} Scheduled
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Weekly Progress"
          value={`${progress}%`}
          icon={<TrendingUp className="w-4 h-4" />}
          color="#1668e8"
          sub={`${publishedCount + upcomingCount} / ${totalTarget} posts`}
          progress={progress}
        />
        <StatCard
          label="Avg Quality Score"
          value={avgScore > 0 ? avgScore.toString() : '—'}
          icon={<Award className="w-4 h-4" />}
          color="#8b5cf6"
          sub={avgScore >= 85 ? 'Excellent quality' : avgScore > 0 ? 'Good quality' : 'No posts yet'}
        />
        <StatCard
          label="Ready to Publish"
          value={upcomingCount.toString()}
          icon={<Clock className="w-4 h-4" />}
          color="#f59e0b"
          sub="Scheduled posts"
        />
        <StatCard
          label="Published"
          value={publishedCount.toString()}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="#10b981"
          sub="This session"
        />
      </div>
    </div>
  );
};

const StatCard = ({
  label, value, icon, color, sub, progress
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  sub: string;
  progress?: number;
}) => (
  <div
    className="solid-card p-4 flex flex-col gap-3"
    style={{ minHeight: '100px' }}
  >
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: `${color}18`, color }}
      >
        {icon}
      </div>
    </div>
    <div>
      <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>
        {value}
      </div>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </div>
    {progress !== undefined && (
      <div className="w-full h-1 rounded-full" style={{ background: 'var(--input-border)' }}>
        <div
          className="h-1 rounded-full transition-all duration-700"
          style={{ width: `${progress}%`, background: color }}
        />
      </div>
    )}
  </div>
);

export default Header;
