/* ══════════════════════════════════════════════
   app.js — منطق التطبيق (البطاقات، واجهة المستخدم، الوسائط)
   خزنة المرور السحابية v2.1
══════════════════════════════════════════════ */

import {
  auth, db, doc, setDoc, deleteDoc,
  collection, query, orderBy, onSnapshot
} from './auth.js';

import { watchAuthState, prefillSavedEmail, logoutFromFirebase } from './auth.js';

/* ══════════════════════════════════════════════
   Cloudinary Config
══════════════════════════════════════════════ */
const CLOUDINARY_CLOUD  = 'dwbhzpobd';
const CLOUDINARY_PRESET = 'vault_upload';

/* ══════════════════════════════════════════════
   حالة التطبيق
══════════════════════════════════════════════ */
let currentUser       = null;
let entries           = [];
let unsubscribe       = null;
let isDemo            = false;
let activeCategory    = 'all';
let currentEditId     = null;
let selectedColorIdx  = 0;
let selectedImageBase64 = null;
let selectedImageType   = null;
let isUploading       = false;
let uploadMode        = 'crop'; // 'crop' | 'direct'

/* ══════════════════════════════════════════════
   شريط التحميل العلوي (يسقط من أعلى عند فتح الصفحة)
══════════════════════════════════════════════ */
function initTopLoadingBar() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (!isMobile) return; // فقط على الجوال

  /* إنشاء الشريط إذا لم يكن موجوداً */
  let bar = document.getElementById('topLoadingBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'topLoadingBar';
    document.body.prepend(bar);
  }

  /* عرض شاشة Splash على الجوال */
  const splash = document.getElementById('splashScreen');
  if (splash) splash.classList.add('visible');

  /* تفعيل شريط التحميل */
  bar.classList.add('active');

  /* إخفاء الشريط والـ Splash بعد تحميل الصفحة */
  const hideBoth = () => {
    bar.classList.remove('active');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 0.4s ease';
      setTimeout(() => { splash.classList.remove('visible'); splash.style.opacity = ''; }, 400);
    }
  };

  if (document.readyState === 'complete') {
    setTimeout(hideBoth, 600);
  } else {
    window.addEventListener('load', () => setTimeout(hideBoth, 600), { once: true });
  }
}

/* ══════════════════════════════════════════════
   CSRF & Security
══════════════════════════════════════════════ */
(function initCsrf() {
  let token = sessionStorage.getItem('csrf_token');
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map(b => b.toString(16).padStart(2,'0')).join('');
    sessionStorage.setItem('csrf_token', token);
  }
  window._csrfToken = token;
})();
window.verifyCsrf = (token) => token === window._csrfToken;

/* ══════════════════════════════════════════════
   مساعدات
══════════════════════════════════════════════ */
function showToast(msg, bg = '#10b981') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = bg;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}
window.showToast = showToast;

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ══════════════════════════════════════════════
   شريط التقدم
══════════════════════════════════════════════ */
function showProgress(pct, label = '') {
  const container = document.getElementById('progressContainer');
  const bar       = document.getElementById('uploadProgressBar');
  const lbl       = document.getElementById('progressLabel');
  const status    = document.getElementById('uploadStatus');
  if (container) container.style.display = 'block';
  if (bar)       bar.style.width = pct + '%';
  if (lbl)       { lbl.style.display = label ? 'block' : 'none'; lbl.textContent = label; }
  if (status)    status.textContent = pct < 100 ? `${Math.round(pct)}%` : '';
}
function hideProgress() {
  const container = document.getElementById('progressContainer');
  const lbl       = document.getElementById('progressLabel');
  const status    = document.getElementById('uploadStatus');
  if (container) container.style.display = 'none';
  if (lbl)       lbl.style.display = 'none';
  if (status)    status.textContent = '';
}

/* ══════════════════════════════════════════════
   رفع الصورة عبر Cloudinary
══════════════════════════════════════════════ */
async function uploadOriginalImage(uid, entryId, base64DataUrl, mimeType) {
  if (!base64DataUrl) throw new Error('لا توجد صورة للرفع');
  if (isDemo) return base64DataUrl;

  showProgress(5, '⏳ جاري الرفع إلى Cloudinary...');
  document.getElementById('uploadStatus').textContent = '⏳ جاري الرفع...';

  const formData = new FormData();
  formData.append('file', base64DataUrl);
  formData.append('upload_preset', CLOUDINARY_PRESET);
  formData.append('folder', `vault/${uid || 'demo'}`);
  formData.append('public_id', entryId);

  try {
    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

    return new Promise((resolve, reject) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct  = (e.loaded / e.total) * 90;
          const sent  = (e.loaded / 1024).toFixed(0);
          const total = (e.total  / 1024).toFixed(0);
          showProgress(pct, `⏳ ${sent} / ${total} KB`);
        }
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const res = JSON.parse(xhr.responseText);
            showProgress(100, '');
            document.getElementById('uploadStatus').textContent = '✅ تم الرفع بنجاح!';
            setTimeout(hideProgress, 800);
            resolve(res.secure_url);
          } catch(e) { hideProgress(); reject(new Error('فشل قراءة رد Cloudinary')); }
        } else {
          hideProgress();
          let errMsg = 'فشل الرفع';
          try { const d = JSON.parse(xhr.responseText); errMsg = d.error?.message || errMsg; } catch(_) {}
          document.getElementById('uploadStatus').textContent = '❌ ' + errMsg;
          showToast('⛔ ' + errMsg, '#ef4444');
          reject(new Error(errMsg));
        }
      };
      xhr.onerror = () => {
        hideProgress();
        const msg = '⛔ خطأ في الاتصال — تحقق من الإنترنت';
        document.getElementById('uploadStatus').textContent = msg;
        showToast(msg, '#ef4444');
        reject(new Error(msg));
      };
      xhr.ontimeout = () => {
        hideProgress();
        showToast('⛔ انتهت مهلة الرفع — حاول مجدداً', '#ef4444');
        reject(new Error('timeout'));
      };
      xhr.timeout = 120000;
      xhr.open('POST', url, true);
      xhr.send(formData);
    });
  } catch (err) {
    hideProgress();
    showToast('خطأ: ' + err.message, '#ef4444');
    throw err;
  }
}

