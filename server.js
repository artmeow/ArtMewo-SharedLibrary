import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pdf from 'pdf-parse';
import { chromium } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Set up Multer for file upload
const upload = multer({ dest: 'uploads/' });

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// 1. Upload Resume (PDF) Endpoint
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '請提供履歷檔案' });
    }

    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    
    // Parse PDF
    const pdfData = await pdf(dataBuffer);
    const resumeText = pdfData.text.trim();

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    if (!resumeText) {
      return res.status(400).json({ error: '未能從 PDF 中提取出任何文字，請確認該 PDF 是否為掃描檔或空檔案' });
    }

    res.json({ text: resumeText });
  } catch (error) {
    console.error('PDF 解析失敗:', error);
    res.status(500).json({ error: '解析履歷檔案失敗: ' + error.message });
  }
});

// Helper function to paginate 104 search URLs
function getPageUrl(baseUrl, pageNum) {
  try {
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('page', pageNum);
    return urlObj.toString();
  } catch (e) {
    if (baseUrl.includes('page=')) {
      return baseUrl.replace(/page=\d+/, `page=${pageNum}`);
    }
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}page=${pageNum}`;
  }
}

// Helper function to paginate LinkedIn search URLs (offset starts at (page-1)*25)
function getLinkedInPageUrl(baseUrl, pageNum) {
  const startOffset = (pageNum - 1) * 25;
  try {
    const urlObj = new URL(baseUrl);
    urlObj.searchParams.set('start', startOffset.toString());
    return urlObj.toString();
  } catch (e) {
    if (baseUrl.includes('start=')) {
      return baseUrl.replace(/start=\d+/, `start=${startOffset}`);
    }
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}start=${startOffset}`;
  }
}

