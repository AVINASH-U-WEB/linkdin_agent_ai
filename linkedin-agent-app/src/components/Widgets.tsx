'use client';

import React, { useState } from 'react';
import { Play, CheckCircle2, Circle, AlertCircle, CalendarClock, Globe, Trash2 } from 'lucide-react';

export const WeeklyPlannerForm = ({ onGenerate, isGenerating }: { onGenerate: (data: any) => void, isGenerating?: boolean }) => {
  const [theme, setTheme] = useState('');
  const [industry, setIndustry] = useState('');
  const [audience, setAudience] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [contentStyle, setContentStyle] = useState('mimic');
  const [isLoading, setIsLoading] = useState(false);

  const [hasScrapedPosts, setHasScrapedPosts] = useState(true); // Default true until checked

  React.useEffect(() => {
    const savedIndustry = localStorage.getItem('crex_default_industry');
    const savedAudience = localStorage.getItem('crex_default_audience');
    if (savedIndustry) setIndustry(savedIndustry);
    if (savedAudience) setAudience(savedAudience);
    
    // Check if user has scraped posts
    fetch("http://localhost:8000/api/user/scraped-status")
      .then(res => res.json())
      .then(data => {
        setHasScrapedPosts(data.has_scraped_posts);
        if (!data.has_scraped_posts) {
          setContentStyle('viral'); // Force viral if they can't use mimic
        }
      })
      .catch(err => console.error("Failed to check scraped status:", err));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme || !industry || !audience || !goal) return;
    setIsLoading(true);
    // If no start date provided, the backend will default to tomorrow.
    onGenerate({ theme, industry, target_audience: audience, content_goal: goal, start_date: startDate || undefined, content_style: contentStyle });
    
    // Reset local loading state after 1 sec, but rely on isGenerating prop for button state
    setTimeout(() => {
       setIsLoading(false);
       setTheme('');
    }, 1000);
  };

  const showLoading = isLoading || isGenerating;

  return (
    <div className="solid-card p-6 flex flex-col h-full col-span-2">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-crex-text text-lg font-medium">Generate Weekly Plan</h3>
          <span className="text-xs text-crex-grey">Auto-brainstorm 7 days of high-converting posts</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-crex-bg flex items-center justify-center text-crex-blue">
          <Globe className="w-4 h-4" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-5">
          <div className="flex flex-col md:col-span-4">
            <label className="text-xs font-semibold text-crex-grey mb-1.5 uppercase tracking-wider">Core Theme</label>
            <input required value={theme} onChange={e => setTheme(e.target.value)} type="text" placeholder="e.g. Future of AI" className="theme-input px-4 py-2.5 rounded-xl text-sm" />
          </div>
          <div className="flex flex-col md:col-span-4">
            <label className="text-xs font-semibold text-crex-grey mb-1.5 uppercase tracking-wider">Industry</label>
            <input required value={industry} onChange={e => setIndustry(e.target.value)} type="text" placeholder="e.g. SaaS Tech" className="theme-input px-4 py-2.5 rounded-xl text-sm" />
          </div>
          <div className="flex flex-col md:col-span-4">
            <label className="text-xs font-semibold text-crex-grey mb-1.5 uppercase tracking-wider">Target Audience</label>
            <input required value={audience} onChange={e => setAudience(e.target.value)} type="text" placeholder="e.g. Founders" className="theme-input px-4 py-2.5 rounded-xl text-sm" />
          </div>
          <div className="flex flex-col md:col-span-7">
            <label className="text-xs font-semibold text-crex-grey mb-1.5 uppercase tracking-wider">Goal</label>
            <input required value={goal} onChange={e => setGoal(e.target.value)} type="text" placeholder="e.g. Inbound leads" className="theme-input px-4 py-2.5 rounded-xl text-sm" />
          </div>
          <div className="flex flex-col md:col-span-5">
            <label className="text-xs font-semibold text-crex-grey mb-1.5 uppercase tracking-wider">Start Day (Optional)</label>
            <input value={startDate} onChange={e => setStartDate(e.target.value)} type="date" className="theme-input px-4 py-2.5 rounded-xl text-sm" />
          </div>
          <div className="flex flex-col md:col-span-12 mt-2">
            <label className="text-xs font-semibold text-crex-grey mb-2 uppercase tracking-wider">Tone & Style</label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2 text-sm text-crex-text cursor-pointer">
                <input 
                  type="radio" 
                  name="contentStyle" 
                  value="mimic" 
                  checked={contentStyle === 'mimic'} 
                  onChange={(e) => {
                    if (!hasScrapedPosts) {
                      alert("Scraping Required: You must use the Chrome Extension to scrape your LinkedIn posts before selecting this option.");
                      e.preventDefault();
                      return;
                    }
                    setContentStyle('mimic');
                  }} 
                  className="w-4 h-4"
                />
                <span>Use My LinkedIn Style (Scraped)</span>
              </label>
              <label className="flex items-center space-x-2 text-sm text-crex-text cursor-pointer">
                <input 
                  type="radio" 
                  name="contentStyle" 
                  value="viral" 
                  checked={contentStyle === 'viral'} 
                  onChange={() => setContentStyle('viral')} 
                  className="w-4 h-4"
                />
                <span>Use High-Converting AI Style (Viral)</span>
              </label>
            </div>
          </div>
        </div>

        <button 
          disabled={showLoading} 
          type="submit" 
          className="mt-6 w-full py-3 bg-crex-blue text-white rounded-xl font-medium shadow-md hover:bg-crex-blue-light transition-colors flex items-center justify-center disabled:opacity-70"
        >
          {showLoading ? (
             <span className="animate-pulse">Generation in Progress...</span>
          ) : (
             <>
               <Play className="w-4 h-4 mr-2" />
               Start Generation
             </>
          )}
        </button>
      </form>
    </div>
  );
};

