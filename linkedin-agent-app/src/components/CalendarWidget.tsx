import React from 'react';

export const CalendarWidget = ({ calendar, onView }: { calendar: any[], onView?: (post: any) => void }) => {
  // Sort calendar by date to ensure proper ordering
  const sortedCalendar = [...calendar].sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
  
  return (
    <div className="solid-card p-6 flex flex-col h-full relative">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 px-4">
        <span className="text-sm font-medium text-crex-grey">AI Content</span>
        <span className="text-base font-semibold text-crex-text">Weekly Schedule</span>
        <span className="text-sm font-medium text-crex-grey px-4 py-1.5 rounded-full border border-gray-100 shadow-sm">{calendar.length > 0 ? 'Active' : 'Idle'}</span>
      </div>

      {/* Scrollable Container for Mobile */}
      <div className="overflow-x-auto custom-scrollbar pb-2">
        <div className="min-w-[700px]">
          {/* Days header */}
      <div className="grid grid-cols-7 gap-2 mb-4 pl-12">
        {sortedCalendar.length > 0 
          ? sortedCalendar.slice(0, 7).map((post, i) => (
              <div key={i} className="text-center flex flex-col">
                <span className="text-[10px] font-medium text-crex-grey">
                  {new Date(post.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                </span>
              </div>
            ))
          : [1, 2, 3, 4, 5, 6, 7].map((day) => (
              <div key={day} className="text-center flex flex-col">
                <span className="text-[10px] font-medium text-crex-grey">Day {day}</span>
              </div>
            ))
        }
      </div>

      {/* Timeline grid */}
      <div className="relative flex-1 min-h-[160px]">
        {/* Horizontal lines */}
        <div className="absolute inset-0 flex flex-col justify-between pt-2">
          {['Morning', 'Noon', 'Evening'].map((time, i) => (
            <div key={i} className="relative w-full h-[60px] border-t border-gray-100 flex items-start">
              <span className="absolute -left-2 -top-2.5 bg-white pr-2 text-[10px] text-crex-grey font-medium z-10">{time}</span>
            </div>
          ))}
        </div>

        {/* Vertical lines */}
        <div className="absolute top-0 bottom-0 left-12 right-0 grid grid-cols-7 gap-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="border-l border-gray-50 border-dashed h-full ml-4"></div>
          ))}
        </div>

        {/* Events */}
        {sortedCalendar.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center z-20">
             <span className="text-sm text-crex-grey bg-white/80 px-4 py-2 rounded-full">No scheduled posts</span>
          </div>
        ) : (
          sortedCalendar.map((post, idx) => {
             // Calculate column width dynamically based on the 7-column grid
             // left offset = 12 (margin for time labels) + (idx % 7) * column width
             const isBlue = idx % 2 !== 0;
             // Stagger the vertical position slightly so it looks like it's placed at different times
             const topOffsets = [15, 65, 115, 30, 80, 20, 70]; 
             const topPx = topOffsets[idx % topOffsets.length];

             return (
               <div 
                 key={idx} 
                 onClick={() => onView && onView(post)}
                 className={`absolute w-[12%] shadow-sm rounded-xl p-2 z-20 flex flex-col overflow-hidden border cursor-pointer hover:scale-105 transition-transform ${isBlue ? 'bg-crex-blue border-transparent shadow-crex-blue/20 text-white' : 'bg-white border-gray-100 text-crex-text'}`}
                 style={{ left: `calc(48px + ${(idx % 7) * (100 / 7)}%)`, top: `${topPx}px` }}
                 title={post.topic}
               >
                 <span className={`text-[9px] font-bold truncate ${isBlue ? 'text-white' : 'text-crex-text'}`}>{post.scheduled_date}</span>
                 <span className={`text-[8px] truncate mt-1 ${isBlue ? 'text-white/80' : 'text-crex-grey'}`}>{post.topic}</span>
               </div>
             )
          })
        )}

      </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarWidget;
