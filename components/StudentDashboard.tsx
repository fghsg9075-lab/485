
import React, { useState, useEffect } from 'react';
import { User, Subject, StudentTab, SystemSettings, CreditPackage, WeeklyTest, Chapter, MCQItem, Challenge20 } from '../types';
import { updateUserStatus, db, saveUserToLive, getChapterData, rtdb, saveAiInteraction, saveDemandRequest } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, query, limitToLast, onValue } from 'firebase/database';
import { getSubjectsList, DEFAULT_APP_FEATURES, ALL_APP_FEATURES } from '../constants';
import { getActiveChallenges } from '../services/questionBank';
import { generateDailyChallengeQuestions } from '../utils/challengeGenerator';
import { generateMorningInsight } from '../services/morningInsight';
import { RedeemSection } from './RedeemSection';
import { PrizeList } from './PrizeList';
import { Store } from './Store';
import { Layout, Gift, Sparkles, Megaphone, Lock, BookOpen, AlertCircle, Edit, Settings, Play, Pause, RotateCcw, MessageCircle, Gamepad2, Timer, CreditCard, Send, CheckCircle, Mail, X, Ban, Smartphone, Trophy, ShoppingBag, ArrowRight, Video, Youtube, Home, User as UserIcon, Book, BookOpenText, List, BarChart3, Award, Bell, Headphones, LifeBuoy, WifiOff, Zap, Star, Crown, History, ListChecks, Rocket, Ticket, TrendingUp, BrainCircuit, FileText, CheckSquare, Menu, LayoutGrid, Compass, User as UserIconOutline, MessageSquare, Bot, HelpCircle } from 'lucide-react';
import { SubjectSelection } from './SubjectSelection';
import { BannerCarousel } from './BannerCarousel';
import { ChapterSelection } from './ChapterSelection'; // Imported for Video Flow
import { VideoPlaylistView } from './VideoPlaylistView'; // Imported for Video Flow
import { AudioPlaylistView } from './AudioPlaylistView'; // Imported for Audio Flow
import { PdfView } from './PdfView'; // Imported for PDF Flow
import { McqView } from './McqView'; // Imported for MCQ Flow
import { MiniPlayer } from './MiniPlayer'; // Imported for Audio Flow
import { HistoryPage } from './HistoryPage';
import { Leaderboard } from './Leaderboard';
import { SpinWheel } from './SpinWheel';
import { fetchChapters, generateCustomNotes } from '../services/groq'; // Needed for Video Flow
import { LoadingOverlay } from './LoadingOverlay';
import { CreditConfirmationModal } from './CreditConfirmationModal';
import { UserGuide } from './UserGuide';
import { CustomAlert } from './CustomDialogs';
import { AnalyticsPage } from './AnalyticsPage';
import { LiveResultsFeed } from './LiveResultsFeed';
// import { ChatHub } from './ChatHub';
import { UniversalInfoPage } from './UniversalInfoPage';
import { UniversalChat } from './UniversalChat';
import { AiHistoryPage } from './AiHistoryPage';
import { ExpiryPopup } from './ExpiryPopup';
import { SubscriptionHistory } from './SubscriptionHistory';
import { MonthlyMarksheet } from './MonthlyMarksheet';
import { SearchResult } from '../utils/syllabusSearch';
import { AiDeepAnalysis } from './AiDeepAnalysis';
import { RevisionHub } from './RevisionHub'; // NEW
import { McqReviewHub } from './McqReviewHub'; // NEW
import { CustomBloggerPage } from './CustomBloggerPage';
import { ReferralPopup } from './ReferralPopup';
import { StudentAiAssistant } from './StudentAiAssistant';
import { SpeakButton } from './SpeakButton';
import { PerformanceGraph } from './PerformanceGraph';
import { StudentSidebar } from './StudentSidebar';
import { StudyGoalTimer } from './StudyGoalTimer';
import { ExplorePage } from './ExplorePage';

interface Props {
  user: User;
  dailyStudySeconds: number; // Received from Global App
  onSubjectSelect: (subject: Subject) => void;
  onRedeemSuccess: (user: User) => void;
  settings?: SystemSettings; // New prop
  onStartWeeklyTest?: (test: WeeklyTest) => void;
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  setFullScreen: (full: boolean) => void; // Passed from App
  onNavigate?: (view: 'ADMIN_DASHBOARD') => void; // Added for Admin Switch
  isImpersonating?: boolean;
  onNavigateToChapter?: (chapterId: string, chapterTitle: string, subjectName: string, classLevel?: string) => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: (v: boolean) => void;
}

