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

  // ── On mount: check if generation was running before reload ──────────────────
  useEffect(() => {
    // 1. Re-check the backend — if it's still processing, restore the generating UI
    dispatch(checkGenerationOnMount());
    // 2. Fetch health & calendar
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/health`)
      .then(r => r.json()).then(setHealth).catch(() => {});
    dispatch(fetchCalendar());

    // 3. Smart calendar polling — pause when tab hidden
    const POLL_MS = 12000;
    const interval = setInterval(() => {
      if (!document.hidden) dispatch(fetchCalendar());
    }, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) dispatch(fetchCalendar());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const poll = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/workflow/progress`);
        if (res.ok) {
          const data = await res.json();
          dispatch(updateProgress(data));
          // If generation just finished, refetch calendar to get new posts
          if (!data.active) dispatch(fetchCalendar());
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/workflow/generate-weekly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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

      const res = await fetch(`http://localhost:8000/api/posts/publish/${date}`, {
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
      await dispatch(resetCalendar()).unwrap();
      addNotification({ type: 'info', title: 'Queue Cleared', message: 'Publishing queue has been completely reset.' });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Could not reset the calendar.' });
    }
  };

  const handleDeletePost = async (date: string) => {
    if (!confirm(`Delete the post scheduled for ${date}?`)) return;
    try {
      await dispatch(deletePost(date)).unwrap();
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

  return (
    <div
      className="min-h-screen p-4 md:p-8 flex justify-center relative"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <main
        className="w-full max-w-[1400px] rounded-3xl md:rounded-[2.5rem] shadow-xl overflow-hidden p-4 md:p-8 flex flex-col"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid var(--card-border)',
        }}
      >
        <TopNav activePage={activePage} onNavigate={setActivePage} />

        {activePage === 'dashboard' && (
          <div className="flex-1 flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-1/4 flex-shrink-0">
              <ProfileCard health={health} />
            </div>

            <div className="flex-1 flex flex-col lg:pl-4 mt-6 lg:mt-0">
              <Header publishedCount={publishedCount} upcomingCount={upcomingCount} avgScore={avgScore} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                <div className="lg:col-span-2 flex flex-col gap-6">
                  <div>
                    <WeeklyPlannerForm onGenerate={handleGenerate} isGenerating={isGenerating} />
                  </div>
                  <div className="flex-1 min-h-[220px]">
                    <CalendarWidget
                      calendar={calendar}
                      onView={(post) => setSelectedPost(post)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex-1">
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
          </div>
        )}

        {activePage === 'analytics' && (
          <div className="flex-1 mt-2">
            <AnalyticsPanel calendar={calendar} onGenerate={handleGenerate} />
          </div>
        )}
      </main>

      {selectedPost && (
        <PostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onPublish={handlePublish}
        />
      )}

      {/* ── Floating Action Button ──────────────────────────── */}
      {!showGeneratorModal && (
        <button
          onClick={() => setShowGeneratorModal(true)}
          title="Generate Weekly Posts"
          className="fixed bottom-8 right-8 z-40 w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-2xl flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-200"
          style={{ boxShadow: '0 0 24px rgba(99,102,241,0.6)' }}
        >
          {isGenerating && isMinimized ? (
            /* Pulse ring when minimized to indicate background activity */
            <span className="relative flex">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40"></span>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          )}
        </button>
      )}

      {/* ── "Generating in Background" sticky banner ─────────── */}
      {isGenerating && isMinimized && (
        <button
          onClick={() => dispatch(setMinimized(false))}
          className="fixed bottom-28 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-2xl shadow-xl hover:bg-indigo-700 transition-all"
          style={{ boxShadow: '0 0 20px rgba(99,102,241,0.5)' }}
        >
          <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse"></span>
          AI Generating... — Tap to watch
        </button>
      )}

      {/* ── Generator Modal ─────────────────────────────────── */}
      {showGeneratorModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg">
            <button
              onClick={() => setShowGeneratorModal(false)}
              className="absolute -top-3 -right-3 z-10 w-9 h-9 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <WeeklyPlannerForm onGenerate={handleGenerate} isGenerating={isGenerating} />
          </div>
        </div>
      )}

      {/* ── Scrape Required Modal ─────────────────────────────── */}
      {showScrapeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
               <span className="text-3xl">🔌</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Scraping Required</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              You selected <strong>"Use My LinkedIn Style"</strong>, but you haven't scraped any posts yet! 
              <br/><br/>
              Please open the Chrome Extension on your LinkedIn profile and click <strong>"Scrape Posts"</strong> so the AI can learn your style.
            </p>
            <button 
              onClick={() => setShowScrapeModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-all"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* ── Success Modal ─────────────────────────────────────── */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
               <span className="text-3xl">✨</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Generation Complete!</h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              The AI has generated <strong>{successDiff}</strong> high-converting posts for your AI Agents niche. They're ready in your Publishing Queue!
            </p>
            <button 
              onClick={() => setShowSuccessModal(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-6 rounded-xl transition-all"
            >
              View My Posts
            </button>
          </div>
        </div>
      )}

      {/* ── Generation Progress Modal ─────────────────────────── */}
      {isGenerating && !isMinimized && (
        <div className="fixed inset-0 bg-[#0b1120]/80 backdrop-blur-xl z-50 flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col" style={{maxHeight: '85vh', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'}}>

            {/* Premium Header */}
            <div className="relative px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-700 overflow-hidden shrink-0">
              <div className="absolute top-0 left-0 w-full h-full opacity-10" style={{backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px'}}></div>
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex items-center justify-center w-12 h-12">
                    <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <div>
                    <h2 className="text-white font-extrabold text-2xl tracking-tight leading-none">AI Generation Engine</h2>
                    <p className="text-blue-100/90 text-sm font-medium mt-1 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                      {genProgress?.current_step || 'Initializing AI clusters...'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => dispatch(setMinimized(true))} 
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white backdrop-blur-sm transition-all shadow-sm group"
                  title="Minimize to background"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-y-1 transition-transform"><path d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-gray-900/10 dark:bg-gray-100/10 shrink-0">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_12px_rgba(56,189,248,0.7)] transition-all duration-700 ease-out rounded-r-full"
                style={{ width: (genProgress?.total_days ?? 0) > 0 ? `${((genProgress?.current_day ?? 0) / (genProgress?.total_days ?? 1)) * 100}%` : '5%' }}
              />
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden bg-[var(--background)]">

              {/* LEFT: Mind Map */}
              <div className="w-full md:w-1/2 p-6 md:p-8 border-r border-[var(--card-border)] overflow-y-auto hide-scrollbar">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm border border-blue-200/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  </div>
                  <h3 className="font-extrabold text-[var(--foreground)] text-base tracking-widest uppercase">Strategic Mind Map</h3>
                </div>

                <div className="flex flex-col items-center mb-8 relative">
                  <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent -z-10"></div>
                  <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-[15px] font-bold px-8 py-3.5 rounded-2xl shadow-lg shadow-indigo-500/30 text-center max-w-[240px] border border-white/20 backdrop-blur-md">
                    🎯 {genProgress?.theme || lastRequest?.theme || 'Content Strategy'}
                  </div>
                  <div className="w-0.5 h-8 bg-gradient-to-b from-purple-500 to-transparent mt-1 rounded-b-full"></div>
                </div>

                <div className="space-y-4">
                  {(genProgress?.topics || []).map((topic: string, idx: number) => {
                    const isCompleted = (genProgress?.completed_days || []).some((d: any) => d.day === idx + 1);
                    const isCurrent = genProgress?.current_day === idx + 1;
                    const completedDay = (genProgress?.completed_days || []).find((d: any) => d.day === idx + 1);
                    
                    let cardStyle = "bg-[var(--card-bg)] border-y border-r border-[var(--card-border)] border-l-4 border-l-gray-400 dark:border-l-gray-600 opacity-60";
                    let textClass = "text-gray-700 dark:text-gray-300";
                    
                    if (isCompleted) {
                      cardStyle = "bg-[var(--card-bg)] border-y border-r border-[var(--card-border)] border-l-4 border-l-emerald-500 shadow-sm opacity-100";
                      textClass = "text-[var(--foreground)]";
                    }
                    if (isCurrent) {
                      cardStyle = "bg-[var(--card-bg)] border-y border-r border-[var(--card-border)] border-l-4 border-l-blue-500 shadow-[0_4px_20px_-4px_rgba(59,130,246,0.3)] opacity-100 scale-[1.02] transform transition-transform z-10 relative";
                      textClass = "text-blue-900 dark:text-blue-100 font-extrabold";
                    }

                    return (
                      <div key={idx} className={`flex items-start gap-4 p-5 rounded-r-2xl rounded-l-md transition-all duration-500 ${cardStyle}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-inner ${isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : isCurrent ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                          {isCompleted ? <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> : 
                           isCurrent ? <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin-slow"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> : 
                           <span className="text-sm font-bold">{idx+1}</span>}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className={`text-[15px] leading-snug line-clamp-2 ${textClass} ${isCompleted || isCurrent ? 'font-bold' : 'font-medium'}`}>{topic}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[11px] uppercase font-extrabold tracking-widest text-gray-400">Day {idx+1}</span>
                            {isCompleted && completedDay && (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">Score: {completedDay.score}/100</span>
                              </>
                            )}
                            {isCurrent && (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                <span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 animate-pulse">Generating draft...</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(!genProgress?.topics || genProgress.topics.length === 0) && (
                    <div className="flex flex-col gap-4">
                      {[...Array(7)].map((_, i) => (
                        <div key={i} className="h-[88px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl animate-pulse flex items-center px-5">
                          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 mr-4 shrink-0"></div>
                          <div className="w-full space-y-2">
                            <div className="h-2.5 w-3/4 bg-gray-200 dark:bg-gray-800 rounded"></div>
                            <div className="h-2 w-1/4 bg-gray-100 dark:bg-gray-900 rounded"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: Live Activity Feed */}
              <div className="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto hide-scrollbar flex flex-col relative bg-gradient-to-b from-[var(--background)] to-[var(--card-bg)]">
                <div className="flex items-center gap-3 mb-8 sticky top-0 bg-[var(--background)]/95 backdrop-blur-md pb-4 z-10">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-sm border border-purple-200/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                  </div>
                  <h3 className="font-extrabold text-[var(--foreground)] text-base tracking-widest uppercase">Agent Telemetry</h3>
                  <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800/50 shadow-sm">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
                    <span className="text-[11px] font-black text-green-700 dark:text-green-400 uppercase tracking-widest">Live</span>
                  </div>
                </div>

                <div className="space-y-4 flex-1 pb-10">
                  {(genProgress?.activity_log || ['🚀 Initiating swarm intelligence...']).slice(-15).map((log: string, idx: number, arr: string[]) => {
                    const isLatest = idx === arr.length - 1;
                    
                    let accentClass = "border-l-gray-400 dark:border-l-gray-600";
                    let textClass = "text-gray-700 dark:text-gray-300";
                    let iconBg = "bg-gray-100 dark:bg-gray-800";
                    
                    if (log.startsWith('🔍')) {
                      accentClass = "border-l-amber-500"; textClass = "text-amber-900 dark:text-amber-100"; iconBg = "bg-amber-100 dark:bg-amber-900/40";
                    } else if (log.startsWith('✅') || log.startsWith('✍')) {
                      accentClass = "border-l-emerald-500"; textClass = "text-emerald-900 dark:text-emerald-100"; iconBg = "bg-emerald-100 dark:bg-emerald-900/40";
                    } else if (log.startsWith('📝') || log.startsWith('Day')) {
                      accentClass = "border-l-blue-500"; textClass = "text-blue-900 dark:text-blue-100"; iconBg = "bg-blue-100 dark:bg-blue-900/40";
                    } else if (log.startsWith('🛑') || log.startsWith('❌')) {
                      accentClass = "border-l-red-500"; textClass = "text-red-900 dark:text-red-100 font-semibold"; iconBg = "bg-red-100 dark:bg-red-900/40";
                    } else if (log.startsWith('🎉')) {
                      accentClass = "border-l-purple-500"; textClass = "text-purple-900 dark:text-purple-100 font-bold"; iconBg = "bg-purple-100 dark:bg-purple-900/40";
                    }

                    // Extract the emoji from the start of the string if it exists
                    const emojiMatch = log.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic})/u);
                    const emoji = emojiMatch ? emojiMatch[0] : '🔹';
                    const message = emojiMatch ? log.substring(emoji.length).trim() : log;

                    return (
                      <div key={idx} className={`relative flex items-start gap-4 p-4 rounded-r-2xl rounded-l-md border-y border-r border-[var(--card-border)] border-l-4 ${accentClass} bg-[var(--card-bg)] shadow-sm transition-all duration-300 ${isLatest ? 'opacity-100 ring-2 ring-indigo-500/20 shadow-md transform -translate-y-1' : 'opacity-70'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-inner ${iconBg}`}>
                          <span className="text-lg">{emoji}</span>
                        </div>
                        <div className="flex-1 min-w-0 pt-2">
                          <p className={`text-[15px] font-medium leading-snug ${textClass}`}>
                            {message}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <WelcomeModal onComplete={() => {}} />
    </div>
  );
}
