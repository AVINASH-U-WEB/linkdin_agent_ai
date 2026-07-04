'use client';

import React, { useState } from 'react';
import {
  BarChart3, User, Sparkles, Send, ChevronRight, Brain, TrendingUp,
  Target, Layers, Zap, MessageSquare, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, Linkedin
} from 'lucide-react';

// ─── Post Analysis ────────────────────────────────────────────────────────────
const PostAnalysisTab = ({ calendar }: { calendar: any[] }) => {
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [bulkReport, setBulkReport] = useState<string | null>(null);
  const [linkedinPosts, setLinkedinPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [postsAnalyzed, setPostsAnalyzed] = useState<number>(0);
  const [activeView, setActiveView] = useState<'draft' | 'linkedin'>('draft');

  const handleAnalyze = async (post: any) => {
    setSelectedPost(post);
    setAnalysis(null);
    setBulkReport(null);
    setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/posts/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_text: post.draft || post.text }),
      });
      const data = await res.json();
      setAnalysis(data.feedback || data.detail || 'No feedback returned.');
    } catch {
      setAnalysis('❌ Failed to reach the backend. Ensure FastAPI is running on port 8000.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeLinkedinPosts = async () => {
    setIsBulkLoading(true);
    setBulkReport(null);
    setAnalysis(null);
    setSelectedPost(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/linkedin/analyze-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setBulkReport(data.report || data.detail || 'No report returned.');
      setPostsAnalyzed(data.posts_analyzed || 0);
    } catch {
      setBulkReport('❌ Failed to reach the backend. Ensure FastAPI is running on port 8000.');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUploadCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsBulkLoading(true);
    setBulkReport(null);
    setAnalysis(null);
    setSelectedPost(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/linkedin/upload-csv`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setBulkReport(data.report || data.message || 'No report returned.');
      setPostsAnalyzed(data.posts_analyzed || 0);
    } catch {
      setBulkReport('❌ Failed to upload CSV.');
    } finally {
      setIsBulkLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };


  const handleFetchLinkedinPosts = async () => {
    setIsLoading(true);
    setLinkedinPosts([]);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/linkedin/posts?count=15`);
      const data = await res.json();
      if (data.posts && data.posts.length > 0) {
        setLinkedinPosts(data.posts);
        setActiveView('linkedin');
      } else {
        setAnalysis('⚠️ No LinkedIn posts found. Make sure your token is valid and you have published posts.');
      }
    } catch {
      setAnalysis('❌ Failed to reach the backend. Ensure FastAPI is running on port 8000.');
    } finally {
      setIsLoading(false);
    }
  };

  // Render markdown-ish text with bold support
  const renderFormatted = (text: string) =>
    text.split('\n').map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return (
        <p
          key={i}
          className="text-sm leading-relaxed"
          style={{ color: 'var(--foreground)', marginBottom: '4px' }}
          dangerouslySetInnerHTML={{ __html: bold }}
        />
      );
    });

  const displayPosts = activeView === 'linkedin' ? linkedinPosts : calendar;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Post list */}
      <div className="solid-card p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-crex-blue" />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
            Post Intelligence
          </h3>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('draft')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeView === 'draft' ? 'bg-crex-blue text-white' : 'text-gray-400 hover:text-white'}`}
            style={activeView !== 'draft' ? { background: 'var(--input-bg)' } : {}}
          >
            📋 Draft Posts
          </button>
          <button
            onClick={() => setActiveView('linkedin')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeView === 'linkedin' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            style={activeView !== 'linkedin' ? { background: 'var(--input-bg)' } : {}}
          >
            <span className="flex items-center justify-center gap-1">
              <Linkedin className="w-3 h-3" /> Real Posts
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {activeView === 'linkedin' && (
            <button
              onClick={handleFetchLinkedinPosts}
              disabled={isLoading}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-70"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Fetch My LinkedIn Posts
            </button>
          )}
          <button
            onClick={handleAnalyzeLinkedinPosts}
            disabled={isBulkLoading}
            className="w-full py-2.5 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-70"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
          >
            {isBulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            🔍 Analyze ALL My Posts (AI Report)
          </button>
          <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleUploadCsv} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isBulkLoading}
            className="w-full py-2.5 bg-gray-800 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 hover:bg-gray-700 transition-all disabled:opacity-70 border border-gray-700"
          >
            📂 Upload "Shares.csv" (Free Bypass)
          </button>
        </div>

        {/* Post List */}
        {displayPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 opacity-50">
            <BarChart3 className="w-8 h-8 mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              {activeView === 'linkedin'
                ? 'Click "Fetch My LinkedIn Posts" to load your real posts.'
                : 'No draft posts yet.\nGenerate a weekly plan first.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[360px] custom-scrollbar pr-1">
            {displayPosts.map((post, idx) => (
              <button
                key={idx}
                onClick={() => handleAnalyze(post)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedPost?.id === post.id || selectedPost?.scheduled_date === post.scheduled_date
                    ? 'border-crex-blue bg-crex-blue/5'
                    : 'border-transparent hover:border-crex-blue/30'
                }`}
                style={{ background: 'var(--input-bg)' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                      {post.topic || post.text?.substring(0, 60)}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {post.scheduled_date || (post.created_at ? new Date(post.created_at).toLocaleDateString() : 'LinkedIn post')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {post.score && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: post.score >= 85 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: post.score >= 85 ? '#10b981' : '#f59e0b' }}
                      >
                        {post.score}
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Analysis Result */}
      <div className="solid-card p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
            {bulkReport ? `AI Post Intelligence Report (${postsAnalyzed} posts)` : 'AI Mentor Feedback'}
          </h3>
        </div>

        {!selectedPost && !isLoading && !bulkReport && !isBulkLoading && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40">
            <Brain className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Select a post to analyze, or click "Analyze ALL My Posts" for a full AI intelligence report.
            </p>
          </div>
        )}

        {(isLoading || isBulkLoading) && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-crex-blue animate-spin" />
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {isBulkLoading ? 'AI is analyzing your LinkedIn history...' : 'AI Mentor is analyzing your post...'}
            </p>
          </div>
        )}

        {bulkReport && !isBulkLoading && (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
            {renderFormatted(bulkReport)}
          </div>
        )}

        {analysis && !isLoading && !bulkReport && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {selectedPost && (
              <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--input-bg)' }}>
                <p className="text-[10px] font-semibold text-crex-blue uppercase tracking-wider mb-1">Analyzing</p>
                <p className="text-xs font-medium truncate" style={{ color: 'var(--foreground)' }}>{selectedPost.topic || selectedPost.text?.substring(0, 60)}</p>
              </div>
            )}
            <div className="space-y-1">
              {renderFormatted(analysis)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Account Analysis ─────────────────────────────────────────────────────────
const AccountAnalysisTab = () => {
  const [industry, setIndustry] = useState('');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [fullAudit, setFullAudit] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAnalysis(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/account/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry, target_audience: audience, goal }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || data.detail || 'No analysis returned.');
    } catch {
      setAnalysis('❌ Failed to reach the backend. Ensure FastAPI is running on port 8000.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderFormatted = (text: string) =>
    text.split('\n').map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return (
        <p
          key={i}
          className="text-sm leading-relaxed"
          style={{ color: 'var(--foreground)', marginBottom: '4px' }}
          dangerouslySetInnerHTML={{ __html: bold }}
        />
      );
    });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <div className="solid-card p-6 flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-crex-blue" />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Account Strategy Analyzer</h3>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Get a personalized LinkedIn growth strategy from your AI mentor.
          </p>
        </div>

        <form onSubmit={handleAnalyze} className="flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Your Industry
            </label>
            <input
              required value={industry} onChange={e => setIndustry(e.target.value)}
              placeholder="e.g. AI / SaaS / Finance"
              className="theme-input w-full px-4 py-2.5 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Target Audience
            </label>
            <input
              required value={audience} onChange={e => setAudience(e.target.value)}
              placeholder="e.g. Startup Founders, CTOs"
              className="theme-input w-full px-4 py-2.5 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Primary Goal
            </label>
            <input
              required value={goal} onChange={e => setGoal(e.target.value)}
              placeholder="e.g. Get consulting clients, Build personal brand"
              className="theme-input w-full px-4 py-2.5 rounded-xl text-sm"
            />
          </div>

          {/* Feature pills */}
          <div className="grid grid-cols-3 gap-2 py-1">
            {[
              { icon: <TrendingUp className="w-3 h-3" />, label: 'Profile Tips' },
              { icon: <Layers className="w-3 h-3" />, label: 'Content Pillars' },
              { icon: <Target className="w-3 h-3" />, label: 'Growth Tactics' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5 p-2 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                <span style={{ color: '#1668e8' }}>{item.icon}</span>
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 w-full py-3 bg-crex-blue text-white rounded-xl font-semibold text-sm shadow-md hover:bg-crex-blue-light transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Account...</>
            ) : (
              <><Zap className="w-4 h-4" /> Run Account Analysis</>
            )}
          </button>

          {/* Full Audit Button */}
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              setFullAudit(null);
              setAnalysis(null);
              try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/account/full-analysis`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ industry, target_audience: audience, goal, name: 'User', posts: [] }),
                });
                const data = await res.json();
                setFullAudit(data.audit || data.detail || 'No audit returned.');
              } catch {
                setFullAudit('❌ Failed to reach the backend. Ensure FastAPI is running on port 8000.');
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="mt-2 w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-sm shadow-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isLoading && !analysis ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Loading Full Audit...</>
            ) : (
              <><AlertCircle className="w-4 h-4" /> Full Account Audit</>
            )}
          </button>
        </form>
      </div>

      {/* Result */}
      <div className="solid-card p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-purple-500" />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Strategic Growth Report</h3>
        </div>

        {!analysis && !fullAudit && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40">
            <TrendingUp className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              Fill out the form and click "Run Account Analysis" for a quick strategy, or "Full Account Audit" for a comprehensive 6-section deep dive with your real LinkedIn post history.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            </div>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              AI is fetching your posts & building the full audit...
            </p>
          </div>
        )}

        {analysis && !fullAudit && !isLoading && (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
            {renderFormatted(analysis)}
          </div>
        )}

        {fullAudit && !isLoading && (
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
            {renderFormatted(fullAudit)}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── AI Autopilot ─────────────────────────────────────────────────────────────
const AiAutopilotTab = ({ calendar, onGenerate }: { calendar: any[], onGenerate: (data: any) => void }) => {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: "👋 Hi! I'm your AI Content Strategist. Tell me what you need — generate posts, analyze your content strategy, or ask for LinkedIn growth advice." }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/posts/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_text: `User Question: ${userMsg}\n\nContext: User has ${calendar.length} scheduled posts.`
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.feedback || 'I had trouble generating a response. Please try again.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Backend not reachable. Please ensure FastAPI is running on port 8000.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const autopilotActions = [
    { label: '📅 What posts should I write this week?', prompt: 'What are the best LinkedIn post ideas for this week based on current trends?' },
    { label: '🔥 How do I grow my LinkedIn following?', prompt: 'Give me a 5-step LinkedIn growth strategy for 2025.' },
    { label: '✍️ Review my writing style', prompt: 'Based on LinkedIn best practices, what writing style should I use for maximum engagement?' },
    { label: '📊 How to measure LinkedIn ROI?', prompt: 'How do I measure the ROI of my LinkedIn content strategy?' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Quick Actions */}
      <div className="solid-card p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Quick Actions</h3>
        </div>
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>Click a prompt to instantly ask the AI.</p>
        <div className="flex flex-col gap-2">
          {autopilotActions.map((action, i) => (
            <button
              key={i}
              onClick={() => {
                setChatInput('');
                setMessages(prev => [...prev, { role: 'user', text: action.prompt }]);
                setIsLoading(true);
                fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/posts/analyze`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ draft_text: action.prompt }),
                })
                  .then(r => r.json())
                  .then(d => {
                    setMessages(prev => [...prev, { role: 'ai', text: d.feedback || 'No response.' }]);
                    setIsLoading(false);
                  })
                  .catch(() => {
                    setMessages(prev => [...prev, { role: 'ai', text: '❌ Backend not reachable.' }]);
                    setIsLoading(false);
                  });
              }}
              className="text-left text-xs p-3 rounded-xl border transition-all hover:border-crex-blue/40 hover:bg-crex-blue/5"
              style={{ borderColor: 'var(--card-border)', color: 'var(--foreground)', background: 'var(--input-bg)' }}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--card-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Pipeline Status</p>
          <div className="flex flex-col gap-2">
            {[
              { label: 'Scheduled Posts', value: calendar.length, color: '#1668e8' },
              { label: 'Avg Quality Score', value: calendar.length > 0 ? Math.round(calendar.reduce((a, c) => a + c.score, 0) / calendar.length) : 0, color: '#10b981' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                <span className="text-sm font-bold" style={{ color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="lg:col-span-2 solid-card flex flex-col overflow-hidden" style={{ minHeight: '480px' }}>
        <div className="flex items-center gap-2 p-5 border-b" style={{ borderColor: 'var(--card-border)' }}>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-crex-blue to-purple-500 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>AI Content Strategist</h3>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Powered by Llama 3.3 70B</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar flex flex-col gap-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'ai' && (
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-crex-blue to-purple-500 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className="max-w-[80%] px-4 py-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap"
                style={{
                  background: msg.role === 'user' ? '#1668e8' : 'var(--input-bg)',
                  color: msg.role === 'user' ? 'white' : 'var(--foreground)',
                  borderRadius: msg.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
                }}
              >
                {msg.text.replace(/\*\*(.*?)\*\*/g, '$1')}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-crex-blue to-purple-500 flex items-center justify-center mr-2 flex-shrink-0">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div className="px-4 py-3 rounded-2xl text-xs" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleChat} className="p-4 border-t flex gap-3" style={{ borderColor: 'var(--card-border)' }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="Ask your AI strategist anything..."
            className="flex-1 theme-input px-4 py-2.5 rounded-xl text-sm"
          />
          <button
            type="submit"
            disabled={isLoading || !chatInput.trim()}
            className="p-2.5 bg-crex-blue text-white rounded-xl transition-all hover:bg-crex-blue-light disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Engagement Tab (AI Comment Replier) ──────────────────────────────────────
const EngagementTab = () => {
  const [comment, setComment] = useState('');
  const [postContext, setPostContext] = useState('');
  const [replies, setReplies] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateReplies = async () => {
    if (!comment) return;
    setIsLoading(true);
    setReplies(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/comments/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment, post_context: postContext }),
      });
      const data = await res.json();
      setReplies(data.replies || 'No replies generated.');
    } catch {
      setReplies('❌ Failed to connect to AI server.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderFormatted = (text: string) =>
    text.split('\n').map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return (
        <p
          key={i}
          className="text-sm leading-relaxed"
          style={{ color: 'var(--foreground)', marginBottom: '8px' }}
          dangerouslySetInnerHTML={{ __html: bold }}
        />
      );
    });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="solid-card p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-crex-blue" />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>AI Comment Replier</h3>
        </div>
        
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block text-gray-400">
            Someone commented on your post:
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Paste their comment here..."
            className="theme-input w-full p-3 rounded-xl text-sm min-h-[100px] resize-none"
          />
        </div>
        
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block text-gray-400">
            (Optional) Your original post context:
          </label>
          <input
            type="text"
            value={postContext}
            onChange={(e) => setPostContext(e.target.value)}
            placeholder="e.g. A post about using AI for growth..."
            className="theme-input w-full p-3 rounded-xl text-sm"
          />
        </div>

        <button
          onClick={handleGenerateReplies}
          disabled={isLoading || !comment}
          className="mt-2 w-full py-3 bg-crex-blue text-white rounded-xl font-semibold text-sm shadow-md hover:bg-crex-blue-light transition-colors disabled:opacity-70 flex justify-center items-center gap-2"
        >
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</> : <><Sparkles className="w-4 h-4" /> Generate Strategic Replies</>}
        </button>
      </div>

      <div className="solid-card p-5 flex flex-col">
        <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--foreground)' }}>Generated Replies</h3>
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-crex-blue animate-spin" />
            <span className="text-xs text-gray-400">Crafting the perfect hooks...</span>
          </div>
        ) : replies ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {renderFormatted(replies)}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40">
            <MessageSquare className="w-10 h-10 mb-3 text-gray-400" />
            <p className="text-xs text-center text-gray-400">
              Paste a comment and click Generate to see 3 strategic reply options.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Analytics Panel ─────────────────────────────────────────────────────
type Tab = 'posts' | 'account' | 'engagement' | 'autopilot';

const AnalyticsPanel = ({ calendar, onGenerate }: { calendar: any[], onGenerate: (data: any) => void }) => {
  const [activeTab, setActiveTab] = useState<Tab>('posts');

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'posts', label: 'Post Analysis', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'account', label: 'Account Analysis', icon: <User className="w-4 h-4" /> },
    { id: 'engagement', label: 'Engagement', icon: <MessageSquare className="w-4 h-4" />, badge: 'FREE' },
    { id: 'autopilot', label: 'AI Autopilot', icon: <Brain className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 rounded-2xl" style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id ? 'bg-crex-blue text-white shadow-sm' : 'hover:opacity-80'
            }`}
            style={activeTab !== tab.id ? { color: 'var(--text-muted)' } : {}}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.badge && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-crex-blue text-white'}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'posts' && <PostAnalysisTab calendar={calendar} />}
      {activeTab === 'account' && <AccountAnalysisTab />}
      {activeTab === 'engagement' && <EngagementTab />}
      {activeTab === 'autopilot' && <AiAutopilotTab calendar={calendar} onGenerate={onGenerate} />}
    </div>
  );
};

export default AnalyticsPanel;