/* ══════════════════════════════════════════════
   عرض البطاقات
══════════════════════════════════════════════ */
function renderCards() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const filtered = entries.filter(e =>
    (activeCategory === 'all' || e.category === activeCategory) &&
    ((e.name || '').toLowerCase().includes(q) || (e.note || '').toLowerCase().includes(q))
  );

  // ✅ تحديث عدادات البطاقات
  const totalCountEl = document.getElementById('totalCount');
  if (totalCountEl) {
    totalCountEl.textContent = entries.length;
  }

  // ✅ عد الصور المرفوعة بنجاح
  const photosCount = entries.filter(e => 
    (e.type === 'image' && e.imageUrl && e.imageUrl.trim() !== '') ||
    (e.originalImageUrl && e.originalImageUrl.trim() !== '')
  ).length;
  
  const photosCountEl = document.getElementById('photosCount');
  if (photosCountEl) {
    photosCountEl.textContent = photosCount;
  }

  const list = document.getElementById('cardsList');
  if (!filtered.length) {
    list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--muted2);">
      <div style="font-size:48px;margin-bottom:12px;">🔍</div>
      <div style="font-weight:700;">لا توجد نتائج</div>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(e => {
    if (e.type === 'image') {
      return `<div class="card" id="card-${e.id}" onclick="window.toggleCard('${e.id}')" style="border-right:4px solid ${c.accent};">
        <div class="card-header-row">
          <div class="card-title">
            <div class="card-icon" style="padding:0;">
              <img src="${escapeHtml(e.imageUrl)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
            </div>
            <div>
              <div style="font-weight:700;">${escapeHtml(e.name)}</div>
              <div style="font-size:11px;color:var(--muted2);">🖼️ صورة${e.note ? ' · 📝 ' + escapeHtml(e.note) : ''}</div>
            </div>
          </div>
        </div>
        <div class="card-body">
          <div style="border-radius:16px;overflow:hidden;margin-bottom:12px;max-height:240px;">
            <img src="${escapeHtml(e.imageUrl)}" style="width:100%;height:auto;max-height:240px;object-fit:contain;display:block;" loading="lazy">
          </div>
          <div style="display:flex;gap:8px;" onclick="event.stopPropagation()">
            <button style="flex:1;padding:11px 0;border-radius:40px;background:rgba(239,68,68,0.13);color:#f87171;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;" onclick="window.deleteEntry('${e.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>حذف
            </button>
            <button style="flex:1;padding:11px 0;border-radius:40px;background:rgba(59,130,246,0.13);color:#60a5fa;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;" onclick="window.shareEntry('${e.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>مشاركة
            </button>
            <button style="flex:1;padding:11px 0;border-radius:40px;background:rgba(16,185,129,0.13);color:#10b981;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;" onclick="window.downloadImage('${e.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>تحميل
            </button>
            <button style="flex:1;padding:11px 0;border-radius:40px;background:var(--card2);color:var(--text2);border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;gap:4px;" onclick="window.openEditImage('${e.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>تعديل
            </button>
          </div>
        </div>
      </div>`;
    } else {
      const CARD_COLORS = [
        {bg:'#1e3a5f',text:'#60a5fa',accent:'#3b82f6'},
        {bg:'#1a3a2a',text:'#34d399',accent:'#10b981'},
        {bg:'#3a1a1a',text:'#f87171',accent:'#ef4444'},
        {bg:'#3a2a1a',text:'#fbbf24',accent:'#f59e0b'},
        {bg:'#2a1a3a',text:'#a78bfa',accent:'#8b5cf6'},
        {bg:'#3a2010',text:'#fb923c',accent:'#f97316'},
        {bg:'#3a1a2a',text:'#f472b6',accent:'#ec4899'},
        {bg:'#0f2a3a',text:'#22d3ee',accent:'#06b6d4'},
        {bg:'#0f2a1a',text:'#4ade80',accent:'#22c55e'},
        {bg:'#2a2a0f',text:'#facc15',accent:'#eab308'}
      ];
      const colorIdx = (typeof e.color === 'number') ? e.color : 0;
      const c = CARD_COLORS[colorIdx % CARD_COLORS.length];
      const iconHtml = e.imageUrl
        ? `<div class="card-icon" style="padding:0;"><img src="${escapeHtml(e.imageUrl)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"></div>`
        : e.icon
          ? `<div class="card-icon" style="background:${c.bg};font-size:28px;display:flex;align-items:center;justify-content:center;">${e.icon}</div>`
          : `<div class="card-icon" style="background:${c.bg};color:${c.text};font-size:18px;">${escapeHtml(e.name.substring(0,2)).toUpperCase()}</div>`;
      const catMap = {work:'💼 عمل',personal:'👤 شخصي',banking:'🏦 بنوك',entertainment:'🎬 ترفيه',websites:'🌐 مواقع',other:'📁 أخرى',photos:'🖼️ صور'};
      const catLabel = catMap[e.category] || '📁 أخرى';
      const safePass  = escapeHtml(e.pass || '');
      const safeEmail = escapeHtml(e.email || '');
      const dateStr = e.createdAt ? new Date(e.createdAt).toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'}) : '';
      return `<div class="card" id="card-${e.id}" onclick="window.toggleCard('${e.id}')">
        <div class="card-header-row">
          <div class="card-title">
            ${iconHtml}
            <div>
              <div style="font-weight:700;">${escapeHtml(e.name)}</div>
              <div style="font-size:11px;color:var(--muted2);">${catLabel}${dateStr ? ' · ' + dateStr : ''}</div>
              ${e.note ? `<div style="font-size:11px;color:var(--muted2);margin-top:2px;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📝 ${escapeHtml(e.note)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="card-body">
          <div class="field">
            <span>📧 ${safeEmail}</span>
            <button class="btn-sm copy-btn" data-copy="${safeEmail}" data-label="الإيميل" onclick="event.stopPropagation();window.copyText(this.dataset.copy,this.dataset.label)">📋 نسخ</button>
          </div>
          <div class="field">
            <span>🔑 <span id="pwd-${e.id}">${safePass}</span></span>
            <div style="display:flex;gap:6px;">
              <button class="btn-sm copy-btn" data-copy="${safePass}" data-label="كلمة المرور" onclick="event.stopPropagation();window.copyText(this.dataset.copy,this.dataset.label)">📋 نسخ</button>
            </div>
          </div>
          ${e.url ? `<div class="field"><span>🔗 <a href="${escapeHtml(e.url)}" target="_blank" style="color:var(--blue);">${escapeHtml(e.url)}</a></span></div>` : ''}
          <div style="display:flex;gap:8px;margin-top:12px;" onclick="event.stopPropagation()">
            <button style="flex:1;padding:11px 0;border-radius:40px;background:rgba(239,68,68,0.13);color:#f87171;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;gap:5px;" onclick="window.deleteEntry('${e.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>حذف
            </button>
            <button style="flex:1;padding:11px 0;border-radius:40px;background:rgba(59,130,246,0.13);color:#60a5fa;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;gap:5px;" onclick="window.shareEntry('${e.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>مشاركة
            </button>
            <button style="flex:1;padding:11px 0;border-radius:40px;background:var(--card2);color:var(--text2);border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;gap:5px;" onclick="window.openEdit('${e.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>تعديل
            </button>
          </div>
        </div>
      </div>`;
    }
  }).join('');
}

window.toggleCard = (id) => document.getElementById(`card-${id}`)?.classList.toggle('expanded');

/* ══════════════════════════════════════════════
   نسخ النص
══════════════════════════════════════════════ */
window.copyText = function(text, label) {
  const doSuccess = () => {
    showToast('✅ تم نسخ ' + label);
    const activeBtn = document.activeElement;
    if (activeBtn && activeBtn.classList.contains('copy-btn')) {
      const orig = activeBtn.innerHTML;
      activeBtn.innerHTML = '✅';
      activeBtn.style.background = 'rgba(16,185,129,0.2)';
      activeBtn.style.color = '#10b981';
      setTimeout(() => { activeBtn.innerHTML = orig; activeBtn.style.background = ''; activeBtn.style.color = ''; }, 1500);
    }
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(doSuccess).catch(() => _fallbackCopy(text, label));
  } else {
    _fallbackCopy(text, label);
  }
};
function _fallbackCopy(text, label) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand('copy'); showToast('✅ تم نسخ ' + label); }
  catch(e) { showToast('❌ فشل النسخ — انسخ يدوياً', '#ef4444'); }
  document.body.removeChild(ta);
}

/* ══════════════════════════════════════════════
   حفظ حساب
══════════════════════════════════════════════ */
window.saveAccountEntry = async function() {
  if (!isDemo && !currentUser) { showToast('يجب تسجيل الدخول أولاً', '#ef4444'); return; }
  const name = document.getElementById('fName').value.trim();
  const pass = document.getElementById('fPass').value.trim();
  if (!name) { showToast('اسم الحساب مطلوب', '#ef4444'); return; }
  if (!pass) { showToast('كلمة المرور مطلوبة', '#ef4444'); return; }

  const entryData = {
    name,
    email:    document.getElementById('fEmail').value,
    pass,
    url:      document.getElementById('fUrl').value,
    note:     document.getElementById('fNote').value,
    category: document.getElementById('fCategory').value,
    color:    selectedColorIdx,
    icon:     window._selectedIcon || null,
    type:     'account'
  };

  try {
    if (currentEditId) {
      const old     = entries.find(e => e.id === currentEditId);
      const updated = { ...old, ...entryData, updatedAt: Date.now() };
      if (isDemo) { entries = entries.map(e => e.id === currentEditId ? updated : e); renderCards(); showToast('✅ تم التعديل (تجريبي)'); }
      else { await setDoc(doc(db, 'users', currentUser.uid, 'entries', currentEditId), updated); showToast('✅ تم التعديل والمزامنة'); }
    } else {
      const newId    = Date.now().toString();
      const newEntry = { id: newId, ...entryData, createdAt: Date.now() };
      if (isDemo) { entries.unshift(newEntry); renderCards(); showToast('✅ تمت الإضافة (تجريبي)'); }
      else { await setDoc(doc(db, 'users', currentUser.uid, 'entries', newId), newEntry); showToast('✅ تم الحفظ في السحابة'); }
    }
    window.closeModalAccount();
  } catch (err) {
    showToast('خطأ في الحفظ: ' + err.message, '#ef4444');
  }
};

/* ══════════════════════════════════════════════
   حفظ صورة
══════════════════════════════════════════════ */
window.saveImageEntry = async function() {
  if (!isDemo && !currentUser) { showToast('يجب تسجيل الدخول أولاً', '#ef4444'); return; }
  if (isUploading) { showToast('جارٍ الرفع، انتظر...', '#f5a623'); return; }

  const name = document.getElementById('imgName').value.trim();
  if (!name) { showToast('عنوان الصورة مطلوب', '#ef4444'); return; }

  const note    = document.getElementById('imgNote').value;
  const entryId = currentEditId || Date.now().toString();
  let finalImageUrl = null;

  if (currentEditId && !selectedImageBase64) {
    const old = entries.find(e => e.id === currentEditId);
    if (old) finalImageUrl = old.imageUrl;
  }

  if (selectedImageBase64) {
    if (!isDemo && !currentUser?.uid) { showToast('يجب تسجيل الدخول لرفع الصور', '#ef4444'); return; }
    isUploading = true;
    const btn = document.getElementById('btnSaveImage');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الرفع...'; }
    try {
      finalImageUrl = await uploadOriginalImage(currentUser?.uid, entryId, selectedImageBase64, selectedImageType || 'image/jpeg');
    } catch(err) {
      isUploading = false;
      if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الصورة'; }
      return;
    }
    isUploading = false;
    if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الصورة'; }
  }

  if (!finalImageUrl) { showToast('اختر صورة أولاً', '#ef4444'); return; }

  const entryData = { id: entryId, name, type: 'image', imageUrl: finalImageUrl, note, category: 'photos' };

  try {
    if (currentEditId) {
      const old     = entries.find(e => e.id === currentEditId);
      const updated = { ...old, ...entryData, updatedAt: Date.now() };
      if (isDemo) { entries = entries.map(e => e.id === currentEditId ? updated : e); renderCards(); showToast('✅ تم تعديل الصورة (تجريبي)'); }
      else { await setDoc(doc(db, 'users', currentUser.uid, 'entries', currentEditId), updated); showToast('✅ تم تحديث الصورة في السحابة'); }
    } else {
      const newEntry = { ...entryData, createdAt: Date.now() };
      if (isDemo) { entries.unshift(newEntry); renderCards(); showToast('✅ تمت إضافة الصورة (تجريبي)'); }
      else { await setDoc(doc(db, 'users', currentUser.uid, 'entries', entryId), newEntry); showToast('✅ تم حفظ الصورة في السحابة'); }
    }
    window.closeModalImage();
  } catch(err) { showToast('خطأ في حفظ البيانات: ' + err.message, '#ef4444'); }
};

/* ══════════════════════════════════════════════
   تحميل + مشاركة + حذف
══════════════════════════════════════════════ */
window.downloadImage = async (id) => {
  const e = entries.find(x => x.id === id);
  if (!e || !e.imageUrl) return;
  try {
    showToast('⏳ جاري التحميل...', '#f5a623');
    const resp = await fetch(e.imageUrl);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (e.name || 'image').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_') + '.jpg';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ تم تحميل الصورة');
  } catch { window.open(e.imageUrl, '_blank'); showToast('✅ تم فتح الصورة'); }
};

window.shareEntry = (id) => {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  const text = e.type === 'image'
    ? `🖼️ ${e.name}\n${e.imageUrl}`
    : `🔐 ${e.name}\n📧 ${e.email||''}\n🔑 ${e.pass||''}${e.url ? '\n🔗 '+e.url : ''}`;
  if (navigator.share) { navigator.share({ title: e.name, text }).catch(() => {}); }
  else { navigator.clipboard.writeText(text); showToast('تم نسخ البيانات للمشاركة 📋'); }
};

window.deleteEntry = async (id) => {
  const entry    = entries.find(e => e.id === id);
  const confirmed = await window.showDeleteConfirm(entry?.name || 'هذا العنصر');
  if (!confirmed) return;
  if (isDemo) { entries = entries.filter(e => e.id !== id); renderCards(); showToast('تم الحذف', '#ef4444'); return; }
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'entries', id));
    showToast('تم الحذف', '#ef4444');
  } catch(e) { showToast('خطأ في الحذف', '#ef4444'); }
};

/* ══════════════════════════════════════════════
   مودال تأكيد الحذف
══════════════════════════════════════════════ */
window.showDeleteConfirm = (name) => {
  return new Promise((resolve) => {
    let overlay = document.getElementById('deleteConfirmOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'deleteConfirmOverlay';
      overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9100;align-items:flex-end;justify-content:center;backdrop-filter:blur(6px);';
      overlay.innerHTML = `
        <div style="background:var(--card);border-radius:32px 32px 0 0;padding:28px 20px;width:100%;max-width:480px;border-top:1px solid var(--border2);">
          <div style="text-align:center;font-size:48px;margin-bottom:8px;">🗑️</div>
          <div style="text-align:center;font-weight:900;font-size:18px;margin-bottom:6px;color:var(--red)">تأكيد الحذف</div>
          <div id="deleteConfirmMsg" style="text-align:center;font-size:13px;color:var(--muted2);margin-bottom:22px;line-height:1.7;"></div>
          <div style="display:flex;gap:12px;">
            <button id="deleteCancelBtn" style="flex:1;padding:13px;background:var(--card2);border-radius:40px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:14px;color:var(--text);font-weight:700;">إلغاء</button>
            <button id="deleteConfirmBtn" style="flex:2;padding:13px;background:linear-gradient(135deg,#dc2626,#ef4444);border-radius:40px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:15px;font-weight:900;color:#fff;">🗑️ نعم، احذف</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }
    document.getElementById('deleteConfirmMsg').textContent = `هل تريد حذف "${name}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`;
    overlay.style.display = 'flex';
    const close = (val) => { overlay.style.display = 'none'; resolve(val); };
    document.getElementById('deleteConfirmBtn').onclick = () => close(true);
    document.getElementById('deleteCancelBtn').onclick  = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  });
};