export const PublishingQueue = ({ calendar, onPublish, onView, onReset, onDelete }: { calendar: any[], onPublish: (date: string) => void, onView?: (post: any) => void, onReset?: () => void, onDelete?: (date: string) => void }) => {
  return (
    <div className="dark-card p-6 flex flex-col relative h-full">
      <div className="flex justify-between items-end mb-6">
        <div>
           <h3 className="text-white text-lg font-medium leading-tight">Publishing Queue</h3>
           <span className="text-[10px] text-white/50">One-click live to LinkedIn</span>
        </div>
        <div className="flex items-center space-x-3">
          {calendar.length > 0 && onReset && (
            <button 
              onClick={onReset}
              className="p-1.5 rounded-md hover:bg-red-500/20 text-red-400 transition-colors"
              title="Clear entire queue"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <span className="text-2xl font-light text-white leading-none">{calendar.length}</span>
        </div>
      </div>

      <div className="flex flex-col space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
        {calendar.length === 0 ? (
           <div className="flex flex-col items-center justify-center flex-1 opacity-50">
             <CalendarClock className="w-8 h-8 text-white mb-2" />
             <span className="text-xs text-center">Queue is empty.<br/>Generate a weekly plan first.</span>
           </div>
        ) : (
          calendar.map((post, idx) => (
            <div 
              key={idx} 
              onClick={() => onView && onView(post)}
              className="flex items-start space-x-3 group bg-white/5 rounded-xl p-3 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
            >
              <div className="flex flex-col flex-1">
                <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors truncate w-40">{post.topic}</span>
                <div className="flex justify-between items-center mt-1">
                   <span className="text-[10px] text-crex-blue-light">{post.scheduled_date}</span>
                   <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white">Score: {post.score}</span>
                </div>
              </div>
              
              <div className="flex-shrink-0 self-center flex items-center space-x-2">
                {onDelete && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(post.scheduled_date);
                    }}
                    className="p-2 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors active:scale-95 group-hover:scale-110"
                    title="Delete Post"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                <button 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering the row click
                    onPublish(post.scheduled_date);
                  }}
                  className="p-2 rounded-full bg-crex-blue text-white shadow-sm hover:bg-crex-blue-light transition-transform active:scale-95 group-hover:scale-110"
                  title="Publish to LinkedIn"
                >
                  <Play className="w-3 h-3 ml-0.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
