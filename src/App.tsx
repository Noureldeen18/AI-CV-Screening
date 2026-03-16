import React, { useState, useEffect, useRef } from 'react';
import { JobProfile, CandidateResult, screenCV, suggestProfile, generateAudioSummary, playPCM } from './services/gemini';
import { Plus, Upload, Trash2, Loader2, Search, FileText, Briefcase, User, Star, Volume2, AlertCircle, Moon, Sun, Globe, Edit, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translations, Language } from './i18n';

export default function App() {
  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  
  const [candidates, setCandidates] = useState<CandidateResult[]>(() => {
    const saved = localStorage.getItem('hr_candidates');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
        (!('darkMode' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('language') as Language) || 'ar';
  });
  
  const t = translations[language];
  
  // Form State
  const [newProfile, setNewProfile] = useState<Partial<JobProfile>>({});
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Search & Filter State
  const [profileSearch, setProfileSearch] = useState('');
  const [profileSort, setProfileSort] = useState<'newest' | 'name'>('newest');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateSort, setCandidateSort] = useState<'score_desc' | 'score_asc' | 'name'>('score_desc');
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'success' | 'processing' | 'error'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('hr_profiles');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfiles(parsed);
        if (parsed.length > 0) setSelectedProfileId(parsed[0].id);
      } catch (e) {
        console.error("Failed to parse profiles", e);
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('hr_candidates', JSON.stringify(candidates));
  }, [candidates]);

  const saveProfiles = (newProfiles: JobProfile[]) => {
    setProfiles(newProfiles);
    localStorage.setItem('hr_profiles', JSON.stringify(newProfiles));
  };

  const handleCreateOrUpdateProfile = () => {
    if (!newProfile.title) return;
    
    if (editingProfileId) {
      const updated = profiles.map(p => p.id === editingProfileId ? { ...p, ...newProfile } as JobProfile : p);
      saveProfiles(updated);
    } else {
      const profile: JobProfile = {
        id: crypto.randomUUID(),
        title: newProfile.title || '',
        field: newProfile.field || '',
        experience: newProfile.experience || '',
        skills: newProfile.skills || '',
        other: newProfile.other || '',
        createdAt: Date.now()
      };
      const updated = [...profiles, profile];
      saveProfiles(updated);
      setSelectedProfileId(profile.id);
    }
    
    setIsCreatingProfile(false);
    setEditingProfileId(null);
    setNewProfile({});
  };

  const handleEditProfileClick = (profile: JobProfile) => {
    setNewProfile(profile);
    setEditingProfileId(profile.id);
    setIsCreatingProfile(true);
  };

  const handleDeleteProfile = (id: string) => {
    const updated = profiles.filter(p => p.id !== id);
    saveProfiles(updated);
    if (selectedProfileId === id) {
      setSelectedProfileId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleSuggestProfile = async () => {
    if (!newProfile.title) return;
    setIsSuggesting(true);
    try {
      const suggestions = await suggestProfile(newProfile.title, language);
      setNewProfile(prev => ({
        ...prev,
        field: suggestions.field || prev.field,
        experience: suggestions.experience || prev.experience,
        skills: suggestions.skills || prev.skills,
        other: suggestions.other || prev.other
      }));
    } catch (error) {
      console.error("Failed to suggest profile", error);
      alert(t.errorSuggesting);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const profile = profiles.find(p => p.id === selectedProfileId);
    if (!profile) {
      alert(t.selectProfileFirst);
      return;
    }

    const newCandidates: CandidateResult[] = Array.from(files).map((file: File) => ({
      id: crypto.randomUUID(),
      profileId: profile.id,
      fileName: file.name,
      candidateName: t.analyzingName,
      score: 0,
      keyStrengths: [],
      summary: '',
      status: 'pending'
    }));

    setCandidates(prev => [...newCandidates, ...prev]);

    await Promise.all(Array.from(files).map(async (file: File, i) => {
      const candidateId = newCandidates[i].id;
      
      setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, status: 'processing' } : c));
      
      try {
        const result = await screenCV(file, profile, language);
        setCandidates(prev => prev.map(c => c.id === candidateId ? {
          ...c,
          ...result,
          status: 'success'
        } : c));
      } catch (error: any) {
        console.error("Error screening CV", error);
        setCandidates(prev => prev.map(c => c.id === candidateId ? {
          ...c,
          status: 'error',
          error: error.message || t.unknownError
        } : c));
      }
    }));
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePlayAudio = async (text: string, candidateId: string) => {
    try {
      const audioBase64 = await generateAudioSummary(text);
      await playPCM(audioBase64);
    } catch (error) {
      console.error("Audio generation failed", error);
      alert(t.errorAudio);
    }
  };

  const handleExportCSV = () => {
    if (!selectedProfileId) return;
    const profileCands = candidates.filter(c => c.profileId === selectedProfileId);
    
    const BOM = '\uFEFF';
    const headers = [t.name, t.file, t.score, t.status, t.strengths, t.summary];
    
    const rows = profileCands.map(c => [
      `"${c.candidateName.replace(/"/g, '""')}"`,
      `"${c.fileName.replace(/"/g, '""')}"`,
      c.score,
      `"${c.status}"`,
      `"${(c.keyStrengths || []).join(' - ').replace(/"/g, '""')}"`,
      `"${(c.summary || '').replace(/"/g, '""')}"`
    ]);
    
    const csvContent = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${selectedProfileId}.csv`;
    link.click();
  };

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  
  // Filter & Sort Profiles
  const filteredProfiles = profiles
    .filter(p => p.title.toLowerCase().includes(profileSearch.toLowerCase()) || p.field.toLowerCase().includes(profileSearch.toLowerCase()))
    .sort((a, b) => {
      if (profileSort === 'name') return a.title.localeCompare(b.title);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  // Filter & Sort Candidates
  const currentCandidates = candidates
    .filter(c => c.profileId === selectedProfileId)
    .filter(c => candidateFilter === 'all' || c.status === candidateFilter)
    .filter(c => c.candidateName.toLowerCase().includes(candidateSearch.toLowerCase()) || c.fileName.toLowerCase().includes(candidateSearch.toLowerCase()))
    .sort((a, b) => {
      if (candidateSort === 'score_desc') return b.score - a.score;
      if (candidateSort === 'score_asc') return a.score - b.score;
      return a.candidateName.localeCompare(b.candidateName);
    });

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-blue-950 dark:bg-slate-900 border-e border-blue-900 dark:border-slate-800 p-6 flex flex-col h-screen sticky top-0 overflow-y-auto transition-colors duration-200 shadow-xl z-20">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3 text-orange-500">
            <Briefcase size={32} />
            <h1 className="text-xl font-bold text-white">{t.appTitle}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 bg-blue-900/50 p-1.5 rounded-xl">
          <button 
            onClick={() => setLanguage(l => l === 'ar' ? 'en' : 'ar')}
            className="flex-1 py-1.5 text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-blue-800 font-bold text-sm flex justify-center items-center gap-2"
            title="Toggle Language"
          >
            <Globe size={16} />
            {language === 'ar' ? 'English' : 'عربي'}
          </button>
          <div className="w-px h-4 bg-blue-800"></div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="flex-1 py-1.5 text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-blue-800 flex justify-center items-center"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white">{t.jobProfiles}</h2>
          <button 
            onClick={() => {
              setNewProfile({});
              setEditingProfileId(null);
              setIsCreatingProfile(true);
            }}
            className="p-2 bg-orange-500/20 text-orange-400 rounded-full hover:bg-orange-500 hover:text-white transition-colors"
            title={t.createProfile}
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Profile Search & Sort */}
        <div className="mb-4 space-y-2">
          <div className="relative">
            <Search className="absolute top-2.5 start-3 text-blue-400" size={16} />
            <input 
              type="text" 
              placeholder={t.searchProfiles}
              value={profileSearch}
              onChange={e => setProfileSearch(e.target.value)}
              className="w-full p-2 ps-9 rounded-lg bg-blue-900/50 border border-blue-800/50 text-white placeholder-blue-400 focus:ring-1 focus:ring-orange-500 outline-none text-sm transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setProfileSort('newest')}
              className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${profileSort === 'newest' ? 'bg-orange-500 text-white' : 'bg-blue-900/30 text-blue-300 hover:bg-blue-800'}`}
            >
              {t.sortByNewest}
            </button>
            <button 
              onClick={() => setProfileSort('name')}
              className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${profileSort === 'name' ? 'bg-orange-500 text-white' : 'bg-blue-900/30 text-blue-300 hover:bg-blue-800'}`}
            >
              {t.sortByName}
            </button>
          </div>
        </div>

        <div className="space-y-2 flex-1 overflow-y-auto pe-1 custom-scrollbar">
          {filteredProfiles.length === 0 && !isCreatingProfile && (
            <div className="text-center p-6 bg-blue-900/20 rounded-xl border border-dashed border-blue-800/50 text-blue-400 text-sm">
              {t.noProfiles}
            </div>
          )}
          
          {filteredProfiles.map(profile => (
            <div 
              key={profile.id}
              onClick={() => { setSelectedProfileId(profile.id); setIsCreatingProfile(false); setEditingProfileId(null); }}
              className={`p-4 rounded-xl border-s-4 cursor-pointer transition-all ${selectedProfileId === profile.id ? 'border-orange-500 bg-blue-900 dark:bg-slate-800 shadow-md' : 'border-transparent hover:border-orange-500/50 hover:bg-blue-900/50 dark:hover:bg-slate-800/50'}`}
            >
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-white text-sm">{profile.title}</h3>
                <div className="flex gap-1.5">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleEditProfileClick(profile); }}
                    className="text-blue-400 hover:text-orange-400 transition-colors p-1"
                    title={t.edit}
                  >
                    <Edit size={14} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteProfile(profile.id); }}
                    className="text-blue-400 hover:text-red-400 transition-colors p-1"
                    title={t.delete}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-blue-300 mt-1 line-clamp-1">{profile.field}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-10 overflow-y-auto">
        
        {/* Create/Edit Profile Modal/Section */}
        <AnimatePresence>
          {(isCreatingProfile || editingProfileId) && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 mb-8 transition-colors duration-200"
            >
              <h2 className="text-2xl font-bold mb-6 text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {editingProfileId ? <Edit className="text-orange-500" /> : <Plus className="text-orange-500" />}
                {editingProfileId ? t.editProfile : t.createProfile}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                <div className="col-span-1 md:col-span-2 flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t.jobTitle}</label>
                    <input 
                      type="text" 
                      value={newProfile.title || ''}
                      onChange={e => setNewProfile({...newProfile, title: e.target.value})}
                      className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                      placeholder={t.jobTitlePlaceholder}
                    />
                  </div>
                  <div className="flex items-end">
                    <button 
                      onClick={handleSuggestProfile}
                      disabled={!newProfile.title || isSuggesting}
                      className="h-[52px] px-5 bg-blue-950 dark:bg-slate-800 text-white rounded-xl hover:bg-blue-900 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors w-full sm:w-auto font-medium"
                    >
                      {isSuggesting ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                      <span>{t.suggestReqs}</span>
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t.field}</label>
                  <input 
                    type="text" 
                    value={newProfile.field || ''}
                    onChange={e => setNewProfile({...newProfile, field: e.target.value})}
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t.experience}</label>
                  <input 
                    type="text" 
                    value={newProfile.experience || ''}
                    onChange={e => setNewProfile({...newProfile, experience: e.target.value})}
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                  />
                </div>
                
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t.skills}</label>
                  <textarea 
                    value={newProfile.skills || ''}
                    onChange={e => setNewProfile({...newProfile, skills: e.target.value})}
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none min-h-[100px] transition-all"
                  />
                </div>
                
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{t.otherReqs}</label>
                  <textarea 
                    value={newProfile.other || ''}
                    onChange={e => setNewProfile({...newProfile, other: e.target.value})}
                    className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none min-h-[100px] transition-all"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button 
                  onClick={() => { setIsCreatingProfile(false); setEditingProfileId(null); }}
                  className="px-6 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={handleCreateOrUpdateProfile}
                  disabled={!newProfile.title}
                  className="px-6 py-2.5 rounded-xl bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors font-medium shadow-md shadow-orange-500/20"
                >
                  {t.saveProfile}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Profile & Upload */}
        {!(isCreatingProfile || editingProfileId) && selectedProfile && (
          <div className="mb-10">
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 mb-6 transition-colors duration-200">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                  <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">{selectedProfile.title}</h2>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">{selectedProfile.field}</span>
                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">{selectedProfile.experience}</span>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <input 
                    type="file" 
                    multiple 
                    accept=".pdf,image/png,image/jpeg" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 lg:flex-none px-6 py-3.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-medium flex justify-center items-center gap-2 shadow-lg shadow-orange-500/20"
                  >
                    <Upload size={20} />
                    {t.uploadScreen}
                  </button>
                  {candidates.filter(c => c.profileId === selectedProfileId).length > 0 && (
                    <button 
                      onClick={handleExportCSV}
                      className="flex-1 lg:flex-none px-6 py-3.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium flex justify-center items-center gap-2 shadow-sm"
                    >
                      <Download size={20} />
                      {t.exportReport}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Candidates Section */}
            {candidates.filter(c => c.profileId === selectedProfileId).length > 0 && (
              <div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">{t.screeningResults}</h3>
                  
                  {/* Filters & Search */}
                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="absolute top-3 start-3 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder={t.searchCandidates}
                        value={candidateSearch}
                        onChange={e => setCandidateSearch(e.target.value)}
                        className="w-full p-2.5 ps-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none text-sm transition-all"
                      />
                    </div>
                    <select 
                      value={candidateSort}
                      onChange={e => setCandidateSort(e.target.value as any)}
                      className="p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none text-sm transition-all"
                    >
                      <option value="score_desc">{t.sortByScoreDesc}</option>
                      <option value="score_asc">{t.sortByScoreAsc}</option>
                      <option value="name">{t.sortByName}</option>
                    </select>
                    <select 
                      value={candidateFilter}
                      onChange={e => setCandidateFilter(e.target.value as any)}
                      className="p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none text-sm transition-all"
                    >
                      <option value="all">{t.filterAll}</option>
                      <option value="success">{t.filterSuccess}</option>
                      <option value="processing">{t.filterProcessing}</option>
                      <option value="error">{t.filterError}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  <AnimatePresence>
                    {currentCandidates.map(candidate => (
                      <motion.div 
                        key={candidate.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col h-full relative overflow-hidden transition-colors duration-200"
                      >
                        {candidate.status === 'processing' && (
                          <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                            <Loader2 className="animate-spin text-orange-500 mb-3" size={32} />
                            <p className="text-blue-950 dark:text-blue-300 font-medium">{t.analyzing}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{candidate.fileName}</p>
                          </div>
                        )}
                        
                        {candidate.status === 'error' && (
                          <div className="absolute inset-0 bg-red-50/90 dark:bg-red-900/90 backdrop-blur-sm flex flex-col items-center justify-center z-10 p-6 text-center">
                            <AlertCircle className="text-red-500 dark:text-red-400 mb-3" size={32} />
                            <p className="text-red-800 dark:text-red-200 font-bold mb-1">{t.analysisFailed}</p>
                            <p className="text-sm text-red-600 dark:text-red-300">{candidate.error}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">{candidate.fileName}</p>
                          </div>
                        )}

                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-400">
                              <User size={24} />
                            </div>
                            <div>
                              <h4 className="font-bold text-lg text-slate-800 dark:text-slate-200 line-clamp-1">{candidate.candidateName}</h4>
                              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <FileText size={12} />
                                <span className="line-clamp-1" dir="ltr">{candidate.fileName}</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                              candidate.score >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400' : 
                              candidate.score >= 50 ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400' : 
                              'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                            }`}>
                              {candidate.score}
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium uppercase tracking-wider">{t.score}</span>
                          </div>
                        </div>

                        <div className="mb-4 flex-1">
                          <h5 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1">
                            <Star size={14} className="text-orange-500" />
                            {t.strengths}
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {candidate.keyStrengths?.map((strength, i) => (
                              <span key={i} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs rounded-lg font-medium">
                                {strength}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50">
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                            {candidate.summary}
                          </p>
                          <button 
                            onClick={() => handlePlayAudio(candidate.summary, candidate.id)}
                            className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 font-medium transition-colors"
                          >
                            <Volume2 size={16} />
                            {t.listenSummary}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        )}

        {!(isCreatingProfile || editingProfileId) && !selectedProfile && profiles.length > 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-600">
            <Briefcase size={64} className="mb-4 opacity-20" />
            <p className="text-lg">{t.selectProfilePrompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}