/* ══════════════════════════════════════════════
   واجهات الإضافة والتعديل
══════════════════════════════════════════════ */
window.showAddChoice = () => document.getElementById('choiceOverlay').classList.add('open');
window.closeChoice   = () => document.getElementById('choiceOverlay').classList.remove('open');

window.openAddAccount = () => {
  window.closeChoice();
  currentEditId       = null;
  window._selectedIcon = null;
  document.getElementById('fName').value     = '';
  document.getElementById('fEmail').value    = '';
  document.getElementById('fPass').value     = '';
  document.getElementById('fUrl').value      = '';
  document.getElementById('fNote').value     = '';
  document.getElementById('fCategory').value = 'websites';
  document.getElementById('modalTitleAccount').textContent = 'إضافة كلمة مرور';
  window.switchAccountTab('basic');
  const iconEl = document.getElementById('iconPickerEmoji');
  if (iconEl) iconEl.textContent = '📷';
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  const firstChip = document.querySelector('.cat-chip[data-cat="websites"]');
  if (firstChip) firstChip.classList.add('active');
  for(let i=1;i<=4;i++){ const b=document.getElementById('sb'+i); if(b) b.style.background='var(--border2)'; }
  const lbl=document.getElementById('strengthLabel'); if(lbl) lbl.textContent='';
  document.getElementById('overlayAccount').classList.add('open');
};

