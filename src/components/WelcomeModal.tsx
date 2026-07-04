import React, { useState, useEffect } from 'react';
import { X, Sparkles, Chrome, Target, ArrowRight, Linkedin } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';

interface WelcomeModalProps {
  onComplete: () => void;
}

export default function WelcomeModal({ onComplete }: WelcomeModalProps) {
  const { data: session, status } = useSession();
  const [step, setStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [profile, setProfile] = useState({
    industry: '',
    audience: '',
    goal: 'Lead Generation'
  });

  useEffect(() => {
    // If user is authenticated via LinkedIn, auto-complete onboarding
    if (status === 'authenticated' && session?.user) {
      localStorage.setItem('crex_onboarded', 'true');
      setIsVisible(false);
      onComplete();
      return;
    }

    // If not authenticated and not yet onboarded, show the modal
    if (status === 'unauthenticated') {
      const hasOnboarded = localStorage.getItem('crex_onboarded');
      if (!hasOnboarded) {
        setIsVisible(true);
      }
    }
  }, [status, session]);

  if (!isVisible || status === 'loading') return null;

  const handleFinish = () => {
    localStorage.setItem('crex_onboarded', 'true');
    if (profile.industry) localStorage.setItem('crex_default_industry', profile.industry);
    if (profile.audience) localStorage.setItem('crex_default_audience', profile.audience);
    setIsVisible(false);
    onComplete();
  };

  const handleLinkedInConnect = () => {
    signIn('linkedin');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-crex-bg border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-300">
        
        {/* Progress Bar */}
        <div className="w-full h-1 bg-crex-card">
          <div 
            className="h-full bg-crex-blue transition-all duration-300" 
            style={{ width: step === 0 ? '33%' : step === 1 ? '66%' : '100%' }}
          />
        </div>

        <div className="p-8">
          {step === 0 ? (
            <div className="space-y-6 text-center py-6">
              <div className="w-16 h-16 bg-[#0a66c2]/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Linkedin className="text-[#0a66c2] w-8 h-8" />
              </div>
              <h2 className="text-3xl font-bold text-crex-text">Connect Your Account</h2>
              <p className="text-crex-grey text-lg max-w-md mx-auto">
                To generate and schedule posts directly to your feed, you need to securely connect your LinkedIn profile.
              </p>
              
              <button 
                onClick={handleLinkedInConnect}
                className="w-full max-w-sm mx-auto mt-8 bg-[#0a66c2] hover:bg-[#004182] text-white rounded-xl py-4 font-semibold flex items-center justify-center space-x-2 transition-all shadow-lg"
              >
                <Linkedin className="w-5 h-5" />
                <span>Sign in with LinkedIn</span>
              </button>
              
              <p className="text-xs text-crex-grey mt-4">
                We will never post without your permission.
              </p>
            </div>
          ) : step === 1 ? (
            <div className="space-y-6">
              <div className="w-12 h-12 bg-crex-blue/20 rounded-full flex items-center justify-center mb-6">
                <Sparkles className="text-crex-blue w-6 h-6" />
              </div>
              <h2 className="text-3xl font-bold text-crex-text">Welcome to your AI LinkedIn Agent</h2>
              <p className="text-crex-grey text-lg">
                Before we start generating your viral content calendar, let's configure your AI agent so it perfectly matches your brand.
              </p>
              
              <div className="space-y-4 mt-8">
                <div>
                  <label className="block text-sm font-medium text-crex-grey mb-2">Your Industry / Niche</label>
                  <input 
                    type="text"
                    value={profile.industry}
                    onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                    placeholder="e.g. B2B SaaS, AI Tech, Marketing"
                    className="w-full bg-crex-card border border-white/10 rounded-xl px-4 py-3 text-crex-text focus:outline-none focus:border-crex-blue transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-crex-grey mb-2">Target Audience</label>
                  <input 
                    type="text"
                    value={profile.audience}
                    onChange={(e) => setProfile({ ...profile, audience: e.target.value })}
                    placeholder="e.g. Startup Founders, CTOs, Junior Devs"
                    className="w-full bg-crex-card border border-white/10 rounded-xl px-4 py-3 text-crex-text focus:outline-none focus:border-crex-blue transition-colors"
                  />
                </div>
              </div>

              <button 
                onClick={() => setStep(2)}
                disabled={!profile.industry || !profile.audience}
                className="w-full mt-8 bg-crex-blue hover:bg-blue-600 text-white rounded-xl py-4 font-semibold flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          ) : step === 2 ? (
            <div className="space-y-6">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                <Chrome className="text-green-400 w-6 h-6" />
              </div>
              <h2 className="text-3xl font-bold text-crex-text">Step 2: Clone Your Voice</h2>
              <p className="text-crex-grey text-lg">
                Your AI agent is ready. But right now, it writes like a robot. 
                To make it sound exactly like you, we need to sync your past LinkedIn posts.
              </p>
              
              <div className="bg-crex-card border border-white/10 p-6 rounded-xl space-y-4">
                <h3 className="font-semibold text-crex-text flex items-center space-x-2">
                  <Target className="w-5 h-5 text-crex-blue" />
                  <span>Your First Mission:</span>
                </h3>
                <ol className="list-decimal list-inside space-y-3 text-crex-grey ml-2">
                  <li>Install the AI Extractor Chrome Extension</li>
                  <li>Go to your LinkedIn profile</li>
                  <li>Click the extension icon to scrape your posts</li>
                </ol>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-4">
                  <p className="text-sm text-yellow-200">
                    💡 If you skip this, the AI will use a standard "5-Zone Framework" to write your posts.
                  </p>
                </div>
              </div>

              <button 
                onClick={handleFinish}
                className="w-full mt-8 bg-white hover:bg-gray-100 text-black rounded-xl py-4 font-semibold flex items-center justify-center space-x-2 transition-all"
              >
                <span>Let's Go!</span>
                <Sparkles className="w-5 h-5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
