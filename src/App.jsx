import React, { useState, useEffect, useRef } from 'react';
import logoIcon from './Icon/Goolge頁面Icon.png';


// Helper to normalize English locations/countries/job types to Chinese for fuzzy matching
const normalizeLocation = (locStr) => {
  if (!locStr) return '';
  let s = locStr.toLowerCase();
  
  const mappings = {
    'new taipei': '新北',
    'taipei': '台北',
    'keelung': '基隆',
    'taoyuan': '桃園',
    'hsinchu': '新竹',
    'miaoli': '苗栗',
    'taichung': '台中',
    'changhua': '彰化',
    'nantou': '南投',
    'yunlin': '雲林',
    'chiayi': '嘉義',
    'tainan': '台南',
    'kaohsiung': '高雄',
    'pingtung': '屏東',
    'yilan': '宜蘭',
    'hualien': '花蓮',
    'taitung': '台東',
    'penghu': '澎湖',
    'kinmen': '金門',
    'matsu': '連江',
    'taiwan': '台灣'
  };

  for (const [eng, chi] of Object.entries(mappings)) {
    if (s.includes(eng)) {
      return chi;
    }
  }
  return locStr;
};

// Web Audio API Synthesizer for tech-style notification sound (Ding-Dong chime)
const playSuccessSound = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // First note (C5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    gain1.gain.setValueAtTime(0.08, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.12);
    
    // Second note (E5) delayed slightly for the ding-dong effect
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('播放成功音效失敗:', e);
  }
};

// Helper functions for matching 104 generic boilerplate skills
const isGenericSkill = (skill) => {
  const s = skill.trim().replace(/\s+/g, '').toLowerCase(); // strip spaces and lowercase
  const genericKeywords = [
    '電腦繪圖軟體操作', '繪圖工具與軟體操作', '設計表現能力', '色彩調配能力', 
    '色彩整合與應用', '平面設計規劃', '數位攝影技術', '廣告創意企劃', 
    '插畫表現技巧', '多媒體企劃設計', '電腦排版設計', '電腦系統操作', 
    '文書處理軟體操作', '簡報軟體操作', '試算表軟體操作', '作業系統基本操作',
    '基本電腦操作', '硬體裝設與維護', '基礎電腦概念', '多媒體影像處理',
    '視覺設計相關知識', '電腦視覺', '電腦動畫設計', '視覺設計', '電腦動畫', '遊戲設計',
    // English counterparts
    'computervision', 'visualdesign', 'computeranimation', 'gamedesign',
    'colortheory', 'colorintegration', 'graphicdesign', 'multimediadesign',
    'illustration', 'photography', 'basiccomputer', 'office', 'wordprocessing',
    'presentation', 'spreadsheet', 'operatingsystem', 'hardwaremaintenance',
    'computerdrafting', 'drawingtools', 'layoutdesign'
  ];
  return genericKeywords.some(gk => {
    const cleanedGk = gk.replace(/\s+/g, '').toLowerCase();
    return s.includes(cleanedGk) || cleanedGk.includes(s);
  });
};

const checkGenericSkillMatch = (skill, resumeLowerText) => {
  const s = skill.trim().replace(/\s+/g, '').toLowerCase();
  
  // Force match for the user's confirmed skills and other standard design/office boilerplate
  const forceMatchSkills = [
    '電腦繪圖軟體操作', '繪圖工具與軟體操作', '多媒體影像處理', '設計表現能力',
    '視覺設計相關知識', '遊戲設計', '電腦視覺', '電腦動畫設計',
    '電腦繪圖', '繪圖工具', '設計表現', '多媒體影像', '色彩調配', '色彩整合',
    '平面設計', '多媒體企劃', '電腦排版', '插畫表現', '文書處理', '簡報',
    '試算表', '基本電腦', '電腦系統', '作業系統', '電腦操作', '視覺設計', '遊戲設計',
    '電腦視覺', '電腦動畫',
    // English counterparts
    'computervision', 'visualdesign', 'computeranimation', 'gamedesign',
    'colortheory', 'colorintegration', 'graphicdesign', 'multimediadesign',
    'illustration', 'photography', 'basiccomputer', 'office', 'wordprocessing',
    'presentation', 'spreadsheet', 'operatingsystem', 'hardwaremaintenance',
    'computerdrafting', 'drawingtools', 'layoutdesign'
  ];
  
  const cleanedForce = forceMatchSkills.map(f => f.replace(/\s+/g, '').toLowerCase());
  if (cleanedForce.some(f => s.includes(f) || f.includes(s))) {
    return true;
  }
  
  const computerDraw = ['blender', 'maya', '3ds', 'photoshop', 'illustrator', 'zbrush', 'substance', 'cad', 'drawing', 'art', 'design', '繪圖', '設計', '美術'];
  const multimedia = ['多媒體', '影像', '影片', '剪輯', '後製', '動畫', 'video', 'editing', 'photoshop', 'premiere', 'ae', 'blender', 'maya'];
  const designExpress = ['設計', '美術', '作品', 'portfolio', '3d', '2d', '繪圖', 'visual', 'art', 'design', 'modeling', 'rendering', '表現'];
  const basicOffice = ['office', 'word', 'excel', 'ppt', 'powerpoint', '文書', '簡報', '試算表', '電腦操作'];

  if (s.includes('電腦繪圖') || s.includes('繪圖工具')) {
    return computerDraw.some(kw => resumeLowerText.includes(kw));
  }
  if (s.includes('多媒體') || s.includes('影像')) {
    return multimedia.some(kw => resumeLowerText.includes(kw));
  }
  if (s.includes('設計表現')) {
    return designExpress.some(kw => resumeLowerText.includes(kw));
  }
  if (s.includes('文書') || s.includes('簡報') || s.includes('試算表') || s.includes('基本電腦') || s.includes('電腦系統')) {
    return basicOffice.some(kw => resumeLowerText.includes(kw)) || true;
  }
  
  return false;
};