window.openAddImage = () => {
  window.closeChoice();
  currentEditId         = null;
  selectedImageBase64   = null;
  selectedImageType     = null;
  uploadMode            = 'crop';
  const fileInput = document.getElementById('imgFileInput');
  if (fileInput) fileInput.value = '';
  document.getElementById('imgName').value            = '';
  document.getElementById('imgNote').value            = '';
  document.getElementById('imagePreviewWrap').style.display = 'none';
  document.getElementById('previewImgOnly').src       = '';
  document.getElementById('modalTitleImage').textContent = '🖼️ إضافة صورة جديدة';
  document.getElementById('uploadStatus').textContent = '';
  setTimeout(() => window.setUploadMode('crop'), 10);
  const dz = document.getElementById('imageDropZone');
  if (dz) dz._initDone = false;
  hideProgress();
  document.getElementById('overlayImage').classList.add('open');
  setTimeout(initImageDropzone, 50);
};

window.openEdit = (id) => {
  const e = entries.find(x => x.id === id);
  if (!e || e.type === 'image') return;
  currentEditId = id;
  document.getElementById('fName').value     = e.name;
  document.getElementById('fEmail').value    = e.email || '';
  document.getElementById('fPass').value     = e.pass;
  document.getElementById('fUrl').value      = e.url || '';
  document.getElementById('fNote').value     = e.note || '';
  document.getElementById('fCategory').value = e.category || 'work';
  document.getElementById('modalTitleAccount').textContent = 'تعديل الحساب';
  document.getElementById('overlayAccount').classList.add('open');
};

