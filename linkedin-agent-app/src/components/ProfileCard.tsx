import React, { useState } from 'react';
import { ChevronDown, Bot, Server, ShieldCheck, Cpu } from 'lucide-react';
import { useSession } from 'next-auth/react';

export interface HealthData {
  status: string;
  version: string;
  search_engines: Record<string, string>;
  llm_models: string[];
  style: string;
}

const ProfileCard = ({ health }: { health?: HealthData }) => {
  const { data: session } = useSession();
  const [profileImage, setProfileImage] = useState<string | null>(null);

  React.useEffect(() => {
    // If we have a real LinkedIn photo, use it, otherwise check local storage for custom uploads
    if (session?.user?.image) {
      setProfileImage(session.user.image);
    } else {
      const savedImage = localStorage.getItem('crex_profile_image');
      if (savedImage) setProfileImage(savedImage);
    }
  }, [session]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setProfileImage(base64String);
        localStorage.setItem('crex_profile_image', base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const displayName = session?.user?.name || "Avinash";

  return (
    <div className="flex flex-col space-y-6">
      {/* Agent Info / Profile Photo */}
      <div 
        className="relative rounded-[2rem] overflow-hidden h-80 shadow-md group p-6 flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1 group"
        style={{
          backgroundImage: `url('${profileImage || '/download.jpg?v=1'}')`,
          backgroundSize: "cover",
          backgroundPosition: "center top"
        }}
      >
        {/* Hidden File Input for Image Upload */}
        <input 
          type="file" 
          accept="image/*" 
          id="profileImageInput" 
          className="hidden" 
          onChange={handleImageUpload} 
        />
        <label 
          htmlFor="profileImageInput"
          className="absolute top-4 left-4 bg-black/50 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-full cursor-pointer backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg border border-white/20"
        >
          Change Photo
        </label>
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/40 to-transparent" />
        
        <div className="relative flex justify-end items-start z-10">
           {/* Online Status Pill */}
           <div className="bg-black/30 border border-white/20 px-3.5 py-1.5 rounded-full text-white font-semibold backdrop-blur-md text-xs flex items-center gap-2 shadow-sm">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
             <span>{health?.status === 'healthy' ? 'Online' : 'Offline'}</span>
           </div>
        </div>
        
        <div className="relative z-10 text-white mt-auto">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/20 backdrop-blur-md mb-3 border border-white/20">
            <Bot className="w-3.5 h-3.5 text-white" />
            <span className="text-[10px] font-bold tracking-wider uppercase text-white/90">AI Publisher</span>
          </div>
          <h2 className="text-3xl font-bold mb-1 tracking-tight drop-shadow-md">{displayName}</h2>
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/80 font-medium drop-shadow-sm">v{health?.version || '3.0.0'} • Content Engine</p>
            {session ? (
              <button onClick={() => {
                localStorage.removeItem('crex_onboarded');
                window.location.href = '/api/auth/signout';
              }} className="text-xs bg-red-500/80 hover:bg-red-500 text-white px-3 py-1 rounded-full backdrop-blur-md transition-colors">
                Sign Out
              </button>
            ) : (
              <button onClick={() => window.location.href = '/api/auth/signin'} className="text-xs bg-blue-500/80 hover:bg-blue-500 text-white px-3 py-1 rounded-full backdrop-blur-md transition-colors">
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Configuration Accordion */}
      <div className="flex flex-col space-y-2 px-2">
        <AccordionItem 
          title="Active Style" 
          value={health?.style ? "Custom" : "Loading..."} 
          icon={<ShieldCheck className="w-4 h-4 text-crex-blue" />}
        >
          <div className="bg-gray-50 rounded-xl p-3 mb-2 border border-gray-100">
             <span className="text-xs font-medium text-crex-text leading-relaxed">
               {health?.style || 'Loading style configuration...'}
             </span>
          </div>
        </AccordionItem>
        
        <AccordionItem 
          title="LLM Models" 
          value={health?.llm_models ? `${health.llm_models.length} Loaded` : ""} 
          icon={<Cpu className="w-4 h-4 text-crex-grey" />}
          defaultOpen={true}
        >
          <div className="flex flex-col space-y-2 mb-2">
             {health?.llm_models.map((model, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white rounded-2xl p-3 shadow-sm border border-transparent hover:border-crex-blue/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-crex-text">{model.split(' ')[0]}</span>
                    <span className="text-[10px] text-crex-grey">{model.includes('primary') ? 'Primary' : 'Fallback'}</span>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${model.includes('primary') ? 'bg-crex-blue' : 'bg-gray-300'}`}></div>
                </div>
             ))}
          </div>
        </AccordionItem>

        <AccordionItem 
          title="Search Engines" 
          value={`${Object.keys(health?.search_engines || {}).length} Configured`} 
          icon={<Server className="w-4 h-4 text-crex-grey" />}
        >
          <div className="flex flex-col space-y-2 mb-2">
             {Object.entries(health?.search_engines || {}).map(([engine, status], idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <span className="text-xs font-medium text-crex-text capitalize">{engine}</span>
                  <span className={`text-[10px] font-bold ${status.includes('active') && !status.includes('no key') ? 'text-green-500' : 'text-red-400'}`}>
                    {status}
                  </span>
                </div>
             ))}
          </div>
        </AccordionItem>
      </div>
    </div>
  );
};

const AccordionItem = ({ title, value, icon, children, defaultOpen = false }: { title: string, value?: string, icon?: React.ReactNode, children?: React.ReactNode, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col">
      <div 
        className="flex items-center justify-between py-3 cursor-pointer group"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-3">
           {icon && React.cloneElement(icon as React.ReactElement, {
             className: `${(icon as React.ReactElement).props.className} group-hover:text-crex-blue transition-colors`
           })}
           <span className="text-crex-text font-medium group-hover:text-crex-blue transition-colors">{title}</span>
        </div>
        <div className="flex items-center space-x-2">
           {value && !isOpen && <span className="text-xs text-crex-grey font-medium truncate max-w-[120px]">{value}</span>}
           <ChevronDown className={`w-5 h-5 text-crex-grey transition-transform duration-200 ${isOpen ? 'rotate-180' : 'group-hover:-translate-y-0.5'}`} />
        </div>
      </div>
      
      {/* Expanded Content */}
      {isOpen && children && (
        <div className="animate-in slide-in-from-top-2 fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  );
};

export default ProfileCard;
