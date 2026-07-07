'use client';

import React, { useState, useEffect, useRef } from "react";
import TopNav from "@/components/TopNav";
import Header from "@/components/Header";
import ProfileCard, { HealthData } from "@/components/ProfileCard";
import { WeeklyPlannerForm, PublishingQueue } from "@/components/Widgets";
import { CalendarWidget } from "@/components/CalendarWidget";
import PostModal from "@/components/PostModal";
import AnalyticsPanel from "@/components/AnalyticsPanel";
import WelcomeModal from "@/components/WelcomeModal";
import { useNotifications } from "@/context/NotificationContext";
import { useSession } from "next-auth/react";

// Redux
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  startGeneration,
  stopGeneration,
  setMinimized,
  updateProgress,
  checkGenerationOnMount,
} from "@/store/generationSlice";
import {
  fetchCalendar,
  resetCalendar,
  deletePost,
  markPublished,
} from "@/store/calendarSlice";

export type AppPage = 'dashboard' | 'analytics';

export default function Home() {
  const dispatch = useAppDispatch();
  const { addNotification } = useNotifications();
  const { data: session } = useSession();

  // ── Redux state ─────────────────────────────────────────────────────────────
  const { isGenerating, isMinimized, progress: genProgress, lastRequest } = useAppSelector(s => s.generation);
  const { posts: calendar, isLoading: calendarLoading } = useAppSelector(s => s.calendar);

  // ── Local UI state (no need to persist) ─────────────────────────────────────
  const [activePage, setActivePage] = useState<AppPage>('dashboard');
  const [health, setHealth] = useState<HealthData | undefined>(undefined);
  const [publishedCount, setPublishedCount] = useState(0);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successDiff, setSuccessDiff] = useState(0);
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const prevCalendarLengthRef = useRef(calendar.length);

  // ── On mount & Session Load ──────────────────────────────────────────────────
  useEffect(() => {
    // 1. Re-check the backend
    const userId = (session?.user as any)?.id;
    if (userId) {
      dispatch(checkGenerationOnMount(userId));
    }
    
    // 2. Fetch health
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/health`)
      .then(r => r.json()).then(setHealth).catch(() => {});
  }, [dispatch]);

  // ── Smart Polling & Initial Fetch (Requires Session) ─────────────────────────
  useEffect(() => {
    const userId = (session?.user as any)?.id;
    if (!userId) return;

    // Initial fetch once session is loaded
    dispatch(fetchCalendar(userId));

    const POLL_MS = 12000;
    const interval = setInterval(() => {
      if (!document.hidden) dispatch(fetchCalendar(userId));
    }, POLL_MS);
    
    const onVisibility = () => {
      if (!document.hidden) dispatch(fetchCalendar(userId));
    };
    
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session, dispatch]);

  // ── Detect when calendar grows → generation complete ─────────────────────────
  useEffect(() => {
    const prev = prevCalendarLengthRef.current;
    if (calendar.length > prev && prev > 0) {
      const diff = calendar.length - prev;
      setSuccessDiff(diff);
      setShowSuccessModal(true);
      dispatch(stopGeneration());
    }
    prevCalendarLengthRef.current = calendar.length;
  }, [calendar.length, dispatch]);

  // ── Poll progress while generating ──────────────────────────────────────────
  useEffect(() => {
    if (!isGenerating) return;
    const POLL_MS = isMinimized ? 4000 : 2000;
    const userId = (session?.user as any)?.id;

    const poll = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/workflow/progress?user_id=${userId || 'anonymous'}`);
        if (res.ok) {
          const data = await res.json();
          dispatch(updateProgress(data));
          // If generation just finished, refetch calendar to get new posts
          if (!data.active && (session?.user as any)?.id) dispatch(fetchCalendar((session?.user as any).id as string));
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [isGenerating, isMinimized, dispatch]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleGenerate = async (data: any) => {
    dispatch(startGeneration({
      theme: data.theme,
      industry: data.industry,
      target_audience: data.target_audience,
      content_goal: data.content_goal,
      content_style: data.content_style,
    }));
    setShowGeneratorModal(false);

    try {
      const payload = { ...data, user_id: (session?.user as any)?.id || 'anonymous' };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/workflow/generate-weekly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        addNotification({
          type: 'info',
          title: 'Generation Started',
          message: `AI agent is generating 7 posts about "${data.theme}". Check back shortly!`,
        });
      } else {
        dispatch(stopGeneration());
        const errData = await res.json();
        const errMessage = errData.detail || '';
        if (errMessage.includes("No scraped posts found")) {
          setShowScrapeModal(true);
        } else {
          addNotification({ type: 'error', title: 'Generation Blocked', message: errMessage || 'Could not start generation.' });
        }
      }
    } catch {
      dispatch(stopGeneration());
      addNotification({ type: 'error', title: 'Connection Error', message: 'Could not reach the backend on port 8000.' });
    }
  };

  const handlePublish = async (date: string, editedDraft?: string, imageFile?: File) => {
    try {
      const formData = new FormData();
      if (editedDraft) formData.append("draft_text", editedDraft);
      if (imageFile) formData.append("image", imageFile);
      const userToken = (session?.user as any)?.linkedinAccessToken;
      if (userToken) formData.append("linkedin_token", userToken);
      formData.append("user_id", (session?.user as any)?.id || "anonymous");

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/posts/publish/${date}`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setPublishedCount(prev => prev + 1);
        dispatch(markPublished(date));
        addNotification({ type: 'success', title: 'Published to LinkedIn! 🎉', message: `Your post for ${date} is now live.` });
      } else {
        const err = await res.json();
        addNotification({ type: 'error', title: 'Publish Failed', message: err.detail || `Failed to publish post for ${date}.` });
      }
    } catch {
      addNotification({ type: 'error', title: 'Connection Error', message: 'Could not reach the backend publisher.' });
    }
  };

  const handleReset = async () => {
    if (!confirm("Are you sure you want to clear the entire publishing queue? This cannot be undone.")) return;
    try {
      await dispatch(resetCalendar((session?.user as any)?.id || 'anonymous')).unwrap();
      addNotification({ type: 'info', title: 'Queue Cleared', message: 'Publishing queue has been completely reset.' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Could not reset the calendar.' });
    }
  };

  const handleDeletePost = async (date: string) => {
    if (!confirm(`Delete the post scheduled for ${date}?`)) return;
    try {
      await dispatch(deletePost({ date, userId: (session?.user as any)?.id || 'anonymous' })).unwrap();
      addNotification({ type: 'info', title: 'Post Deleted', message: `Post for ${date} deleted.` });
    } catch {
      addNotification({ type: 'error', title: 'Delete Failed', message: 'Could not delete post.' });
    }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const upcomingCount = calendar.length;
  const avgScore = calendar.length > 0
    ? Math.round(calendar.reduce((acc, p) => acc + p.score, 0) / calendar.length)
    : 0;

  // Mobile tab for progress modal
  const [progressTab, setProgressTab] = React.useState<'map' | 'log'>('map');

  return (
    <div
      className="min-h-screen p-2 sm:p-4 md:p-8 flex justify-center relative"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <main
        className="w-full max-w-[1400px] rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] shadow-xl overflow-hidden p-3 sm:p-5 md:p-8 flex flex-col"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--card-border)',
        }}
      >
        <TopNav activePage={activePage} onNavigate={setActivePage} />

        {activePage === 'dashboard' && (
          <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6 mt-2">
            <div className="w-full lg:w-1/4 flex-shrink-0">
              <ProfileCard health={health} />
            </div>
            <div className="flex-1 flex flex-col lg:pl-4">
              <Header publishedCount={publishedCount} upcomingCount={upcomingCount} avgScore={avgScore} />
              <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6 flex-1 mt-4">
                <div className="lg:col-span-2 flex flex-col gap-4 md:gap-6">
                  <WeeklyPlannerForm onGenerate={handleGenerate} isGenerating={isGenerating} />
                  <div className="min-h-[200px]">
                    <CalendarWidget calendar={calendar} onView={(post) => setSelectedPost(post)} />
                  </div>
                </div>
                <div>
                  <PublishingQueue
                    calendar={calendar}
                    onPublish={handlePublish}
                    onView={(post) => setSelectedPost(post)}
                    onReset={handleReset}
                    onDelete={handleDeletePost}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activePage === 'analytics' && (
          <div className="flex-1 mt-2">
            <AnalyticsPanel calendar={calendar} onGenerate={handleGenerate} />
          </div>
        )}
      </main>

      {selectedPost && (
        <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} onPublish={handlePublish} />
      )}

      {/* FAB */}
      {!showGeneratorModal && (
        <button
          onClick={() => setShowGeneratorModal(true)}
          title="Generate Weekly Posts"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-2xl flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-200"
          style={{ boxShadow: '0 0 24px rgba(99,102,241,0.6)' }}
        >
          {isGenerating && isMinimized ? (
            <span className="relative flex">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40"></span>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          )}
        </button>
      )}

      {/* Minimized banner */}
      {isGenerating && isMinimized && (
        <button
          onClick={() => dispatch(setMinimized(false))}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-2xl shadow-xl hover:bg-indigo-700 transition-all"
          style={{ boxShadow: '0 0 20px rgba(99,102,241,0.5)' }}
        >
          <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse"></span>
          AI Generating... — Tap to watch
        </button>
      )}

      {/* Generator Modal — slides up on mobile */}
      {showGeneratorModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden">
            <button
              onClick={() => setShowGeneratorModal(false)}
              className="absolute top-3 right-4 z-10 w-8 h-8 bg-black/20 rounded-full flex items-center justify-center text-white hover:bg-black/40 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <WeeklyPlannerForm onGenerate={handleGenerate} isGenerating={isGenerating} />
          </div>
        </div>
      )}

      {/* Scrape Modal */}
      {showScrapeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-8 w-full sm:max-w-md shadow-2xl text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-3xl">🔌</span></div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Scraping Required</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">You selected <strong>&quot;Use My LinkedIn Style&quot;</strong>, but you haven&apos;t scraped any posts yet!<br/><br/>Open the Chrome Extension on LinkedIn and click <strong>&quot;Scrape Posts&quot;</strong> first.</p>
            <button onClick={() => setShowScrapeModal(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-all">Got it!</button>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-8 w-full sm:max-w-md shadow-2xl text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-3xl">✨</span></div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Generation Complete!</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">The AI generated <strong>{successDiff}</strong> posts. Ready in your Publishing Queue!</p>
            <button onClick={() => setShowSuccessModal(false)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-6 rounded-xl transition-all">View My Posts</button>
          </div>
        </div>
      )}

      {/* Generation Progress Modal — Mobile-First Full Screen */}
      {isGenerating && !isMinimized && (
        <div className="fixed inset-0 bg-[#0b1120]/90 backdrop-blur-xl z-50 flex flex-col">
          {/* Header */}
          <div className="relative px-4 sm:px-8 py-4 sm:py-5 bg-gradient-to-r from-blue-600 to-indigo-700 shrink-0">
            <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px'}}></div>
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-10 h-10 shrink-0">
                  <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-white font-extrabold text-base sm:text-xl leading-tight">AI Generation Engine</h2>
                  <p className="text-blue-100/90 text-xs font-medium flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0"></span>
                    {genProgress?.current_step || 'Initializing...'}
                  </p>
                </div>
              </div>
              <button onClick={() => dispatch(setMinimized(true))} className="shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-black/30 shrink-0">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-700 ease-out rounded-r-full shadow-[0_0_8px_rgba(56,189,248,0.6)]"
              style={{ width: (genProgress?.total_days ?? 0) > 0 ? `${((genProgress?.current_day ?? 0) / (genProgress?.total_days ?? 1)) * 100}%` : '5%' }} />
          </div>

          {/* Mobile tabs */}
          <div className="md:hidden flex border-b border-white/10 bg-[var(--card-bg)] shrink-0">
            <button onClick={() => setProgressTab('map')} className={`flex-1 py-3 text-sm font-bold transition-colors ${progressTab === 'map' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400'}`}>🗺 Mind Map</button>
            <button onClick={() => setProgressTab('log')} className={`flex-1 py-3 text-sm font-bold transition-colors ${progressTab === 'log' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400'}`}>📡 Live Log</button>
          </div>

          <div className="flex flex-1 overflow-hidden bg-[var(--background)]">
            {/* Mind Map */}
            <div className={`w-full md:w-1/2 p-4 sm:p-6 overflow-y-auto border-r border-[var(--card-border)] ${progressTab === 'log' ? 'hidden md:block' : 'block'}`}>
              <h3 className="hidden md:block font-extrabold text-[var(--foreground)] text-sm tracking-widest uppercase mb-5">Strategic Mind Map</h3>
              <div className="flex flex-col items-center mb-5">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg text-center max-w-[200px]">
                  🎯 {genProgress?.theme || lastRequest?.theme || 'Content Strategy'}
                </div>
                <div className="w-0.5 h-4 bg-gradient-to-b from-purple-500 to-transparent mt-1"></div>
              </div>
              <div className="space-y-2.5">
                {(genProgress?.topics || []).map((topic: string, idx: number) => {
                  const isCompleted = (genProgress?.completed_days || []).some((d: any) => d.day === idx + 1);
                  const isCurrent = genProgress?.current_day === idx + 1;
                  const completedDay = (genProgress?.completed_days || []).find((d: any) => d.day === idx + 1);
                  return (
                    <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border-l-4 transition-all duration-500 bg-[var(--card-bg)] ${isCompleted ? 'border-emerald-500' : isCurrent ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-gray-600 opacity-50'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${isCompleted ? 'bg-emerald-100 text-emerald-600' : isCurrent ? 'bg-blue-100 text-blue-600' : 'bg-gray-800 text-gray-500'}`}>
                        {isCompleted ? '✓' : isCurrent ? '⚡' : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--foreground)] truncate">{topic}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500 uppercase">Day {idx + 1}</span>
                          {isCompleted && completedDay && <span className="text-[10px] font-bold text-emerald-500">Score: {completedDay.score}/100</span>}
                          {isCurrent && <span className="text-[10px] font-bold text-blue-400 animate-pulse">Writing...</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!genProgress?.topics || genProgress.topics.length === 0) && (
                  [...Array(7)].map((_, i) => (
                    <div key={i} className="h-14 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl animate-pulse flex items-center px-3 gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-700 shrink-0"></div>
                      <div className="flex-1 space-y-1.5"><div className="h-2 w-3/4 bg-gray-700 rounded"></div><div className="h-1.5 w-1/4 bg-gray-800 rounded"></div></div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Activity Log */}
            <div className={`w-full md:w-1/2 p-4 sm:p-6 overflow-y-auto flex flex-col ${progressTab === 'map' ? 'hidden md:flex' : 'flex'}`}>
              <div className="flex items-center gap-2 mb-5 sticky top-0 bg-[var(--background)]/95 backdrop-blur-md pb-3 z-10">
                <h3 className="font-extrabold text-[var(--foreground)] text-sm tracking-widest uppercase">Agent Telemetry</h3>
                <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/30">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Live</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {(genProgress?.activity_log || ['🚀 Initializing...']).slice(-15).map((log: string, idx: number, arr: string[]) => {
                  const isLatest = idx === arr.length - 1;
                  const emojiMatch = log.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic})/u);
                  const emoji = emojiMatch ? emojiMatch[0] : '🔹';
                  const message = emojiMatch ? log.substring(emoji.length).trim() : log;
                  const accent = log.startsWith('🔍') ? 'border-l-amber-500' : log.startsWith('✅') || log.startsWith('✍') ? 'border-l-emerald-500' : log.startsWith('📝') ? 'border-l-blue-500' : log.startsWith('❌') || log.startsWith('🛑') ? 'border-l-red-500' : log.startsWith('🎉') ? 'border-l-purple-500' : 'border-l-gray-600';
                  return (
                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl border-l-4 ${accent} bg-[var(--card-bg)] transition-all ${isLatest ? 'ring-1 ring-indigo-500/20' : 'opacity-60'}`}>
                      <span className="text-base shrink-0">{emoji}</span>
                      <p className="text-[13px] font-medium text-[var(--foreground)] leading-snug">{message}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <WelcomeModal onComplete={() => {}} />
    </div>
  );
}