export default function App() {
  // Config & State
  const [apiKey, setApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('qwen2.5:7b');
  const [resumeText, setResumeText] = useState('');
  const [resumeName, setResumeName] = useState('');
  const [targetUrl, setTargetUrl] = useState('https://www.104.com.tw/jobs/search/?area=6001001000%2C6001002000&jobsource=index_s&keyword=3D&mode=s&page=1');
  
  const [criteria, setCriteria] = useState({
    techSkills: '3d,3d美術,3d建模',
    location: '台北市,新北市',
    jobType: '全職',
    country: '台灣'
  });

  // Temporary local states for inputs to avoid high-frequency re-rendering/calculation lags
  const [tempTechSkills, setTempTechSkills] = useState('');
  const [tempLocation, setTempLocation] = useState('');
  const debounceTimerRef = useRef(null);

  // Sync temp values when criteria loads from localStorage
  useEffect(() => {
    setTempTechSkills(criteria.techSkills || '');
    setTempLocation(criteria.location || '');
  }, [criteria.techSkills, criteria.location]);

  const [maxJobs, setMaxJobs] = useState(15);
  const [isCrawling, setIsCrawling] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isBatchMatching, setIsBatchMatching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [sortBy, setSortBy] = useState('score');
  const [scoreFilter, setScoreFilter] = useState(0);
  
  // Advanced settings state
  const [aiBatchSize, setAiBatchSize] = useState(30);
  const [aiDelay, setAiDelay] = useState(1.0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [analysisMode, setAnalysisMode] = useState('gemini'); // 'gemini' or 'local'
  const [showGuide, setShowGuide] = useState(false);
  
  // Load API Key, Resume, and settings from localStorage if available
  useEffect(() => {
    const savedApiKey = localStorage.getItem('gemini_api_key');
    if (savedApiKey) setApiKey(savedApiKey);

    const savedResumeText = localStorage.getItem('resume_text');
    const savedResumeName = localStorage.getItem('resume_name');
    if (savedResumeText && savedResumeName) {
      setResumeText(savedResumeText);
      setResumeName(savedResumeName);
    }

    const savedTargetUrl = localStorage.getItem('target_url');
    if (savedTargetUrl) setTargetUrl(savedTargetUrl);

    const savedCriteria = localStorage.getItem('criteria');
    if (savedCriteria) {
      try {
        setCriteria(JSON.parse(savedCriteria));
      } catch (e) {
        console.error('Error parsing saved criteria:', e);
      }
    }

    const savedMaxJobs = localStorage.getItem('max_jobs');
    if (savedMaxJobs) setMaxJobs(parseInt(savedMaxJobs));

    const savedBatchSize = localStorage.getItem('ai_batch_size');
    if (savedBatchSize) setAiBatchSize(parseInt(savedBatchSize));

    const savedAiDelay = localStorage.getItem('ai_delay');
    if (savedAiDelay) setAiDelay(parseFloat(savedAiDelay));

    const savedAnalysisMode = localStorage.getItem('analysis_mode');
    if (savedAnalysisMode) setAnalysisMode(savedAnalysisMode);

    const savedOllamaUrl = localStorage.getItem('ollama_url');
    if (savedOllamaUrl) setOllamaUrl(savedOllamaUrl);

    const savedOllamaModel = localStorage.getItem('ollama_model');
    if (savedOllamaModel) setOllamaModel(savedOllamaModel);
  }, []);

  const handleApiKeyChange = (e) => {
    const value = e.target.value;
    setApiKey(value);
    localStorage.setItem('gemini_api_key', value);
  };

  const handleOllamaUrlChange = (e) => {
    const value = e.target.value;
    setOllamaUrl(value);
    localStorage.setItem('ollama_url', value);
  };

  const handleOllamaModelChange = (e) => {
    const value = e.target.value;
    setOllamaModel(value);
    localStorage.setItem('ollama_model', value);
  };

  const handleCriteriaChange = (key, value) => {
    setCriteria(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('criteria', JSON.stringify(next));
      return next;
    });
  };

  const handleCriteriaChangeDebounced = (key, value) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      handleCriteriaChange(key, value);
    }, 400); // 400ms debounce
  };

  // Resume Upload Handler
  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('目前僅支援 PDF 格式履歷檔案！');
      return;
    }

    const formData = new FormData();
    formData.append('resume', file);

    setStatusText('正在解析履歷 PDF 檔案...');
    setProgress(15);
    setIsMatching(true);

    try {
      const response = await fetch('/api/upload-resume', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '解析履歷失敗');

      setResumeText(data.text);
      setResumeName(file.name);
      localStorage.setItem('resume_text', data.text);
      localStorage.setItem('resume_name', file.name);
      setProgress(100);
      setStatusText('履歷上傳成功！');
      setTimeout(() => {
        setIsMatching(false);
        setProgress(0);
      }, 1500);
    } catch (err) {
      console.error(err);
      alert('上傳失敗: ' + err.message);
      setIsMatching(false);
      setProgress(0);
    }
  };

  const removeResume = () => {
    setResumeText('');
    setResumeName('');
    localStorage.removeItem('resume_text');
    localStorage.removeItem('resume_name');
  };

  const calculateLocalScore = (job, resumeText, criteria) => {
    let score = 50; // Base score
    const matches = [];
    const missingSkills = [];
    const hardMismatches = [];
    const softMismatches = [];

    const jobTitle = (job.title || '').toLowerCase();
    const jobDesc = (job.fullDescription || job.description || '').toLowerCase();
    const resumeLower = (resumeText || '').toLowerCase();
    const fullDescText = job.fullDescription || job.description || '';

    // Industry blacklist check (combining keyword blacklist and official industry classifications)
    const blacklistWords = [
      '美甲', '美睫', '美髮', '美容', '沙龍', '睫毛', '指甲', '紋繡', '美體', '芳療', '護膚', 'spa',
      '牙助', '牙醫', '牙科', '齒雕', '牙體技術', '診所助理', '掛號', '護理師', '護士', '藥師',
      '餐飲', '廚師', '洗碗', '外送', '送外賣', '吧台', '吧檯', '調酒', '門市店員', '收銀員',
      '髮型設計師', '美髮設計師', '洗頭助理', '美容師', '美容助理', '美甲師', '美睫師', '新娘秘書',
      '室內設計', '展覽設計', '展場設計', '空間設計', '室內裝修', '景觀設計', '會展設計', '展位設計', '裝潢', '空間規劃'
    ];

    const lowerTitle = jobTitle.toLowerCase();
    const lowerCompany = (job.company || '').toLowerCase();
    const matchedBlacklistWord = blacklistWords.find(word => 
      lowerTitle.includes(word) || lowerCompany.includes(word)
    );

    const industryLower = (job.industry || '').toLowerCase();
    const industryBlacklist = [
      '醫療', '診所', '美醫', '美甲', '美睫', '美髮', '美容', '美體', '沙龍', '餐飲', '批發', '零售', '百貨', '不動產', '保險', '餐館',
      '室內設計', '建築及裝潢', '裝潢設計', '景觀設計', '會議及展覽'
    ];
    const matchedIndustry = industryBlacklist.find(ind => industryLower.includes(ind));

    if (matchedBlacklistWord || matchedIndustry) {
      const reasonText = matchedBlacklistWord 
        ? `無關產業關鍵字: ${matchedBlacklistWord}` 
        : `官方無關產業分類: ${job.industry}`;
      return {
        score: 5,
        summary: `[本機排除] 職缺屬於無關產業 (${reasonText})。`,
        preFiltered: true,
        skipAiMatch: true,
        matchedSkills: [],
        missingSkills: criteria.techSkills ? criteria.techSkills.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [],
        locationMatch: { isMatch: false, reason: '無關產業已排除' },
        jobTypeMatch: { isMatch: false, reason: '無關產業已排除' },
        countryMatch: { isMatch: false, reason: '無關產業已排除' },
        advice: `此職缺所屬的產業（${job.industry || '非相關產業'}）或公司屬性與您的 3D/設計/科技專業背景完全不符。系統已自動將其排除。`
      };
    }

    // 1. Match country
    if (criteria.country && criteria.country !== '無特別指定' && criteria.country !== '全球') {
      const jobCountry = job.country || '台灣';
      const targetCountry = criteria.country.trim();
      const normJobCountry = (jobCountry.toLowerCase().includes('taiwan') || jobCountry.toLowerCase().includes('tw')) ? '台灣' : jobCountry;
      const normTargetCountry = (targetCountry.toLowerCase().includes('taiwan') || targetCountry.toLowerCase().includes('tw')) ? '台灣' : targetCountry;
      
      if (!normJobCountry.includes(normTargetCountry) && !normTargetCountry.includes(normJobCountry) &&
          !jobCountry.includes(targetCountry) && !targetCountry.includes(jobCountry)) {
        score -= 30;
        hardMismatches.push(`國家不符 (${jobCountry})`);
      } else {
        score += 5;
      }
    }

    // 2. Match job type
    if (criteria.jobType && criteria.jobType !== '無特別指定') {
      const isJobFullTime = job.isFullTime;
      const targetFullTime = criteria.jobType === '全職';
      if (isJobFullTime !== targetFullTime) {
        score -= 25;
        hardMismatches.push(`性質不符 (${isJobFullTime ? '全職' : '兼職/其他'})`);
      } else {
        score += 5;
      }
    }

    // 3. Match location
    if (criteria.location && criteria.location !== '無特別指定') {
      const jobLoc = job.location || '';
      const targetLocs = criteria.location.split(',').map(l => l.trim()).filter(Boolean);
      if (targetLocs.length > 0) {
        const matchLoc = targetLocs.some(loc => {
          // Check for remote/wfh match first
          const isRemoteQuery = loc.includes('遠端') || loc.includes('遠距') || loc.includes('遠程') || loc.includes('在家工作') || loc.toLowerCase().includes('remote') || loc.toLowerCase().includes('wfh') || loc.toLowerCase().includes('home');
          const isJobRemote = jobLoc.includes('遠端') || jobLoc.includes('遠距') || jobLoc.includes('遠程') || jobLoc.includes('在家工作') || jobLoc.toLowerCase().includes('remote') || jobLoc.toLowerCase().includes('wfh') || jobLoc.toLowerCase().includes('home');
          if (isRemoteQuery && isJobRemote) return true;

          const normJobLoc = normalizeLocation(jobLoc);
          const normLoc = normalizeLocation(loc);
          return jobLoc.toLowerCase().includes(loc.toLowerCase()) || 
                 loc.toLowerCase().includes(jobLoc.toLowerCase()) ||
                 normJobLoc.includes(normLoc) || 
                 normLoc.includes(normJobLoc);
        });
        if (!matchLoc) {
          score -= 25;
          hardMismatches.push(`地區不符 (${jobLoc})`);
        } else {
          score += 10;
        }
      }
    }

    // Parse 104 specific requirements
    const getRequirementField = (prefix) => {
      const regex = new RegExp(`${prefix}[:：]?\\s*([^\\n]+)`, 'i');
      const match = fullDescText.match(regex);
      return match ? match[1].trim() : '';
    };

    const reqWorkExp = getRequirementField('工作經驗');
    const reqEdu = getRequirementField('學歷要求');
    const reqTools = getRequirementField('擅長工具');
    const reqSkills = getRequirementField('工作技能');

    // 4. Match Work Experience
    const extractUserExpYears = (resume) => {
      const lower = resume.toLowerCase();
      // First, keep a collapsed space version for English regex
      const collapsed = lower.replace(/\s+/g, ' ');
      // Second, keep a completely space-stripped version for Chinese and dates
      const stripped = lower.replace(/\s+/g, '');

      const strippedRegexes = [
        /(\d+)(?:年(?:以上)?(?:工作)?經驗|年資|年(?:的)?工作經歷)/,
        /(?:工作經驗|年資|經歷)[:：](\d+)年/
      ];
      for (const regex of strippedRegexes) {
        const match = stripped.match(regex);
        if (match) return parseInt(match[1]);
      }

      const collapsedRegexes = [
        /(\d+)\s*years?\s*(?:of\s*)?experience/i
      ];
      for (const regex of collapsedRegexes) {
        const match = collapsed.match(regex);
        if (match) return parseInt(match[1]);
      }

      // Date range parsing (supports ROC years like 107.09 and AD years like 2018/09)
      const rangeRegex = /(\d{3,4})(?:[\.\/年](\d{1,2}))?(?:月)?(?:[~-]|至)(\d{3,4}|至今|現在|present)(?:[\.\/年](\d{1,2}))?/gi;
      
      let totalMonths = 0;
      let match;
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      const parseYear = (yearStr) => {
        let y = parseInt(yearStr);
        if (isNaN(y)) return null;
        if (y >= 50 && y < 1900) {
          return y + 1911; // 民國年轉西元年
        }
        return y;
      };

      while ((match = rangeRegex.exec(stripped)) !== null) {
        const startY = parseYear(match[1]);
        const startM = match[2] ? parseInt(match[2]) : 1;
        
        const endStr = match[3].trim().toLowerCase();
        let endY, endM;
        
        if (endStr === '至今' || endStr === '現在' || endStr === 'present') {
          endY = currentYear;
          endM = currentMonth;
        } else {
          endY = parseYear(match[3]);
          endM = match[4] ? parseInt(match[4]) : 12;
        }

        if (startY && endY) {
          const months = (endY - startY) * 12 + (endM - startM);
          if (months > 0) {
            totalMonths += months;
          }
        }
      }

      const calculatedYears = Math.round(totalMonths / 12);
      return calculatedYears > 0 ? calculatedYears : 0;
    };
    
    const userExpYears = extractUserExpYears(resumeLower);
    let requiredExpYears = 0;
    if (reqWorkExp && !reqWorkExp.includes('不拘') && !reqWorkExp.includes('無經驗')) {
      const numMatch = reqWorkExp.match(/(\d+)\s*年/);
      if (numMatch) {
        requiredExpYears = parseInt(numMatch[1]);
      }
    }
    
    if (requiredExpYears > 0) {
      if (userExpYears < requiredExpYears) {
        score -= 20;
        softMismatches.push(`年資不足 (要求 ${requiredExpYears} 年，履歷估計約 ${userExpYears} 年)`);
      } else {
        score += 5;
      }
    }

    // 5. Match Education Requirements
    const getEduLevel = (eduText) => {
      const lower = eduText.toLowerCase();
      // Remove all spaces for Chinese character checks to handle PDF extraction spacing issues
      const cleaned = lower.replace(/\s+/g, '');
      
      if (cleaned.includes('博士')) return 5;
      if (cleaned.includes('碩士') || cleaned.includes('研究所')) return 4;
      if (
        cleaned.includes('大學') || cleaned.includes('學士') || cleaned.includes('本科') || 
        cleaned.includes('技術學院') || cleaned.includes('學院') || cleaned.includes('科大') ||
        cleaned.includes('藝大') || cleaned.includes('體大') || cleaned.includes('警大') ||
        cleaned.includes('軍校') || cleaned.includes('官校') ||
        cleaned.includes('台大') || cleaned.includes('政大') || cleaned.includes('清大') || 
        cleaned.includes('交大') || cleaned.includes('成大') || cleaned.includes('師大') || 
        cleaned.includes('輔大') || cleaned.includes('實踐') || cleaned.includes('銘傳') || 
        cleaned.includes('世新') || cleaned.includes('淡江') || cleaned.includes('逢甲') ||
        cleaned.includes('中原') || cleaned.includes('元智') || cleaned.includes('文化') ||
        cleaned.includes('東吳') || cleaned.includes('東海') || cleaned.includes('大同') ||
        cleaned.includes('靜宜') || cleaned.includes('中華') || cleaned.includes('義守') ||
        cleaned.includes('長庚') || cleaned.includes('慈濟') || cleaned.includes('真理') ||
        cleaned.includes('大葉') || cleaned.includes('嶺東') || cleaned.includes('朝陽') ||
        cleaned.includes('明志') || cleaned.includes('崑山') || cleaned.includes('樹德') ||
        cleaned.includes('龍華') || cleaned.includes('輔仁') || cleaned.includes('東華') ||
        cleaned.includes('暨南') || cleaned.includes('聯合') || cleaned.includes('宜蘭') ||
        cleaned.includes('台東') || cleaned.includes('台南') || cleaned.includes('金門') ||
        lower.includes('bachelor') || lower.includes('university') || lower.includes('college')
      ) return 3;
      if (
        cleaned.includes('專科') || cleaned.includes('大專') || cleaned.includes('二專') || 
        cleaned.includes('三專') || cleaned.includes('五專') || cleaned.includes('商專') || 
        cleaned.includes('工專') || cleaned.includes('藝專') || cleaned.includes('醫專') || 
        cleaned.includes('農專') || lower.includes('associate')
      ) return 2;
      if (
        cleaned.includes('高中') || cleaned.includes('高職') || cleaned.includes('中學') ||
        cleaned.includes('商工') || cleaned.includes('高工') || cleaned.includes('高商') ||
        cleaned.includes('農工') || cleaned.includes('家商') ||
        lower.includes('seniorhigh') || lower.includes('senior high')
      ) return 1;
      return 0;
    };
    
    const userEduLevel = getEduLevel(resumeLower);
    let requiredEduLevel = 0;
    if (reqEdu && !reqEdu.includes('不拘')) {
      const levels = [];
      if (reqEdu.includes('博士')) levels.push(5);
      if (reqEdu.includes('碩士')) levels.push(4);
      if (reqEdu.includes('大學')) levels.push(3);
      if (reqEdu.includes('專科')) levels.push(2);
      if (reqEdu.includes('高中')) levels.push(1);
      
      if (levels.length > 0) {
        requiredEduLevel = Math.min(...levels);
      }
    }
    
    if (requiredEduLevel > 0) {
      if (userEduLevel < requiredEduLevel) {
        score -= 15;
        const eduNames = { 5: '博士', 4: '碩士', 3: '大學', 2: '專科', 1: '高中' };
        softMismatches.push(`學歷不符 (最低要求 ${eduNames[requiredEduLevel] || reqEdu}，履歷估計最高為 ${eduNames[userEduLevel] || '高中以下'})`);
      } else {
        score += 5;
      }
    }

    // Helper function to match keywords with word boundaries
    const matchKeyword = (text, keyword) => {
      if (!text || !keyword) return false;
      const lowerText = text.toLowerCase();
      let lowerKeyword = keyword.toLowerCase().trim();
      
      // Strip "adobe " prefix if present (e.g. "adobe photoshop" -> "photoshop")
      if (lowerKeyword.startsWith('adobe ')) {
        lowerKeyword = lowerKeyword.replace(/^adobe\s+/, '');
      }
      
      // Synonym mappings
      if (lowerKeyword === '3ds max' || lowerKeyword === '3dmax' || lowerKeyword === '3d max' || lowerKeyword === '3dsmax') {
        return /\b(3ds\s*max|3dmax|3d\s*max)\b/i.test(lowerText);
      }
      if (lowerKeyword === 'unreal' || lowerKeyword === 'unreal engine' || lowerKeyword === 'unrealengine' || lowerKeyword === 'ue4' || lowerKeyword === 'ue5') {
        return /\b(unreal|unreal\s*engine|ue4|ue5)\b/i.test(lowerText);
      }
      if (lowerKeyword === 'unity' || lowerKeyword === 'unity 3d' || lowerKeyword === 'unity3d') {
        return /\b(unity|unity\s*3d)\b/i.test(lowerText);
      }
      if (lowerKeyword === '3d美術' || lowerKeyword === '3d美術設計' || lowerKeyword === '3d art' || lowerKeyword === '3d artist' || lowerKeyword === '3d美術人員') {
        return /3d\s*美術|3d\s*art|3d\s*artist/i.test(lowerText);
      }
      if (lowerKeyword === '3d建模' || lowerKeyword === '3d 建模' || lowerKeyword === '3d model' || lowerKeyword === '3d modeler') {
        return /3d\s*建模|3d\s*model/i.test(lowerText);
      }
      
      // For Chinese or mixed keywords (contains Chinese characters)
      // Remove all spaces from both text and keyword before doing the check to handle PDF extraction spacing issues
      if (/[\u4e00-\u9fa5]/.test(lowerKeyword)) {
        const cleanedText = lowerText.replace(/\s+/g, '');
        const cleanedKeyword = lowerKeyword.replace(/\s+/g, '');
        return cleanedText.includes(cleanedKeyword);
      }
      
      const escaped = lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // If keyword is purely English letters and digits, use word boundaries
      if (/^[a-z0-9]+$/i.test(lowerKeyword)) {
        const regex = new RegExp('\\b' + escaped + '\\b', 'i');
        return regex.test(lowerText);
      }
      
      // Special cases for common technologies with symbols
      if (lowerKeyword === 'c++') {
        return /\bc\+\+([^a-z0-9]|$)/i.test(lowerText);
      }
      if (lowerKeyword === 'c#') {
        return /\bc#([^a-z0-9]|$)/i.test(lowerText);
      }
      
      // For other English keywords with symbols, use simple substring check
      return lowerText.includes(lowerKeyword);
    };



    const parseCommaList = (text) => {
      if (!text || text.includes('不拘') || text.includes('未填寫')) return [];
      return text.split(/[,，、]/).map(s => s.trim().toLowerCase()).filter(Boolean);
    };

    const targetTools = parseCommaList(reqTools);
    const targetSkills = parseCommaList(reqSkills);
    const jobRequiredKeywords = Array.from(new Set([...targetTools, ...targetSkills]));

    // Get user specified tech criteria
    const userSpecifiedSkills = [];
    if (criteria.techSkills && criteria.techSkills !== '無特別指定') {
      criteria.techSkills.split(',').forEach(s => {
        const cleaned = s.trim().toLowerCase();
        if (cleaned) userSpecifiedSkills.push(cleaned);
      });
    }

    const standardTechKeywords = [
      'react', 'vue', 'angular', 'node', 'express', 'koa', 'nest', 'python', 'django', 'flask', 'fastapi', 
      'java', 'spring', 'c++', 'c#', 'golang', 'php', 'laravel', 'mysql', 'postgresql', 'mongodb', 'redis', 
      'docker', 'k8s', 'aws', 'azure', 'gcp', 'git', 'ci/cd', 'unity', 'unreal', 'blender', 'maya', 
      '3ds max', '3dmax', 'zbrush', 'substance', 'photoshop', 'illustrator', 'figma', 'ui/ux', 'css', 
      'html', 'typescript', 'javascript', 'tailwind', 'sass', 'graphql', 'restful', 'webpack', 'vite', 
      'next.js', 'nuxt.js', 'three.js', 'webgl', 'shader', '3d建模', '3d美術', '3d動畫', '動作設計', '骨架綁定'
    ];

    const allCandidateSkills = Array.from(new Set([
      ...userSpecifiedSkills,
      ...standardTechKeywords,
      ...jobRequiredKeywords
    ]));

    // Define standard general-purpose DCC modeling tools group
    const dccGroup = ['maya', '3ds max', '3dmax', '3d max', '3dsmax', 'blender', 'cinema 4d', 'c4d'];

    // Separate DCC and Non-DCC required skills for this job
    const requiredDccSkillsInJob = [];
    const requiredNonDccSkillsInJob = [];

    allCandidateSkills.forEach(skill => {
      const isRequiredByJob = jobRequiredKeywords.some(s => s.toLowerCase() === skill.toLowerCase()) ||
                              matchKeyword(jobTitle, skill) ||
                              matchKeyword(jobDesc, skill);
      if (isRequiredByJob) {
        const normalizedSkill = skill.toLowerCase();
        const isDcc = dccGroup.some(dcc => dcc === normalizedSkill || normalizedSkill.startsWith(dcc) || dcc.startsWith(normalizedSkill));
        if (isDcc) {
          requiredDccSkillsInJob.push(skill);
        } else {
          requiredNonDccSkillsInJob.push(skill);
        }
      }
    });

    // Match DCC group: if user has ANY of the required DCC tools, count that one as matched and ignore the rest of the required DCC tools
    let dccMatched = false;
    const matchedDccList = [];

    requiredDccSkillsInJob.forEach(skill => {
      const inResume = matchKeyword(resumeLower, skill);
      if (inResume) {
        matchedDccList.push(skill);
        dccMatched = true;
      }
    });

    if (requiredDccSkillsInJob.length > 0) {
      if (dccMatched) {
        matchedDccList.forEach(skill => {
          if (!matches.includes(skill.toUpperCase())) {
            matches.push(skill.toUpperCase());
          }
        });
      } else {
        requiredDccSkillsInJob.forEach(skill => {
          if (!missingSkills.includes(skill.toUpperCase())) {
            missingSkills.push(skill.toUpperCase());
          }
        });
      }
    }

    // Match Non-DCC skills normally
    requiredNonDccSkillsInJob.forEach(skill => {
      const isGeneric = isGenericSkill(skill);
      const isMatched = isGeneric 
        ? checkGenericSkillMatch(skill, resumeLower)
        : matchKeyword(resumeLower, skill);
        
      if (isMatched) {
        if (!matches.includes(skill.toUpperCase())) {
          matches.push(skill.toUpperCase());
        }
      } else {
        if (!missingSkills.includes(skill.toUpperCase())) {
          missingSkills.push(skill.toUpperCase());
        }
      }
    });

    // Score calculations
    const totalJobSkillsCount = matches.length + missingSkills.length;
    if (totalJobSkillsCount > 0) {
      const matchRatio = matches.length / totalJobSkillsCount;
      score += Math.round(matchRatio * 30);
      
      // Penalty for missing 104 specified required skills
      let missingDccPenaltyApplied = false;
      const missingRequiredJobSkills = jobRequiredKeywords.filter(s => {
        const isDcc = dccGroup.some(dcc => dcc === s.toLowerCase() || s.toLowerCase().startsWith(dcc) || dcc.startsWith(s.toLowerCase()));
        if (isDcc) {
          if (dccMatched) return false;
          if (missingDccPenaltyApplied) return false;
          missingDccPenaltyApplied = true;
          return true;
        }
        return !matchKeyword(resumeLower, s);
      });

      if (missingRequiredJobSkills.length > 0) {
        const penalty = Math.min(missingRequiredJobSkills.length * 10, 30);
        score -= penalty;
      }
    }

    // 7. General Resume Keyword Overlap (English technical terms) fallback
    const extractEngWords = (text) => {
      return new Set((text.match(/[a-zA-Z0-9\+#\.]+/g) || []).map(w => w.toLowerCase()).filter(w => w.length > 1));
    };

    const resumeWords = extractEngWords(resumeLower);
    const jobWords = extractEngWords(jobDesc);
    
    let overlapCount = 0;
    const overlapWords = [];
    resumeWords.forEach(word => {
      const stopWords = ['and', 'the', 'of', 'to', 'in', 'for', 'with', 'on', 'at', 'by', 'an', 'is', 'are', 'was', 'were', 'as', 'it', 'its', 'this', 'that', 'or', 'be', 'from', '104', 'api', 'com', 'tw', 'http', 'https', 'job', 'work', 'experience', 'skills'];
      if (stopWords.includes(word)) return;
      if (!isNaN(word)) return; // Skip pure numbers
      
      if (jobWords.has(word)) {
        overlapCount++;
        const wordUpper = word.toUpperCase();
        if (overlapWords.length < 6 && !matches.includes(wordUpper)) {
          overlapWords.push(word);
        }
      }
    });

    const bonus = Math.min(overlapCount * 2.0, 10);
    score += bonus;

    // Clamp score before sub-role check
    score = Math.max(0, Math.min(100, score));

     // 8. 3D Sub-role Mismatch Check (Modeling/Art vs Animation/Rigging vs Programming/TA)
     const animationKeywords = ['動畫', '動作', '動態', '骨架', '綁定', 'animator', 'animation', 'rig', 'rigging', 'motion', 'keyframe', '動態捕捉'];
     const programmingKeywords = ['程式', '引擎', 'ta', 'technical art', 'shader', 'unity', 'unreal', 'ue4', 'ue5', 'c++', 'c#', 'webgl', 'three.js', 'software'];
     const modelingKeywords = ['建模', '模型', '貼圖', '材質', '渲染', '雕刻', '場景', '角色', '道具', 'model', 'texture', 'blender', 'max', 'zbrush', 'substance', 'rendering', '3d美術'];
 
     // Determine user background role based on criteria and resume content
     const criteriaLower = (criteria.techSkills || '').toLowerCase();
     let userRole = 'modeling'; // default
     if (animationKeywords.some(kw => matchKeyword(criteriaLower, kw))) {
       userRole = 'animation';
     } else if (programmingKeywords.some(kw => matchKeyword(criteriaLower, kw))) {
       userRole = 'programming';
     } else {
       let animCount = 0;
       let modelCount = 0;
       let progCount = 0;
       animationKeywords.forEach(kw => { if (matchKeyword(resumeLower, kw)) animCount++; });
       modelingKeywords.forEach(kw => { if (matchKeyword(resumeLower, kw)) modelCount++; });
       programmingKeywords.forEach(kw => { if (matchKeyword(resumeLower, kw)) progCount++; });
 
       if (progCount > animCount && progCount > modelCount) userRole = 'programming';
       else if (animCount > modelCount && animCount > progCount) userRole = 'animation';
       else userRole = 'modeling';
     }
 
     // Determine job role based on title, description, and official categories (Title takes absolute priority)
     let jobRole = 'modeling'; // default
     
     const titleHasModeling = modelingKeywords.some(kw => matchKeyword(jobTitle, kw));
     const titleHasAnimation = animationKeywords.some(kw => matchKeyword(jobTitle, kw));
     const titleHasProgramming = programmingKeywords.some(kw => matchKeyword(jobTitle, kw));
     
     if (titleHasProgramming) {
       jobRole = 'programming';
     } else if (titleHasAnimation) {
       jobRole = 'animation';
     } else if (titleHasModeling) {
       jobRole = 'modeling';
     } else {
       // Fallback to fuzzy category classifications if title has no clear indicator
       const isJobAnimationCat = (job.categories || []).some(cat => cat.includes('動畫') || cat.includes('動作') || cat.toLowerCase().includes('animator'));
       const isJobProgrammingCat = (job.categories || []).some(cat => cat.includes('軟體') || cat.includes('工程師') || cat.toLowerCase().includes('engineer') || cat.toLowerCase().includes('programmer'));
       
       if (isJobProgrammingCat) {
         jobRole = 'programming';
       } else if (isJobAnimationCat) {
         jobRole = 'animation';
       } else {
         jobRole = 'modeling';
       }
     }

    // Check for mismatch
    let subRoleMismatch = false;
    let mismatchReason = '';

    if (userRole === 'modeling' && jobRole === 'animation') {
      const animMatches = animationKeywords.filter(kw => matchKeyword(resumeLower, kw));
      if (animMatches.length < 2) {
        subRoleMismatch = true;
        mismatchReason = '職缺為 3D 動作與動畫類，與您的 3D 建模與美術背景不符';
      }
    } else if (userRole === 'modeling' && jobRole === 'programming') {
      const progMatches = programmingKeywords.filter(kw => matchKeyword(resumeLower, kw));
      if (progMatches.length < 2) {
        subRoleMismatch = true;
        mismatchReason = '職缺為 3D 程式與網頁開發類，與您的 3D 建模與美術背景不符';
      }
    } else if (userRole === 'animation' && jobRole === 'modeling') {
      const modelMatches = modelingKeywords.filter(kw => matchKeyword(resumeLower, kw));
      if (modelMatches.length < 2) {
        subRoleMismatch = true;
        mismatchReason = '職缺為 3D 建模與美術類，與您的 3D 動作與動畫背景不符';
      }
    } else if (userRole === 'programming' && (jobRole === 'modeling' || jobRole === 'animation')) {
      const artMatches = modelingKeywords.concat(animationKeywords).filter(kw => matchKeyword(resumeLower, kw));
      if (artMatches.length < 2) {
        subRoleMismatch = true;
        mismatchReason = '職缺為 3D 美術或動畫類，與您的程式/技術 TA 開發背景不符';
      }
    }

    // Determine if the job is related
    const hasTechSkillsCriteria = criteria.techSkills && criteria.techSkills !== '無特別指定';
    let hasKeywordMatch = false;
    if (hasTechSkillsCriteria) {
      const targetSkills = criteria.techSkills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const requiredMatches = 1;
      const userMatchedCount = targetSkills.filter(skill => matchKeyword(jobTitle, skill) || matchKeyword(jobDesc, skill)).length;
      hasKeywordMatch = userMatchedCount >= requiredMatches;
    }

    const isRelated = hasTechSkillsCriteria ? hasKeywordMatch : (overlapCount > 0);
    const hasHardMismatch = hardMismatches.length > 0;
    const allMismatches = [...hardMismatches, ...softMismatches];
    const isUnrelated = !isRelated;
    
    // Sub-role mismatch behaves as an automatic exclusion
    const skipAiMatch = hasHardMismatch || isUnrelated || subRoleMismatch;

    // Apply penalty for sub-role mismatch
    if (subRoleMismatch) {
      score = Math.max(15, Math.min(score, 20));
    }

    // Generate local summary and override score/advice if excluded
    let summaryText = '';
    let finalAdvice = '';

    if (skipAiMatch) {
      if (subRoleMismatch) {
        summaryText = `[本機排除] 專業領域錯配 (${mismatchReason})。`;
        finalAdvice = `【專業領域錯配】此職缺的核心要求是「${jobRole === 'animation' ? '3D 動作/動畫師 (Animator)' : jobRole === 'programming' ? '3D 程式開發工程師' : '3D 美術建模師'}」，與您偏好的「${userRole === 'modeling' ? '3D 美術與建模' : userRole === 'animation' ? '3D 動作與動畫' : '3D 程式開發'}」屬於不同的專業領域分工。在您的履歷無相關專案作品前，系統已自動將其排除，跳過 AI 分析以節省額度。`;
      } else if (hasHardMismatch && isUnrelated) {
        score = 5;
        summaryText = `[本機排除] 條件不符 (${allMismatches.join('、')}) 且無技能重疊。`;
        finalAdvice = `此職缺因基本條件不符（${allMismatches.join('、')}）且與您的專業技能溫關，已被本機自動篩選排除，跳過 AI 分析以節省額度。`;
      } else if (hasHardMismatch) {
        score = 15;
        summaryText = `[本機排除] 條件不符 (${allMismatches.join('、')})。`;
        finalAdvice = `此職缺因基本條件不符（${allMismatches.join('、')}），已被本機自動篩選排除，跳過 AI 分析以節省額度。`;
      } else {
        score = 20;
        summaryText = `[本機排除] 與關鍵字或履歷技能無重疊。`;
        finalAdvice = `此職缺與您設定的搜尋關鍵字及履歷技能無任何重疊，已被本機自動篩選排除，跳過 AI 分析以節省額度。`;
      }
    } else {
      summaryText = `[本機分析] 地區與性質符合。`;
      if (job.industry) {
        summaryText = `[本機分析] [${job.industry}] 地區與性質符合。`;
      }
      if (matches.length > 0) {
        summaryText += ` 匹配技能：${matches.slice(0, 4).join(', ')}。`;
      }
      if (overlapWords.length > 0) {
        summaryText += ` 相關語意重疊：${overlapWords.map(w => w.toUpperCase()).slice(0, 4).join(', ')}。`;
      }

      // Generate advice
      let adviceParts = [];
      if (missingSkills.length > 0) {
        adviceParts.push(`【履歷修改建議】您的履歷中目前缺少此職缺要求的關鍵技能：${missingSkills.slice(0, 5).join('、')}。建議您在履歷中補上相關專案實作經驗，或在面試前補充相關作品集。`);
      } else if (matches.length > 0) {
        adviceParts.push(`【履歷優勢】您的技術能力與此職缺要求的核心技能（${matches.slice(0, 5).join('、')}）完美匹配！建議在履歷中特別突出這些技術的實際專案成果。`);
      }

      const locMismatch = allMismatches.find(m => m.includes('地區'));
      const typeMismatch = allMismatches.find(m => m.includes('性質'));
      const expMismatch = allMismatches.find(m => m.includes('年資'));
      const eduMismatch = allMismatches.find(m => m.includes('學歷'));

      if (locMismatch) {
        adviceParts.push(`【偏好提醒】此工作地點為「${job.location}」，與您指定的「${criteria.location}」不符。`);
      }
      if (typeMismatch) {
        adviceParts.push(`【偏好提醒】此職缺性質為「${job.isFullTime ? '全職' : '兼職/其他'}」，與您要求的「${criteria.jobType}」不符。`);
      }
      if (expMismatch) {
        adviceParts.push(`【條件提醒】${expMismatch}。若有豐富的專案作品，或許可彌補年資劣勢。`);
      }
      if (eduMismatch) {
        adviceParts.push(`【條件提醒】${eduMismatch}。`);
      }

      adviceParts.push(`【面試準備】面試前建議詳細研究 ${job.company} 的產品或代表作，並準備 1-2 個能體現您解決問題能力與技術應用（如 ${matches.length > 0 ? matches[0] : '您的核心技能'}）的案例分享。`);
      finalAdvice = adviceParts.join('\n\n');
    }

    return {
      score,
      summary: summaryText,
      preFiltered: true,
      skipAiMatch,
      matchedSkills: matches,
      missingSkills: missingSkills,
      locationMatch: {
        isMatch: !allMismatches.some(m => m.includes('地區')),
        reason: allMismatches.some(m => m.includes('地區')) ? '與您設定的工作地區不符' : '符合您設定的工作地區'
      },
      jobTypeMatch: {
        isMatch: !allMismatches.some(m => m.includes('性質')),
        reason: allMismatches.some(m => m.includes('性質')) ? '與您設定的工作性質不符' : '符合您設定的工作性質'
      },
      countryMatch: {
        isMatch: !allMismatches.some(m => m.includes('國家')),
        reason: allMismatches.some(m => m.includes('國家')) ? '與您設定的國家地區不符' : '符合您設定的國家地區'
      },
      advice: finalAdvice
    };
  };

  // Automatically re-calculate local scores for pending/local jobs when resume or criteria changes
  useEffect(() => {
    if (jobs.length === 0) return;
    setJobs(prevJobs => 
      prevJobs.map(job => {
        const localResult = calculateLocalScore(job, resumeText, criteria);
        // Keep existing AI matchResult if we are in gemini mode and it has already been evaluated successfully
        const isAiEvaluated = job.matchResult && !job.matchResult.preFiltered && !job.matchResult.apiError;
        return {
          ...job,
          score: localResult.score,
          aiScore: isAiEvaluated ? job.aiScore : undefined,
          matchResult: isAiEvaluated ? job.matchResult : localResult
        };
      })
    );
  }, [resumeText, criteria, analysisMode]);

  // Stage 2: Select job to display in Drawer (Instant local load, NO automatic AI analysis)
  const handleSelectJob = async (job) => {
    setSelectedJob(job);
    
    // If analysisMode is 'local', perform pure local analysis instantly!
    if (analysisMode === 'local') {
      const localResult = calculateLocalScore(job, resumeText, criteria);
      // Mark preFiltered as false so that the UI treats it as fully evaluated
      const updatedResult = { ...localResult, preFiltered: false, apiError: false };
      
      setJobs(prevJobs => 
        prevJobs.map(j => j.link === job.link ? { ...j, matchResult: updatedResult, score: updatedResult.score } : j)
      );
      setSelectedJob(prevSelected => 
        prevSelected && prevSelected.link === job.link ? { ...prevSelected, matchResult: updatedResult, score: updatedResult.score } : prevSelected
      );
    }
  };

  // Stage 2b: Explicitly trigger AI analysis for a single job from the drawer
  const runSingleJobAiAnalysis = async (job, forceRetry = false, overrideMode = null) => {
    const targetMode = overrideMode || analysisMode;
    if (targetMode === 'local') return;

    // Skip AI matching if the job was excluded by local criteria (skipAiMatch is true)
    // AND we are not forcing a retry.
    if (job.matchResult && job.matchResult.skipAiMatch && !forceRetry) {
      return;
    }

    setIsDetailLoading(true);
    try {
      const response = await fetch('/api/match-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText,
          job,
          criteria,
          apiKey,
          analysisMode: targetMode,
          ollamaUrl,
          ollamaModel
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '獲取詳細分析失敗');

      // Post-process the AI results: move generic/boilerplate skills from missing to matched
      const resumeLower = (resumeText || '').toLowerCase();
      if (data && Array.isArray(data.missingSkills) && Array.isArray(data.matchedSkills)) {
        const newMissing = [];
        const newMatched = [...data.matchedSkills];
        
        data.missingSkills.forEach(skill => {
          if (isGenericSkill(skill) && checkGenericSkillMatch(skill, resumeLower)) {
            const upper = skill.toUpperCase();
            if (!newMatched.includes(upper) && !newMatched.includes(skill)) {
              newMatched.push(skill);
            }
          } else {
            newMissing.push(skill);
          }
        });
        
        data.missingSkills = newMissing;
        data.matchedSkills = newMatched;
      }
      
      const localResult = calculateLocalScore(job, resumeText, criteria);
      const updatedResult = { ...data, apiError: false, preFiltered: false };

      // Update this job in our main list
      setJobs(prevJobs => 
        prevJobs.map(j => j.link === job.link ? { 
          ...j, 
          matchResult: updatedResult, 
          score: localResult.score,
          aiScore: data.score
        } : j)
      );
      
      // Update selectedJob state
      setSelectedJob(prevSelected => 
        prevSelected && prevSelected.link === job.link ? { 
          ...prevSelected, 
          matchResult: updatedResult, 
          score: localResult.score,
          aiScore: data.score
        } : prevSelected
      );

      // Play success notification chime
      playSuccessSound();
    } catch (err) {
      console.error(err);
      const isRateLimit = err.message?.includes('429') || err.message?.toLowerCase().includes('quota') || err.message?.toLowerCase().includes('limit');
      
      // Automatic Fallback to Upgraded Local Matching Engine
      const localResult = calculateLocalScore(job, resumeText, criteria);
      
      const errorResult = {
        ...localResult,
        apiError: true,
        preFiltered: true,
        advice: (isRateLimit
          ? '⚠️ Gemini API 流量限制或配額不足 (429 Too Many Requests)。系統已自動使用本機演算法進行分析，您可以稍後點擊頂部的「重新嘗試 AI 評估」重試。\n\n'
          : `獲取 AI 詳細分析失敗: ${err.message}。已自動降級使用本機演算法進行分析。\n\n`) + (localResult.advice || '')
      };

      // Update this job in our main list
      setJobs(prevJobs => 
        prevJobs.map(j => j.link === job.link ? { ...j, score: errorResult.score, matchResult: errorResult } : j)
      );

      // Update selectedJob state
      setSelectedJob(prevSelected => 
        prevSelected && prevSelected.link === job.link ? { ...prevSelected, score: errorResult.score, matchResult: errorResult } : prevSelected
      );
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Run Crawler and AI Matching Process
  const startAgent = async () => {
    if (!resumeText) {
      alert('請先上傳您的 PDF 履歷！');
      return;
    }
    if (!targetUrl) {
      alert('請輸入 104 或 LinkedIn 搜尋連結！');
      return;
    }
    
    const isLinkedIn = targetUrl.includes('linkedin.com');
    const is104 = targetUrl.includes('104.com.tw');
    
    if (!isLinkedIn && !is104) {
      alert('目前僅支援 104 人力銀行與 LinkedIn 平台的搜尋連結！');
      return;
    }

    if (analysisMode === 'gemini' && !apiKey) {
      alert('請輸入您的 Gemini API Key！');
      return;
    }

    if (analysisMode === 'ollama' && (!ollamaUrl || !ollamaModel)) {
      alert('使用 Ollama 模式請先設定 API 位址與模型名稱！');
      return;
    }

    setIsCrawling(true);
    setProgress(10);
    const platformName = isLinkedIn ? 'LinkedIn' : '104';
    setStatusText(`啟動 Playwright 瀏覽器並爬取 ${platformName} 搜尋列表中...`);
    setJobs([]);

    try {
      // Step 1: Crawl jobs
      const crawlResponse = await fetch('/api/crawl-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl,
          pageCount: Math.ceil(maxJobs / 20), // Automatically calculate page count based on maxJobs
          maxJobs
        })
      });

      const crawlData = await crawlResponse.json();
      if (!crawlResponse.ok) throw new Error(crawlData.error || '爬取職缺失敗');

      const rawJobs = crawlData.jobs;
      if (!rawJobs || rawJobs.length === 0) {
        throw new Error(`未爬取到任何職缺，請確認 ${targetUrl.includes('linkedin.com') ? 'LinkedIn' : '104'} 連結或登入狀態是否正確！`);
      }

      setProgress(80);
      setStatusText(`成功爬取 ${rawJobs.length} 個職缺！正在透過本機關鍵字進行即時比對與評估...`);

      // Calculate local keyword score for all crawled jobs instantly
      const localMatchedResults = rawJobs.map(job => {
        const localResult = calculateLocalScore(job, resumeText, criteria);
        return {
          ...job,
          score: localResult.score,
          matchResult: localResult
        };
      });

      setJobs(localMatchedResults);
      setStatusText(`任務完成！已使用本機關鍵字即時分析並排序 ${rawJobs.length} 個職缺。`);
      setProgress(100);

      setTimeout(() => {
        setIsCrawling(false);
        setProgress(0);
      }, 2000);

    } catch (err) {
      console.error(err);
      alert('執行過程發生錯誤: ' + err.message);
      setIsCrawling(false);
      setProgress(0);
    }
  };

  // Run optional background AI batch matching for all jobs
  const startAiBatchMatching = async () => {
    if (jobs.length === 0) {
      alert('請先執行爬蟲抓取職缺列表！');
      return;
    }

    // Find jobs that have only been pre-filtered (preFiltered is true) and not skipped locally (skipAiMatch is not true)
    const jobsToAiMatch = jobs.map((job, idx) => ({ ...job, originalIndex: idx }));
    const pendingJobs = jobsToAiMatch.filter(j => j.matchResult?.preFiltered && !j.matchResult?.skipAiMatch);

    if (pendingJobs.length === 0) {
      alert('所有符合基本與關鍵字條件的職缺都已經完成詳細評估！');
      return;
    }

    if (analysisMode === 'local') {
      setIsBatchMatching(true);
      setProgress(5);
      setStatusText('正在執行本機演算法批量評估...');
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setJobs(prevJobs => {
        const newJobs = [...prevJobs];
        pendingJobs.forEach(pendingJob => {
          const localResult = calculateLocalScore(pendingJob, resumeText, criteria);
          const targetIdx = newJobs.findIndex(j => j.link === pendingJob.link);
          if (targetIdx !== -1) {
            newJobs[targetIdx] = {
              ...newJobs[targetIdx],
              score: localResult.score,
              matchResult: {
                ...localResult,
                preFiltered: false, // Mark as fully analyzed
                apiError: false
              }
            };
          }
        });
        return newJobs;
      });

      setSelectedJob(prevSelected => {
        if (prevSelected) {
          const isPending = pendingJobs.some(j => j.link === prevSelected.link);
          if (isPending) {
            const localResult = calculateLocalScore(prevSelected, resumeText, criteria);
            return {
              ...prevSelected,
              score: localResult.score,
              matchResult: {
                ...localResult,
                preFiltered: false,
                apiError: false
              }
            };
          }
        }
        return prevSelected;
      });

      setProgress(100);
      setStatusText('本機批量分析已全部瞬間完成！');
      setTimeout(() => {
        setIsBatchMatching(false);
        setProgress(0);
      }, 1000);
      return;
    }

    if (analysisMode === 'ollama') {
      // 依照本機快速分數從高到低排序，優先評估最相關的職缺
      const sortedPending = [...pendingJobs].sort((a, b) => b.score - a.score);
      // 根據您設定的「AI 批次大小 (Batch Size)」限制本次比對的數量
      const limitedPending = sortedPending.slice(0, aiBatchSize);

      if (limitedPending.length === 0) {
        alert('當前沒有符合條件且尚未評估的職缺！');
        return;
      }

      setIsBatchMatching(true);
      setProgress(5);
      setStatusText('正在啟動 Ollama 深度分析評估...');

      try {
        const totalPending = limitedPending.length;
        let processedCount = 0;

        for (let i = 0; i < totalPending; i++) {
          const currentJob = limitedPending[i];
          setStatusText(`[Ollama 深度分析 ${i + 1}/${totalPending}] 正在評估: ${currentJob.company} - ${currentJob.title}...`);

          try {
            const response = await fetch('/api/match-job', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                resumeText,
                job: currentJob,
                criteria,
                apiKey,
                analysisMode: 'ollama',
                ollamaUrl,
                ollamaModel
              })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '獲取詳細分析失敗');

            // Post-process the AI results: move generic/boilerplate skills from missing to matched
            const resumeLower = (resumeText || '').toLowerCase();
            if (data && Array.isArray(data.missingSkills) && Array.isArray(data.matchedSkills)) {
              const newMissing = [];
              const newMatched = [...data.matchedSkills];
              
              data.missingSkills.forEach(skill => {
                if (isGenericSkill(skill) && checkGenericSkillMatch(skill, resumeLower)) {
                  const upper = skill.toUpperCase();
                  if (!newMatched.includes(upper) && !newMatched.includes(skill)) {
                    newMatched.push(skill);
                  }
                } else {
                  newMissing.push(skill);
                }
              });
              
              data.missingSkills = newMissing;
              data.matchedSkills = newMatched;
            }

            const localResult = calculateLocalScore(currentJob, resumeText, criteria);
            
            // Update this job in our main list
            setJobs(prevJobs => 
              prevJobs.map(j => j.link === currentJob.link ? { 
                ...j, 
                matchResult: { ...data, apiError: false, preFiltered: false }, 
                score: localResult.score,
                aiScore: data.score
              } : j)
            );
            
            // Sync selectedJob state
            setSelectedJob(prevSelected => {
              if (prevSelected && prevSelected.link === currentJob.link) {
                return {
                  ...prevSelected,
                  matchResult: { ...data, apiError: false, preFiltered: false },
                  score: localResult.score,
                  aiScore: data.score
                };
              }
              return prevSelected;
            });

          } catch (err) {
            console.error(`Ollama 深度分析職缺失敗 (${currentJob.title}):`, err);
            setJobs(prevJobs => 
              prevJobs.map(j => j.link === currentJob.link ? { 
                ...j, 
                matchResult: { 
                  ...j.matchResult, 
                  apiError: true, 
                  preFiltered: true,
                  advice: `⚠️ Ollama 分析失敗: ${err.message}` 
                } 
              } : j)
            );
          }

          processedCount++;
          setProgress(Math.round(5 + (processedCount / totalPending) * 95));

          if (i < totalPending - 1 && aiDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, aiDelay * 1000));
          }
        }

        setProgress(100);
        playSuccessSound();
        setStatusText(`Ollama 深度分析已全部完成！共分析 ${totalPending} 個職缺。`);
        setTimeout(() => {
          setIsBatchMatching(false);
          setProgress(0);
        }, 1500);

      } catch (outerErr) {
        console.error('Ollama 批量深度分析發生致命錯誤:', outerErr);
        setStatusText(`[錯誤] Ollama 批量分析中斷: ${outerErr.message}`);
        setIsBatchMatching(false);
        setProgress(0);
        alert(`Ollama 批量深度分析發生錯誤: ${outerErr.message}`);
      }
      return;
    }

    if (analysisMode === 'gemini' && !apiKey) {
      alert('使用 Gemini AI 模式請先輸入您的 Gemini API Key！');
      return;
    }

    setIsBatchMatching(true);
    setProgress(5);
    setStatusText(analysisMode === 'ollama' ? '正在啟動 Ollama 批量分析...' : '正在啟動 Gemini 批量分析...');

    try {
      const totalPending = pendingJobs.length;
      let processedCount = 0;
      let batchIndex = 0;
      let consecutiveErrors = 0;

      while (batchIndex < totalPending) {
        const batchJobs = pendingJobs.slice(batchIndex, batchIndex + aiBatchSize);
        const batchSize = batchJobs.length;

        setStatusText(`[AI 批量比對 ${batchIndex + 1}~${Math.min(batchIndex + batchSize, totalPending)}/${totalPending}] 正在分析 ${batchSize} 個候選職缺...`);

        let success = false;

        try {
          const matchResponse = await fetch('/api/match-jobs-batch-fast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              resumeText,
              jobs: batchJobs,
              criteria,
              apiKey,
              analysisMode,
              ollamaUrl,
              ollamaModel
            })
          });

          const matchData = await matchResponse.json();

          const isResponseRateLimit = matchResponse.status === 429 ||
            (matchData.error && (
              matchData.error.includes('429') ||
              matchData.error.toLowerCase().includes('quota') ||
              matchData.error.toLowerCase().includes('limit')
            ));

          if (isResponseRateLimit) {
            consecutiveErrors++;
            if (consecutiveErrors >= 3) {
              setStatusText(`[API 限制] 連續 3 次頻率限制。批量分析已安全暫停。已保留未完成職缺的本機分數。`);
              setIsBatchMatching(false);
              setProgress(0);
              alert('API 持續繁忙，已暫停批量分析。未完成的職缺已保留本機分數，您可以稍後再次點選按鈕繼續分析。');
              return;
            }

            let waitSec = 30;
            const matchSec = matchData.error?.match(/retry in ([\d\.]+)/i) || matchData.error?.match(/retry after (\d+)/i);
            if (matchSec) {
              waitSec = Math.ceil(parseFloat(matchSec[1])) + 2;
            }

            for (let s = waitSec; s > 0; s--) {
              setStatusText(`[API 流量限制] 已自動暫停，將在 ${s} 秒後重新嘗試此區段 (${consecutiveErrors}/3)...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            continue;
          }

          if (!matchResponse.ok) throw new Error(matchData.error || 'AI 快速比對失敗');

          const batchResults = matchData.results || [];

          // Update state in real-time using functional form to avoid overwrite race conditions
          setJobs(prevJobs => {
            const newJobs = [...prevJobs];
            for (let k = 0; k < batchSize; k++) {
              const currentJob = batchJobs[k];
              const jobResult = batchResults.find(r => r.index === k) || batchResults[k];
              const targetIdx = newJobs.findIndex(j => j.link === currentJob.link);
              if (targetIdx !== -1) {
                if (jobResult) {
                  const localResult = calculateLocalScore(newJobs[targetIdx], resumeText, criteria);
                  newJobs[targetIdx] = {
                    ...newJobs[targetIdx],
                    score: localResult.score,
                    aiScore: jobResult.score || 0,
                    matchResult: {
                      ...newJobs[targetIdx].matchResult,
                      score: jobResult.score || 0,
                      summary: jobResult.summary || 'AI 評估完成。',
                      preFiltered: false,
                      apiError: false
                    }
                  };
                } else {
                  newJobs[targetIdx] = {
                    ...newJobs[targetIdx],
                    matchResult: {
                      ...newJobs[targetIdx].matchResult,
                      apiError: true,
                      preFiltered: true,
                      advice: '⚠️ AI 未能成功返回此職缺的比對數據，您可以稍後重試。'
                    }
                  };
                }
              }
            }
            return newJobs;
          });

          // Sync open drawer if currently selected job is in this batch
          setSelectedJob(prevSelected => {
            if (prevSelected) {
              const batchIdxInJobs = batchJobs.findIndex(j => j.link === prevSelected.link);
              if (batchIdxInJobs !== -1) {
                const jobResult = batchResults.find(r => r.index === batchIdxInJobs) || batchResults[batchIdxInJobs];
                if (jobResult) {
                  const localResult = calculateLocalScore(prevSelected, resumeText, criteria);
                  return {
                    ...prevSelected,
                    score: localResult.score,
                    aiScore: jobResult.score || 0,
                    matchResult: {
                      ...prevSelected.matchResult,
                      score: jobResult.score || 0,
                      summary: jobResult.summary || 'AI 評估完成。',
                      preFiltered: false,
                      apiError: false
                    }
                  };
                } else {
                  return {
                    ...prevSelected,
                    matchResult: {
                      ...prevSelected.matchResult,
                      apiError: true,
                      preFiltered: true,
                      advice: '⚠️ AI 未能成功返回此職缺的比對數據，您可以稍後重試。'
                    }
                  };
                }
              }
            }
            return prevSelected;
          });

          success = true;
          consecutiveErrors = 0; // Reset error count on success
        } catch (err) {
          console.error(`AI 批量篩選失敗 (區段 ${batchIndex + 1}~${batchIndex + batchSize}):`, err);

          const isErrorRateLimit = err.message?.includes('429') || err.message?.toLowerCase().includes('quota') || err.message?.toLowerCase().includes('limit');

          if (isErrorRateLimit) {
            consecutiveErrors++;
            if (consecutiveErrors >= 3) {
              setStatusText(`[API 限制] 連續 3 次頻率限制。批量分析已安全暫停。已保留未完成職缺的本機分數。`);
              setIsBatchMatching(false);
              setProgress(0);
              alert('API 持續繁忙，已暫停批量分析。未完成的職缺已保留本機分數，您可以稍後再次點選按鈕繼續分析。');
              return;
            }

            let waitSec = 30;
            for (let s = waitSec; s > 0; s--) {
              setStatusText(`[API 流量限制] 已自動暫停，將在 ${s} 秒後重新嘗試此區段 (${consecutiveErrors}/3)...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            continue;
          }

          // Fallback for this batch on non-429 error (network failure etc.) - preserve scores but flag error
          setJobs(prevJobs => {
            const newJobs = [...prevJobs];
            for (let k = 0; k < batchSize; k++) {
              const currentJob = batchJobs[k];
              const targetIdx = newJobs.findIndex(j => j.link === currentJob.link);
              if (targetIdx !== -1) {
                newJobs[targetIdx] = {
                  ...newJobs[targetIdx],
                  matchResult: {
                    ...newJobs[targetIdx].matchResult,
                    apiError: true,
                    preFiltered: true,
                    advice: 'AI 評估時發生錯誤: ' + err.message
                  }
                };
              }
            }
            return newJobs;
          });

          // Sync open drawer on error
          setSelectedJob(prevSelected => {
            if (prevSelected) {
              const batchIdxInJobs = batchJobs.findIndex(j => j.link === prevSelected.link);
              if (batchIdxInJobs !== -1) {
                return {
                  ...prevSelected,
                  matchResult: {
                    ...prevSelected.matchResult,
                    apiError: true,
                    preFiltered: true,
                    advice: 'AI 評估時發生錯誤: ' + err.message
                  }
                };
              }
            }
            return prevSelected;
          });

          success = true; // Move to next batch after logging error to prevent infinite loop on general exceptions
        }

        if (success) {
          batchIndex += aiBatchSize;
          processedCount += batchSize;
          setProgress(Math.round((processedCount / totalPending) * 100));

          if (batchIndex < totalPending) {
            const delayTime = aiDelay * 1000;
            setStatusText(`[AI 快速比對] 已完成此區段，等待 ${aiDelay} 秒後繼續...`);
            await new Promise(resolve => setTimeout(resolve, delayTime));
          }
        }
      }

      setStatusText('所有職缺 AI 批量分析完成！');
      setProgress(100);
      playSuccessSound();
      setTimeout(() => {
        setIsBatchMatching(false);
        setProgress(0);
      }, 2000);

    } catch (err) {
      console.error(err);
      alert('批量分析發生錯誤: ' + err.message);
      setIsBatchMatching(false);
      setProgress(0);
    }
  };

  // Helper to determine score color class
  const getScoreClass = (score) => {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  };

  // Sort and Filter jobs
  const processedJobs = jobs
    .filter(job => job.score >= scoreFilter)
    .sort((a, b) => {
      if (sortBy === 'aiScore') {
        const scoreA = a.aiScore !== undefined && a.aiScore !== null ? a.aiScore : -1;
        const scoreB = b.aiScore !== undefined && b.aiScore !== null ? b.aiScore : -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return b.score - a.score; // Fallback to local score
      }
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'company') return a.company.localeCompare(b.company, 'zh-TW');
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh-TW');
      return 0;
    });

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <div className="logo-icon">
            <img src={logoIcon} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div className="logo-text">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <h1>求職小幫手</h1>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary)', background: 'var(--primary-glow)', padding: '0.1rem 0.4rem', borderRadius: '0.25rem' }}>v5.6.01</span>
            </div>
            <p>AI-Powered Job Crawler & Matcher</p>
          </div>
        </div>
        <div className={`api-badge ${apiKey ? 'connected' : ''}`}>
          {apiKey ? '● Gemini API 已設定' : '○ 尚未設定 Gemini API Key'}
        </div>
      </header>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Config Panel */}
        <aside className="panel" id="config-panel">
          <h2 className="panel-title">
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            Agent 控制面板
          </h2>

          {/* Gemini API Key */}
          {analysisMode === 'gemini' && (
            <div className="form-group" id="api-key-group">
              <label htmlFor="api-key-input">Gemini API Key</label>
              <input 
                id="api-key-input"
                type="password" 
                className="form-control" 
                placeholder="請輸入 Gemini API Key"
                value={apiKey}
                onChange={handleApiKeyChange}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>*金鑰僅儲存在您本機的瀏覽器中</span>
            </div>
          )}

          {/* Ollama Configuration */}
          {analysisMode === 'ollama' && (
            <div id="ollama-config-group">
              <div className="form-group">
                <label htmlFor="ollama-url-input">Ollama API 位址</label>
                <input 
                  id="ollama-url-input"
                  type="text" 
                  className="form-control" 
                  placeholder="例如: http://localhost:11434"
                  value={ollamaUrl}
                  onChange={handleOllamaUrlChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="ollama-model-input">Ollama 模型名稱</label>
                <input 
                  id="ollama-model-input"
                  type="text" 
                  className="form-control" 
                  placeholder="例如: qwen2.5:7b"
                  value={ollamaModel}
                  onChange={handleOllamaModelChange}
                />
              </div>
            </div>
          )}

          {/* Analysis Mode Select */}
          <div className="form-group" id="analysis-mode-group">
            <label htmlFor="analysis-mode-select">分析模式</label>
            <select
              id="analysis-mode-select"
              className="form-control"
              value={analysisMode}
              onChange={(e) => {
                const mode = e.target.value;
                setAnalysisMode(mode);
                localStorage.setItem('analysis_mode', mode);
                if (mode === 'ollama') {
                  setAiBatchSize(5); // Default to safer batch size for local LLM
                } else if (mode === 'gemini') {
                  setAiBatchSize(30); // Default to larger batch size for cloud API
                }
              }}
            >
              <option value="gemini">🤖 Gemini AI 深度分析</option>
              <option value="ollama">💻 本機 Ollama AI 深度分析</option>
              <option value="local">💻 本機演算法分析 (極速免流量)</option>
            </select>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {analysisMode === 'gemini' 
                ? '*使用 Google Gemini 進行詳細比對，可能受限流影響' 
                : analysisMode === 'ollama'
                ? '*使用本機 Ollama 進行大模型分析，完全免費與保護隱私'
                : '*使用純本地語意及技能比對，100% 免流量與限制'}
            </span>
          </div>

          {/* Resume Upload */}
          <div className="form-group" id="resume-upload-group">
            <label>履歷檔案 (PDF)</label>
            {!resumeText ? (
              <div className="upload-zone" onClick={() => document.getElementById('resume-file').click()}>
                <input 
                  type="file" 
                  id="resume-file" 
                  accept=".pdf" 
                  style={{ display: 'none' }} 
                  onChange={handleResumeUpload}
                />
                <div className="upload-icon">📄</div>
                <p>點擊或拖放上傳 PDF 履歷</p>
                <span>支援 .pdf 格式</span>
              </div>
            ) : (
              <div className="resume-success-card">
                <div className="resume-success-info">
                  <span>✓</span>
                  <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumeName}</span>
                </div>
                <button type="button" className="resume-remove-btn" onClick={removeResume}>✕</button>
              </div>
            )}
          </div>

          {/* Target URL Link */}
          <div className="form-group" id="target-url-group">
            <label htmlFor="target-url-input">104 / LinkedIn 搜尋網址</label>
            <textarea 
              id="target-url-input"
              className="form-control" 
              rows="3"
              placeholder="請貼上 104 人力銀行或 LinkedIn 的職缺搜尋結果 Link..."
              value={targetUrl}
              onChange={(e) => {
                setTargetUrl(e.target.value);
                localStorage.setItem('target_url', e.target.value);
              }}
            />
          </div>

          {/* Filters & Criteria */}
          <div className="form-group" id="tech-skills-group">
            <label htmlFor="tech-skills-input">指定技術能力</label>
            <input 
              id="tech-skills-input"
              type="text" 
              className="form-control" 
              placeholder="例如: React, Node.js, Python"
              value={tempTechSkills}
              onChange={(e) => {
                setTempTechSkills(e.target.value);
                handleCriteriaChangeDebounced('techSkills', e.target.value);
              }}
            />
          </div>

          <div className="form-group" id="location-group">
            <label htmlFor="location-input">指定工作地區</label>
            <input 
              id="location-input"
              type="text" 
              className="form-control" 
              placeholder="例如: 台北市, 新北市"
              value={tempLocation}
              onChange={(e) => {
                setTempLocation(e.target.value);
                handleCriteriaChangeDebounced('location', e.target.value);
              }}
            />
          </div>

          <div id="job-type-country-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label htmlFor="job-type-select">工作性質</label>
              <select 
                id="job-type-select"
                className="form-control"
                value={criteria.jobType}
                onChange={(e) => handleCriteriaChange('jobType', e.target.value)}
              >
                <option value="全職">全職</option>
                <option value="兼職">兼職</option>
                <option value="無特別指定">無特別指定</option>
              </select>
            </div>
            <div className="form-group" id="country-group">
              <label htmlFor="country-input">指定國家</label>
              <input 
                id="country-input"
                type="text" 
                className="form-control" 
                placeholder="例如: 台灣"
                value={criteria.country}
                onChange={(e) => handleCriteriaChange('country', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" id="max-jobs-group">
            <label htmlFor="max-jobs-range">分析職缺數量上限: {maxJobs} 個</label>
            <input 
              id="max-jobs-range"
              type="range" 
              min="5" 
              max="200" 
              step="5"
              className="form-control" 
              style={{ padding: 0 }}
              value={maxJobs}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setMaxJobs(val);
                localStorage.setItem('max_jobs', val.toString());
              }}
            />
          </div>

          {/* Advanced Settings Toggle */}
          <div id="advanced-settings-group">
            <div className="advanced-settings-toggle" onClick={() => setShowAdvanced(!showAdvanced)} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 0',
              cursor: 'pointer',
              borderTop: '1px solid var(--border-glass)',
              marginTop: '1rem',
              marginBottom: '0.5rem',
              color: 'var(--accent-cyan)',
              fontSize: '0.85rem',
              fontWeight: '600'
            }}>
              <span>⚙️ AI 批量分析進階設定</span>
              <span>{showAdvanced ? '▲' : '▼'}</span>
            </div>

            {showAdvanced && (
              <div className="advanced-settings-content" style={{
                background: 'rgba(81, 147, 179, 0.03)',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                border: '1px solid var(--border-glass)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div className="form-group" style={{ marginBottom: 0, gap: '0.25rem' }}>
                  <label htmlFor="batch-size-range" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI 批次大小 (Batch Size): {aiBatchSize} 個</label>
                  <input 
                    id="batch-size-range"
                    type="range" 
                    min="10" 
                    max="50" 
                    step="5"
                    className="form-control" 
                    style={{ padding: 0 }}
                    value={aiBatchSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setAiBatchSize(val);
                      localStorage.setItem('ai_batch_size', val.toString());
                    }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0, gap: '0.25rem' }}>
                  <label htmlFor="batch-delay-range" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>批次發送間隔 (Batch Delay): {aiDelay} 秒</label>
                  <input 
                    id="batch-delay-range"
                    type="range" 
                    min="0.5" 
                    max="5.0" 
                    step="0.5"
                    className="form-control" 
                    style={{ padding: 0 }}
                    value={aiDelay}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setAiDelay(val);
                      localStorage.setItem('ai_delay', val.toString());
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <button 
            type="button" 
            className="btn-action" 
            id="start-agent-btn"
            onClick={startAgent}
            disabled={isCrawling || isBatchMatching || !resumeText || !targetUrl || (analysisMode === 'gemini' && !apiKey)}
          >
            {isCrawling ? '正在爬取職缺中...' : '開始爬蟲與即時分析'}
          </button>

          {jobs.length > 0 && (
            <button 
              type="button" 
              className="btn-action" 
              onClick={startAiBatchMatching}
              disabled={isCrawling || isBatchMatching || (analysisMode === 'gemini' && !apiKey)}
              style={{
                marginTop: '0.75rem',
                background: analysisMode === 'local' 
                  ? 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' 
                  : analysisMode === 'ollama'
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                boxShadow: analysisMode === 'local'
                  ? '0 4px 15px rgba(6, 182, 212, 0.3)'
                  : analysisMode === 'ollama'
                  ? '0 4px 15px rgba(16, 185, 129, 0.3)'
                  : '0 4px 15px rgba(124, 58, 237, 0.3)'
              }}
            >
              {isBatchMatching 
                ? (analysisMode === 'local' ? '本機批量評估中...' : analysisMode === 'ollama' ? 'Ollama 批量評估中...' : 'AI 批量評估中...') 
                : (analysisMode === 'local' ? '💻 執行本機批量評估' : analysisMode === 'ollama' ? '💻 執行 Ollama 批量評估' : '🤖 執行 AI 批量評估')}
            </button>
          )}
        </aside>

        {/* Right Dashboard Area */}
        <main className="main-display">
          {/* Progress Tracker */}
          {(isCrawling || isMatching || isBatchMatching) && (
            <div className="progress-card">
              <div className="progress-info">
                <span className="progress-status">{statusText}</span>
                <span className="progress-percentage">{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
              <p className="progress-log">
                {isCrawling ? `系統記錄：正在獲取 ${targetUrl.includes('linkedin.com') ? 'LinkedIn' : '104'} 職缺資訊...` : 
                 isBatchMatching ? `系統記錄：正在使用 ${analysisMode === 'ollama' ? '本機 Ollama AI' : 'Gemini API'} 背景評估職缺中...` : 
                 '系統記錄：正在處理比對分析作業...'}
              </p>
            </div>
          )}

          {/* Results Area */}
          {jobs.length > 0 ? (
            <>
              {/* Filter and Sort Toolbar */}
              <div className="results-header">
                <h2 className="results-count">
                  配對結果 <span>{processedJobs.length} 個職缺</span>
                </h2>
                <div className="results-filter">
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                    <label htmlFor="sort-select" style={{ whiteSpace: 'nowrap' }}>排序</label>
                    <select 
                      id="sort-select"
                      className="select-filter"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="aiScore">🤖 AI 匹配度高到低</option>
                      <option value="score">本機匹配度高到低</option>
                      <option value="company">公司名稱</option>
                      <option value="title">職缺名稱</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                    <label htmlFor="score-filter-select" style={{ whiteSpace: 'nowrap' }}>篩選分數</label>
                    <select 
                      id="score-filter-select"
                      className="select-filter"
                      value={scoreFilter}
                      onChange={(e) => setScoreFilter(parseInt(e.target.value))}
                    >
                      <option value="0">全部顯示</option>
                      <option value="80">80 分以上 (極推薦)</option>
                      <option value="60">60 分以上 (合格)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Jobs Grid */}
              <div className="jobs-grid">
                {processedJobs.map((job, idx) => (
                  <div 
                    key={idx} 
                    className="job-card"
                    onClick={() => handleSelectJob(job)}
                  >
                    <div className="job-card-header">
                      <div className="job-title-area">
                        <span className="job-company">{job.company}</span>
                        <h3 className="job-title" title={job.title}>{job.title}</h3>
                        {/* Display AI score if available */}
                        {job.aiScore !== undefined && job.aiScore !== null && (
                          <div className="ai-score-tag" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.75rem',
                            color: 'var(--accent-purple)',
                            background: 'rgba(197, 140, 56, 0.08)',
                            border: '1px solid rgba(197, 140, 56, 0.2)',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '0.375rem',
                            marginTop: '0.25rem',
                            width: 'fit-content',
                            fontWeight: '600'
                          }}>
                            🤖 AI: {job.aiScore}分
                          </div>
                        )}
                      </div>
                      <div className={`score-badge ${getScoreClass(job.score)}`}>
                        {job.score}
                        <span>分</span>
                      </div>
                    </div>

                    <div className="job-meta-list">
                      <div className="meta-tag highlight">📍 {job.location}</div>
                      <div className="meta-tag">💼 {job.isFullTime ? '全職' : '兼職'}</div>
                      <div className="meta-tag">🌐 {job.country}</div>
                    </div>

                    <p className="job-summary">
                      {job.matchResult?.summary || job.description}
                    </p>

                    <div className="job-card-footer">
                      <span className="job-salary-text">💰 {job.salary}</span>
                      {analysisMode === 'local' ? (
                        <button 
                          type="button" 
                          className="btn-detail"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectJob(job);
                          }}
                        >
                          🔎 查看本機報告
                        </button>
                      ) : (job.matchResult?.advice ? (
                        <button 
                          type="button" 
                          className="btn-detail"
                          style={{
                            background: 'rgba(197, 140, 56, 0.08)',
                            border: '1px solid rgba(197, 140, 56, 0.2)',
                            color: 'var(--accent-purple)',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectJob(job);
                          }}
                        >
                          🔎 查看 AI 報告
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button 
                            type="button" 
                            className="btn-detail"
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border-glass)',
                              color: 'var(--text-muted)',
                              padding: '0.35rem 0.6rem',
                              fontSize: '0.75rem'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectJob(job);
                            }}
                          >
                            🔎 瀏覽
                          </button>
                          <button 
                            type="button" 
                            className="btn-detail"
                            style={{
                              background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-cyan) 100%)',
                              border: 'none',
                              color: '#fff',
                              fontWeight: '600',
                              boxShadow: '0 2px 8px var(--primary-glow)',
                              padding: '0.35rem 0.7rem',
                              fontSize: '0.75rem'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectJob(job);
                              runSingleJobAiAnalysis(job, true);
                            }}
                          >
                            🤖 AI 分析
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            // Empty State
            !isCrawling && !isMatching && !isBatchMatching && (
              <div className="empty-state">
                <div className="empty-icon">
                  <img src={logoIcon} alt="Logo" style={{ width: '4.5rem', height: '4.5rem', objectFit: 'contain', marginBottom: '0.5rem' }} />
                </div>
                <h3>歡迎使用求職小幫手 Agent</h3>
                <p>
                  請於左側面板輸入您的 Gemini API Key、上傳您的 PDF 履歷，並貼上 104 人力銀行或 LinkedIn 的搜尋結果連結，Agent 將為您自動抓取網頁並使用 AI 評估您的適配度。
                </p>
                <button
                  type="button"
                  className="btn-action"
                  style={{
                    marginTop: '1.5rem',
                    padding: '0.85rem 2rem'
                  }}
                  onClick={() => setShowGuide(true)}
                >
                  操作指引按鈕
                </button>
              </div>
            )
          )}
        </main>
      </div>

      {/* Detail Drawer Modal */}
      {selectedJob && (
        <div className="drawer-backdrop" onClick={() => setSelectedJob(null)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-area">
                <span className="job-company" style={{ fontSize: '1rem' }}>{selectedJob.company}</span>
                <h2>{selectedJob.title}</h2>
              </div>
              <button type="button" className="btn-close" onClick={() => setSelectedJob(null)}>✕</button>
            </div>

            <div className="drawer-body">
              {isDetailLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '350px', gap: '1.5rem', color: 'var(--text-main)' }}>
                  <div className="detail-loading-spinner" style={{
                    width: '3.5rem',
                    height: '3.5rem',
                    border: '4px solid var(--border-glass)',
                    borderTop: '4px solid var(--accent-cyan)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></div>
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem', fontSize: '1.15rem' }}>🤖 AI 深度分析中...</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '380px', margin: '0 auto', lineHeight: '1.5' }}>
                      正在深入比對此職缺與您履歷的適配細節（包含符合/缺失技能及具體履歷修改建議），請稍候...
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {selectedJob.matchResult?.skipAiMatch && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      padding: '0.75rem 1rem',
                      borderRadius: '0.75rem',
                      marginBottom: '1.25rem',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontWeight: '500'
                    }}>
                      <span>⚠️</span>
                      <span>此職缺不符基本偏好或與技能無關，已由系統本機自動篩選排除，跳過 AI 評估。</span>
                    </div>
                  )}
                  {analysisMode !== 'local' && (!selectedJob.matchResult?.advice) && !selectedJob.matchResult?.apiError && !selectedJob.matchResult?.skipAiMatch && (
                    <div style={{
                      background: 'rgba(197, 140, 56, 0.05)',
                      border: '1px solid rgba(197, 140, 56, 0.15)',
                      color: 'var(--text-main)',
                      padding: '1.25rem',
                      borderRadius: '0.75rem',
                      marginBottom: '1.5rem',
                      fontSize: '0.9rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      alignItems: 'flex-start'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', color: 'var(--accent-purple)' }}>
                        <span>💡</span>
                        <span>此職缺尚未進行 AI 深度匹配分析</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        目前僅為本機快速評分。點擊下方按鈕，將使用您設定的 {analysisMode === 'ollama' ? '💻 本機 Ollama (qwen2.5:7b)' : '☁️ Gemini AI'} 來解構這筆職缺，為您產出完整的符合/缺失技能分析以及精準的履歷修改建議！
                      </p>
                      <button
                        type="button"
                        onClick={() => runSingleJobAiAnalysis(selectedJob, true)}
                        className="btn-action"
                        style={{
                          background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-cyan) 100%)',
                          boxShadow: '0 2px 8px var(--primary-glow)',
                          padding: '0.45rem 1rem',
                          fontSize: '0.85rem',
                          margin: 0,
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: '0.5rem',
                          color: '#fff',
                          fontWeight: 'bold',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          width: 'auto'
                        }}
                      >
                        🤖 開始 AI 深度分析
                      </button>
                    </div>
                  )}
                  {selectedJob.matchResult?.apiError && (
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                      color: '#f59e0b',
                      padding: '0.75rem 1rem',
                      borderRadius: '0.75rem',
                      marginBottom: '1.25rem',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      fontWeight: '500'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>⚠️</span>
                        <span>目前 API 流量繁忙或分析失敗，顯示為本機快篩評分。</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => runSingleJobAiAnalysis(selectedJob, true)}
                        className="btn-action"
                        style={{
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.8rem',
                          margin: 0,
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: '0.375rem',
                          color: '#fff',
                          fontWeight: 'bold',
                          width: 'auto',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        🔄 重新嘗試 AI 評估
                      </button>
                    </div>
                  )}
                  {/* Score and Summary */}
                  <div className="detail-section" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '1.5rem', background: 'rgba(81, 147, 179, 0.04)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid var(--border-glass)' }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <div className={`score-badge ${getScoreClass(selectedJob.score)}`} style={{ width: '4.5rem', height: '4.5rem', fontSize: '1.3rem' }}>
                        {selectedJob.score}
                        <span style={{ fontSize: '0.55rem' }}>本機分數</span>
                      </div>
                      {selectedJob.aiScore !== undefined && selectedJob.aiScore !== null && (
                        <div className={`score-badge ${getScoreClass(selectedJob.aiScore)}`} style={{ width: '4.5rem', height: '4.5rem', fontSize: '1.3rem', borderColor: 'var(--accent-purple)', background: 'rgba(197, 140, 56, 0.08)', color: 'var(--accent-purple)' }}>
                          {selectedJob.aiScore}
                          <span style={{ fontSize: '0.55rem', color: 'var(--accent-purple)' }}>AI分數</span>
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '0.25rem' }}>配對總結</h4>
                      <p style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>{selectedJob.matchResult?.summary}</p>
                    </div>
                  </div>

                  {/* Metas */}
                  <div className="job-meta-list">
                    <div className="meta-tag highlight" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>📍 地點: {selectedJob.location}</div>
                    <div className="meta-tag" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>💰 待遇: {selectedJob.salary}</div>
                    <div className="meta-tag" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>💼 性質: {selectedJob.isFullTime ? '全職工作' : '兼職/其他'}</div>
                    <div className="meta-tag" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>🌐 國家: {selectedJob.country}</div>
                  </div>

                  {/* Skills Comparison */}
                  <div className="detail-section">
                    <h3 className="detail-section-title">🛠 技能匹配分析</h3>
                    <div className="skills-comparison">
                      <div className="skills-box matched">
                        <div className="skills-box-title">✓ 履歷中符合的技能</div>
                        <div className="skills-list">
                          {selectedJob.matchResult?.matchedSkills?.length > 0 ? (
                            selectedJob.matchResult.matchedSkills.map((skill, i) => (
                              <span key={i} className="skill-bubble">{skill}</span>
                            ))
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>無直接匹配技能</span>
                          )}
                        </div>
                      </div>
                      <div className="skills-box missing">
                        <div className="skills-box-title">✗ 履歷中缺失的技能</div>
                        <div className="skills-list">
                          {selectedJob.matchResult?.missingSkills?.length > 0 ? (
                            selectedJob.matchResult.missingSkills.map((skill, i) => (
                              <span key={i} className="skill-bubble">{skill}</span>
                            ))
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>無缺失關鍵技能</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Criteria Match Checklist */}
                  <div className="detail-section">
                    <h3 className="detail-section-title">📋 核心條件符合狀況</h3>
                    <div className="criteria-list">
                      <div className="criteria-item">
                        <div className={`criteria-status-icon ${selectedJob.matchResult?.locationMatch?.isMatch ? 'yes' : 'no'}`}>
                          {selectedJob.matchResult?.locationMatch?.isMatch ? '✓' : '✗'}
                        </div>
                        <div className="criteria-detail">
                          <h4>指定工作地區 ({criteria.location || '未指定'})</h4>
                          <p>{selectedJob.matchResult?.locationMatch?.reason || '無詳細說明'}</p>
                        </div>
                      </div>
                      <div className="criteria-item">
                        <div className={`criteria-status-icon ${selectedJob.matchResult?.jobTypeMatch?.isMatch ? 'yes' : 'no'}`}>
                          {selectedJob.matchResult?.jobTypeMatch?.isMatch ? '✓' : '✗'}
                        </div>
                        <div className="criteria-detail">
                          <h4>工作性質 ({criteria.jobType || '全職'})</h4>
                          <p>{selectedJob.matchResult?.jobTypeMatch?.reason || '無詳細說明'}</p>
                        </div>
                      </div>
                      <div className="criteria-item">
                        <div className={`criteria-status-icon ${selectedJob.matchResult?.countryMatch?.isMatch ? 'yes' : 'no'}`}>
                          {selectedJob.matchResult?.countryMatch?.isMatch ? '✓' : '✗'}
                        </div>
                        <div className="criteria-detail">
                          <h4>工作國家 ({criteria.country || '台灣'})</h4>
                          <p>{selectedJob.matchResult?.countryMatch?.reason || '無詳細說明'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Advice */}
                  <div className="detail-section">
                    <h3 className="detail-section-title">💡 履歷修改與面試建議</h3>
                    <div className="advice-card">
                      <p>{selectedJob.matchResult?.advice}</p>
                    </div>
                  </div>

                  {/* Job Description Text */}
                  <div className="detail-section">
                    <h3 className="detail-section-title">📄 原始職缺描述</h3>
                    <pre style={{ 
                      background: 'rgba(81, 147, 179, 0.03)', 
                      border: '1px solid var(--border-glass)', 
                      padding: '1.25rem', 
                      borderRadius: '1rem', 
                      fontSize: '0.85rem', 
                      color: 'var(--text-muted)', 
                      whiteSpace: 'pre-wrap', 
                      fontFamily: 'var(--font-sans)', 
                      lineHeight: '1.6',
                      maxHeight: '300px',
                      overflowY: 'auto'
                    }}>
                      {selectedJob.fullDescription}
                    </pre>
                  </div>
                </>
              )}
            </div>

            <div className="drawer-footer">
              <button 
                type="button" 
                className="btn-drawer-secondary" 
                onClick={() => setSelectedJob(null)}
              >
                關閉
              </button>
              <button
                type="button"
                className="btn-action"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: '600',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                  padding: '0.85rem 1.25rem',
                  borderRadius: '0.75rem',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
                disabled={isDetailLoading}
                onClick={() => runSingleJobAiAnalysis(selectedJob, true, 'ollama')}
              >
                🤖 Ollama AI 分析
              </button>
              <a 
                href={selectedJob.link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn-action btn-drawer-action"
                style={{ textDecoration: 'none' }}
              >
                {selectedJob.link?.includes('linkedin.com') ? '前往 LinkedIn 投遞履歷 ➔' : '前往 104 投遞履歷 ➔'}
              </a>
            </div>
          </div>
        </div>
      )}
      
      {/* Footer */}
      <footer className="app-footer" style={{
        marginTop: '3rem',
        paddingTop: '1.5rem',
        borderTop: '1px solid var(--border-glass)',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        paddingBottom: '2rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', fontWeight: '600' }}>
          <span>作者：Art Meow</span>
          <span>版本號：v5.6.01</span>
        </div>
        <p style={{ margin: 0, fontWeight: '500' }}>
          版權所有 © 2026 Art Meow. 採用 MIT 開源授權協議釋出。
        </p>
        <p style={{ margin: 0, opacity: 0.8, maxWidth: '600px', alignSelf: 'center', lineHeight: '1.5' }}>
          本工具為公開分享之開源專案，旨在便利求職者進行自動化職缺抓取與本機/AI 深度比對分析。本專案託管於 GitHub，歡迎社群交流、提交 Pull Requests 與自由分發使用。
        </p>
      </footer>

      {/* Onboarding Guide Overlay */}
      {showGuide && (
        <GuideOverlay 
          onClose={() => setShowGuide(false)} 
          analysisMode={analysisMode} 
          showAdvanced={showAdvanced} 
          setShowAdvanced={setShowAdvanced} 
        />
      )}
    </div>
  );
}