window.openEditImage = (id) => {
  const e = entries.find(x => x.id === id);
  if (!e || e.type !== 'image') return;
  currentEditId       = id;
  selectedImageBase64 = null;
  selectedImageType   = null;
  document.getElementById('imgName').value            = e.name;
  document.getElementById('imgNote').value            = e.note || '';
  document.getElementById('modalTitleImage').textContent = '✏️ تعديل الصورة';
  const wrap = document.getElementById('imagePreviewWrap');
  const img  = document.getElementById('previewImgOnly');
  wrap.style.display = 'block'; img.src = e.imageUrl;
  document.getElementById('uploadStatus').textContent = 'الصورة الحالية معروضة أعلاه';
  hideProgress();
  document.getElementById('overlayImage').classList.add('open');
  const dz = document.getElementById('imageDropZone');
  if (dz) dz._initDone = false;
  setTimeout(initImageDropzone, 50);
};

window.closeModalAccount = () => {
  document.getElementById('overlayAccount').classList.remove('open');
  currentEditId = null;
};
window.closeModalImage = () => {
  document.getElementById('overlayImage').classList.remove('open');
  currentEditId = null; selectedImageBase64 = null; selectedImageType = null;
  hideProgress(); isUploading = false;
  const btn = document.getElementById('btnSaveImage');
  if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الصورة'; }
};

/* ══════════════════════════════════════════════
   وضع الرفع
══════════════════════════════════════════════ */
window.setUploadMode = (mode) => {
  uploadMode = mode;
  const cropBtn   = document.getElementById('modeCropBtn');
  const directBtn = document.getElementById('modeDirectBtn');
  if (!cropBtn || !directBtn) return;
  if (mode === 'crop') {
    cropBtn.style.background = 'var(--accent)'; cropBtn.style.color = '#0a0e1a'; cropBtn.style.borderColor = 'var(--accent)';
    directBtn.style.background = 'var(--card2)'; directBtn.style.color = 'var(--text2)'; directBtn.style.borderColor = 'var(--border2)';
  } else {
    directBtn.style.background = 'var(--accent)'; directBtn.style.color = '#0a0e1a'; directBtn.style.borderColor = 'var(--accent)';
    cropBtn.style.background = 'var(--card2)'; cropBtn.style.color = 'var(--text2)'; cropBtn.style.borderColor = 'var(--border2)';
  }
};

/* ══════════════════════════════════════════════
   نظام الاقتصاص
══════════════════════════════════════════════ */
let cropImg, cropBox, cropCanvas, cropContainer;
let cropDrag = false, cropStartX = 0, cropStartY = 0;
let cropBx = 0, cropBy = 0, cropBw = 0, cropBh = 0, cropScale = 1;
let _pendingCropFile = null;

function openCrop(file) {
  _pendingCropFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const overlay = document.getElementById('cropOverlay');
    overlay.style.display = 'flex';
    cropContainer = document.getElementById('cropContainer');
    cropCanvas    = document.getElementById('cropCanvas');
    cropBox       = document.getElementById('cropBox');
    cropImg       = new Image();
    cropImg.onload = () => {
      const cw = cropContainer.offsetWidth, ch = cropContainer.offsetHeight;
      cropScale = Math.min(cw / cropImg.width, ch / cropImg.height);
      const dw = cropImg.width * cropScale, dh = cropImg.height * cropScale;
      cropCanvas.width = dw; cropCanvas.height = dh;
      cropCanvas.getContext('2d').drawImage(cropImg, 0, 0, dw, dh);
      cropCanvas.style.left = ((cw - dw) / 2) + 'px';
      cropCanvas.style.top  = ((ch - dh) / 2) + 'px';
      const ix = parseFloat(cropCanvas.style.left), iy = parseFloat(cropCanvas.style.top);
      cropBw = dw * 0.8; cropBh = dh * 0.8;
      cropBx = ix + dw * 0.1; cropBy = iy + dh * 0.1;
      _updateCropBox();
      _initCropDrag();
    };
    cropImg.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function _updateCropBox() {
  cropBox.style.left = cropBx + 'px'; cropBox.style.top = cropBy + 'px';
  cropBox.style.width = cropBw + 'px'; cropBox.style.height = cropBh + 'px';
}

function _initCropDrag() {
  const cbox = document.getElementById('cropBox');
  const onDown = (ex, ey) => { cropDrag = true; cropStartX = ex - cropBx; cropStartY = ey - cropBy; };
  const onMove = (ex, ey) => {
    if (!cropDrag) return;
    cropBx = Math.max(0, ex - cropStartX);
    cropBy = Math.max(0, ey - cropStartY);
    const ix = parseFloat(cropCanvas.style.left), iy = parseFloat(cropCanvas.style.top);
    cropBx = Math.min(cropBx, ix + parseFloat(cropCanvas.width)  - cropBw);
    cropBy = Math.min(cropBy, iy + parseFloat(cropCanvas.height) - cropBh);
    _updateCropBox();
  };
  const onUp = () => { cropDrag = false; };
  cbox.addEventListener('mousedown', e => { e.preventDefault(); onDown(e.clientX, e.clientY); });
  document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onUp);
  cbox.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onDown(t.clientX, t.clientY); }, {passive:false});
  document.addEventListener('touchmove', e => { const t = e.touches[0]; onMove(t.clientX, t.clientY); }, {passive:true});
  document.addEventListener('touchend', onUp);
}

