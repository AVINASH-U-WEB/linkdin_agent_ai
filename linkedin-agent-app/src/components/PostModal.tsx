import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Calendar, Edit3, Check, Sparkles, Image as ImageIcon } from 'lucide-react';

interface PostModalProps {
  post: any;
  onClose: () => void;
  onPublish: (date: string, editedDraft?: string, imageFile?: File) => void;
}

const PostModal = ({ post, onClose, onPublish }: PostModalProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = async () => {
    try {
      setIsAnalyzing(true);
      const res = await fetch("http://localhost:8000/api/posts/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_text: editedDraft })
      });
      if (res.ok) {
        const data = await res.json();
        setAiFeedback(data.feedback);
      } else {
        setAiFeedback("Failed to get analysis. Ensure the backend is running.");
      }
    } catch (err) {
      setAiFeedback("Connection error. Is the FastAPI backend running on port 8000?");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset state when post changes
  useEffect(() => {
    if (post) {
      setEditedDraft(post.draft);
      setIsEditing(false);
      setAiFeedback(null);
    }
  }, [post]);

  if (!post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      {/* Modal Container */}
      <div 
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-gray-100 bg-gray-50/50">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="bg-crex-blue/10 text-crex-blue px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                Score: {post.score}
              </span>
              <span className="flex items-center text-[10px] font-medium text-crex-grey">
                <Calendar className="w-3 h-3 mr-1" />
                Scheduled for {post.scheduled_date}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-crex-text leading-tight pr-8">
              {post.topic}
            </h2>
          </div>
          <div className="flex items-center space-x-2 absolute top-4 right-4">
            <button 
              onClick={() => setIsEditing(!isEditing)}
              className={`p-2 rounded-full transition-colors flex items-center justify-center ${isEditing ? 'bg-crex-blue/10 text-crex-blue' : 'hover:bg-gray-200 text-crex-grey'}`}
              title={isEditing ? "Finish Editing" : "Edit Draft"}
            >
              {isEditing ? <Check className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-200 text-crex-grey transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white flex flex-col gap-6">
          {aiFeedback && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 animate-in slide-in-from-top-4 relative">
              <button 
                onClick={() => setAiFeedback(null)} 
                className="absolute top-3 right-3 text-indigo-400 hover:text-indigo-600"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-sm font-bold text-indigo-800 flex items-center mb-3">
                <Sparkles className="w-4 h-4 mr-2" /> AI Mentor Feedback
              </h3>
              <div className="prose prose-sm prose-indigo max-w-none text-indigo-900 whitespace-pre-wrap">
                {aiFeedback}
              </div>
            </div>
          )}

          {isEditing ? (
            <textarea
              className="w-full h-full min-h-[300px] p-4 border border-crex-blue/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-crex-blue/50 text-sm text-crex-text font-[family-name:var(--font-geist-sans)] resize-none bg-blue-50/20"
              value={editedDraft}
              onChange={(e) => setEditedDraft(e.target.value)}
              placeholder="Edit your LinkedIn draft here..."
            />
          ) : (
            <div className="prose prose-sm max-w-none text-crex-text whitespace-pre-wrap font-[family-name:var(--font-geist-sans)]">
              {editedDraft}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button 
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="flex items-center px-4 py-2.5 rounded-xl text-sm font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? (
                <span className="animate-pulse flex items-center"><Sparkles className="w-4 h-4 mr-2" /> Analyzing...</span>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> AI Mentor</>
              )}
            </button>
            
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedImage(e.target.files[0]);
                }
              }} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${selectedImage ? 'text-green-600 bg-green-50 border-green-200' : 'text-gray-600 bg-white border-gray-200 hover:bg-gray-50'}`}
              title={selectedImage ? selectedImage.name : "Attach Image"}
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              {selectedImage ? 'Image Added' : 'Attach Image'}
            </button>
            {selectedImage && (
              <button onClick={() => setSelectedImage(null)} className="text-gray-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex space-x-3">
            <button 
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-crex-grey hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
            <button 
              onClick={() => {
                const textToPublish = editedDraft !== post.draft ? editedDraft : undefined;
                onPublish(post.scheduled_date, textToPublish, selectedImage || undefined);
                onClose();
              }}
              className="flex items-center px-6 py-2.5 bg-crex-blue text-white rounded-xl text-sm font-medium shadow-md hover:bg-crex-blue-light transition-colors"
            >
              <Play className="w-4 h-4 mr-2" />
              Publish Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostModal;