// Onboarding Walkthrough User Guide Overlay component
function GuideOverlay({ onClose, analysisMode, showAdvanced, setShowAdvanced }) {
  const [rects, setRects] = useState({});

  const getGuideTitle = (key) => {
    const titles = {
      'api-key-group': '🔑 Gemini API Key',
      'ollama-config-group': '💻 Ollama 本機配置設定',
      'analysis-mode-group': '🤖 分析比對模式切換',
      'resume-upload-group': '📄 履歷檔案上傳 (PDF)',
      'target-url-group': '🌐 104 / LinkedIn 搜尋網址',
      'tech-skills-group': '🛠 指定技術關鍵字',
      'location-group': '📍 指定期望工作地區',
      'country-group': '💼 指定國家篩選',
      'max-jobs-group': '📊 分析職缺數量上限',
      'advanced-settings-group': '⚙️ AI 批量分析進階設定',
      'start-agent-btn': '🚀 開始爬蟲與即時分析'
    };
    return titles[key] || '';
  };

  const getGuideDesc = (key) => {
    const descs = {
      'api-key-group': (
        <span>
          輸入您的 Gemini API Key。金鑰僅儲存在您的瀏覽器本機，可用於雲端高精度的 AI 履歷與職缺匹配分析。
          <a 
            href="https://aistudio.google.com/" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ color: '#ea580c', textDecoration: 'underline', fontWeight: 'bold' }}
            onClick={(e) => e.stopPropagation()}
          >
            點擊連結至 Google AI Studio 免費申請金鑰
          </a>。
        </span>
      ),
      'ollama-config-group': '設定本機 LLM 伺服器的連接位址與下載好的模型。預設使用本機運行的 qwen2.5:7b，享有無限制、安全且 100% 隱私保護的本地 AI 分析體驗。',
      'analysis-mode-group': (
        <span>
          切換三種模式：
          <br />
          1. 雲端 Gemini AI 深度分析 ( 精準度最高但是會消耗大量的 Gemini API Key Token )
          <br />
          2. 本機 Ollama AI 深度分析 ( 完全免費不需要消耗 Token ，
          <a 
            href="https://ollama.com/" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ color: '#ea580c', textDecoration: 'underline', fontWeight: 'bold' }}
            onClick={(e) => e.stopPropagation()}
          >
            Ollama 安裝說明
          </a> )
          <br />
          3. 本機快速演算 ( 使用 GPU 運算，完全不需要消耗 Token，缺點是會有極少機會職缺評論錯誤 )
        </span>
      ),
      'resume-upload-group': '點選或拖放上傳您的個人 PDF 履歷。系統會自動解析履歷內容，以利後續與抓取到的職缺要求進行多維度交叉比對與精準評估。',
      'target-url-group': '在此貼上 104 人力銀行或 LinkedIn 職缺搜尋結果頁面的完整網址。請先在網頁做好條件篩選並複製網址，系統將會自動在背景下載該頁面的職缺內容。',
      'tech-skills-group': (
        <span>
          輸入您期望符合的技術關鍵字。
          <br />
          範例：( 行銷業務, 電商, 業務 )
        </span>
      ),
      'location-group': (
        <span>
          設定您期望的工作地區。
          <br />
          範例：( 台北市,新北市,新竹市 )
        </span>
      ),
      'country-group': (
        <span>
          輸入您期望求職的國家。
          <br />
          範例：( 台灣 )
        </span>
      ),
      'max-jobs-group': '設定您想要獲取的職缺數量（範圍從 5 到 200 個）。數量少時讀取速度較快，數量多時能獲取更豐富的職缺機會。',
      'advanced-settings-group': '調整 AI 分析職缺的目標數量，數量越小代表分析速度越快，當您發現系統讀取變慢或出現網路超速限制時，可以適度調大間隔時間。',
      'start-agent-btn': '當所有設定與履歷都配置完成後，點擊此按鈕即可啟動自動化求職小幫手。系統將會立即為您讀取職缺並在右側展示配對結果與分析報告！'
    };
    return descs[key] || '';
  };

  useEffect(() => {
    // If advanced settings are collapsed, expand them temporarily so we can measure them!
    const originalShowAdvanced = showAdvanced;
    if (!showAdvanced) {
      setShowAdvanced(true);
    }

    const calculateRects = () => {
      const ids = [
        'api-key-group',
        'ollama-config-group',
        'analysis-mode-group',
        'resume-upload-group',
        'target-url-group',
        'tech-skills-group',
        'location-group',
        'country-group',
        'max-jobs-group',
        'advanced-settings-group',
        'start-agent-btn'
      ];
      
      const containerEl = document.querySelector('.app-container');
      if (!containerEl) return;
      
      const containerRect = containerEl.getBoundingClientRect();
      const newRects = {};
      
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          newRects[id] = {
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
            width: rect.width,
            height: rect.height,
            right: rect.right - containerRect.left,
            bottom: rect.bottom - containerRect.top,
            cardTop: rect.top - containerRect.top + (rect.height / 2) - 60, // initial draft top
            cardHeight: 120 // initial draft height
          };
        }
      });
      
      setRects(newRects);
    };

    // Calculate immediately and also on resize
    const timer = setTimeout(calculateRects, 180); // wait for state render & toggle animation
    window.addEventListener('resize', calculateRects);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateRects);
      // Restore original advanced state when overlay closes
      setShowAdvanced(originalShowAdvanced);
    };
  }, []);

  // Pixel-perfect overlap avoidance with exact fixed gap of 16px
  React.useLayoutEffect(() => {
    if (Object.keys(rects).length === 0) return;

    const updatedRects = {};
    let changed = false;

    const sortedKeys = Object.keys(rects).sort((a, b) => rects[a].top - rects[b].top);
    let lastBottom = 20; // safe padding from top of container
    const cardGap = 16;  // exact fixed gap of 16px!

    sortedKeys.forEach(key => {
      const rect = rects[key];
      const cardEl = document.getElementById(`card-${key}`);
      const actualHeight = cardEl ? cardEl.offsetHeight : 120;
      
      let preferredTop = rect.top + (rect.height / 2) - (actualHeight / 2);
      if (preferredTop < lastBottom) {
        preferredTop = lastBottom;
      }

      updatedRects[key] = {
        ...rect,
        cardTop: preferredTop,
        cardHeight: actualHeight
      };

      if (rect.cardTop !== preferredTop || rect.cardHeight !== actualHeight) {
        changed = true;
      }

      lastBottom = preferredTop + actualHeight + cardGap;
    });

    if (changed) {
      setRects(updatedRects);
    }
  }, [rects]);

  return (
    <div 
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        pointerEvents: 'none' // Let events pass through root container
      }}
    >
      {/* SVG Mask Definition */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <mask id="guide-spotlight-mask">
            {/* White fills the mask, meaning the overlay will be visible */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black cuts out holes, meaning the overlay will be transparent and unblurred */}
            {Object.entries(rects).map(([key, rect]) => (
              <rect 
                key={`hole-${key}`}
                x={rect.left - 6} 
                y={rect.top - 6} 
                width={rect.width + 12} 
                height={rect.height + 12} 
                rx="10" 
                ry="10"
                fill="black" 
              />
            ))}
          </mask>
        </defs>
      </svg>

      {/* Visual Backdrop Layer (Blurred and Dimmed with Spotlight Cutouts) */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(27, 42, 71, 0.55)', // Translucent Morandi dark blue backdrop
          backdropFilter: 'blur(4px)',
          mask: 'url(#guide-spotlight-mask)',
          WebkitMask: 'url(#guide-spotlight-mask)',
          pointerEvents: 'none',
          zIndex: 999
        }}
      />

      {/* Transparent Click Catcher Layer */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          background: 'transparent',
          zIndex: 1000,
          pointerEvents: 'auto',
          cursor: 'pointer'
        }}
        onClick={onClose}
      />
      {/* Central Guide Info Box */}
      <div 
        style={{
          position: 'fixed',
          top: '30px',
          right: '30px',
          width: '380px',
          background: '#ffffff',
          border: '2px solid var(--primary)',
          borderRadius: '1rem',
          padding: '1.5rem',
          boxShadow: '0 20px 40px rgba(27, 42, 71, 0.25)',
          color: '#1b2a3a',
          zIndex: 1003,
          cursor: 'default',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          animation: 'slideIn 0.3s ease',
          pointerEvents: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>💡</span>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }}>操作指引手冊已開啟</h3>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#5e7082', lineHeight: '1.5' }}>
          系統已將左側「Agent 控制面板」的各項參數區塊以橙色外框標示，並為您拉出對應的說明卡片。
        </p>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#5e7082', lineHeight: '1.5', fontWeight: '500' }}>
          點擊背景任意空白處，或點擊下方按鈕即可關閉指引。
        </p>
        <button 
          type="button" 
          className="btn-action"
          style={{ width: '100%', padding: '0.65rem', fontSize: '0.9rem', marginTop: '0.25rem' }}
          onClick={onClose}
        >
          我知道了，關閉指引
        </button>
      </div>

      {/* SVG Canvas for all arrows */}
      <svg 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1001,
          pointerEvents: 'none'
        }}
      >
        <defs>
          <marker 
            id="guide-arrow-marker" 
            viewBox="0 0 10 10" 
            refX="4" 
            refY="5" 
            markerWidth="6" 
            markerHeight="6" 
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ea580c" />
          </marker>
          <marker 
            id="guide-dot-marker" 
            viewBox="0 0 10 10" 
            refX="5" 
            refY="5" 
            markerWidth="5" 
            markerHeight="5"
          >
            <circle cx="5" cy="5" r="5" fill="#ea580c" />
          </marker>
        </defs>
        {Object.entries(rects).map(([key, rect]) => (
          <line 
            key={`line-${key}`}
            x1={rect.right + 6} 
            y1={rect.top + (rect.height / 2)} 
            x2={rect.right + 64} 
            y2={rect.cardTop + 24} 
            stroke="#ea580c" 
            strokeWidth="2.5" 
            markerStart="url(#guide-dot-marker)"
            markerEnd="url(#guide-arrow-marker)" 
          />
        ))}
      </svg>

      {/* Render highlights and description cards dynamically */}
      {Object.entries(rects).map(([key, rect]) => (
        <React.Fragment key={key}>
          {/* Highlight rectangle */}
          <div 
            style={{
              position: 'absolute',
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              border: '2px solid #ea580c', // red-orange indicator border
              background: 'rgba(234, 88, 12, 0.12)', // translucent fill
              borderRadius: '0.6rem',
              boxShadow: '0 0 15px rgba(234, 88, 12, 0.35)',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />

          {/* Floating description card on the right */}
          <div 
            id={`card-${key}`}
            style={{
              position: 'absolute',
              top: rect.cardTop,
              left: rect.right + 70,
              width: '320px',
              background: '#ffffff',
              border: '1.5px solid rgba(234, 88, 12, 0.35)',
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              boxShadow: '0 10px 25px rgba(27, 42, 71, 0.12)',
              fontSize: '0.82rem',
              lineHeight: '1.55',
              zIndex: 1001,
              cursor: 'default',
              pointerEvents: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <strong style={{ display: 'block', color: '#ea580c', marginBottom: '0.25rem', fontSize: '0.88rem', fontWeight: 'bold' }}>
              {getGuideTitle(key)}
            </strong>
            <span style={{ color: '#2c3e50', fontWeight: '500' }}>
              {getGuideDesc(key)}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