// Helper function to detect country from job location string
function detectCountry(locStr) {
  if (!locStr) return '台灣';
  const cleanLoc = locStr.replace(/\(.*?\)/g, '').trim().toLowerCase();
  
  // Split by comma and get the last part
  const parts = cleanLoc.split(',');
  const lastPart = parts[parts.length - 1].trim();

  const countryMap = {
    'taiwan': '台灣',
    'tw': '台灣',
    'japan': '日本',
    'jp': '日本',
    'singapore': '新加坡',
    'sg': '新加坡',
    'united states': '美國',
    'usa': '美國',
    'us': '美國',
    'china': '中國',
    'cn': '中國',
    'malaysia': '馬來西亞',
    'my': '馬來西亞',
    'canada': '加拿大',
    'ca': '加拿大',
    'united kingdom': '英國',
    'uk': '英國',
    'great britain': '英國',
    'australia': '澳洲',
    'au': '澳洲',
    'germany': '德國',
    'de': '德國',
    'france': '法國',
    'fr': '法國',
    'hong kong': '香港',
    'hk': '香港',
    'south korea': '韓國',
    'korea': '韓國',
    'kr': '韓國',
  };

  if (countryMap[lastPart]) {
    return countryMap[lastPart];
  }

  for (const [key, val] of Object.entries(countryMap)) {
    if (cleanLoc.includes(key)) {
      return val;
    }
  }

  const chineseCountries = ['台灣', '日本', '新加坡', '美國', '中國', '馬來西亞', '加拿大', '英國', '澳洲', '德國', '法國', '香港', '韓國', '越南', '泰國', '菲律賓'];
  for (const c of chineseCountries) {
    if (locStr.includes(c)) {
      return c;
    }
  }

  if (/^[a-zA-Z\s]+$/.test(lastPart)) {
    return lastPart.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  if (cleanLoc.includes('台北') || cleanLoc.includes('新北') || cleanLoc.includes('台中') || cleanLoc.includes('高雄') || cleanLoc.includes('台南') || cleanLoc.includes('桃園') || cleanLoc.includes('新竹')) {
    return '台灣';
  }

  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
}

// Helper function to call Ollama Chat API
async function callOllamaChat(url, model, systemPrompt, userPrompt) {
  const ollamaUrl = `${url.trim().replace(/\/$/, '')}/api/chat`;
  console.log(`[Ollama API] Sending request to model: ${model} at ${ollamaUrl}`);
  
  const response = await fetch(ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: false,
      options: {
        temperature: 0.1 // Keep it deterministic for matching scores
      },
      format: 'json' // Force JSON output format
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API returned HTTP ${response.status}: ${errText}`);
  }

  const result = await response.json();
  const content = result.message?.content;
  if (!content) {
    throw new Error('Ollama returned empty response message');
  }
  return content;
}

// Helper function to crawl 104 jobs
async function crawl104Jobs(page, targetUrl, pageCount, maxJobs) {
  let allJobs = [];
  let interceptedJobs = [];

  // Setup network interception to capture the API JSON response
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('jobs/search/api/jobs')) {
      try {
        const json = await response.json();
        if (json && json.data && Array.isArray(json.data)) {
          interceptedJobs = json.data.map(item => {
            let link = item.link?.job || '';
            if (link && link.startsWith('//')) {
              link = 'https:' + link;
            }
            if (link) {
              const qIdx = link.indexOf('?');
              if (qIdx !== -1) {
                link = link.substring(0, qIdx);
              }
            }
            return {
              title: item.jobName,
              link: link,
              company: item.custName,
              salary: item.salaryDesc || '面議',
              location: item.jobAddrNoDesc || '',
              description: item.description || ''
            };
          }).filter(j => j.title && j.link);
          console.log(`[API Intercept] 成功攔截並解析了 ${interceptedJobs.length} 個職缺`);
        }
      } catch (err) {
        console.error('[API Intercept] 解析 JSON 響應失敗:', err.message);
      }
    }
  });

  for (let p = 1; p <= pageCount; p++) {
    const url = getPageUrl(targetUrl, p);
    console.log(`正在爬取第 ${p} 頁: ${url}`);
    interceptedJobs = []; // reset for new page
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for a few seconds to let client JS execute and trigger the API call
    await page.waitForTimeout(6000);

    // Check if there are actually 0 results (to avoid crawling unrelated "Recommended Jobs")
    const totalCount = await page.evaluate(() => {
      const countEl = document.querySelector('.js-job-header-count, .job-count');
      if (countEl) {
        const text = countEl.innerText.trim();
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : -1;
      }
      if (document.body.innerText.includes('共 0 筆') || document.body.innerText.includes('目前條件搜尋結果有點少')) {
        return 0;
      }
      return -1;
    });

    console.log(`[Crawler] 104 搜尋結果數量: ${totalCount}`);
    if (totalCount === 0) {
      console.log('[Crawler] 偵測到搜尋結果為 0 筆，忽略 104 推薦職缺，直接結束爬取。');
      break;
    }

    let pageJobs = [];
    if (interceptedJobs.length > 0) {
      pageJobs = [...interceptedJobs];
    } else {
      // Fallback to DOM-based parsing if API interception failed
      console.log('未偵測到 API 攔截內容，嘗試從 HTML DOM 解析...');
      pageJobs = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('article.js-job-item'));
        return items.map(item => {
          const linkEl = item.querySelector('a.js-job-link');
          const title = linkEl ? linkEl.textContent.trim() : '';
          let link = linkEl ? linkEl.getAttribute('href') : '';
          
          if (link && link.startsWith('//')) {
            link = 'https:' + link;
          }
          if (link) {
            const qIdx = link.indexOf('?');
            if (qIdx !== -1) {
              link = link.substring(0, qIdx);
            }
          }

          const company = item.getAttribute('data-cust-name') || item.querySelector('.b-list-inline a')?.textContent.trim() || '';
          
          const tags = Array.from(item.querySelectorAll('.b-tag--default, .job-list-tag span, .b-list-inline li'));
          let salary = '面議';
          for (const tag of tags) {
            const text = tag.textContent.trim();
            if (text.includes('月薪') || text.includes('時薪') || text.includes('年薪') || text.includes('面議')) {
              salary = text;
              break;
            }
          }

          let location = '';
          const locLi = item.querySelector('.b-list-inline li, .job-list-item__info span');
          if (locLi) {
            location = locLi.textContent.trim();
          }

          const description = item.querySelector('p.job-list-item__info, .job-list-item__info')?.textContent.trim() || '';

          return {
            title,
            link,
            company,
            salary,
            location,
            description
          };
        }).filter(j => j.title && j.link);
      });
    }

    console.log(`第 ${p} 頁獲取了 ${pageJobs.length} 個職缺`);
    allJobs = allJobs.concat(pageJobs);

    if (allJobs.length >= maxJobs) {
      allJobs = allJobs.slice(0, maxJobs);
      break;
    }
  }

  // Now crawl detailed info for the extracted jobs (up to maxJobs) using AJAX fetching in page context
  const jobsWithDetails = [];
  const crawlLimit = Math.min(allJobs.length, maxJobs);

  console.log(`正在透過 AJAX 獲取 ${crawlLimit} 個職缺的詳細內容...`);

  for (let i = 0; i < crawlLimit; i++) {
    const job = allJobs[i];
    console.log(`正在獲取職缺詳情 (${i + 1}/${crawlLimit}): ${job.title} - ${job.company}`);
    
    try {
      // Extract job ID from link (e.g., https://www.104.com.tw/job/7xxxx)
      const match = job.link.match(/\/job\/([a-zA-Z0-9]+)/);
      const jobId = match ? match[1] : null;
      
      if (!jobId) {
        throw new Error('無法從連結解析職缺 ID');
      }

      // Fetch detail via AJAX inside the page context to bypass anti-bot WAF and reuse cookies
      const ajaxUrl = `https://www.104.com.tw/job/ajax/content/${jobId}`;
      
      const details = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, {
            headers: {
              'Referer': window.location.origin + window.location.pathname,
              'Accept': 'application/json, text/plain, */*'
            }
          });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const json = await res.json();
          return json.data;
        } catch (e) {
          return { error: e.message };
        }
      }, ajaxUrl);

      if (details.error) {
        throw new Error(details.error);
      }

      // Parse description and requirements
      const descText = details.jobDetail?.jobDescription || '';
      const otherReq = details.condition?.other || '';
      const workExp = details.condition?.workExp || '';
      const edu = details.condition?.edu || '';
      
      const specialtyList = (details.condition?.specialty || []).map(s => s.description).join(', ');
      const skillList = (details.condition?.skill || []).map(s => s.description).join(', ');
      
      const fullDesc = `${descText}\n\n【條件要求】\n工作經驗: ${workExp}\n學歷要求: ${edu}\n擅長工具: ${specialtyList}\n工作技能: ${skillList}\n其他條件:\n${otherReq}`;

      // Determine job type (full time vs part time)
      const jobTypeDesc = details.jobDetail?.jobType?.description || '';
      let isFullTime = true;
      if (jobTypeDesc.includes('兼職') || jobTypeDesc.includes('工時') || jobTypeDesc.includes('部分工時')) {
        isFullTime = false;
      }

      // Country detection
      const addressRegion = details.jobDetail?.addressRegion || '';
      let country = '台灣';
      if (addressRegion.includes('日本')) country = '日本';
      else if (addressRegion.includes('新加坡')) country = '新加坡';
      else if (addressRegion.includes('美國')) country = '美國';
      else if (addressRegion.includes('中國')) country = '中國';

      const industry = details.industryDesc || details.header?.industryDesc || '';
      const jobCategories = (details.jobDetail?.jobCategory || []).map(c => c.description).filter(Boolean);

      jobsWithDetails.push({
        ...job,
        fullDescription: fullDesc,
        isFullTime,
        country: country,
        industry: industry,
        categories: jobCategories
      });
    } catch (err) {
      console.error(`獲取職缺詳情失敗 ${job.link} (嘗試使用備用 DOM 爬取方式):`, err.message);
      
      // Fallback: Navigate browser to the page and parse DOM directly (original method)
      try {
        await page.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1000 + Math.random() * 1000);
        
        const details = await page.evaluate(() => {
          const descEl = document.querySelector('.job-description__content, .job-description, [class*="description"]');
          const reqEl = document.querySelector('.job-requirement, [class*="requirement"]');
          
          const descText = descEl ? descEl.innerText.trim() : '';
          const reqText = reqEl ? reqEl.innerText.trim() : '';
          
          let isFullTime = true;
          let country = '台灣';
          
          const pageText = document.body.innerText;
          if (pageText.includes('兼職') || pageText.includes('工時') || pageText.includes('部分工時')) {
            isFullTime = false;
          }
          if (pageText.includes('全職')) {
            isFullTime = true;
          }

          if (pageText.includes('日本')) country = '日本';
          else if (pageText.includes('新加坡')) country = '新加坡';
          else if (pageText.includes('美國')) country = '美國';
          else if (pageText.includes('中國')) country = '中國';

          const industryEl = document.querySelector('a[trigger-click="company-industry"], [class*="industry"]');
          const industry = industryEl ? industryEl.innerText.trim() : '';
          
          const categoryEls = Array.from(document.querySelectorAll('.job-description-table__data a, [class*="jobCategory"] a, [class*="job-description"] [class*="category"] a'));
          const categories = categoryEls.map(el => el.innerText.trim()).filter(Boolean);

          return {
            fullDescription: reqEl ? `${descText}\n\n【條件要求】\n${reqText}` : descText || pageText,
            isFullTime,
            country,
            industry,
            categories
          };
        });

        jobsWithDetails.push({
          ...job,
          fullDescription: details.fullDescription || job.description,
          isFullTime: details.isFullTime,
          country: details.country,
          industry: details.industry || '',
          categories: details.categories || []
        });
      } catch (domErr) {
        console.error(`備用 DOM 爬取也失敗 ${job.link}:`, domErr.message);
        jobsWithDetails.push({
          ...job,
          fullDescription: job.description,
          isFullTime: true,
          country: '台灣',
          industry: '',
          categories: []
        });
      }
    }
    
    // Delay to avoid WAF rate limits (AJAX requests can be faster, e.g., 200-400ms delay)
    await page.waitForTimeout(200 + Math.random() * 200);
  }
  return jobsWithDetails;
}