const DashboardSectionWrapper = ({
    id,
    children,
    label,
    settings,
    isLayoutEditing,
    onToggleVisibility
}: {
    id: string,
    children: React.ReactNode,
    label: string,
    settings?: SystemSettings,
    isLayoutEditing: boolean,
    onToggleVisibility: (id: string) => void
}) => {
    const isVisible = settings?.dashboardLayout?.[id]?.visible !== false;

    if (!isVisible && !isLayoutEditing) return null;

    return (
        <div className={`relative ${isLayoutEditing ? 'border-2 border-dashed border-yellow-400 p-2 rounded-xl mb-4 bg-yellow-50/10' : ''}`}>
            {isLayoutEditing && (
                <div className="absolute -top-3 left-2 bg-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded shadow z-50 flex items-center gap-2">
                    <span>{label}</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleVisibility(id); }}
                        className={`px-2 py-0.5 rounded text-xs ${isVisible ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
                    >
                        {isVisible ? 'ON' : 'OFF'}
                    </button>
                </div>
            )}
            <div className={!isVisible ? 'opacity-50 grayscale pointer-events-none' : ''}>
                {children}
            </div>
        </div>
    );
};

export const StudentDashboard: React.FC<Props> = ({ user, dailyStudySeconds, onSubjectSelect, onRedeemSuccess, settings, onStartWeeklyTest, activeTab, onTabChange, setFullScreen, onNavigate, isImpersonating, onNavigateToChapter, isDarkMode, onToggleDarkMode }) => {
  
  const hasPermission = (featureId: string) => {
      if (!settings?.tierPermissions) return true;
      let userTier: 'FREE' | 'BASIC' | 'ULTRA' = 'FREE';
      if (user.isPremium) {
          if (user.subscriptionLevel === 'ULTRA') userTier = 'ULTRA';
          else if (user.subscriptionLevel === 'BASIC') userTier = 'BASIC';
      }
      if (user.subscriptionTier === 'LIFETIME' || user.subscriptionTier === 'YEARLY') {
           if (!user.subscriptionLevel) userTier = 'ULTRA';
      }
      const allowedFeatures = settings.tierPermissions[userTier] || [];
      return allowedFeatures.includes(featureId);
  };

  // CUSTOM ALERT STATE (Moved up to be available for early hooks)
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean, type: 'SUCCESS'|'ERROR'|'INFO', title?: string, message: string}>({isOpen: false, type: 'INFO', message: ''});
  const showAlert = (msg: string, type: 'SUCCESS'|'ERROR'|'INFO' = 'INFO', title?: string) => {
      setAlertConfig({ isOpen: true, type, title, message: msg });
  };

  // NEW NOTIFICATION LOGIC
  const [hasNewUpdate, setHasNewUpdate] = useState(false);
  useEffect(() => {
      const q = query(ref(rtdb, 'universal_updates'), limitToLast(1));
      const unsub = onValue(q, snap => {
          const data = snap.val();
          if (data) {
              const latest = Object.values(data)[0] as any;
              const lastRead = localStorage.getItem('nst_last_read_update') || '0';
              if (new Date(latest.timestamp).getTime() > Number(lastRead)) {
                  setHasNewUpdate(true);
                      // IMMEDIATE ALERT FOR NEW UPDATE (FIX: Show once per update ID)
                      const alertKey = `nst_update_alert_shown_${latest.id}`;
                      if (!localStorage.getItem(alertKey)) {
                          showAlert(`New Content Available: ${latest.text}`, 'INFO', 'New Update');
                          localStorage.setItem(alertKey, 'true');
                      }
              } else {
                  setHasNewUpdate(false);
              }
          }
      });
      return () => unsub();
  }, []);

  // const [activeTab, setActiveTab] = useState<StudentTab>('VIDEO'); // REMOVED LOCAL STATE
  const [testAttempts, setTestAttempts] = useState<Record<string, any>>(JSON.parse(localStorage.getItem(`nst_test_attempts_${user.id}`) || '{}'));
  const globalMessage = localStorage.getItem('nst_global_message');
  const [activeExternalApp, setActiveExternalApp] = useState<string | null>(null);
  const [pendingApp, setPendingApp] = useState<{app: any, cost: number} | null>(null);
  // GENERIC CONTENT FLOW STATE (Used for Video, PDF, MCQ)
  const [contentViewStep, setContentViewStep] = useState<'SUBJECTS' | 'CHAPTERS' | 'PLAYER'>('SUBJECTS');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [syllabusMode, setSyllabusMode] = useState<'SCHOOL' | 'COMPETITION'>('SCHOOL');
  const [currentAudioTrack, setCurrentAudioTrack] = useState<{url: string, title: string} | null>(null);
  const [universalNotes, setUniversalNotes] = useState<any[]>([]);
  const [topicFilter, setTopicFilter] = useState<string | undefined>(undefined); // NEW: Topic Filter

  useEffect(() => {
      getChapterData('nst_universal_notes').then(data => {
          if (data && data.notesPlaylist) setUniversalNotes(data.notesPlaylist);
      });
  }, []);
  
  // LOADING STATE FOR 10S RULE
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [profileData, setProfileData] = useState({
      classLevel: user.classLevel || '10',
      board: user.board || 'CBSE',
      stream: user.stream || 'Science',
      newPassword: '',
      dailyGoalHours: 3 // Default
  });

  const [canClaimReward, setCanClaimReward] = useState(false);
  const [selectedPhoneId, setSelectedPhoneId] = useState<string>('');
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showNameChangeModal, setShowNameChangeModal] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  
  // REPLACED CHAT WITH SUPPORT MODAL
  const [showSupportModal, setShowSupportModal] = useState(false); // Keep for legacy/direct email if needed
  const [showChat, setShowChat] = useState(false); // New Universal Chat
  
  // ADMIN LAYOUT EDITING STATE
  const [isLayoutEditing, setIsLayoutEditing] = useState(false);
  
  // Expiry Logic
  const [showExpiryPopup, setShowExpiryPopup] = useState(false);
  
  // Monthly Report
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [marksheetType, setMarksheetType] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [showReferralPopup, setShowReferralPopup] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- HEADER CONTROL ---
  useEffect(() => {
    // Force Full Screen for Home/Explore/Profile to use Custom Header
    if (activeTab === 'HOME' || activeTab === 'EXPLORE' || activeTab === 'PROFILE' || activeTab === 'AI_STUDIO' || activeTab === 'REVISION') {
        setFullScreen(true);
    } else {
        // For other tabs (content), let the content decide or default to normal
        if (activeTab !== 'VIDEO' && activeTab !== 'PDF' && activeTab !== 'MCQ' && activeTab !== 'AUDIO') {
             setFullScreen(false);
        }
    }
  }, [activeTab]);

  // --- REFERRAL POPUP CHECK ---
  useEffect(() => {
      const isNew = (Date.now() - new Date(user.createdAt).getTime()) < 10 * 60 * 1000; // 10 mins window
      if (isNew && !user.redeemedReferralCode && !localStorage.getItem(`referral_shown_${user.id}`)) {
          setShowReferralPopup(true);
          localStorage.setItem(`referral_shown_${user.id}`, 'true');
      }
  }, [user.id, user.createdAt, user.redeemedReferralCode]);

  const handleSupportEmail = () => {
    const email = "nadim841442@gmail.com";
    const subject = encodeURIComponent(`Support Request: ${user.name} (ID: ${user.id})`);
    const body = encodeURIComponent(`Student Details:\nName: ${user.name}\nUID: ${user.id}\nEmail: ${user.email}\n\nIssue Description:\n`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };
  
  // Request Content Modal State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestData, setRequestData] = useState({ subject: '', topic: '', type: 'PDF' });

  // AI Modal State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  // Custom Daily Target Logic
  const [dailyTargetSeconds, setDailyTargetSeconds] = useState(3 * 3600);
  const REWARD_AMOUNT = settings?.dailyReward || 3;
  
  // Phone setup
  const adminPhones = settings?.adminPhones || [{id: 'default', number: '8227070298', name: 'Admin'}];
  const defaultPhoneId = adminPhones.find(p => p.isDefault)?.id || adminPhones[0]?.id || 'default';
  
  if (!selectedPhoneId && adminPhones.length > 0) {
    setSelectedPhoneId(defaultPhoneId);
  }

  // --- SELF-REPAIR SYNC (Fix for "New User Not Showing") ---
  // REMOVED: This was causing data overwrite and potential infinite loops.
  // We should rely on Auth/Login to save initial state, and onSnapshot for updates.
  // useEffect(() => {
  //     if (user && user.id) {
  //         saveUserToLive(user);
  //     }
  // }, [user.id]);

  // --- DISCOUNT TIMER STATE ---
  const [discountTimer, setDiscountTimer] = useState<string | null>(null);
  const [discountStatus, setDiscountStatus] = useState<'WAITING' | 'ACTIVE' | 'NONE'>('NONE');
  const [showDiscountBanner, setShowDiscountBanner] = useState(false);
  const [morningBanner, setMorningBanner] = useState<any>(null); // NEW: Morning Banner

  // --- MORNING INSIGHT LOADER & AUTO-GENERATOR ---
  useEffect(() => {
      const loadMorningInsight = async () => {
          const now = new Date();
          // Check if time is past 10 AM (Hour 10)
          if (now.getHours() >= 10) {
              const today = now.toDateString();
              const savedBanner = localStorage.getItem('nst_morning_banner');
              
              if (savedBanner) {
                  const parsed = JSON.parse(savedBanner);
                  if (parsed.date === today) {
                      setMorningBanner(parsed);
                      return;
                  }
              }

              // IF MISSING: Auto-Generate (Client-side automation)
              // We allow any user to trigger this to ensure it happens
              // Logic: Fetch logs -> Generate -> Save -> Display
              // We check a 'generating' flag to prevent double hits
              const isGen = localStorage.getItem(`nst_insight_gen_${today}`);
              if (!isGen) {
                  localStorage.setItem(`nst_insight_gen_${today}`, 'true'); // Lock
                  try {
                      console.log("Generating Morning Insight...");
                      // Mock Logs if Universal Logs unavailable locally
                      const logs = JSON.parse(localStorage.getItem('nst_universal_analysis_logs') || '[]');
                      
                      if (logs.length === 0) {
                          // Skip generation if no data
                          console.log("No logs for insight.");
                          return;
                      }

                      await generateMorningInsight(
                          logs, 
                          settings, 
                          (banner) => {
                              localStorage.setItem('nst_morning_banner', JSON.stringify(banner));
                              setMorningBanner(banner);
                              // Sync to Firebase if Admin
                              if (user.role === 'ADMIN') {
                                  // Implementation details for firebase sync omitted for safety
                              }
                          }
                      );
                  } catch (e) {
                      console.error("Insight Gen Failed", e);
                      localStorage.removeItem(`nst_insight_gen_${today}`); // Unlock
                  }
              }
          }
      };
      loadMorningInsight();
  }, [user.role, settings]);

  useEffect(() => {
     const evt = settings?.specialDiscountEvent;
     
     const formatDiff = (diff: number) => {
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);
        
        const parts = [];
        if(d > 0) parts.push(`${d}d`);
        parts.push(`${h.toString().padStart(2, '0')}h`);
        parts.push(`${m.toString().padStart(2, '0')}m`);
        parts.push(`${s.toString().padStart(2, '0')}s`);
        return parts.join(' ');
     };

     const checkStatus = () => {
         if (!evt?.enabled) {
             setShowDiscountBanner(false);
             setDiscountStatus('NONE');
             setDiscountTimer(null);
             return;
         }

         const now = Date.now();
         const startsAt = evt.startsAt ? new Date(evt.startsAt).getTime() : now;
         const endsAt = evt.endsAt ? new Date(evt.endsAt).getTime() : now;
         
         if (now < startsAt) {
             // WAITING (Cooldown)
             setDiscountStatus('WAITING');
             setShowDiscountBanner(true);
             const diff = startsAt - now;
             setDiscountTimer(formatDiff(diff));
         } else if (now < endsAt) {
             // ACTIVE
             setDiscountStatus('ACTIVE');
             setShowDiscountBanner(true);
             const diff = endsAt - now;
             setDiscountTimer(formatDiff(diff));
         } else {
             // EXPIRED
             setDiscountStatus('NONE');
             setShowDiscountBanner(false);
             setDiscountTimer(null);
         }
     };

     // Initial Check (Immediate)
     checkStatus();

     // Interval Check
     if (evt?.enabled) {
         const interval = setInterval(checkStatus, 1000);
         return () => clearInterval(interval);
     } else {
         // Reset if disabled
         setShowDiscountBanner(false);
         setDiscountStatus('NONE');
     }
  }, [settings?.specialDiscountEvent]);

  // --- HERO SLIDER STATE ---
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = [
      { id: 1, title: "Ultra Subscription", subtitle: "Unlock Everything: Videos, PDFs & Tests", icon: <Crown className="text-yellow-400" size={40} />, btnText: "Get Access" },
      { id: 3, title: "Smart Notes & PDFs", subtitle: "High Quality Digital Material", icon: <FileText className="text-white" size={40} />, btnText: "Read Notes" },
      { id: 4, title: "MCQ & Tests", subtitle: "Compete & View Ranks", icon: <Trophy className="text-yellow-400" size={40} />, btnText: "Start Test" },
    ];

  const handleAiNotesGeneration = async () => {
      if (!aiTopic.trim()) {
          showAlert("Please enter a topic!", "ERROR");
          return;
      }

      // Check Limits
      const today = new Date().toDateString();
      const usageKey = `nst_ai_usage_${user.id}_${today}`;
      const currentUsage = parseInt(localStorage.getItem(usageKey) || '0');
      
      let limit = settings?.aiLimits?.free || 0; // Default Free Limit
      if (user.subscriptionLevel === 'BASIC' && user.isPremium) limit = settings?.aiLimits?.basic || 0;
      if (user.subscriptionLevel === 'ULTRA' && user.isPremium) limit = settings?.aiLimits?.ultra || 0;

      if (currentUsage >= limit) {
          showAlert(`Daily Limit Reached! You have used ${currentUsage}/${limit} AI generations today.`, "ERROR", "Limit Exceeded");
          return;
      }

      setAiGenerating(true);
      try {
          const notes = await generateCustomNotes(aiTopic, settings?.aiNotesPrompt || '', settings?.aiModel);
          setAiResult(notes);
          
          // Increment Usage
          localStorage.setItem(usageKey, (currentUsage + 1).toString());

          // SAVE TO HISTORY
          saveAiInteraction({
              id: `ai-note-${Date.now()}`,
              userId: user.id,
              userName: user.name,
              type: 'AI_NOTES',
              query: aiTopic,
              response: notes,
              timestamp: new Date().toISOString()
          });

          showAlert("Notes Generated Successfully!", "SUCCESS");
      } catch (e) {
          console.error(e);
          showAlert("Failed to generate notes. Please try again.", "ERROR");
      } finally {
          setAiGenerating(false);
      }
  };

  useEffect(() => {
      const timer = setInterval(() => {
          setCurrentSlide((prev) => (prev + 1) % slides.length);
      }, 5000); // 5s Interval as requested
      return () => clearInterval(timer);
  }, []);

  // --- ADMIN SWITCH HANDLER ---
  const handleSwitchToAdmin = () => {
    if (onNavigate) {
       onNavigate('ADMIN_DASHBOARD');
    }
  };

  const toggleLayoutVisibility = (sectionId: string) => {
      if (!settings) return;
      const currentLayout = settings.dashboardLayout || {};
      const currentConfig = currentLayout[sectionId] || { id: sectionId, visible: true };
      
      const newLayout = {
          ...currentLayout,
          [sectionId]: { ...currentConfig, visible: !currentConfig.visible }
      };
      
      // Save locally and trigger update (assuming parent handles persistence via settings prop updates or we need a way to save)
      // Since settings is a prop, we can't mutate it directly. We need to save to localStorage 'nst_system_settings' and trigger reload or use a callback if available.
      // But StudentDashboard props doesn't have onUpdateSettings. 
      // We will write to localStorage directly as a quick fix for Admin convenience, ensuring AdminDashboard picks it up or we reload.
      const newSettings = { ...settings, dashboardLayout: newLayout };
      localStorage.setItem('nst_system_settings', JSON.stringify(newSettings));
      
      // Also update Firebase if connected (best effort)
      saveUserToLive(user); // This saves USER, not settings. 
      // We need to use saveSystemSettings from firebase.ts but it's not imported.
      // Let's just rely on LocalStorage for immediate effect and force a reload or assume AdminDashboard syncs it.
      // Actually, we can just force a reload to see changes if we can't update props.
      window.location.reload(); 
  };
  
  const getPhoneNumber = (phoneId?: string) => {
    const phone = adminPhones.find(p => p.id === (phoneId || selectedPhoneId));
    return phone ? phone.number : '8227070298';
  };

  // --- STRICT COMPETITION MODE SUBSCRIPTION CHECK ---
  useEffect(() => {
      const checkCompetitionAccess = () => {
          if (syllabusMode === 'COMPETITION') {
              const now = new Date();
              const isSubscribed = user.isPremium && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > now;
              // Competition Mode requires ULTRA subscription
              const hasAccess = isSubscribed && (user.subscriptionLevel === 'ULTRA' || user.subscriptionTier === 'YEARLY' || user.subscriptionTier === 'LIFETIME');
              
              if (!hasAccess) {
                  setSyllabusMode('SCHOOL');
                  document.documentElement.style.setProperty('--primary', settings?.themeColor || '#3b82f6');
                  showAlert("⚠️ Competition Mode is locked! Please upgrade to an Ultra subscription to access competition content.", 'ERROR', 'Locked Feature');
              }
          }
      };

      checkCompetitionAccess();
      
      // Auto-lock if subscription expires while using the app
      const interval = setInterval(checkCompetitionAccess, 60000); // Check every minute
      return () => clearInterval(interval);
  }, [syllabusMode, user.isPremium, user.subscriptionEndDate, user.subscriptionTier, user.subscriptionLevel, settings?.themeColor]);

  useEffect(() => {
      // Load user's custom goal
      const storedGoal = localStorage.getItem(`nst_goal_${user.id}`);
      if (storedGoal) {
          const hours = parseInt(storedGoal);
          setDailyTargetSeconds(hours * 3600);
          setProfileData(prev => ({...prev, dailyGoalHours: hours}));
      }
  }, [user.id]);

  // ... (Existing Reward Logic - Keep as is) ...
  // --- CHECK YESTERDAY'S REWARD ON LOAD ---
  useEffect(() => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yDateStr = yesterday.toDateString();
      
      const yActivity = parseInt(localStorage.getItem(`activity_${user.id}_${yDateStr}`) || '0');
      const yClaimed = localStorage.getItem(`reward_claimed_${user.id}_${yDateStr}`);
      
      if (!yClaimed && (!user.subscriptionTier || user.subscriptionTier === 'FREE')) {
          let reward = null;
          if (yActivity >= 10800) reward = { tier: 'MONTHLY', level: 'ULTRA', hours: 4 }; // 3 Hrs -> Ultra
          else if (yActivity >= 3600) reward = { tier: 'WEEKLY', level: 'BASIC', hours: 4 }; // 1 Hr -> Basic

          if (reward) {
              const expiresAt = new Date(new Date().setHours(new Date().getHours() + 24)).toISOString();
              const newMsg: any = {
                  id: `reward-${Date.now()}`,
                  text: `🎁 Daily Reward! You studied enough yesterday. Claim your ${reward.hours} hours of ${reward.level} access now!`,
                  date: new Date().toISOString(),
                  read: false,
                  type: 'REWARD',
                  reward: { tier: reward.tier as any, level: reward.level as any, durationHours: reward.hours },
                  expiresAt: expiresAt,
                  isClaimed: false
              };
              
              const updatedUser = { 
                  ...user, 
                  inbox: [newMsg, ...(user.inbox || [])] 
              };
              
              handleUserUpdate(updatedUser);
              localStorage.setItem(`reward_claimed_${user.id}_${yDateStr}`, 'true');
          }
      }
  }, [user.id]);

  const claimRewardMessage = (msgId: string, reward: any, gift?: any) => {
      const updatedInbox = user.inbox?.map(m => m.id === msgId ? { ...m, isClaimed: true, read: true } : m);
      let updatedUser: User = { ...user, inbox: updatedInbox };
      let successMsg = '';

      if (gift) {
          // HANDLE ADMIN GIFT
          if (gift.type === 'CREDITS') {
              updatedUser.credits = (user.credits || 0) + Number(gift.value);
              successMsg = `🎁 Gift Claimed! Added ${gift.value} Credits.`;
          } else if (gift.type === 'SUBSCRIPTION') {
              const [tier, level] = (gift.value as string).split('_');
              const duration = gift.durationHours || 24;
              
              const now = new Date();
              const currentEnd = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : now;
              const isActive = user.isPremium && currentEnd > now;
              
              let newEndDate = new Date(now.getTime() + duration * 60 * 60 * 1000);

              if (isActive) {
                  // Extend existing duration
                  newEndDate = new Date(currentEnd.getTime() + duration * 60 * 60 * 1000);
                  updatedUser.subscriptionEndDate = newEndDate.toISOString();
                  // Keep existing Tier/Level to prevent downgrade
                  successMsg = `🎁 Gift Claimed! Extended your plan by ${duration} hours.`;
              } else {
                  updatedUser.subscriptionTier = tier as any;
                  updatedUser.subscriptionLevel = level as any;
                  updatedUser.subscriptionEndDate = newEndDate.toISOString();
                  updatedUser.isPremium = true;
                  successMsg = `🎁 Gift Claimed! ${tier} ${level} unlocked for ${duration} hours.`;
              }
          }
      } else if (reward) {
          // HANDLE AUTO REWARD
          const duration = reward.durationHours || 4;
          
          const now = new Date();
          const currentEnd = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : now;
          const isActive = user.isPremium && currentEnd > now;
          
          let newEndDate = new Date(now.getTime() + duration * 60 * 60 * 1000);

          if (isActive) {
              newEndDate = new Date(currentEnd.getTime() + duration * 60 * 60 * 1000);
              updatedUser.subscriptionEndDate = newEndDate.toISOString();
              successMsg = `✅ Reward Claimed! Extended access by ${duration} hours.`;
          } else {
              updatedUser.subscriptionTier = reward.tier;
              updatedUser.subscriptionLevel = reward.level;
              updatedUser.subscriptionEndDate = newEndDate.toISOString();
              updatedUser.isPremium = true;
              successMsg = `✅ Reward Claimed! Enjoy ${duration} hours of ${reward.level} access.`;
          }
      }
      
      handleUserUpdate(updatedUser);
      showAlert(successMsg, 'SUCCESS', 'Rewards Claimed');
  };

  // --- TRACK TODAY'S ACTIVITY & FIRST DAY BONUSES ---
  // Use Ref to avoid stale closures in onSnapshot
  const userRef = React.useRef(user);
  useEffect(() => {
      userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!user.id) return;
    const unsub = onSnapshot(doc(db, "users", user.id), (doc) => {
        if (doc.exists()) {
            const cloudData = doc.data() as User;
            const currentUser = userRef.current;

            // Check for critical updates or if we need to sync history
            // We only trigger update if critical fields changed OR if we need to save our local history to cloud

            const needsUpdate = cloudData.credits !== currentUser.credits ||
                                cloudData.subscriptionTier !== currentUser.subscriptionTier ||
                                cloudData.isPremium !== currentUser.isPremium ||
                                cloudData.isGameBanned !== currentUser.isGameBanned ||
                                // Also check for deep object changes if necessary (e.g. new test result from another device)
                                (cloudData.mcqHistory?.length || 0) > (currentUser.mcqHistory?.length || 0);

            if (needsUpdate) {
                console.log("Syncing User Data from Cloud...", cloudData);
                // DATA PERSISTENCE FIX:
                // If cloud has NO history but we have local history, keep local.
                // This prevents overwriting valid local data with empty cloud data if sync failed previously.

                const updated: User = { ...currentUser, ...cloudData };

                // RESTORE LOCAL HISTORY IF CLOUD IS EMPTY (Safety Net)
                if ((!cloudData.mcqHistory || cloudData.mcqHistory.length === 0) && (currentUser.mcqHistory && currentUser.mcqHistory.length > 0)) {
                    console.log("Restoring local history over empty cloud history...");
                    updated.mcqHistory = currentUser.mcqHistory;
                    // Ideally we should push this back to cloud, but let's at least not lose it locally
                    // Only save if we are sure (to avoid loop). For now, just update local state.
                    // saveUserToLive(updated); // Avoid write loop
                }

                onRedeemSuccess(updated); 
            }
        }
    });
    return () => unsub();
  }, [user.id]); 

  useEffect(() => {
      const interval = setInterval(() => {
          updateUserStatus(user.id, dailyStudySeconds);
          const todayStr = new Date().toDateString();
          localStorage.setItem(`activity_${user.id}_${todayStr}`, dailyStudySeconds.toString());
          
          const accountAgeHours = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60);
          const firstDayBonusClaimed = localStorage.getItem(`first_day_ultra_${user.id}`);
          
          if (accountAgeHours < 24 && dailyStudySeconds >= 3600 && !firstDayBonusClaimed) {
              const endDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 Hour
              const updatedUser: User = { 
                  ...user, 
                  subscriptionTier: 'MONTHLY', // Ultra
                  subscriptionEndDate: endDate,
                  isPremium: true
              };
              const storedUsers = JSON.parse(localStorage.getItem('nst_users') || '[]');
              const idx = storedUsers.findIndex((u:User) => u.id === user.id);
              if (idx !== -1) storedUsers[idx] = updatedUser;
              
              localStorage.setItem('nst_users', JSON.stringify(storedUsers));
              localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
              localStorage.setItem(`first_day_ultra_${user.id}`, 'true');
              
              onRedeemSuccess(updatedUser);
              showAlert("🎉 FIRST DAY BONUS: You unlocked 1 Hour Free ULTRA Subscription!", 'SUCCESS');
          }
          
      }, 60000); 
      return () => clearInterval(interval);
  }, [dailyStudySeconds, user.id, user.createdAt]);

  // Inbox
  const [showInbox, setShowInbox] = useState(false);
  const unreadCount = user.inbox?.filter(m => !m.read).length || 0;

  useEffect(() => {
    const today = new Date().toDateString();
    const lastClaim = user.lastRewardClaimDate ? new Date(user.lastRewardClaimDate).toDateString() : '';
    setCanClaimReward(lastClaim !== today && dailyStudySeconds >= dailyTargetSeconds);
  }, [user.lastRewardClaimDate, dailyStudySeconds, dailyTargetSeconds]);

  const claimDailyReward = () => {
      if (!canClaimReward) return;
      
      // DYNAMIC REWARD LOGIC (ADMIN CONTROLLED)
      let finalReward = settings?.loginBonusConfig?.freeBonus ?? 3;
      if (user.subscriptionTier !== 'FREE') {
          if (user.subscriptionLevel === 'BASIC') finalReward = settings?.loginBonusConfig?.basicBonus ?? 5;
          if (user.subscriptionLevel === 'ULTRA') finalReward = settings?.loginBonusConfig?.ultraBonus ?? 10;
      }

      // STRICT STREAK LOGIC
      // If Strict Mode is ON and User missed yesterday, they might get reduced reward or no reward next time
      // Here we just grant the reward for hitting the goal TODAY.
      // But we update streak logic elsewhere.

      const updatedUser = {
          ...user,
          credits: (user.credits || 0) + finalReward,
          lastRewardClaimDate: new Date().toISOString()
      };
      handleUserUpdate(updatedUser);
      setCanClaimReward(false);
      showAlert(`Received: ${finalReward} Free Credits!`, 'SUCCESS', 'Daily Goal Met');
  };

  const handleExternalAppClick = (app: any) => {
      if (app.isLocked) { showAlert("This app is currently locked by Admin.", 'ERROR'); return; }
      if (app.creditCost > 0) {
          if (user.credits < app.creditCost) { showAlert(`Insufficient Credits! You need ${app.creditCost} credits.`, 'ERROR'); return; }
          if (user.isAutoDeductEnabled) processAppAccess(app, app.creditCost);
          else setPendingApp({ app, cost: app.creditCost });
          return;
      }
      setActiveExternalApp(app.url);
  };

  const processAppAccess = (app: any, cost: number, enableAuto: boolean = false) => {
      let updatedUser = { ...user, credits: user.credits - cost };
      if (enableAuto) updatedUser.isAutoDeductEnabled = true;
      handleUserUpdate(updatedUser);
      setActiveExternalApp(app.url);
      setPendingApp(null);
  };


  const handleBuyPackage = (pkg: CreditPackage) => {
      const phoneNum = getPhoneNumber();
      const message = `Hello Admin, I want to buy credits.\n\n🆔 User ID: ${user.id}\n📦 Package: ${pkg.name}\n💰 Amount: ₹${pkg.price}\n💎 Credits: ${pkg.credits}\n\nPlease check my payment.`;
      const url = `https://wa.me/91${phoneNum}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const saveProfile = () => {
      // Cost Check
      const isPremium = user.isPremium && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date();
      const cost = settings?.profileEditCost ?? 10;
      
      if (!isPremium && user.credits < cost) {
          showAlert(`Profile update costs ${cost} NST Coins.\nYou have ${user.credits} coins.`, 'ERROR');
          return;
      }
      
      const updatedUser = { 
          ...user, 
          board: profileData.board,
          classLevel: profileData.classLevel,
          stream: profileData.stream,
          password: profileData.newPassword.trim() ? profileData.newPassword : user.password,
          credits: isPremium ? user.credits : user.credits - cost
      };
      localStorage.setItem(`nst_goal_${user.id}`, profileData.dailyGoalHours.toString());
      setDailyTargetSeconds(profileData.dailyGoalHours * 3600);
      handleUserUpdate(updatedUser);
      window.location.reload(); 
      setEditMode(false);
  };
  
  const handleUserUpdate = (updatedUser: User) => {
      const storedUsers = JSON.parse(localStorage.getItem('nst_users') || '[]');
      const userIdx = storedUsers.findIndex((u:User) => u.id === updatedUser.id);
      if (userIdx !== -1) {
          storedUsers[userIdx] = updatedUser;
          localStorage.setItem('nst_users', JSON.stringify(storedUsers));
          
          if (!isImpersonating) {
              localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
              saveUserToLive(updatedUser); 
          }
          onRedeemSuccess(updatedUser); 
      }
  };

  const markInboxRead = () => {
      if (!user.inbox) return;
      const updatedInbox = user.inbox.map(m => ({ ...m, read: true }));
      handleUserUpdate({ ...user, inbox: updatedInbox });
  };

  // --- GENERIC CONTENT FLOW HANDLERS ---
  const handleContentSubjectSelect = async (subject: Subject) => {
      setSelectedSubject(subject);
      setLoadingChapters(true);
      setContentViewStep('CHAPTERS');
      try {
          const ch = await fetchChapters(user.board || 'CBSE', user.classLevel || '10', user.stream || 'Science', subject, 'English');
          setChapters(ch);
      } catch(e) { console.error(e); }
      setLoadingChapters(false);
  };

  const [showSyllabusPopup, setShowSyllabusPopup] = useState<{
    subject: Subject;
    chapter: Chapter;
  } | null>(null);

  const handleContentChapterSelect = (chapter: Chapter) => {
    // Record Activity
    if (typeof (window as any).recordActivity === 'function') {
        const typeMap: Record<string, any> = {
            'VIDEO': 'VIDEO',
            'PDF': 'PDF',
            'MCQ': 'MCQ',
            'AUDIO': 'AUDIO'
        };
        const currentType = typeMap[activeTab] || 'VIEW';
        (window as any).recordActivity(currentType, chapter.title, 0, { 
            itemId: chapter.id, 
            subject: selectedSubject?.name || 'General' 
        });
    }

    setSelectedChapter(chapter);
    setContentViewStep('PLAYER');
    setFullScreen(true);
  };

  const confirmSyllabusSelection = (mode: 'SCHOOL' | 'COMPETITION') => {
    if (showSyllabusPopup) {
      if (mode === 'COMPETITION') {
          // 1. Check if Globally Disabled
          if (settings?.isCompetitionModeEnabled === false) {
              showAlert("Coming Soon! Competition Mode is currently disabled.", 'INFO');
              return;
          }
          // 2. Check User Access (Strictly ULTRA & Active)
          const now = new Date();
          const isSubscribed = user.isPremium && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > now;
          const hasAccess = (isSubscribed && (user.subscriptionLevel === 'ULTRA' || user.subscriptionTier === 'YEARLY')) || user.subscriptionTier === 'LIFETIME';

          if (!hasAccess) {
              showAlert("🏆 Competition Mode is exclusive to Active ULTRA users! Renew or Upgrade.", 'ERROR');
              return;
          }
      }

      setSyllabusMode(mode);
      setSelectedChapter(showSyllabusPopup.chapter);
      setContentViewStep('PLAYER');
      setFullScreen(true);
      setShowSyllabusPopup(null);
    }
  };

  const onLoadingComplete = () => {
      setIsLoadingContent(false);
      setContentViewStep('PLAYER');
      setFullScreen(true);
  };

  // GENERIC CONTENT SECTION RENDERER
  // Trend Analysis (Last 5 tests for Home Page)
  const homeTrendData = (user.mcqHistory || [])
      .slice(0, 5)
      .reverse()
      .map(h => ({
          score: h.totalQuestions > 0 ? Math.round((h.correctCount / h.totalQuestions) * 100) : 0,
          topic: h.chapterTitle || 'Test'
      }));

  const renderContentSection = (type: 'VIDEO' | 'PDF' | 'MCQ' | 'AUDIO') => {
      const handlePlayerBack = () => {
          setContentViewStep('CHAPTERS');
          setFullScreen(false);
          setTopicFilter(undefined); // Clear filter on back
      };

      if (contentViewStep === 'PLAYER' && selectedChapter && selectedSubject) {
          if (type === 'VIDEO') {
            return <VideoPlaylistView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} initialSyllabusMode={syllabusMode} />;
          } else if (type === 'PDF') {
            return <PdfView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} initialSyllabusMode={syllabusMode} directResource={(selectedChapter as any).directResource} topicFilter={topicFilter} />;
          } else if (type === 'AUDIO') {
            return <AudioPlaylistView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} onPlayAudio={setCurrentAudioTrack} initialSyllabusMode={syllabusMode} />;
          } else {
            return <McqView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} topicFilter={topicFilter} />;
          }
      }

      if (contentViewStep === 'CHAPTERS' && selectedSubject) {
          return (
              <ChapterSelection 
                  chapters={chapters} 
                  subject={selectedSubject} 
                  classLevel={user.classLevel || '10'} 
                  loading={loadingChapters} 
                  user={user} 
                  settings={settings}
                  onSelect={(chapter, contentType) => {
                      setSelectedChapter(chapter);
                      if (contentType) {
                          // contentType based logic if needed, but for now we just go to player
                          setContentViewStep('PLAYER');
                          setFullScreen(true);
                      } else {
                          handleContentChapterSelect(chapter);
                      }
                  }} 
                  onBack={() => { setContentViewStep('SUBJECTS'); onTabChange('COURSES'); }} 
              />
          );
      }

      return null; 
  };

  const isGameEnabled = settings?.isGameEnabled ?? true;


  // --- RENDER BASED ON ACTIVE TAB ---
  const renderMainContent = () => {
      // 1. HOME TAB
      if (activeTab === 'HOME') {
          return (
              <div className="space-y-4 pb-24">
                {/* NEW HEADER DESIGN */}
                <div className="bg-white p-4 rounded-b-3xl shadow-sm border-b border-slate-200 mb-2 flex items-center justify-between sticky top-0 z-40">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowSidebar(true)}
                            className="bg-white border border-slate-200 shadow-sm px-3 py-2 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2 group active:scale-95"
                        >
                            <div className="space-y-1">
                                <span className="block w-5 h-0.5 bg-slate-600 group-hover:bg-blue-600 transition-colors rounded-full"></span>
                                <span className="block w-3 h-0.5 bg-slate-600 group-hover:bg-blue-600 transition-colors rounded-full"></span>
                                <span className="block w-5 h-0.5 bg-slate-600 group-hover:bg-blue-600 transition-colors rounded-full"></span>
                            </div>
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-black text-slate-800 leading-none">
                                    {settings?.appName || 'Student App'}
                                </h2>
                                {/* DISCOUNT BADGE */}
                                {discountStatus === 'ACTIVE' && (
                                    <button
                                        onClick={() => onTabChange('STORE')}
                                        className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse shadow-sm"
                                    >
                                        {settings?.specialDiscountEvent?.discountPercent || 50}% OFF
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{user.displayId || user.id.slice(0,6)}</span>
                                {user.role === 'ADMIN' && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[9px] font-bold">ADMIN</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onTabChange('STORE')}
                            className="flex flex-col items-end group active:scale-95 transition-transform"
                        >
                            <span className="text-[10px] font-bold text-slate-400 uppercase group-hover:text-blue-600 transition-colors">Credits</span>
                            <span className="font-black text-blue-600 flex items-center gap-1">
                                <Crown size={14} className="fill-blue-600"/> {user.credits} <span className="bg-blue-100 text-blue-700 text-[8px] px-1 rounded ml-1 group-hover:bg-blue-600 group-hover:text-white transition-colors">ADD</span>
                            </span>
                        </button>
                        <div className="flex flex-col items-end border-l pl-3 border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Streak</span>
                            <span className="font-black text-orange-500 flex items-center gap-1">
                                <Zap size={14} className="fill-orange-500"/> {user.streak}
                            </span>
                        </div>
                        {user.isPremium && user.subscriptionEndDate && (
                            <div className="flex flex-col items-end border-l pl-3 border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Plan</span>
                                <span className="font-black text-purple-600 text-[10px]">
                                    {user.subscriptionTier === 'LIFETIME' ? '∞' :
                                     `${Math.max(0, Math.ceil((new Date(user.subscriptionEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} Days`}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* PERFORMANCE GRAPH */}
                <DashboardSectionWrapper id="section_performance" label="Performance" settings={settings} isLayoutEditing={isLayoutEditing} onToggleVisibility={toggleLayoutVisibility}>
                    <PerformanceGraph
                        history={user.mcqHistory || []}
                        user={user}
                        onViewNotes={(topic) => {
                            onTabChange('PDF');
                        }}
                    />
                </DashboardSectionWrapper>

                {/* STUDY TIMER & MYSTERY REVISION */}
                <DashboardSectionWrapper id="section_timer" label="Study Goal" settings={settings} isLayoutEditing={isLayoutEditing} onToggleVisibility={toggleLayoutVisibility}>
                    <div className="relative">
                        <StudyGoalTimer
                            dailyStudySeconds={dailyStudySeconds}
                            targetSeconds={dailyTargetSeconds}
                            onSetTarget={(s) => {
                                setDailyTargetSeconds(s);
                                localStorage.setItem(`nst_goal_${user.id}`, (s / 3600).toString());
                            }}
                        />

                        {/* MYSTERY REVISION BUTTON (Weak Topic Shortcut) */}
                        {(() => {
                            // Check for Weak Topics due today
                            const weakTopics = (user.mcqHistory || [])
                                .filter(h => (h.score / h.totalQuestions) < 0.5)
                                .map(h => h.chapterTitle || 'Topic');
                            const uniqueWeak = [...new Set(weakTopics)];
                            const topicName = uniqueWeak[0]; // Get first topic name

                            if (uniqueWeak.length > 0) {
                                return (
                                    <button
                                        onClick={() => {
                                            onTabChange('REVISION');
                                            showAlert(`🎯 Focusing on: ${topicName}. Go to Revision Hub!`, "INFO");
                                        }}
                                        className="absolute -top-2 right-4 bg-slate-900 text-white px-3 py-1.5 rounded-full shadow-lg border-2 border-red-500 animate-in slide-in-from-right flex items-center gap-2 group z-10"
                                        title="Mystery Revision Due!"
                                    >
                                        <div className="relative">
                                            <HelpCircle size={16} className="text-yellow-400" />
                                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full border border-white animate-pulse"></div>
                                        </div>
                                        <span className="text-[10px] font-bold max-w-[100px] truncate">
                                            {topicName}
                                        </span>
                                    </button>
                                );
                            }
                            return null;
                        })()}
                    </div>
                </DashboardSectionWrapper>

                {/* MAIN ACTION BUTTONS */}
                <DashboardSectionWrapper id="section_main_actions" label="Main Actions" settings={settings} isLayoutEditing={isLayoutEditing} onToggleVisibility={toggleLayoutVisibility}>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => { onTabChange('COURSES'); setContentViewStep('SUBJECTS'); }}
                            className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-lg shadow-blue-200 flex flex-col items-center justify-center gap-2 group active:scale-95 transition-all relative overflow-hidden h-32"
                        >
                            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <Book size={32} className="text-white mb-1" />
                            <span className="font-black text-white text-lg tracking-wide uppercase">My Courses</span>
                        </button>

                        <button
                            onClick={() => onTabChange('ANALYTICS')}
                            className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm flex flex-col items-center justify-center gap-2 group active:scale-95 transition-all hover:border-blue-200 h-32"
                        >
                            <BarChart3 size={32} className="text-blue-600 mb-1" />
                            <span className="font-black text-slate-700 text-lg tracking-wide uppercase">My Analysis</span>
                        </button>
                    </div>
                </DashboardSectionWrapper>
              </div>
          );
      }

      // 2. REVISION HUB (Replaces AI Studio)
      // Alias AI_STUDIO to REVISION for backward compatibility
      if (activeTab === 'REVISION' || activeTab === 'AI_STUDIO') {
          return (
              <RevisionHub
                  user={user}
                  onTabChange={onTabChange}
                  settings={settings}
                  onNavigateContent={(type, chapterId, topicName) => {
                      // Only for PDF/Notes now
                      setTopicFilter(topicName);

                      if (type === 'PDF') {
                          setLoadingChapters(true);
                          fetchChapters(user.board || 'CBSE', user.classLevel || '10', user.stream || 'Science', null, 'English').then(allChapters => {
                              const ch = allChapters.find(c => c.id === chapterId);
                              if (ch) {
                                  onTabChange('PDF');
                                  const subjects = getSubjectsList(user.classLevel || '10', user.stream || 'Science');
                                  if (!selectedSubject) setSelectedSubject(subjects[0]);

                                  setSelectedChapter(ch);
                                  setContentViewStep('PLAYER');
                                  setFullScreen(true);
                              } else {
                                  showAlert("Content not found or not loaded.", "ERROR");
                              }
                              setLoadingChapters(false);
                          });
                      }
                  }}
              />
          );
      }

      // 3. MCQ REVIEW HUB
      if (activeTab === 'MCQ_REVIEW') {
          return (
              <McqReviewHub
                  user={user}
                  onTabChange={onTabChange}
                  settings={settings}
                  onNavigateContent={(type, chapterId) => {
                      // Navigate to MCQ Player
                      setLoadingChapters(true);
                      fetchChapters(user.board || 'CBSE', user.classLevel || '10', user.stream || 'Science', null, 'English').then(allChapters => {
                          const ch = allChapters.find(c => c.id === chapterId);
                          if (ch) {
                              onTabChange('MCQ');
                              const subjects = getSubjectsList(user.classLevel || '10', user.stream || 'Science');
                              if (!selectedSubject) setSelectedSubject(subjects[0]);

                              setSelectedChapter(ch);
                              setContentViewStep('PLAYER');
                              setFullScreen(true);
                          } else {
                              showAlert("Test not found.", "ERROR");
                          }
                          setLoadingChapters(false);
                      });
                  }}
              />
          );
      }

      // 3. COURSES TAB (Handles Video, Notes, MCQ Selection)
      if (activeTab === 'COURSES') {
          // If viewing a specific content type (from drilled down), show it
          // Note: Clicking a subject switches tab to VIDEO/PDF/MCQ, so COURSES just shows the Hub.
          const visibleSubjects = getSubjectsList(user.classLevel || '10', user.stream || null)
                                    .filter(s => !(settings?.hiddenSubjects || []).includes(s.id));

          return (
              <div className="space-y-6 pb-24">
                      <div className="flex items-center justify-between">
                          <h2 className="text-2xl font-black text-slate-800">My Courses</h2>
                      </div>

                      {/* Video Section */}
                      {settings?.contentVisibility?.VIDEO !== false && (
                          <div className="bg-gradient-to-br from-red-50 to-rose-100 p-6 rounded-3xl border border-red-200 shadow-sm">
                              <h3 className="font-black text-red-900 flex items-center gap-2 mb-4 text-lg">
                                  <div className="p-2 bg-white rounded-full shadow-sm text-red-600"><Youtube size={20} /></div>
                                  Video Lectures
                              </h3>
                              <div className="grid grid-cols-2 gap-3">
                                  {visibleSubjects.map(s => (
                                      <button key={s.id} onClick={() => { onTabChange('VIDEO'); handleContentSubjectSelect(s); }} className="bg-white p-3 rounded-2xl text-xs font-bold text-slate-700 shadow-sm border border-red-100 text-left hover:shadow-md hover:scale-[1.02] transition-all flex items-center gap-2">
                                          <div className={`w-2 h-2 rounded-full ${s.color?.split(' ')[0] || 'bg-red-500'}`}></div>
                                          {s.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      {/* Notes Section */}
                      {settings?.contentVisibility?.PDF !== false && (
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-6 rounded-3xl border border-blue-200 shadow-sm">
                              <h3 className="font-black text-blue-900 flex items-center gap-2 mb-4 text-lg">
                                  <div className="p-2 bg-white rounded-full shadow-sm text-blue-600"><FileText size={20} /></div>
                                  Notes Library
                              </h3>
                              <div className="grid grid-cols-2 gap-3">
                                  {visibleSubjects.map(s => (
                                      <button key={s.id} onClick={() => { onTabChange('PDF'); handleContentSubjectSelect(s); }} className="bg-white p-3 rounded-2xl text-xs font-bold text-slate-700 shadow-sm border border-blue-100 text-left hover:shadow-md hover:scale-[1.02] transition-all flex items-center gap-2">
                                          <div className={`w-2 h-2 rounded-full ${s.color?.split(' ')[0] || 'bg-blue-500'}`}></div>
                                          {s.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      {/* MCQ Section */}
                      {settings?.contentVisibility?.MCQ !== false && (
                          <div className="bg-gradient-to-br from-purple-50 to-fuchsia-100 p-6 rounded-3xl border border-purple-200 shadow-sm">
                              <div className="flex justify-between items-center mb-4">
                                  <h3 className="font-black text-purple-900 flex items-center gap-2 text-lg">
                                      <div className="p-2 bg-white rounded-full shadow-sm text-purple-600"><CheckSquare size={20} /></div>
                                      MCQ Practice
                                  </h3>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                  {visibleSubjects.map(s => (
                                      <button key={s.id} onClick={() => { onTabChange('MCQ'); handleContentSubjectSelect(s); }} className="bg-white p-3 rounded-2xl text-xs font-bold text-slate-700 shadow-sm border border-purple-100 text-left hover:shadow-md hover:scale-[1.02] transition-all flex items-center gap-2">
                                          <div className={`w-2 h-2 rounded-full ${s.color?.split(' ')[0] || 'bg-purple-500'}`}></div>
                                          {s.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}

                      {/* Audio/Podcast Section */}
                      {settings?.contentVisibility?.AUDIO !== false && (
                          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 rounded-2xl shadow-lg border border-slate-700 relative overflow-hidden">
                              <div className="flex justify-between items-center mb-2 relative z-10">
                                  <h3 className="font-bold text-white flex items-center gap-2"><Headphones className="text-pink-500" /> Audio Library</h3>
                                  <span className="text-[10px] font-black bg-pink-600 text-white px-2 py-0.5 rounded-full">NEW</span>
                              </div>
                              <p className="text-xs text-slate-400 mb-3 relative z-10">Listen to high-quality audio lectures and podcasts.</p>
                              <div className="grid grid-cols-2 gap-2 relative z-10">
                                  {visibleSubjects.map(s => (
                                      <button key={s.id} onClick={() => { onTabChange('AUDIO'); handleContentSubjectSelect(s); }} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl text-xs font-bold text-white shadow-sm border border-white/10 text-left backdrop-blur-sm transition-colors">
                                          {s.name}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              );
      }

      // 4. LEGACY TABS (Mapped to new structure or kept as sub-views)
      if (activeTab === 'CUSTOM_PAGE') return <CustomBloggerPage onBack={() => onTabChange('HOME')} />;
      if (activeTab === 'DEEP_ANALYSIS') return <AiDeepAnalysis user={user} settings={settings} onUpdateUser={handleUserUpdate} onBack={() => onTabChange('HOME')} />;
      if (activeTab === 'AI_HISTORY') return <AiHistoryPage user={user} onBack={() => onTabChange('HOME')} />;
      if (activeTab === 'UPDATES') return <UniversalInfoPage onBack={() => onTabChange('HOME')} />;
      if ((activeTab as string) === 'ANALYTICS') return <AnalyticsPage user={user} onBack={() => onTabChange('HOME')} settings={settings} onNavigateToChapter={onNavigateToChapter} />;
      if ((activeTab as string) === 'SUB_HISTORY') return <SubscriptionHistory user={user} onBack={() => onTabChange('HOME')} />;
      if (activeTab === 'HISTORY') return <HistoryPage user={user} onUpdateUser={handleUserUpdate} settings={settings} />;
      if (activeTab === 'LEADERBOARD') return <Leaderboard user={user} settings={settings} />;
      if (activeTab === 'GAME') return isGameEnabled ? (user.isGameBanned ? <div className="text-center py-20 bg-red-50 rounded-2xl border border-red-100"><Ban size={48} className="mx-auto text-red-500 mb-4" /><h3 className="text-lg font-bold text-red-700">Access Denied</h3><p className="text-sm text-red-600">Admin has disabled the game for your account.</p></div> : <SpinWheel user={user} onUpdateUser={handleUserUpdate} settings={settings} />) : null;
      if (activeTab === 'REDEEM') return <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><RedeemSection user={user} onSuccess={onRedeemSuccess} /></div>;
      if (activeTab === 'PRIZES') return <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><PrizeList /></div>;
      // if (activeTab === 'REWARDS') return (...); // REMOVED TO PREVENT CRASH
      if (activeTab === 'STORE') return <Store user={user} settings={settings} onUserUpdate={handleUserUpdate} />;
      if (activeTab === 'PROFILE') return (
                <div className="animate-in fade-in zoom-in duration-300 pb-24">
                    <div className={`rounded-3xl p-8 text-center text-white mb-6 shadow-xl relative overflow-hidden transition-all duration-500 ${
                        user.subscriptionLevel === 'ULTRA' && user.isPremium 
                        ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 shadow-purple-500/50 ring-2 ring-purple-400/50' 
                        : user.subscriptionLevel === 'BASIC' && user.isPremium
                        ? 'bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-600 shadow-blue-500/50'
                        : 'bg-gradient-to-br from-slate-700 to-slate-900'
                    }`}>
                        {/* ANIMATED BACKGROUND FOR ULTRA */}
                        {user.subscriptionLevel === 'ULTRA' && user.isPremium && (
                            <>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 animate-spin-slow"></div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                                <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/30 rounded-full blur-3xl animate-pulse"></div>
                            </>
                        )}
                        
                        {/* ANIMATED BACKGROUND FOR BASIC */}
                        {user.subscriptionLevel === 'BASIC' && user.isPremium && (
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-30 animate-pulse"></div>
                        )}

                        {/* SPECIAL BANNER ANIMATION (7/30/365) */}
                        {(user.subscriptionTier === 'WEEKLY' || user.subscriptionTier === 'MONTHLY' || user.subscriptionTier === 'YEARLY' || user.subscriptionTier === 'LIFETIME') && user.isPremium && (
                            <div className="absolute top-2 right-2 animate-bounce">
                                <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold border border-white/30">
                                    {user.subscriptionTier === 'WEEKLY' ? '7 DAYS' : user.subscriptionTier === 'MONTHLY' ? '30 DAYS' : user.subscriptionTier === 'LIFETIME' ? '∞' : '365 DAYS'}
                                </span>
                            </div>
                        )}

                        <div className={`w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-4xl font-black shadow-2xl relative z-10 ${
                            user.subscriptionLevel === 'ULTRA' && user.isPremium ? 'text-purple-700 ring-4 ring-purple-300 animate-bounce-slow' : 
                            user.subscriptionLevel === 'BASIC' && user.isPremium ? 'text-blue-600 ring-4 ring-cyan-300' : 
                            'text-slate-800'
                        }`}>
                            {user.name.charAt(0)}
                            {user.subscriptionLevel === 'ULTRA' && user.isPremium && <div className="absolute -top-2 -right-2 text-2xl">👑</div>}
                        </div>
                        
                        <div className="flex items-center justify-center gap-2 relative z-10">
                            <h2 className="text-3xl font-black">{user.name}</h2>
                            <button 
                                onClick={() => { setNewNameInput(user.name); setShowNameChangeModal(true); }}
                                className="bg-white/20 p-1.5 rounded-full hover:bg-white/40 transition-colors"
                            >
                                <Edit size={14} />
                            </button>
                        </div>
                        <p className="text-white/80 text-sm font-mono relative z-10">ID: {user.displayId || user.id}</p>
                        {user.createdAt && (
                            <p className="text-white/60 text-[10px] mt-1 font-medium relative z-10">
                                Joined: {new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                        )}
                        
                        <div className="mt-4 relative z-10">
                            <span className={`px-6 py-2 rounded-full text-sm font-black uppercase tracking-widest shadow-lg shadow-black/20 border-2 ${
                                user.subscriptionLevel === 'ULTRA' && user.isPremium ? 'bg-purple-500 text-white border-purple-300 animate-pulse' :
                                user.subscriptionLevel === 'BASIC' && user.isPremium ? 'bg-cyan-500 text-white border-cyan-300' : 'bg-slate-600 text-slate-400 border-slate-500'
                            }`}>
                                {user.isPremium
                                    ? (() => {
                                        const tier = user.subscriptionTier;
                                        let displayTier = 'PREMIUM';

                                        if (tier === 'WEEKLY') displayTier = 'Weekly';
                                        else if (tier === 'MONTHLY') displayTier = 'Monthly';
                                        else if (tier === 'YEARLY') displayTier = 'Yearly';
                                        else if (tier === 'LIFETIME') displayTier = 'Yearly Plus'; // Mapped as per user request
                                        else if (tier === '3_MONTHLY') displayTier = 'Quarterly';
                                        else if (tier === 'CUSTOM') displayTier = 'Custom Plan';

                                        return (
                                            <span className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]">
                                                {displayTier} {user.subscriptionLevel}
                                            </span>
                                        );
                                    })()
                                    : 'Free User'
                                }
                            </span>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Class</p>
                            <p className="text-lg font-black text-slate-800">{user.classLevel} • {user.board} • {user.stream}</p>
                        </div>
                        
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Subscription</p>
                            <p className="text-lg font-black text-slate-800">
                                {user.subscriptionTier === 'CUSTOM' ? (user.customSubscriptionName || 'Basic Ultra') : (user.subscriptionTier || 'FREE')}
                            </p>
                            {user.subscriptionEndDate && user.subscriptionTier !== 'LIFETIME' && (
                                <div className="mt-1">
                                    <p className="text-xs text-slate-500 font-medium">Expires on:</p>
                                    <p className="text-xs font-bold text-slate-700">
                                        {new Date(user.subscriptionEndDate).toLocaleString('en-IN', {
                                            year: 'numeric', month: 'long', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                                        })}
                                    </p>
                                    <p className="text-[10px] text-red-500 mt-1 font-mono">
                                        (Time left: {
                                            (() => {
                                                const diff = new Date(user.subscriptionEndDate).getTime() - Date.now();
                                                if (diff <= 0) return 'Expired';
                                                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                                                const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                                                const m = Math.floor((diff / 1000 / 60) % 60);
                                                return `${d}d ${h}h ${m}m`;
                                            })()
                                        })
                                    </p>
                                </div>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                                <p className="text-xs font-bold text-blue-600 uppercase">Credits</p>
                                <p className="text-2xl font-black text-blue-600">{user.credits}</p>
                            </div>
                            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                                <p className="text-xs font-bold text-orange-600 uppercase">Streak</p>
                                <p className="text-2xl font-black text-orange-600">{user.streak} Days</p>
                            </div>
                        </div>
                        
                        <button onClick={() => { setMarksheetType('MONTHLY'); setShowMonthlyReport(true); }} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow flex items-center justify-center gap-2"><BarChart3 size={18} /> View Monthly Report</button>
                        <button onClick={() => onTabChange('SUB_HISTORY')} className="w-full bg-purple-600 text-white py-3 rounded-xl font-bold hover:bg-purple-700 shadow flex items-center justify-center gap-2"><History size={18} /> View Subscription History</button>
                        
                        <div className="flex items-center justify-between p-4 bg-slate-100 rounded-xl">
                            <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-slate-800 text-yellow-400' : 'bg-white text-slate-600'}`}>
                                    {isDarkMode ? <Sparkles size={16} /> : <Zap size={16} />}
                                </div>
                                <span className="font-bold text-slate-700 text-sm">Dark Mode</span>
                            </div>
                            <button 
                                onClick={() => onToggleDarkMode && onToggleDarkMode(!isDarkMode)}
                                className={`w-12 h-7 rounded-full transition-all relative ${isDarkMode ? 'bg-slate-800' : 'bg-slate-300'}`}
                            >
                                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-sm ${isDarkMode ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        <button onClick={() => setEditMode(true)} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900">✏️ Edit Profile</button>
                        <button onClick={() => {
                            handleUserUpdate(user); // Force sync before logout
                            localStorage.removeItem('nst_current_user');
                            window.location.reload();
                        }} className="w-full bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600">🚪 Logout</button>
                    </div>
                </div>
      );

      // Handle Drill-Down Views (Video, PDF, MCQ, AUDIO)
      if (activeTab === 'VIDEO' || activeTab === 'PDF' || activeTab === 'MCQ' || activeTab === 'AUDIO') {
          return renderContentSection(activeTab);
      }

      return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
        {/* ADMIN SWITCH BUTTON */}
        {(user.role === 'ADMIN' || isImpersonating) && (
             <div className="fixed bottom-36 right-4 z-50 flex flex-col gap-3 items-end">
                 <button 
                    onClick={() => setIsLayoutEditing(!isLayoutEditing)}
                    className={`p-4 rounded-full shadow-2xl border-2 hover:scale-110 transition-transform flex items-center gap-2 ${isLayoutEditing ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-white text-slate-800 border-slate-200'}`}
                 >
                     <Edit size={20} />
                     {isLayoutEditing && <span className="font-bold text-xs">Editing Layout</span>}
                 </button>
                 <button 
                    onClick={handleSwitchToAdmin}
                    className="bg-slate-900 text-white p-4 rounded-full shadow-2xl border-2 border-slate-700 hover:scale-110 transition-transform flex items-center gap-2 animate-bounce-slow"
                 >
                     <Layout size={20} className="text-yellow-400" />
                     <span className="font-bold text-xs">Admin Panel</span>
                 </button>
             </div>
        )}

        {/* NOTIFICATION BAR (Only on Home) (COMPACT VERSION) */}
        {activeTab === 'HOME' && settings?.noticeText && (
            <div className="bg-slate-900 text-white p-3 mb-4 rounded-xl shadow-md border border-slate-700 animate-in slide-in-from-top-4 relative mx-2 mt-2">
                <div className="flex items-center gap-3">
                    <Megaphone size={16} className="text-yellow-400 shrink-0" />
                    <div className="overflow-hidden flex-1">
                        <p className="text-xs font-medium truncate">{settings.noticeText}</p>
                    </div>
                    <SpeakButton text={settings.noticeText} className="text-white hover:bg-white/10" iconSize={14} />
                </div>
            </div>
        )}

        {/* AI NOTES MODAL */}
        {showAiModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
                <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                <BrainCircuit size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800">{settings?.aiName || 'AI Notes'}</h3>
                                <p className="text-xs text-slate-500">Instant Note Generator</p>
                            </div>
                        </div>
                        <button onClick={() => {setShowAiModal(false); setAiResult(null);}} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
                    </div>

                    {!aiResult ? (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">What topic do you want notes for?</label>
                                <textarea 
                                    value={aiTopic}
                                    onChange={(e) => setAiTopic(e.target.value)}
                                    placeholder="e.g. Newton's Laws of Motion, Photosynthesis process..."
                                    className="w-full p-4 bg-slate-50 border-none rounded-2xl text-slate-800 focus:ring-2 focus:ring-indigo-100 h-32 resize-none"
                                />
                            </div>
                            
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                                <AlertCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
                                <div className="text-xs text-blue-800">
                                    <span className="font-bold block mb-1">Usage Limit</span>
                                    You can generate notes within your daily limit. 
                                    {user.isPremium ? (user.subscriptionLevel === 'ULTRA' ? ' (Ultra Plan: High Limit)' : ' (Basic Plan: Medium Limit)') : ' (Free Plan: Low Limit)'}
                                </div>
                            </div>

                            <button 
                                onClick={handleAiNotesGeneration}
                                disabled={aiGenerating}
                                className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {aiGenerating ? <Sparkles className="animate-spin" /> : <Sparkles />}
                                {aiGenerating ? "Generating Magic..." : "Generate Notes"}
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 prose prose-sm max-w-none">
                                <div className="whitespace-pre-wrap">{aiResult}</div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setAiResult(null)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl"
                                >
                                    New Topic
                                </button>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(aiResult);
                                        showAlert("Notes Copied!", "SUCCESS");
                                    }}
                                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg"
                                >
                                    Copy Text
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* REQUEST CONTENT MODAL */}
        {showRequestModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    <div className="flex items-center gap-2 mb-4 text-pink-600">
                        <Megaphone size={24} />
                        <h3 className="text-lg font-black text-slate-800">Request Content</h3>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Subject</label>
                            <input 
                                type="text" 
                                value={requestData.subject} 
                                onChange={e => setRequestData({...requestData, subject: e.target.value})}
                                className="w-full p-2 border rounded-lg"
                                placeholder="e.g. Mathematics"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Topic / Chapter</label>
                            <input 
                                type="text" 
                                value={requestData.topic} 
                                onChange={e => setRequestData({...requestData, topic: e.target.value})}
                                className="w-full p-2 border rounded-lg"
                                placeholder="e.g. Trigonometry"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
                            <select 
                                value={requestData.type} 
                                onChange={e => setRequestData({...requestData, type: e.target.value})}
                                className="w-full p-2 border rounded-lg"
                            >
                                <option value="PDF">PDF Notes</option>
                                <option value="VIDEO">Video Lecture</option>
                                <option value="MCQ">MCQ Test</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => setShowRequestModal(false)} className="flex-1 py-3 text-slate-500 font-bold bg-slate-100 rounded-xl">Cancel</button>
                        <button 
                            onClick={() => {
                                if (!requestData.subject || !requestData.topic) {
                                    showAlert("Please fill all fields", 'ERROR');
                                    return;
                                }
                                const request = {
                                    id: `req-${Date.now()}`,
                                    userId: user.id,
                                    userName: user.name,
                                    details: `${user.classLevel || '10'} ${user.board || 'CBSE'} - ${requestData.subject} - ${requestData.topic} - ${requestData.type}`,
                                    timestamp: new Date().toISOString()
                                };
                                // Save to Firebase for Admin Visibility
                                saveDemandRequest(request)
                                    .then(() => {
                                        setShowRequestModal(false);
                                        showAlert("✅ Request Sent! Admin will check it.", 'SUCCESS');
                                        // Also save locally just in case
                                        const existing = JSON.parse(localStorage.getItem('nst_demand_requests') || '[]');
                                        existing.push(request);
                                        localStorage.setItem('nst_demand_requests', JSON.stringify(existing));
                                    })
                                    .catch(() => showAlert("Failed to send request.", 'ERROR'));
                            }}
                            className="flex-1 py-3 bg-pink-600 text-white font-bold rounded-xl hover:bg-pink-700 shadow-lg"
                        >
                            Send Request
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* NAME CHANGE MODAL */}
        {showNameChangeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    <h3 className="text-lg font-bold mb-4 text-slate-800">Change Display Name</h3>
                    <input 
                        type="text" 
                        value={newNameInput} 
                        onChange={e => setNewNameInput(e.target.value)} 
                        className="w-full p-3 border rounded-xl mb-2" 
                        placeholder="Enter new name" 
                    />
                    <p className="text-xs text-slate-500 mb-4">Cost: <span className="font-bold text-orange-600">{settings?.nameChangeCost || 10} Coins</span></p>
                    <div className="flex gap-2">
                        <button onClick={() => setShowNameChangeModal(false)} className="flex-1 py-2 text-slate-500 font-bold bg-slate-100 rounded-lg">Cancel</button>
                        <button 
                            onClick={() => {
                                const cost = settings?.nameChangeCost || 10;
                                if (newNameInput && newNameInput !== user.name) {
                                    if (user.credits < cost) { showAlert(`Insufficient Coins! Need ${cost}.`, 'ERROR'); return; }
                                    const u = { ...user, name: newNameInput, credits: user.credits - cost };
                                    handleUserUpdate(u);
                                    setShowNameChangeModal(false);
                                    showAlert("Name Updated Successfully!", 'SUCCESS');
                                }
                            }}
                            className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
                        >
                            Pay & Update
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MAIN CONTENT AREA */}
        <div className="p-4">
            {renderMainContent()}
            
            {settings?.showFooter !== false && (
                <div className="mt-8 mb-4 text-center">
                    <p 
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: settings?.footerColor || '#cbd5e1' }}
                    >
                        Developed by Nadim Anwar
                    </p>
                </div>
            )}
        </div>

        {/* MINI PLAYER */}
        <MiniPlayer track={currentAudioTrack} onClose={() => setCurrentAudioTrack(null)} />

        {/* FIXED BOTTOM NAVIGATION */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 pb-safe">
            <div className="flex justify-around items-center h-16">
                <button onClick={() => { onTabChange('HOME'); setContentViewStep('SUBJECTS'); }} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'HOME' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <Home size={24} fill={activeTab === 'HOME' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Home</span>
                </button>
                
                <button onClick={() => onTabChange('REVISION' as any)} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'REVISION' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <BrainCircuit size={24} fill={activeTab === 'REVISION' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Notes</span>
                </button>

                <button onClick={() => onTabChange('MCQ_REVIEW' as any)} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'MCQ_REVIEW' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <CheckSquare size={24} fill={activeTab === 'MCQ_REVIEW' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Review</span>
                </button>

                <button onClick={() => onTabChange('PROFILE')} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'PROFILE' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <UserIconOutline size={24} fill={activeTab === 'PROFILE' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Profile</span>
                </button>
            </div>
        </div>

        <StudentSidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            onNavigate={(tab) => {
                onTabChange(tab);
                setIsSidebarOpen(false);
            }}
            user={user}
            settings={settings}
            onLogout={() => {
                handleUserUpdate(user); // Force sync before logout
                localStorage.removeItem('nst_current_user');
                window.location.reload();
            }}
        />

        {/* SYLLABUS SELECTION POPUP */}
        {showSyllabusPopup && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl scale-in-center">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                            <BookOpen size={32} />
                        </div>
                        <h3 className="text-xl font-black text-slate-800">Choose Syllabus Mode</h3>
                        <p className="text-sm text-slate-500 mt-1">Select how you want to study this chapter.</p>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                        <button 
                            onClick={() => confirmSyllabusSelection('SCHOOL')}
                            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            🏫 School Mode
                        </button>
                        <button 
                            onClick={() => confirmSyllabusSelection('COMPETITION')}
                            className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-purple-200 active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            🏆 Competition Mode
                        </button>
                    </div>

                    <button 
                        onClick={() => setShowSyllabusPopup(null)}
                        className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        )}

        {/* MODALS */}
        {showUserGuide && <UserGuide onClose={() => setShowUserGuide(false)} />}
        
        {editMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    {/* ... (Edit Profile Content - duplicated code removed for brevity, should use component) ... */}
                    {/* Re-implementing simplified edit mode here as it was inside a helper function before */}
                    <h3 className="font-bold text-lg mb-4">Edit Profile & Settings</h3>
                    <div className="space-y-3 mb-6">
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Daily Study Goal (Hours)</label><input type="number" value={profileData.dailyGoalHours} onChange={e => setProfileData({...profileData, dailyGoalHours: Number(e.target.value)})} className="w-full p-2 border rounded-lg" min={1} max={12}/></div>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">New Password</label><input type="text" placeholder="Set new password (optional)" value={profileData.newPassword} onChange={e => setProfileData({...profileData, newPassword: e.target.value})} className="w-full p-2 border rounded-lg bg-yellow-50 border-yellow-200"/><p className="text-[9px] text-slate-400 mt-1">Leave blank to keep current password.</p></div>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Board</label><select value={profileData.board} onChange={e => setProfileData({...profileData, board: e.target.value as any})} className="w-full p-2 border rounded-lg"><option value="CBSE">CBSE</option><option value="BSEB">BSEB</option></select></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Class</label><select value={profileData.classLevel} onChange={e => setProfileData({...profileData, classLevel: e.target.value as any})} className="w-full p-2 border rounded-lg">{['6','7','8','9','10','11','12'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        {['11','12'].includes(profileData.classLevel) && (<div><label className="text-xs font-bold text-slate-500 uppercase">Stream</label><select value={profileData.stream} onChange={e => setProfileData({...profileData, stream: e.target.value as any})} className="w-full p-2 border rounded-lg"><option value="Science">Science</option><option value="Commerce">Commerce</option><option value="Arts">Arts</option></select></div>)}
                        
                        {/* NAME CHANGE */}
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Display Name ({settings?.nameChangeCost || 10} Coins)</label>
                            <input 
                                type="text" 
                                value={user.name} 
                                onChange={(e) => {
                                    // Normally name is in user object, here we modify a local state if we want preview, 
                                    // but saveProfile uses profileData. Let's add name to profileData.
                                    // BUT user prop is read-only here. We need to handle this in saveProfile properly.
                                    // For now, we will just prompt for Name Change separately or add it here.
                                    // Adding separate logic for Name Change.
                                    // Actually, let's keep it simple: separate button in profile view is better.
                                }}
                                disabled
                                className="w-full p-2 border rounded-lg bg-slate-100 text-slate-500"
                                placeholder="Change from Profile Page"
                            />
                            <p className="text-[9px] text-slate-400 mt-1">Use 'Edit Name' on Profile page to change.</p>
                        </div>
                    </div>
                    <div className="flex gap-2"><button onClick={() => setEditMode(false)} className="flex-1 py-2 text-slate-500 font-bold">Cancel</button><button onClick={saveProfile} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">Save Changes</button></div>
                </div>
            </div>
        )}
        
        {showInbox && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                    <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Mail size={18} className="text-blue-600" /> Admin Messages</h3>
                        <button onClick={() => setShowInbox(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-4 space-y-3">
                        {(!user.inbox || user.inbox.length === 0) && <p className="text-slate-400 text-sm text-center py-8">No messages.</p>}
                        {user.inbox?.map(msg => (
                            <div key={msg.id} className={`p-3 rounded-xl border text-sm ${msg.read ? 'bg-white border-slate-100' : 'bg-blue-50 border-blue-100'} transition-all`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-slate-500">{msg.type === 'GIFT' ? '🎁 GIFT' : 'MESSAGE'}</p>
                                        {!msg.read && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
                                    </div>
                                    <p className="text-slate-400 text-[10px]">{new Date(msg.date).toLocaleDateString()}</p>
                                </div>
                                <p className="text-slate-700 leading-relaxed mb-2">{msg.text}</p>
                                
                                {(msg.type === 'REWARD' || msg.type === 'GIFT') && !msg.isClaimed && (
                                    <button 
                                        onClick={() => claimRewardMessage(msg.id, msg.reward, msg.gift)}
                                        className="w-full mt-2 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-lg shadow-md hover:scale-[1.02] transition-transform text-xs flex items-center justify-center gap-2"
                                    >
                                        <Gift size={14} /> Claim {msg.type === 'GIFT' ? 'Gift' : 'Reward'}
                                    </button>
                                )}
                                {(msg.isClaimed) && <p className="text-[10px] text-green-600 font-bold bg-green-50 inline-block px-2 py-1 rounded">✅ Claimed</p>}
                            </div>
                        ))}
                    </div>
                    {unreadCount > 0 && <button onClick={markInboxRead} className="w-full py-3 bg-blue-600 text-white font-bold text-sm hover:opacity-90">Mark All as Read</button>}
                </div>
            </div>
        )}

        {/* SUPPORT MODAL (Replacing ChatHub) */}
        {showSupportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Headphones size={32} className="text-blue-600" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">Need Help?</h3>
                    <p className="text-sm text-slate-500 mb-6">
                        Contact Admin directly for support, subscription issues, or questions.
                    </p>
                    
                    <button 
                        onClick={handleSupportEmail}
                        className="w-full bg-green-500 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-green-600 transition-all flex items-center justify-center gap-2 mb-3"
                    >
                        <Mail size={20} /> Email Support
                    </button>
                    
                    <button 
                        onClick={() => setShowSupportModal(false)} 
                        className="w-full py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl"
                    >
                        Close
                    </button>
                </div>
            </div>
        )}

        {isLoadingContent && <LoadingOverlay dataReady={isDataReady} onComplete={onLoadingComplete} />}
        {activeExternalApp && <div className="fixed inset-0 z-50 bg-white flex flex-col"><div className="flex items-center justify-between p-4 border-b bg-slate-50"><button onClick={() => setActiveExternalApp(null)} className="p-2 bg-white rounded-full border shadow-sm"><X size={20} /></button><p className="font-bold text-slate-700">External App</p><div className="w-10"></div></div><iframe src={activeExternalApp} className="flex-1 w-full border-none" title="External App" allow="camera; microphone; geolocation; payment" /></div>}
        {pendingApp && <CreditConfirmationModal title={`Access ${pendingApp.app.name}`} cost={pendingApp.cost} userCredits={user.credits} isAutoEnabledInitial={!!user.isAutoDeductEnabled} onCancel={() => setPendingApp(null)} onConfirm={(auto) => processAppAccess(pendingApp.app, pendingApp.cost, auto)} />}
        
        {/* GLOBAL ALERT MODAL */}
        <CustomAlert 
            isOpen={alertConfig.isOpen}
            type={alertConfig.type}
            title={alertConfig.title}
            message={alertConfig.message}
            onClose={() => setAlertConfig(prev => ({...prev, isOpen: false}))}
        />

        {showChat && <UniversalChat user={user} onClose={() => setShowChat(false)} />}

        {/* AI INTERSTITIAL */}
        {/* ... (existing ai interstitial code if any) ... */}

        {/* EXPIRY POPUP */}
        <ExpiryPopup 
            isOpen={showExpiryPopup}
            onClose={() => setShowExpiryPopup(false)}
            expiryDate={user.subscriptionEndDate || new Date().toISOString()}
            onRenew={() => {
                setShowExpiryPopup(false);
                onTabChange('STORE');
            }}
        />

        {showMonthlyReport && <MonthlyMarksheet user={user} settings={settings} onClose={() => setShowMonthlyReport(false)} reportType={marksheetType} />}
        {showReferralPopup && <ReferralPopup user={user} onClose={() => setShowReferralPopup(false)} onUpdateUser={handleUserUpdate} />}

        {/* SIDEBAR OVERLAY */}
        {showSidebar && (
            <div className="fixed inset-0 z-[100] flex animate-in fade-in duration-200">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                    onClick={() => setShowSidebar(false)}
                ></div>

                {/* Sidebar Panel */}
                <div className="w-64 bg-white h-full shadow-2xl relative z-10 flex flex-col slide-in-from-left duration-300">
                    <div className="p-6 bg-slate-900 text-white rounded-br-3xl">
                        <h2 className="text-2xl font-black italic mb-1">{settings?.appName || 'App'}</h2>
                        <p className="text-xs text-slate-400">Student Menu</p>
                        <button onClick={() => setShowSidebar(false)} className="absolute top-4 right-4 text-white/50 hover:text-white">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {/* REORDERED MENU as per request */}
                        <button onClick={() => { setShowInbox(true); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                            <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg"><Mail size={20} /></div>
                            Inbox
                        </button>
                        <button onClick={() => { onTabChange('ANALYTICS'); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg"><BarChart3 size={20} /></div>
                            Analytics
                        </button>
                        <button onClick={() => { setShowMonthlyReport(true); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                            <div className="bg-green-100 text-green-600 p-2 rounded-lg"><FileText size={20} /></div>
                            Marksheet
                        </button>
                        <button onClick={() => { onTabChange('HISTORY'); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                            <div className="bg-slate-100 text-slate-600 p-2 rounded-lg"><History size={20} /></div>
                            History
                        </button>
                        <button onClick={() => { onTabChange('SUB_HISTORY'); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                            <div className="bg-purple-100 text-purple-600 p-2 rounded-lg"><CreditCard size={20} /></div>
                            My Plan
                        </button>
                        {isGameEnabled && (
                            <button onClick={() => { onTabChange('GAME'); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                                <div className="bg-orange-100 text-orange-600 p-2 rounded-lg"><Gamepad2 size={20} /></div>
                                Play Game
                            </button>
                        )}
                        <button onClick={() => { onTabChange('REDEEM'); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                            <div className="bg-pink-100 text-pink-600 p-2 rounded-lg"><Gift size={20} /></div>
                            Redeem
                        </button>
                        <button onClick={() => { onTabChange('PRIZES'); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                            <div className="bg-yellow-100 text-yellow-600 p-2 rounded-lg"><Trophy size={20} /></div>
                            Prizes
                        </button>
                        {/* RESTORED: Request Content */}
                        <button onClick={() => { setShowRequestModal(true); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700">
                            <div className="bg-purple-100 text-purple-600 p-2 rounded-lg"><Megaphone size={20} /></div>
                            Request Content
                        </button>

                        {/* EXTERNAL APPS (Admin Configured) */}
                        {settings?.externalApps?.map(app => (
                            <button
                                key={app.id}
                                onClick={() => { handleExternalAppClick(app); setShowSidebar(false); }}
                                className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700"
                            >
                                <div className="bg-cyan-100 text-cyan-600 p-2 rounded-lg">
                                    {app.icon ? <img src={app.icon} alt="" className="w-5 h-5"/> : <Smartphone size={20} />}
                                </div>
                                {app.name}
                                {app.isLocked && <Lock size={14} className="text-red-500 ml-auto" />}
                            </button>
                        ))}

                        {/* NEW: What's New / Blogger Hub */}
                        <button onClick={() => { onTabChange('CUSTOM_PAGE'); setShowSidebar(false); }} className="w-full p-4 rounded-xl flex items-center gap-4 hover:bg-slate-50 transition-colors font-bold text-slate-700 relative">
                            <div className="bg-teal-100 text-teal-600 p-2 rounded-lg"><Zap size={20} /></div>
                            What's New
                            {hasNewUpdate && (
                                <span className="absolute top-4 right-4 w-3 h-3 bg-red-500 rounded-full animate-pulse border-2 border-white"></span>
                            )}
                        </button>
                    </div>

                    <div className="p-4 border-t border-slate-100">
                        <div className="bg-slate-50 p-4 rounded-xl flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                                {user.name.charAt(0)}
                            </div>
                            <div className="overflow-hidden">
                                <p className="font-bold text-sm truncate text-slate-800">{user.name}</p>
                                <p className="text-xs text-slate-500 truncate">{user.id}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* NOTIFICATIONS FLOAT BUTTON (New Requirement) */}
        {activeTab === 'HOME' && (
            <button
                onClick={() => onTabChange('UPDATES')}
                className="fixed top-24 right-4 z-40 bg-white p-3 rounded-full shadow-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:scale-110 transition-all active:scale-95"
            >
                <Bell size={20} />
                {hasNewUpdate && (
                    <span className="absolute top-0 right-0 w-3 h-3 bg-red-600 rounded-full border-2 border-white animate-pulse"></span>
                )}
            </button>
        )}

        <StudentAiAssistant 
            user={user} 
            settings={settings} 
            isOpen={activeTab === 'AI_CHAT'} 
            onClose={() => onTabChange('HOME')} 
        />
    </div>
  );
};