window.cancelCrop = () => { document.getElementById('cropOverlay').style.display = 'none'; _pendingCropFile = null; };
window.applyCrop  = () => {
  const ix = parseFloat(cropCanvas.style.left), iy = parseFloat(cropCanvas.style.top);
  const sx = (cropBx - ix) / cropScale, sy = (cropBy - iy) / cropScale;
  const sw = cropBw / cropScale,         sh = cropBh / cropScale;
  const out = document.createElement('canvas');
  out.width = Math.round(sw); out.height = Math.round(sh);
  out.getContext('2d').drawImage(cropImg, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const dataUrl = out.toDataURL(_pendingCropFile?.type || 'image/jpeg', 0.92);
  selectedImageBase64 = dataUrl; selectedImageType = _pendingCropFile?.type || 'image/jpeg';
  const wrap = document.getElementById('imagePreviewWrap');
  const img  = document.getElementById('previewImgOnly');
  img.src = dataUrl; wrap.style.display = 'block';
  document.getElementById('uploadStatus').textContent = '✅ تم الاقتصاص — جاهز للرفع';
  showToast('✅ تم اقتصاص الصورة', '#10b981');
  document.getElementById('cropOverlay').style.display = 'none';
  _pendingCropFile = null;
};

/* ══════════════════════════════════════════════
   معالجة اختيار الصورة
══════════════════════════════════════════════ */
function handleImageSelection(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('الرجاء اختيار ملف صورة صالح (jpg, png, webp...)', '#ef4444'); return; }
  if (file.size > 20 * 1024 * 1024) { showToast('حجم الصورة كبير جداً (الحد الأقصى 20MB)', '#ef4444'); return; }

  if (uploadMode === 'direct') {
    showProgress(10, '⏳ جاري قراءة الصورة...');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const original = ev.target.result;
      if (file.size > 2 * 1024 * 1024) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1920;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else       { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          selectedImageBase64 = canvas.toDataURL(file.type || 'image/jpeg', 0.88);
          selectedImageType   = file.type || 'image/jpeg';
          document.getElementById('previewImgOnly').src = selectedImageBase64;
          document.getElementById('imagePreviewWrap').style.display = 'block';
          showProgress(100, ''); setTimeout(hideProgress, 400);
          document.getElementById('uploadStatus').textContent = `✅ جاهز للرفع — ${file.name}`;
          showToast('✅ تم اختيار الصورة', '#10b981');
        };
        img.src = original;
      } else {
        selectedImageBase64 = original; selectedImageType = file.type;
        document.getElementById('previewImgOnly').src = original;
        document.getElementById('imagePreviewWrap').style.display = 'block';
        showProgress(100, ''); setTimeout(hideProgress, 400);
        document.getElementById('uploadStatus').textContent = `✅ جاهز للرفع — ${file.name}`;
        showToast('✅ تم اختيار الصورة', '#10b981');
      }
    };
    reader.onerror = () => { hideProgress(); showToast('فشل قراءة الصورة', '#ef4444'); };
    reader.readAsDataURL(file);
  } else {
    openCrop(file);
  }
}

function initImageDropzone() {
  const dropZone  = document.getElementById('imageDropZone');
  const fileInput = document.getElementById('imgFileInput');
  if (!dropZone || dropZone._initDone) return;
  dropZone._initDone = true;

  dropZone.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fileInput.value = ''; fileInput.click(); });
  dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', (e) => { e.stopPropagation(); dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop',      (e) => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over'); const f = e.dataTransfer?.files?.[0]; if (f) handleImageSelection(f); });
  fileInput.addEventListener('change',   (e) => { const f = e.target.files?.[0]; if (f) handleImageSelection(f); });
}

/* ══════════════════════════════════════════════
   مساعدات المودال — تبويبات، أيقونة، لون، كلمة مرور
══════════════════════════════════════════════ */
window.switchAccountTab = (tab) => {
  const basic = document.getElementById('tabBasic');
  const adv   = document.getElementById('tabAdv');
  const btnB  = document.getElementById('tabBasicBtn');
  const btnA  = document.getElementById('tabAdvBtn');
  if (tab === 'basic') {
    basic.style.display = 'block'; adv.style.display = 'none';
    btnB.style.background = 'var(--accent)'; btnB.style.color = '#0a0e1a';
    btnA.style.background = 'transparent';   btnA.style.color = 'var(--muted2)';
  } else {
    basic.style.display = 'none'; adv.style.display = 'block';
    btnA.style.background = 'var(--accent)'; btnA.style.color = '#0a0e1a';
    btnB.style.background = 'transparent';   btnB.style.color = 'var(--muted2)';
  }
};

window.selectCatChip = (el, cat) => {
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('fCategory').value = cat;
};

const _iconEmojis = ['🔐','🌐','📱','✉️','🏦','🎮','🛒','📸','💼','🎬','🏠','🚗','☁️','🔑','💳','📚'];
window.pickAccountIcon = () => {
  let picker = document.getElementById('iconPickerPopup');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'iconPickerPopup';
    picker.style.cssText = 'position:fixed;inset:0;z-index:9200;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.5);';
    picker.innerHTML = `<div style="background:var(--card);border-radius:28px 28px 0 0;padding:20px;width:100%;max-width:480px;">
      <div style="font-weight:900;font-size:16px;text-align:center;margin-bottom:14px;">اختر أيقونة</div>
      <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:10px;margin-bottom:16px;">
        ${_iconEmojis.map(e=>`<button onclick="window.setAccountIcon('${e}')" style="font-size:28px;background:var(--card2);border:none;border-radius:12px;padding:8px;cursor:pointer;">${e}</button>`).join('')}
      </div>
      <button onclick="document.getElementById('iconPickerPopup').remove()" style="width:100%;padding:12px;background:var(--card2);border-radius:40px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;color:var(--muted2);">إلغاء</button>
    </div>`;
    document.body.appendChild(picker);
    picker.addEventListener('click', e => { if(e.target === picker) picker.remove(); });
  } else { picker.remove(); }
};
window.setAccountIcon = (emoji) => {
  const el = document.getElementById('iconPickerEmoji');
  if (el) { el.textContent = emoji; el.dataset.customIcon = emoji; }
  document.getElementById('iconPickerPopup')?.remove();
  window._selectedIcon = emoji;
};

window.generatePassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$=';
  let pass = '';
  const arr = crypto.getRandomValues(new Uint8Array(16));
  arr.forEach(b => pass += chars[b % chars.length]);
  const inp = document.getElementById('fPass');
  if (inp) { inp.value = pass; inp.type = 'text'; window.updateStrength(); }
};

window.togglePassVis = () => {
  const inp = document.getElementById('fPass');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
};

window.updateStrength = () => {
  const val = document.getElementById('fPass')?.value || '';
  let score = 0;
  if (val.length >= 8) score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
  if (/[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val)) score++;
  const colors = ['#ef4444','#f97316','#eab308','#10b981'];
  const labels = ['ضعيفة','متوسطة','جيدة','قوية جداً'];
  for (let i=1; i<=4; i++) {
    const bar = document.getElementById('sb'+i);
    if (bar) bar.style.background = i <= score ? (colors[score-1]||'var(--border2)') : 'var(--border2)';
  }
  const lbl = document.getElementById('strengthLabel');
  if (lbl) lbl.textContent = val.length > 0 ? 'قوة كلمة المرور: ' + (labels[score-1] || 'ضعيفة') : '';
};
document.addEventListener('input', e => { if (e.target?.id === 'fPass') window.updateStrength(); });