// Helper function to crawl LinkedIn jobs
async function crawlLinkedInJobs(page, targetUrl, pageCount = 1, maxJobs = 10) {
  // Helper to dismiss any login modal/auth wall
  const dismissLoginModal = async (p) => {
    try {
      const dismissSelector = 'button.modal__dismiss, button.contextual-sign-in-modal__modal-dismiss, button[aria-label="Dismiss"], button[data-tracking-control-name="public_jobs_contextual-sign-in-modal_modal_dismiss"], button.sign-in-modal__outlet-btn';
      const dismissBtn = await p.$(dismissSelector);
      if (dismissBtn && await dismissBtn.isVisible()) {
        console.log('[LinkedIn] 偵測到登入彈窗，自動點擊關閉按鈕...');
        await dismissBtn.click();
        await p.waitForTimeout(1000);
      }
    } catch (e) {
      // ignore
    }
  };

  // Helper to check for login page redirect and wait for manual action
  const checkLoginRedirect = async (p) => {
    try {
      const currentUrl = p.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/signup') || currentUrl.includes('checkpoint') || currentUrl.includes('authwall') || currentUrl.includes('challenge')) {
        console.log('[LinkedIn] ⚠️ 偵測到被導向登入或驗證碼挑戰頁面！將暫停並等待您完成登入或驗證...');
        
        const startTime = Date.now();
        const loginTimeout = 120000; // Wait up to 120 seconds
        let loggedIn = false;
        
        while (Date.now() - startTime < loginTimeout) {
          try {
            const url = p.url();
            if (url.includes('/feed') || url.includes('/feed/') || url.includes('/search/results/')) {
              loggedIn = true;
              break;
            }
            const hasNav = await p.evaluate(() => {
              return document.querySelector('.global-nav, #global-nav, .feed-identity-module, .nav-main__profile-member-photo') !== null;
            });
            if (hasNav) {
              loggedIn = true;
              break;
            }
          } catch (evalErr) {
            // ignore context destroyed during redirects
          }
          await p.waitForTimeout(1500);
        }
        
        if (loggedIn) {
          console.log('[LinkedIn] 🎉 登入/驗證成功，繼續執行先前操作...');
          await p.waitForTimeout(3000);
        } else {
          console.log('[LinkedIn] ⚠️ 等待登入/驗證超時，將嘗試繼續流程...');
        }
      }
    } catch (e) {
      console.log('[LinkedIn] 檢查登入跳轉發生錯誤:', e.message);
    }
  };

  console.log('[LinkedIn] 正在確認帳號登入狀態...');
  let isLoggedIn = false;
  try {
    // Navigate to feed - only accessible when logged in
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    isLoggedIn = currentUrl.includes('/feed');
  } catch (e) {
    console.log('[LinkedIn] 登入狀態檢查發生錯誤，將預設為未登入:', e.message);
  }

  if (!isLoggedIn) {
    console.log('[LinkedIn] ⚠️ 偵測到尚未登入帳號。正在為您開啟登入畫面，請在開啟的 Chromium 視窗中完成登入...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
    
    // Wait for manual login (wait for global navbar or similar logged-in URL state)
    try {
      const startTime = Date.now();
      const loginTimeout = 180000; // 180 seconds (3 minutes) to allow enough time for Google OAuth / 2FA
      let loggedIn = false;
      
      console.log('[LinkedIn] ⏳ 正在等待您手動登入或完成驗證，系統會持續監測登入狀態 (限時 180 秒)...');
      while (Date.now() - startTime < loginTimeout) {
        try {
          const currentUrl = page.url();
          // Check if navigated to feed, or a logged-in page
          if (currentUrl.includes('/feed') || currentUrl.includes('/feed/') || currentUrl.includes('/search/results/')) {
            loggedIn = true;
            break;
          }
          
          // Also evaluate page DOM to see if global navigation or identity modules are present
          const hasNav = await page.evaluate(() => {
            return document.querySelector('.global-nav, #global-nav, .feed-identity-module, .nav-main__profile-member-photo') !== null;
          });
          
          if (hasNav) {
            loggedIn = true;
            break;
          }
        } catch (evalErr) {
          console.log('[LinkedIn] 瀏覽器載入中，等待下一次檢測...');
        }
        
        await page.waitForTimeout(1500); // Check every 1.5 seconds
      }
      
      if (loggedIn) {
        console.log('[LinkedIn] 🎉 偵測到登入成功！準備開始進行職缺爬取...');
        await page.waitForTimeout(4000); // Wait 4 seconds for page elements to settle down
      } else {
        console.log('[LinkedIn] ⚠️ 登入等待超時 (180 秒)，嘗試直接存取搜尋網址...');
      }
    } catch (loginErr) {
      console.log('[LinkedIn] ⚠️ 登入檢測發生異常，嘗試直接存取搜尋網址...', loginErr.message);
    }
  } else {
    console.log('[LinkedIn] ✓ 偵測到已登入帳號，跳過登入流程...');
  }

  let allRawJobs = [];

  for (let p = 1; p <= pageCount; p++) {
    const pageUrl = getLinkedInPageUrl(targetUrl, p);
    console.log(`[LinkedIn] 正在載入搜尋網址 (第 ${p}/${pageCount} 頁): ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    
    await checkLoginRedirect(page);
    await dismissLoginModal(page);

    console.log(`[LinkedIn] 等待第 ${p} 頁職缺列表載入...`);
    try {
      const listSelector = '.jobs-search__results-list li, .base-card, .base-search-card, .jobs-search-results-list, .jobs-search-results-list__container, .jobs-search-results__list-item, .job-card-container, [data-job-id], li[data-job-id], div[data-job-id]';
      await page.waitForSelector(listSelector, { timeout: 15000 });
      console.log(`[LinkedIn] 第 ${p} 頁職缺列表已載入！`);
    } catch (err) {
      console.log(`[LinkedIn] 警告：等待第 ${p} 頁職缺列表載入超時，將嘗試直接解析 DOM...`);
    }

    // Auto-scroll to load cards (LinkedIn lazy loads job cards as we scroll)
    let scrollCount = 0;
    let prevCount = 0;
    let noNewCardsAttempts = 0;
    
    while (scrollCount < 8 && noNewCardsAttempts < 3) {
      scrollCount++;
      console.log(`[LinkedIn] 滾動加載第 ${scrollCount} 次...`);
      
      await checkLoginRedirect(page);
      await dismissLoginModal(page);

      // In logged-in view, scroll is inside left pane sidebar list element
      await page.evaluate(() => {
        const listEl = document.querySelector('.jobs-search-results-list, .jobs-search-results-list__container, [class*="results-list"]');
        if (listEl) {
          listEl.scrollBy(0, 1000);
        } else {
          window.scrollBy(0, 1000);
        }
      });
      await page.waitForTimeout(1500);

      // Try clicking "See more jobs" button if visible
      try {
        const showMoreButton = await page.$('button.infinite-scroller__show-more-button, button[aria-label="See more jobs"]');
        if (showMoreButton && await showMoreButton.isVisible()) {
          console.log(`[LinkedIn] 點擊「See more jobs」按鈕`);
          await showMoreButton.click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        // ignore button errors
      }

      const currentCardsCount = await page.evaluate(() => {
        return document.querySelectorAll(
          '.jobs-search__results-list li, .base-card, .base-search-card, .jobs-search-results__list-item, .jobs-search-results-list__list-item, .job-card-container, [data-job-id]'
        ).length;
      });

      if (currentCardsCount === prevCount) {
        noNewCardsAttempts++;
      } else {
        noNewCardsAttempts = 0;
      }
      prevCount = currentCardsCount;

      if (currentCardsCount >= maxJobs) {
        break;
      }
    }

    // Extract list items (handles both logged-in and guest formats)
    const pageRawJobs = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(
        '.jobs-search__results-list li, .base-card, .base-search-card, .jobs-search-results-list__list-item, .jobs-search-results__list-item, .job-card-container, li[data-job-id], div[data-job-id]'
      ));
      
      return cards.map(card => {
        let linkEl = card.querySelector('a[href*="/jobs/view/"]');
        if (!linkEl) {
          linkEl = card.querySelector('a.job-card-list__title, a.job-card-container__link, a.base-card__full-link, a[data-tracking-control-name="public_jobs_jserp-result_search-card"]');
        }

        let companyEl = card.querySelector('.job-card-container__company-name, .job-card-container__primary-description, .base-search-card__subtitle, [class*="company-name"], [class*="subtitle"]');
        if (!companyEl) {
          companyEl = card.querySelector('h4');
        }

        let locEl = card.querySelector('.job-card-container__metadata-item, .job-card-container__metadata-wrapper li, .job-search-card__location, [class*="metadata"], [class*="location"]');
        const snippetEl = card.querySelector('p.job-search-card__snippet, .job-search-card__snippet');

        let title = linkEl ? linkEl.innerText.trim() : '';
        let link = linkEl ? linkEl.getAttribute('href') : '';
        let company = companyEl ? companyEl.innerText.trim() : '';
        let location = locEl ? locEl.innerText.trim() : '';
        let description = snippetEl ? snippetEl.innerText.trim() : '';

        if (link) {
          try {
            link = new URL(link, window.location.href).href;
          } catch (e) {
            if (link.startsWith('/')) {
              link = window.location.origin + link;
            }
          }
        }

        if (title) {
          title = title.split('\n')[0].trim();
        }
        return {
          title,
          link,
          company,
          salary: '面議',
          location,
          description
        };
      }).filter(c => c.title && c.link);
    });

    console.log(`[LinkedIn] 第 ${p} 頁獲取了 ${pageRawJobs.length} 個職缺`);
    allRawJobs = allRawJobs.concat(pageRawJobs);

    // De-duplicate immediately to check if we hit maxJobs
    const uniqueJobIds = new Set();
    const tempUnique = [];
    for (const job of allRawJobs) {
      const jobIdMatch = job.link.match(/\/view\/.*?(\d+)/) || job.link.match(/-(\d+)/) || job.link.match(/\/view\/(\d+)/);
      const jobId = jobIdMatch ? jobIdMatch[1] : job.link;
      if (!uniqueJobIds.has(jobId)) {
        uniqueJobIds.add(jobId);
        tempUnique.push(job);
      }
    }
    if (tempUnique.length >= maxJobs) {
      console.log(`[LinkedIn] 達到指定的職缺上限 ${maxJobs}，停止分頁讀取。`);
      break;
    }
  }

  const uniqueJobs = [];
  const seenJobIds = new Set();
  for (const job of allRawJobs) {
    const jobIdMatch = job.link.match(/\/view\/.*?(\d+)/) || job.link.match(/-(\d+)/) || job.link.match(/\/view\/(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : job.link;
    if (!seenJobIds.has(jobId)) {
      seenJobIds.add(jobId);
      uniqueJobs.push(job);
    }
  }

  const jobsToCrawl = uniqueJobs.slice(0, maxJobs);
  console.log(`[LinkedIn] 取得 ${jobsToCrawl.length} 個待抓取詳情職缺`);

  const jobsWithDetails = [];
  for (let i = 0; i < jobsToCrawl.length; i++) {
    const job = jobsToCrawl[i];
    
    // Extract job ID
    const jobIdMatch = job.link.match(/\/view\/.*?(\d+)/) || job.link.match(/-(\d+)/) || job.link.match(/\/view\/(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : null;

    console.log(`[LinkedIn] 正在獲取詳細內容 (${i + 1}/${jobsToCrawl.length}): ${job.title} - ${job.company} (連結: ${job.link})`);

    let detailPage;
    try {
      detailPage = await page.context().newPage();
      await detailPage.goto(job.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      await checkLoginRedirect(detailPage);

      let details = { fullDescription: '', jobType: 'Full-time', industries: '' };
      const startTime = Date.now();
      const timeout = 12000; // 12 seconds to allow animation and text loading
      let hasClickedShowMore = false;
      
      const clickExpandBtn = async (p) => {
        try {
          const btnSelector = 'button[data-testid="expandable-text-button"], button.jobs-description__footer-button, button.show-more-less-html__button--more, button[class*="show-more-less-toggle"], button[aria-label*="Show more"], button[aria-label*="更多"]';
          const expandBtn = p.locator(btnSelector).first();
          if (await expandBtn.isVisible()) {
            const spanSelector = 'button[data-testid="expandable-text-button"] span, button.jobs-description__footer-button span, button.show-more-less-html__button--more span';
            const expandSpan = p.locator(spanSelector).first();
            if (await expandSpan.isVisible()) {
              await expandSpan.click({ force: true, timeout: 3000 });
              console.log('[LinkedIn] 成功原生點擊展開按鈕的子 span 元素');
            } else {
              await expandBtn.click({ force: true, timeout: 3000 });
              console.log('[LinkedIn] 成功原生點擊展開按鈕本身');
            }
            return true;
          }
          return false;
        } catch (err) {
          console.log('[LinkedIn] 嘗試原生點擊展開按鈕時發生錯誤:', err.message);
          return false;
        }
      };

      // Try initial click
      hasClickedShowMore = await clickExpandBtn(detailPage);
      if (hasClickedShowMore) {
        await detailPage.waitForTimeout(1000);
      }
      
      while (Date.now() - startTime < timeout) {
        // If not clicked yet or needs retry
        if (!hasClickedShowMore) {
          hasClickedShowMore = await clickExpandBtn(detailPage);
          if (hasClickedShowMore) {
            await detailPage.waitForTimeout(800);
          }
        }

        // 2. Extract description using standard selectors and logged-in selectors
        details = await detailPage.evaluate(() => {
          // 1. Try stable LinkedIn AboutTheJob SDUI components
          let descEl = document.querySelector('[data-sdui-component*="aboutTheJob"], [componentkey*="AboutTheJob"]');
          
          // 2. Try classic class name selectors
          if (!descEl) {
            descEl = document.querySelector(
              '.show-more-less-html__markup, .description__text, .job-description, .job-details-description, #job-details, .jobs-description-content__text, .jobs-box__html-content, .jobs-description-content'
            );
          }
          
          // 3. Fallback: Search for element containing "關於該職缺" or "About the job" and get its parent/siblings
          if (!descEl) {
            const headers = Array.from(document.querySelectorAll('h2, h3, h4, div, span'));
            const targetHeader = headers.find(el => {
              const t = el.innerText?.trim();
              return t === '關於該職缺' || t === 'About the job' || t === 'About the position';
            });
            if (targetHeader && targetHeader.parentElement) {
              descEl = targetHeader.parentElement;
            }
          }
          
          const descText = descEl ? descEl.innerText.trim() : '';

          if (descText.length < 50) {
            return { fullDescription: '', jobType: 'Full-time', industries: '' };
          }

          // If the description text still contains unexpanded indicators, keep waiting
          const pageText = document.body.innerText;
          const hasUnexpandedIndicator = pageText.includes('… 更多') || pageText.includes('... 更多') || pageText.includes('… Show more') || pageText.includes('... Show more');
          if (hasUnexpandedIndicator && descText.length < 500) {
            return { fullDescription: '', jobType: 'Full-time', industries: '' };
          }

          // Extract job type robustly using keyword scan on the page text
          let jobType = 'Full-time';
          if (pageText.includes('約聘') || pageText.includes('Contract') || pageText.includes('Contractor')) {
            jobType = 'Contract / 約聘';
          } else if (pageText.includes('兼職') || pageText.includes('Part-time')) {
            jobType = 'Part-time / 兼職';
          } else if (pageText.includes('實習') || pageText.includes('Intern')) {
            jobType = 'Internship / 實習';
          } else if (pageText.includes('全職') || pageText.includes('Full-time')) {
            jobType = 'Full-time / 全職';
          }

          // Try to find industries in standard criteria list
          const criteria = Array.from(document.querySelectorAll('.job-criteria__item, .job-criteria__list li, .jobs-description-details__list-item'));
          let industries = '';
          for (const item of criteria) {
            const subheader = item.querySelector('.job-criteria__subheader, .job-criteria__title, .jobs-description-details__list-item-subtitle')?.innerText || '';
            const text = item.querySelector('.job-criteria__text, .job-criteria__description, .jobs-description-details__list-item-value')?.innerText || '';
            if (subheader.includes('Industries') || subheader.includes('產業') || subheader.includes('Industry') || subheader.includes('產業別')) {
              industries = text;
            }
          }

          return {
            fullDescription: descText,
            jobType,
            industries
          };
        });

        if (details.fullDescription) {
          console.log(`[LinkedIn] 成功獲取完整描述，長度: ${details.fullDescription.length}`);
          break;
        }
        console.log(`[LinkedIn] 描述尚未載入、展開或長度不足，等待中...`);
        await detailPage.waitForTimeout(800);
      }

      // Close the tab
      await detailPage.close();

      let isFullTime = true;
      const jobTypeLower = details.jobType.toLowerCase();
      if (jobTypeLower.includes('part-time') || jobTypeLower.includes('兼職') || jobTypeLower.includes('intern') || jobTypeLower.includes('實習') || jobTypeLower.includes('temporary')) {
        isFullTime = false;
      }

      let country = detectCountry(job.location);

      jobsWithDetails.push({
        ...job,
        fullDescription: details.fullDescription ? `${details.fullDescription}\n\n【條件要求】\n工作性質: ${details.jobType}\n產業別: ${details.industries}` : job.description,
        isFullTime,
        country,
        industry: details.industries,
        categories: []
      });
    } catch (err) {
      console.error(`[LinkedIn] 獲取詳情失敗: ${job.link} (錯誤: ${err.message})`);
      if (detailPage) await detailPage.close().catch(() => {});
      jobsWithDetails.push({
        ...job,
        fullDescription: job.description,
        isFullTime: true,
        country: detectCountry(job.location),
        industry: '',
        categories: []
      });
    }
  }

  return jobsWithDetails;
}

// 2. Crawl Jobs Endpoint (Supports both 104 and LinkedIn)
app.post('/api/crawl-jobs', async (req, res) => {
  let { targetUrl, pageCount = 1, maxJobs = 10 } = req.body;

  if (!targetUrl) {
    return res.status(400).json({ error: '請提供目標求職搜尋連結' });
  }

  const isLinkedIn = targetUrl.includes('linkedin.com');
  const is104 = targetUrl.includes('104.com.tw');

  if (!isLinkedIn && !is104) {
    return res.status(400).json({ error: '目前僅支援 104 人力銀行與 LinkedIn 平台的搜尋連結！' });
  }

  let context;
  try {
    const userDataDir = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.chrome_user_data');
    
    // Clean up Chromium stale lock files to prevent startup crash or lock conflicts
    try {
      const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
      for (const file of lockFiles) {
        const lockPath = path.join(userDataDir, file);
        if (fs.existsSync(lockPath)) {
          console.log(`[Cleaner] 偵測到殘留的鎖定檔案 ${file}，正在自動清除...`);
          fs.unlinkSync(lockPath);
        }
      }
    } catch (cleanErr) {
      console.log('[Cleaner] 清除鎖定檔案失敗 (可能是瀏覽器已在運行中):', cleanErr.message);
    }

    console.log(`正在以有頭持久化模式啟動 Chromium 瀏覽器 (設定檔路徑: ${userDataDir})...`);
    
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      locale: isLinkedIn ? 'en-US' : 'zh-TW',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    let jobsWithDetails = [];

    if (isLinkedIn) {
      jobsWithDetails = await crawlLinkedInJobs(page, targetUrl, pageCount, maxJobs);
    } else {
      jobsWithDetails = await crawl104Jobs(page, targetUrl, pageCount, maxJobs);
    }

    await context.close();
    res.json({ jobs: jobsWithDetails });
  } catch (error) {
    console.error('爬蟲失敗:', error);
    if (context) await context.close();
    res.status(500).json({ error: '爬取職缺失敗: ' + error.message });
  }
});

// 3. Match Resume and Job Endpoint
app.post('/api/match-job', async (req, res) => {
  const { resumeText, job, criteria, apiKey, analysisMode = 'gemini', ollamaUrl = 'http://localhost:11434', ollamaModel = 'qwen2.5:7b' } = req.body;

  if (analysisMode === 'gemini') {
    const currentApiKey = apiKey || process.env.GEMINI_API_KEY;
    if (!currentApiKey) {
      return res.status(400).json({ error: '請提供 Gemini API 金鑰' });
    }
  }

  if (!resumeText) {
    return res.status(400).json({ error: '請提供履歷內容' });
  }

  if (!job) {
    return res.status(400).json({ error: '請提供要匹配的職缺資料' });
  }

  try {
    if (analysisMode === 'ollama') {
      const systemPrompt = `你是一位極其嚴格的科技業資深招募經理與職涯顧問。你的任務是評估求職者的履歷與特定職缺描述之間的【專業領域匹配度】與【核心技術匹配度】，並以繁體中文 (Traditional Chinese) 返回一個嚴格格式化的 JSON 物件。

請遵循以下【黃金審查規則】來決定總體匹配分數 (score, 0-100)：
1. 【專業角色與領域對齊 (最重要)】：
   - 首先分析求職者履歷，確定求職者的主要專業領域（例如：程式開發/軟體工程、3D美術設計、3D建模、專案管理PM、會計等）。
   - 接著分析職缺，確定該職缺要求的核心專業角色。
   - 如果兩者領域不對齊（例如：求職者是「網頁開發工程師/軟體工程師」，但職缺是「3D美術設計師/3D建模師/動畫師」；或者求職者是「美術設計」，但職缺是「C++ 3D遊戲引擎工程師」），此為【嚴重領域錯配】。在此情況下，總分 (score) 絕對不能超過 35 分！
2. 【技術能力深度比對】：
   - 逐一比對職缺要求的工具與技術（如 3D Max, Maya, Blender, ZBrush, React, C++ 等）是否在求職者履歷中「確實有使用經驗或專案成果」。
   - 不能僅因為職缺名稱或描述中包含某個關鍵字（如 "3D"），就把一個完全不需要編程的 3D 美術職缺，判定為與程式設計師履歷匹配。
   - 如果求職者履歷完全沒有職缺所需的核心設計軟體或核心開發工具經驗，總分 (score) 必須予以嚴厲扣分（每少一項核心工具/技術扣 15-20 分）。
3. 【使用者指定偏好扣分】：
   - 工作地區不符（如指定台北市但職缺在桃園市）：扣 35 分。
   - 工作性質不符（如指定全職但職缺為兼職/實習）：扣 30 分。
   - 國家地區不符：扣 40 分。

如果有多項不符或專業領域錯配，分數必須在 30 分以下，並在 summary 中嚴厲且明確地指出「專業領域不匹配，本職缺為XX角色，而求職者背景為XX」。`;

      const userPrompt = `
【求職者履歷文字】
${resumeText}

【目標職缺資料】
公司名稱: ${job.company}
職缺名稱: ${job.title}
薪資待遇: ${job.salary}
工作地點: ${job.location}
工作類型: ${job.isFullTime ? '全職' : '兼職/其他'}
國家/地區: ${job.country}
詳細職缺描述與條件要求:
${job.fullDescription}

【使用者本次指定的篩選需求與偏好（重要核對標準）】
指定技術能力: ${criteria.techSkills || '無特別指定（全面比對）'}
指定工作地區: ${criteria.location || '無特別指定'}
工作性質要求: ${criteria.jobType || '無特別指定'}
指定國家: ${criteria.country || '無特別指定'}

請嚴格分析並以下列 JSON 格式回傳評估結果（請只輸出合法的 JSON，不要包含 Markdown 標記如 \`\`\`json）：
{
  "score": 85,
  "summary": "簡短的匹配總結，說明為什麼符合或不符合，並明確指出哪些使用者指定的條件（如地點、技術、性質）是不符合的",
  "matchedSkills": ["技能A", "技能B"],
  "missingSkills": ["技能C", "技能D"],
  "locationMatch": {
    "isMatch": true,
    "reason": "說明詳細比對原因"
  },
  "jobTypeMatch": {
    "isMatch": true,
    "reason": "說明詳細比對原因"
  },
  "countryMatch": {
    "isMatch": true,
    "reason": "說明詳細比對原因"
  },
  "advice": "針對該職缺，求職者應該如何修改履歷或準備面試的具體建議"
}
`;

      console.log(`[Ollama Match] 正在使用 Ollama 進行分析, 模型: ${ollamaModel}`);
      const contentText = await callOllamaChat(ollamaUrl, ollamaModel, systemPrompt, userPrompt);
      let jsonResult;
      try {
        jsonResult = JSON.parse(contentText);
      } catch (parseErr) {
        console.error('Ollama 回傳非標準 JSON, 嘗試清理:', contentText);
        const cleanText = contentText.replace(/```json|```/g, '').trim();
        jsonResult = JSON.parse(cleanText);
      }
      return res.json(jsonResult);
    }

    const currentApiKey = apiKey || process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(currentApiKey);

    const systemPrompt = `你是一位極其嚴格的科技業資深招募經理與職涯顧問。你的任務是評估求職者的履歷與特定職缺描述之間的【專業領域匹配度】與【核心技術匹配度】，並以繁體中文 (Traditional Chinese) 返回一個嚴格格式化的 JSON 物件。

請遵循以下【黃金審查規則】來決定總體匹配分數 (score, 0-100)：
1. 【專業角色與領域對齊 (最重要)】：
   - 首先分析求職者履歷，確定求職者的主要專業領域（例如：程式開發/軟體工程、3D美術設計、3D建模、專案管理PM、會計等）。
   - 接著分析職缺，確定該職缺要求的核心專業角色。
   - 如果兩者領域不對齊（例如：求職者是「網頁開發工程師/軟體工程師」，但職缺是「3D美術設計師/3D建模師/動畫師」；或者求職者是「美術設計」，但職缺是「C++ 3D遊戲引擎工程師」），此為【嚴重領域錯配】。在此情況下，總分 (score) 絕對不能超過 35 分！
2. 【技術能力深度比對】：
   - 逐一比對職缺要求的工具與技術（如 3D Max, Maya, Blender, ZBrush, React, C++ 等）是否在求職者履歷中「確實有使用經驗或專案成果」。
   - 不能僅因為職缺名稱或描述中包含某個關鍵字（如 "3D"），就把一個完全不需要編程的 3D 美術職缺，判定為與程式設計師履歷匹配。
   - 如果求職者履歷完全沒有職缺所需的核心設計軟體或核心開發工具經驗，總分 (score) 必須予以嚴厲扣分（每少一項核心工具/技術扣 15-20 分）。
3. 【使用者指定偏好扣分】：
   - 工作地區不符（如指定台北市但職缺在桃園市）：扣 35 分。
   - 工作性質不符（如指定全職但職缺為兼職/實習）：扣 30 分。
   - 國家地區不符：扣 40 分。

如果有多項不符或專業領域錯配，分數必須在 30 分以下，並在 summary 中嚴厲且明確地指出「專業領域不匹配，本職缺為XX角色，而求職者背景為XX」。`;

    const userPrompt = `
【求職者履歷文字】
${resumeText}

【目標職缺資料】
公司名稱: ${job.company}
職缺名稱: ${job.title}
薪資待遇: ${job.salary}
工作地點: ${job.location}
工作類型: ${job.isFullTime ? '全職' : '兼職/其他'}
國家/地區: ${job.country}
詳細職缺描述與條件要求:
${job.fullDescription}

【使用者本次指定的篩選需求與偏好（重要核對標準）】
指定技術能力: ${criteria.techSkills || '無特別指定（全面比對）'}
指定工作地區: ${criteria.location || '無特別指定'}
工作性質要求: ${criteria.jobType || '無特別指定'}
指定國家: ${criteria.country || '無特別指定'}

請嚴格分析並以下列 JSON 格式回傳評估結果（請只輸出合法的 JSON，不要包含 Markdown 標記如 \`\`\`json）：
{
  "score": 85,
  "summary": "簡短的匹配總結，說明為什麼符合或不符合，並明確指出哪些使用者指定的條件（如地點、技術、性質）是不符合的",
  "matchedSkills": ["技能A", "技能B"],
  "missingSkills": ["技能C", "技能D"],
  "locationMatch": {
    "isMatch": true,
    "reason": "說明詳細比對原因"
  },
  "jobTypeMatch": {
    "isMatch": true,
    "reason": "說明詳細比對原因"
  },
  "countryMatch": {
    "isMatch": true,
    "reason": "說明詳細比對原因"
  },
  "advice": "針對該職缺，求職者應該如何修改履歷或準備面試的具體建議"
}
`;

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'];
    let result = null;
    let lastError = null;
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts && !result) {
      attempt++;
      for (const modelName of modelsToTry) {
        try {
          console.log(`[AI Match] 正在嘗試使用模型: ${modelName} (第 ${attempt}/${maxAttempts} 輪嘗試)`);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json'
            }
          });
          
          result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: systemPrompt
          });
          
          console.log(`[AI Match] 模型 ${modelName} 比對成功！`);
          break;
        } catch (err) {
          console.error(`[AI Match] 模型 ${modelName} 發生錯誤:`, err.message);
          lastError = err;
          
          if (err.message.includes('404')) {
            // Model not supported, skip immediately without waiting
            continue;
          }
          
          if (err.message.includes('429') || err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('limit')) {
            console.log(`[AI Match] 偵測到 429 頻率限制，等待 3.5 秒...`);
            await new Promise(resolve => setTimeout(resolve, 3500));
          } else {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      if (!result && attempt < maxAttempts) {
        console.log(`[AI Match] 所有模型在此輪均失敗，等待 6 秒後進行第 ${attempt + 1} 輪重試...`);
        await new Promise(resolve => setTimeout(resolve, 6000));
      }
    }

    if (!result) {
      throw lastError || new Error('所有備用的 Gemini AI 模型均回應錯誤，無法完成比對。');
    }

    const responseText = result.response.text();
    let jsonResult;
    try {
      jsonResult = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Gemini 回傳非標準 JSON, 嘗試清理:', responseText);
      // Fallback cleanup
      const cleanText = responseText.replace(/```json|```/g, '').trim();
      jsonResult = JSON.parse(cleanText);
    }

    res.json(jsonResult);
  } catch (error) {
    console.error('Gemini AI 匹配失敗:', error);
    const isRateLimit = error.message?.includes('429') || error.message?.toLowerCase().includes('quota') || error.message?.toLowerCase().includes('limit');
    res.status(isRateLimit ? 429 : 500).json({ error: 'AI 匹配分析失敗: ' + error.message });
  }
});

