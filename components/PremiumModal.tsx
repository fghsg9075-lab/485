import React, { useState, useEffect } from 'react';
import { Chapter, ContentType, User, Subject, Board, ClassLevel, Stream, SystemSettings } from '../types';
import { Crown, BookOpen, Lock, X, HelpCircle, FileText, Video, PlayCircle, ArrowLeft, Loader2, Sparkles, CheckCircle, Zap } from 'lucide-react';
import { getChapterData } from '../firebase';

interface Props {
  chapter: Chapter;
  user: User;
  credits: number;
  isAdmin: boolean;
  onSelect: (type: ContentType, count?: number, forcePay?: boolean, specificContent?: any) => void;
  onClose: () => void;
  settings?: SystemSettings;
  board: Board;
  classLevel: ClassLevel;
  stream: Stream | null;
  subject: Subject;
}

export const PremiumModal: React.FC<Props> = ({ chapter, user, credits, isAdmin, onSelect, onClose, settings, board, classLevel, stream, subject }) => {
  const [view, setView] = useState<'HOME' | 'NOTES_FREE' | 'NOTES_PREMIUM' | 'VIDEO_FREE' | 'VIDEO_PREMIUM'>('HOME');
  const [loading, setLoading] = useState(true);
  const [contentData, setContentData] = useState<any>(null);

  useEffect(() => {
      const streamKey = (classLevel === '11' || classLevel === '12') && stream ? `-${stream}` : '';
      const key = `nst_content_${board}_${classLevel}${streamKey}_${subject.name}_${chapter.id}`;
      
      getChapterData(key).then(data => {
          setContentData(data || {});
          setLoading(false);
      });
  }, [chapter.id]);

  const canAccess = (cost: number) => {
      if (isAdmin) return true;
      if (user.isPremium && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date()) return true;
      return credits >= cost;
  };

  const filterContent = (list: any[], isPremium: boolean) => (list || []).filter((i: any) => !!i.isPremium === isPremium);

  const renderHome = () => (
      <div className="grid grid-cols-2 gap-3 p-4">
          <button onClick={() => setView('NOTES_FREE')} className="bg-green-50 p-4 rounded-xl border border-green-100 flex flex-col items-center gap-2 hover:bg-green-100">
              <FileText size={24} className="text-green-600" />
              <span className="text-xs font-bold text-green-800">Free Notes</span>
          </button>
          <button onClick={() => setView('NOTES_PREMIUM')} className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 flex flex-col items-center gap-2 hover:bg-yellow-100">
              <Crown size={24} className="text-yellow-600" />
              <span className="text-xs font-bold text-yellow-800">Premium Notes</span>
          </button>

          <button onClick={() => setView('VIDEO_FREE')} className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col items-center gap-2 hover:bg-blue-100">
              <Video size={24} className="text-blue-600" />
              <span className="text-xs font-bold text-blue-800">Free Videos</span>
          </button>
          <button onClick={() => setView('VIDEO_PREMIUM')} className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex flex-col items-center gap-2 hover:bg-purple-100">
              <PlayCircle size={24} className="text-purple-600" />
              <span className="text-xs font-bold text-purple-800">Premium Videos</span>
          </button>

          <button onClick={() => onSelect('PDF_ULTRA')} className="bg-slate-900 text-white p-4 rounded-xl border border-slate-700 flex flex-col items-center gap-2 hover:bg-slate-800">
              <Sparkles size={24} className="text-yellow-400" />
              <span className="text-xs font-bold">Ultra Content</span>
          </button>
          <button onClick={() => onSelect('MCQ_ANALYSIS')} className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col items-center gap-2 hover:bg-indigo-100">
              <CheckCircle size={24} className="text-indigo-600" />
              <span className="text-xs font-bold text-indigo-800">MCQ Test</span>
          </button>
      </div>
  );

  const renderList = (items: any[], type: 'NOTES' | 'VIDEO', isPremium: boolean) => (
      <div className="p-4 space-y-3">
          {items.length === 0 && <p className="text-center text-slate-400 text-sm">No content available.</p>}
          {items.map((item, idx) => (
              <button
                  key={idx}
                  onClick={() => onSelect(type === 'NOTES' ? (isPremium ? 'NOTES_PREMIUM' : 'NOTES_HTML_FREE') : 'VIDEO_LECTURE', undefined, undefined, item)}
                  className="w-full bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between hover:bg-slate-50"
              >
                  <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isPremium ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'}`}>
                          {type === 'NOTES' ? <FileText size={16} /> : <PlayCircle size={16} />}
                      </div>
                      <span className="text-sm font-bold text-slate-700 truncate max-w-[180px]">{item.title || item.topic}</span>
                  </div>
                  {isPremium && !canAccess(5) ? <Lock size={16} className="text-slate-300" /> : <div className="bg-slate-100 p-1 rounded-full"><ArrowLeft size={16} className="rotate-180 text-slate-400" /></div>}
              </button>
          ))}
      </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden relative max-h-[80vh] flex flex-col">
            
            {/* Header */}
            <div className="bg-white p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {view !== 'HOME' && <button onClick={() => setView('HOME')}><ArrowLeft size={20} className="text-slate-600" /></button>}
                    <h3 className="font-black text-slate-800 truncate max-w-[200px]">{chapter.title}</h3>
                </div>
                <button onClick={onClose} className="bg-slate-100 p-1.5 rounded-full"><X size={20} className="text-slate-500" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="animate-spin text-slate-400" />
                    </div>
                ) : (
                    <>
                        {view === 'HOME' && renderHome()}
                        {view === 'NOTES_FREE' && renderList(filterContent(contentData?.topicNotes, false), 'NOTES', false)}
                        {view === 'NOTES_PREMIUM' && renderList(filterContent(contentData?.topicNotes, true), 'NOTES', true)}
                        {view === 'VIDEO_FREE' && renderList(filterContent(contentData?.topicVideos, false), 'VIDEO', false)}
                        {view === 'VIDEO_PREMIUM' && renderList(filterContent(contentData?.topicVideos, true), 'VIDEO', true)}
                    </>
                )}
            </div>
        </div>
    </div>
  );
};