window.selectColorInModal = (idx, el) => {
  document.querySelectorAll('#colorRowAccount .color-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  selectedColorIdx = idx;
};

/* ══════════════════════════════════════════════
   فلاتر التصنيف
══════════════════════════════════════════════ */
function renderCategoryFilters() {
  const bar  = document.getElementById('categoryBar');
  const cats = [
    { id:'all',      label:'🌐 الكل' },
    { id:'websites', label:'🔗 مواقع' },
    { id:'work',     label:'💼 عمل' },
    { id:'personal', label:'👤 شخصي' },
    { id:'banking',  label:'🏦 بنوك' },
    { id:'other',    label:'📁 أخرى' },
    { id:'photos',   label:'🖼️ صور' }
  ];
  bar.innerHTML = cats.map(c =>
    `<button class="cat-btn ${activeCategory === c.id ? 'active' : ''}" onclick="window.setCategory('${c.id}')">${c.label}</button>`
  ).join('');
}
window.setCategory = (c) => { activeCategory = c; renderCategoryFilters(); renderCards(); };
window.renderCategoryFilters = renderCategoryFilters;

/* ── إصلاح: التحقق من وجود searchInput قبل إضافة الـ listener ── */
const searchInputElement = document.getElementById('searchInput');
if (searchInputElement) {
  searchInputElement.addEventListener('input', renderCards);
} else {
  console.warn('⚠️ عنصر searchInput غير موجود في HTML');
}

/* ══════════════════════════════════════════════
   الشريط الجانبي
══════════════════════════════════════════════ */
function updateSidebarUI() {
  const avatarDiv    = document.getElementById('sidebarAvatar');
  const userNameSpan = document.getElementById('sidebarUserName');
  const emailSpan    = document.getElementById('sidebarEmail');
  const headerAvatar = document.getElementById('menuAvatar');

  if (currentUser && !isDemo) {
    const letter   = (currentUser.displayName?.[0] || currentUser.email?.[0] || 'U').toUpperCase();
    const photoHtml = currentUser.photoURL
      ? `<img src="${currentUser.photoURL}" style="width:100%;height:100%;object-fit:cover;">`
      : `<span style="font-size:24px;">${letter}</span>`;
    avatarDiv.innerHTML    = photoHtml;
    headerAvatar.innerHTML = photoHtml;
    userNameSpan.textContent = currentUser.displayName || currentUser.email?.split('@')[0] || 'مستخدم';
    emailSpan.textContent    = currentUser.email || '';
  } else if (isDemo) {
    avatarDiv.innerHTML    = '<span style="font-size:24px;">🎮</span>';
    headerAvatar.innerHTML = '<span>🎮</span>';
    userNameSpan.textContent = 'الوضع التجريبي';
    emailSpan.textContent    = 'demo@example.com';
  } else {
    avatarDiv.innerHTML    = '<span style="font-size:24px;">👤</span>';
    headerAvatar.innerHTML = '<span>👤</span>';
    userNameSpan.textContent = 'زائر';
    emailSpan.textContent    = 'غير مسجل';
  }
}

window.openSidebar  = () => { updateSidebarUI(); document.getElementById('sidebarOverlay').classList.add('open'); document.getElementById('sidebarPanel').classList.add('open'); };
window.closeSidebar = () => { document.getElementById('sidebarOverlay').classList.remove('open'); document.getElementById('sidebarPanel').classList.remove('open'); };

/* ══════════════════════════════════════════════
   الوضع التجريبي
══════════════════════════════════════════════ */
const DEMO_ENTRIES = [
  { id:'d1', name:'Gmail', email:'demo@gmail.com', pass:'Demo@123', type:'account', category:'work', color:0, note:'حساب تجريبي', url:'', createdAt:Date.now() },
  { id:'d2', name:'صورة تجريبية', type:'image', imageUrl:'https://picsum.photos/id/1015/400/300', note:'منظر طبيعي', category:'photos', createdAt:Date.now() - 1000 }
];

window.startDemo = () => {
  isDemo = true; currentUser = null;
  entries = [...DEMO_ENTRIES];
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display  = 'block';
  document.getElementById('demoBar').style.display    = 'flex';
  document.getElementById('syncStatus').textContent   = '🎮 تجريبي';
  renderCards(); renderCategoryFilters(); updateSidebarUI();
};

window.exitDemo = () => {
  isDemo = false; entries = [];
  document.getElementById('appScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('demoBar').style.display    = 'none';
  document.getElementById('syncStatus').textContent   = '☁️ سحابية';
};

window.logoutUser = async () => {
  if (unsubscribe) unsubscribe();
  if (isDemo) { window.exitDemo(); return; }
  await logoutFromFirebase();
  window.location.reload();
};

/* ══════════════════════════════════════════════
   المظهر
══════════════════════════════════════════════ */
window.toggleTheme = () => {
  const th = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', th);
  localStorage.setItem('vault_theme', th);
  document.getElementById('themeBtn').textContent = th === 'dark' ? '🌙' : '☀️';
};
document.documentElement.setAttribute('data-theme', 'light');
document.getElementById('themeBtn').textContent = '☀️';

/* ══════════════════════════════════════════════
   المشاركة
══════════════════════════════════════════════ */
window.openShareApp = () => {
  const nameEl = document.getElementById('shareFromName');
  if (nameEl) {
    nameEl.textContent = currentUser?.displayName || currentUser?.email?.split('@')[0] || (isDemo ? 'المستخدم التجريبي' : 'مستخدم');
  }
  document.getElementById('shareAppOverlay').classList.add('open');
};
window.closeShareApp = () => document.getElementById('shareAppOverlay').classList.remove('open');
window.shareAppLink  = (type) => {
  const url = 'https://aamer777.github.io/asd/';
  const senderName = currentUser?.displayName || currentUser?.email?.split('@')[0] || (isDemo ? 'المستخدم التجريبي' : 'مستخدم');
  const msg = `🔐 خزنة المرور السحابية\nتطبيق مجاني لحفظ كلمات المرور بأمان مع مزامنة سحابية فورية ورفع صور أصلية.\n\n🌐 الرابط: ${url}\n\n📤 أرسلها: ${senderName} عبر موقع خزنة`;
  if (type === 'wa')      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  else if (type === 'tg') window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`, '_blank');
  else if (type === 'em') window.open(`mailto:?subject=تطبيق خزنة المرور السحابية&body=${encodeURIComponent(msg)}`, '_blank');
  else if (type === 'cp') {
    navigator.clipboard.writeText(url)
      .then(()  => showToast('✅ تم نسخ رابط التطبيق'))
      .catch(() => { const ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('✅ تم نسخ رابط التطبيق'); });
  }
  if (type !== 'cp') window.closeShareApp();
};

/* ══════════════════════════════════════════════
   PWA — تثبيت التطبيق
   يتحقق تلقائياً إذا كان التطبيق مثبتاً مسبقاً
══════════════════════════════════════════════ */
let deferredPrompt = null;

/* ── هل التطبيق مثبت بالفعل على الشاشة الرئيسية؟ ── */
function _isAppInstalled() {
  // standalone = يعمل كـ PWA (iOS أو Android)
  if (window.navigator.standalone === true) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  return false;
}

/* ── إخفاء شريط التثبيت إذا كان التطبيق مثبتاً ── */
function _hideInstallBarIfInstalled() {
  if (_isAppInstalled()) {
    const bar = document.getElementById('pwaInstallBar');
    if (bar) {
      bar.style.transform = 'translateY(100%)';
      bar.style.opacity = '0';
      bar.style.pointerEvents = 'none';
    }
    return true;
  }
  return false;
}

window.addEventListener('beforeinstallprompt', (e) => {
  // إذا مثبت مسبقاً — تجاهل
  if (_isAppInstalled()) { e.preventDefault(); return; }
  deferredPrompt = e;
  setTimeout(() => {
    if (_hideInstallBarIfInstalled()) return; // تحقق مجدداً
    const bar = document.getElementById('pwaInstallBar');
    if (bar && !window._pwaBarDismissed) {
      bar.style.transform = 'translateY(0)';
      bar.style.opacity   = '1';
      bar.style.pointerEvents = 'auto';
    }
  }, 2000);
});

window.addEventListener('appinstalled', () => {
  const bar = document.getElementById('pwaInstallBar');
  if (bar) { bar.style.transform = 'translateY(100%)'; bar.style.opacity = '0'; }
  showToast('✅ تم تثبيت التطبيق على شاشتك الرئيسية!');
  deferredPrompt = null;
  localStorage.setItem('vault_pwa_installed', '1');
});

window.triggerInstallPrompt = async () => {
  // إذا مثبت بالفعل — أخبر المستخدم
  if (_isAppInstalled()) {
    showToast('✅ التطبيق مثبت بالفعل على شاشتك!', '#10b981');
    return;
  }
  const bar = document.getElementById('pwaInstallBar');
  if (deferredPrompt) {
    if (bar) bar.style.transform = 'translateY(100%)';
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('✅ تم إضافة التطبيق للشاشة الرئيسية');
      localStorage.setItem('vault_pwa_installed', '1');
    } else {
      setTimeout(() => {
        if (!_isAppInstalled() && bar) bar.style.transform = 'translateY(0)';
      }, 3000);
    }
    deferredPrompt = null;
  } else {
    _openInstallGuide();
  }
};

window.dismissInstallBar = () => {
  window._pwaBarDismissed = true;
  const bar = document.getElementById('pwaInstallBar');
  if (bar) { bar.style.transform = 'translateY(100%)'; bar.style.opacity = '0'; bar.style.pointerEvents = 'none'; }
};

/* ── تحقق فوري عند بدء التشغيل ── */
(function checkInstallStateOnLoad() {
  if (_isAppInstalled() || localStorage.getItem('vault_pwa_installed') === '1') {
    // تأكد مضاعف: هل لا يزال في standalone؟
    if (_isAppInstalled()) {
      // إخفاء الشريط فوراً بدون انتظار
      const bar = document.getElementById('pwaInstallBar');
      if (bar) { bar.style.transform = 'translateY(100%)'; bar.style.opacity = '0'; bar.style.pointerEvents = 'none'; }
      window._pwaBarDismissed = true;
    } else {
      // كان مثبتاً ثم أُزيل — امسح الـ flag
      localStorage.removeItem('vault_pwa_installed');
    }
  }
})();

window.showInstallTab = (tab) => {
  const androidSteps = document.getElementById('installStepsAndroid');
  const iosSteps     = document.getElementById('installStepsIos');
  const btnA         = document.getElementById('installTabAndroid');
  const btnI         = document.getElementById('installTabIos');
  if (tab === 'android') {
    androidSteps.style.display = 'block'; iosSteps.style.display = 'none';
    btnA.style.background = 'var(--accent)'; btnA.style.color = '#0a0e1a';
    btnI.style.background = 'transparent';   btnI.style.color = 'var(--muted2)';
  } else {
    androidSteps.style.display = 'none'; iosSteps.style.display = 'block';
    btnI.style.background = 'var(--accent)'; btnI.style.color = '#0a0e1a';
    btnA.style.background = 'transparent';   btnA.style.color = 'var(--muted2)';
  }
};

const _openInstallGuide = () => {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  document.getElementById('iosInstallOverlay').classList.add('open');
  setTimeout(() => window.showInstallTab(isIos ? 'ios' : 'android'), 50);
};

window.installPWA = async () => {
  window.closeSidebar();
  if (_isAppInstalled()) {
    showToast('✅ التطبيق مثبت بالفعل على شاشتك!', '#10b981');
    return;
  }
  window.triggerInstallPrompt();
};
window.showIosInstall = () => { window.closeSidebar(); _openInstallGuide(); };
window.loginInstallApp = () => { window.triggerInstallPrompt(); };

/* ── iOS standalone detection ── */
const isIos        = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.navigator.standalone === true;

/* ══════════════════════════════════════════════
   مراقبة Firebase Auth
══════════════════════════════════════════════ */
watchAuthState(
  (user) => {
    currentUser = user;
    document.getElementById('loginScreen').style.display = 'none';
    if (localStorage.getItem('vault_pin_hash')) {
      document.getElementById('lockScreen').style.display = 'flex';
      document.getElementById('appScreen').style.display  = 'none';
    } else {
      document.getElementById('appScreen').style.display = 'block';
    }
    document.getElementById('syncStatus').textContent = '☁️ متصل';
    updateSidebarUI();
    const q = query(collection(db, 'users', user.uid, 'entries'), orderBy('createdAt', 'desc'));
    unsubscribe = onSnapshot(q,
      snap => { entries = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderCards(); },
      err  => { console.error('Firestore error:', err); showToast('خطأ في المزامنة', '#ef4444'); }
    );
    renderCards();
    renderCategoryFilters();
  },
  () => {
    if (!isDemo) {
      currentUser = null;
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('appScreen').style.display  = 'none';
    }
  }
);

/* ══════════════════════════════════════════════
   تهيئة أولية
══════════════════════════════════════════════ */
prefillSavedEmail();
renderCategoryFilters();
initTopLoadingBar();   /* ← شريط التحميل + Splash على الجوال */

/* ── تسجيل Service Worker ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('✅ SW مسجّل:', reg.scope))
      .catch(err => console.warn('SW خطأ:', err));
  });
}