// 4. Batch Match Resume and Jobs Endpoint
app.post('/api/match-jobs-batch', async (req, res) => {
  const { resumeText, jobs, criteria, apiKey } = req.body;

  const currentApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (!currentApiKey) {
    return res.status(400).json({ error: '請提供 Gemini API 金鑰' });
  }

  if (!resumeText) {
    return res.status(400).json({ error: '請提供履歷內容' });
  }

  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: '請提供要批量匹配的職缺列表' });
  }

  try {
    const genAI = new GoogleGenerativeAI(currentApiKey);

    const systemPrompt = `你是一位極其嚴格的科技業資深招募經理與職涯顧問。你的任務是評估求職者的履歷與一組職缺描述之間的【專業領域匹配度】與【核心技術匹配度】，並以繁體中文 (Traditional Chinese) 返回一個嚴格格式化的 JSON 陣列。

輸入包含求職者的履歷，以及多個待評估的職缺（以索引 0, 1, 2... 標記）。
你必須為【每一個輸入的職缺】產生一個對應的評估結果，並放入 JSON 陣列中。

請為每個職缺遵循以下【黃金審查規則】來決定總體匹配分數 (score, 0-100)：
1. 【專業角色與領域對齊 (最重要)】：
   - 首先分析求職者履歷，確定求職者的主要專業領域（例如：程式開發/軟體工程、3D美術設計、3D建模、專案管理PM、會計等）。
   - 接著分析職缺，確定該職缺要求的核心專業角色。
   - 如果兩者領域不對齊（例如：求職者是「網頁開發工程師/軟體工程師」，但職缺是「3D美術設計師/3D建模師/動畫師」；或者求職者是「美術設計」，但職缺是「C++ 3D遊戲引擎工程師」），此為【嚴重領域錯配】。在此情況下，總分 (score) 絕對不能超過 35 分！
2. 【技術能力深度比對】：
   - 逐一比對職缺要求的工具與技術（如 3D Max, Maya, Blender, ZBrush, React, C++ 等）是否在求職者履歷中「確實有使用經驗或專案成果」。
   - 不能僅因為職缺名稱或描述中包含某個關鍵字（如 "3D"），就把一個完全不需要編程的 3D 美術職缺，判定為與程式設計師履歷匹配。
   - 如果求職者履歷完全沒有職缺所需的核心設計軟體或核心開發工具經驗，總分 (score) 必須予以嚴厲扣分（每少一項核心工具/技術扣 15-20 分）。
3. 【使用者指定偏好扣分】：
   - 工作地區不符（如指定台北市但職缺在桃園市）：扣 35 分。
   - 工作性質不符（如指定全職但職缺為兼職/實習）：扣 30 分。
   - 國家地區不符：扣 40 分。

如果有多項不符或專業領域錯配，分數必須在 30 分以下，並在 summary 中嚴厲且明確地指出「專業領域不匹配，本職缺為XX角色，而求職者背景為XX」。

請嚴格分析並以下列 JSON 陣列格式回傳評估結果，長度必須恰好為輸入的職缺數量，且包含 "index" 屬性對應輸入職缺的索引（請只輸出合法的 JSON，不要包含 Markdown 標記如 \`\`\`json）：
[
  {
    "index": 0,
    "score": 85,
    "summary": "簡短的匹配總結，說明為什麼符合或不符合，並明確指出哪些使用者指定的條件（如地點、技術、性質）是不符合的",
    "matchedSkills": ["技能A", "技能B"],
    "missingSkills": ["技能C", "技能D"],
    "locationMatch": {
      "isMatch": true,
      "reason": "說明詳細比對原因"
    },
    "jobTypeMatch": {
      "isMatch": true,
      "reason": "說明詳細比對原因"
    },
    "countryMatch": {
      "isMatch": true,
      "reason": "說明詳細比對原因"
    },
    "advice": "針對該職缺，求職者應該如何修改履歷或準備面試的具體建議"
  }
]`;

    const userPrompt = `
【求職者履歷文字】
${resumeText}

【使用者本次指定的篩選需求與偏好（重要核對標準）】
指定技術能力: ${criteria.techSkills || '無特別指定（全面比對）'}
指定工作地區: ${criteria.location || '無特別指定'}
工作性質要求: ${criteria.jobType || '無特別指定'}
指定國家: ${criteria.country || '無特別指定'}

【待評估的職缺列表】
${jobs.map((job, idx) => `
--- 職缺索引: ${idx} ---
公司名稱: ${job.company}
職缺名稱: ${job.title}
薪資待遇: ${job.salary}
工作地點: ${job.location}
工作類型: ${job.isFullTime ? '全職' : '兼職/其他'}
國家/地區: ${job.country}
詳細描述: ${job.fullDescription.substring(0, 1500)}
`).join('\n')}

請為以上共 ${jobs.length} 個職缺進行評估，並回傳一個長度恰好為 ${jobs.length} 的 JSON 陣列，陣列中每個元素的 "index" 需對應職缺索引。
`;

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'];
    let result = null;
    let lastError = null;
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts && !result) {
      attempt++;
      for (const modelName of modelsToTry) {
        try {
          console.log(`[AI Batch Match] 正在嘗試使用模型: ${modelName} (第 ${attempt}/${maxAttempts} 輪嘗試)`);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json'
            }
          });
          
          result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: systemPrompt
          });
          
          console.log(`[AI Batch Match] 模型 ${modelName} 批量比對成功！`);
          break;
        } catch (err) {
          console.error(`[AI Batch Match] 模型 ${modelName} 發生錯誤:`, err.message);
          lastError = err;
          
          if (err.message.includes('404')) {
            continue;
          }
          
          if (err.message.includes('429') || err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('limit')) {
            console.log(`[AI Batch Match] 偵測到 429 頻率限制，等待 3.5 秒...`);
            await new Promise(resolve => setTimeout(resolve, 3500));
          } else {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      if (!result && attempt < maxAttempts) {
        if (lastError && (lastError.message.includes('429') || lastError.message.toLowerCase().includes('quota') || lastError.message.toLowerCase().includes('limit'))) {
          break; // break the attempt loop to let the frontend handle the wait
        }
        console.log(`[AI Batch Match] 所有模型在此輪均失敗，等待 6 秒後進行重試...`);
        await new Promise(resolve => setTimeout(resolve, 6000));
      }
    }

    if (!result) {
      throw lastError || new Error('所有備用的 Gemini AI 模型均回應錯誤，無法完成批量比對。');
    }

    const responseText = result.response.text();
    let jsonResult;
    try {
      jsonResult = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Gemini 回傳非標準 JSON, 嘗試清理:', responseText);
      const cleanText = responseText.replace(/```json|```/g, '').trim();
      jsonResult = JSON.parse(cleanText);
    }

    res.json({ results: jsonResult });
  } catch (error) {
    console.error('Gemini AI 批量匹配失敗:', error);
    const isRateLimit = error.message?.includes('429') || error.message?.toLowerCase().includes('quota') || error.message?.toLowerCase().includes('limit');
    res.status(isRateLimit ? 429 : 500).json({ error: 'AI 批量匹配分析失敗: ' + error.message });
  }
});

// 5. Fast Batch Match Resume and Jobs Endpoint (Returns only score and summary to optimize speed)
app.post('/api/match-jobs-batch-fast', async (req, res) => {
  const { resumeText, jobs, criteria, apiKey, analysisMode = 'gemini', ollamaUrl = 'http://localhost:11434', ollamaModel = 'qwen2.5:7b' } = req.body;

  if (analysisMode === 'gemini') {
    const currentApiKey = apiKey || process.env.GEMINI_API_KEY;
    if (!currentApiKey) return res.status(400).json({ error: '請提供 Gemini API 金鑰' });
  }

  if (!resumeText) return res.status(400).json({ error: '請提供履歷內容' });
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) return res.status(400).json({ error: '請提供要匹配的職缺列表' });

  try {
    const systemPrompt = `你是一位高效且嚴格的科技業招募篩選器。你的任務是評估求職者的履歷與一組職缺描述之間的匹配度，並以繁體中文 (Traditional Chinese) 返回一個精簡的 JSON 陣列。

請只為每個職缺生成 "score" (0-100) 與 "summary" (1-2 句話簡短總結符合或不符合的原因)。不要生成任何其他詳細資料。

請遵循以下規則決定總體匹配分數 (score, 0-100)：
1. 【專業領域對齊】：求職者主要背景與職缺核心角色如果不對齊（例如：軟體工程師 vs 3D美術設計），總分絕對不能超過 35 分！
2. 【技術能力比對】：比對職缺核心工具與技術是否在求職者履歷中確實有使用經驗。如果完全沒有，予以嚴厲扣分。
3. 【偏好核對】：如果地點、工作性質（全職/兼職）或國家不符，需嚴厲扣分（每項扣 30-40 分）。

【特別規定】：
- 返回的 JSON 陣列長度必須「完全等於」輸入的待評估職缺數量。
- 陣列中的每一個物件必須包含 "index"、"score"、"summary" 屬性。
- 必須精確保留每個職缺對應的 index（從 0 到 N-1），絕對不可漏掉任何一個。若資料不全，仍必須回傳該 index 並將 score 設為 0。
- 不要包含 Markdown 標記如 \`\`\`json，只輸出合法的 JSON。

請嚴格分析並以下列 JSON 陣列格式回傳評估結果：
[
  {
    "index": 0,
    "score": 85,
    "summary": "簡短的匹配總結，說明為什麼符合或不符合，並指出哪些關鍵條件不符合"
  }
]`;

    const userPrompt = `
【求職者履歷文字】
${resumeText}

【使用者本次指定的篩選需求】
指定技術能力: ${criteria.techSkills || '無特別指定'}
指定工作地區: ${criteria.location || '無特別指定'}
工作性質要求: ${criteria.jobType || '無特別指定'}
指定國家: ${criteria.country || '無特別指定'}

【待評估的職缺列表】
${jobs.map((job, idx) => `
--- 職缺索引: ${idx} ---
公司名稱: ${job.company}
職缺名稱: ${job.title}
工作地點: ${job.location}
工作類型: ${job.isFullTime ? '全職' : '兼職/其他'}
國家/地區: ${job.country}
詳細描述: ${job.fullDescription.substring(0, 1000)}
`).join('\n')}

請為以上共 ${jobs.length} 個職缺進行評估，並回傳一個長度恰好為 ${jobs.length} 的 JSON 陣列，陣列中每個元素的 "index" 需對應職缺索引。`;

    if (analysisMode === 'ollama') {
      console.log(`[Ollama Batch Match] 正在使用 Ollama 進行批次快速分析, 模型: ${ollamaModel}`);
      const contentText = await callOllamaChat(ollamaUrl, ollamaModel, systemPrompt, userPrompt);
      let jsonResult;
      try {
        jsonResult = JSON.parse(contentText);
      } catch (parseErr) {
        console.error('Ollama 批次回傳非標準 JSON, 嘗試清理:', contentText);
        const cleanText = contentText.replace(/```json|```/g, '').trim();
        jsonResult = JSON.parse(cleanText);
      }
      const finalResult = Array.isArray(jsonResult) ? jsonResult : (jsonResult.results || []);
      return res.json({ results: finalResult });
    }

    const currentApiKey = apiKey || process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(currentApiKey);



    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'];
    let result = null;
    let lastError = null;
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts && !result) {
      attempt++;
      for (const modelName of modelsToTry) {
        try {
          console.log(`[AI Fast Match] 正在嘗試使用模型: ${modelName} (第 ${attempt}/${maxAttempts} 輪嘗試)`);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json'
            }
          });
          
          result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            systemInstruction: systemPrompt
          });
          
          console.log(`[AI Fast Match] 模型 ${modelName} 快速比對成功！`);
          break;
        } catch (err) {
          console.error(`[AI Fast Match] 模型 ${modelName} 發生錯誤:`, err.message);
          lastError = err;
          if (err.message.includes('404')) continue;
          if (err.message.includes('429') || err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('limit')) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      if (!result && attempt < maxAttempts) {
        if (lastError && (lastError.message.includes('429') || lastError.message.toLowerCase().includes('quota') || lastError.message.toLowerCase().includes('limit'))) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (!result) throw lastError || new Error('所有備用模型均回應錯誤。');

    const responseText = result.response.text();
    let jsonResult;
    try {
      jsonResult = JSON.parse(responseText);
    } catch (e) {
      const cleanText = responseText.replace(/```json|```/g, '').trim();
      jsonResult = JSON.parse(cleanText);
    }

    res.json({ results: jsonResult });
  } catch (error) {
    console.error('Gemini AI 快速匹配失敗:', error);
    const isRateLimit = error.message?.includes('429') || error.message?.toLowerCase().includes('quota') || error.message?.toLowerCase().includes('limit');
    res.status(isRateLimit ? 429 : 500).json({ error: 'AI 快速匹配分析失敗: ' + error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`後端伺服器已啟動，監聽 Port ${PORT}`);
});
