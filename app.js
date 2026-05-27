
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, FacebookAuthProvider, TwitterAuthProvider, OAuthProvider, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
  import { getFirestore, collection, onSnapshot, setDoc, deleteDoc, query, orderBy, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyCCPmhcxaq7-xGqnUBNR1vsFRsIWQjwchU",
    authDomain: "asdf-736d2.firebaseapp.com",
    projectId: "asdf-736d2",
    messagingSenderId: "462090265735",
    appId: "1:462090265735:web:5fc5eeb8295bcea1568422"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // ── EmailJS ──
  const EMAILJS_PUBLIC_KEY  = 'AAqRxMl4frLp82l-7';
  const EMAILJS_SERVICE_ID  = 'service_jmk7uc5';
  const EMAILJS_TEMPLATE_ID = 'template_5qrk29k';
  const OWNER_EMAIL         = 'aamer777@gmail.com';

  // ── Cloudinary ──
  const CLOUDINARY_CLOUD  = 'dwbhzpobd';
  const CLOUDINARY_PRESET = 'vault_upload'; // ← اسم الـ preset الذي أنشأته (Unsigned)

  // ── حالة التطبيق ──
  let currentUser = null;
  let entries = [];
  let unsubscribe = null;
  let isDemo = false;
  let activeCategory = 'all';
  let currentEditId = null;
  let selectedColorIdx = 0;
  let selectedImageBase64 = null;
  let selectedImageType = null;
  let isUploading = false;
  let uploadMode = 'crop'; // 'crop' | 'direct'

  // ── مساعدات ──
  function showToast(msg, bg = '#10b981') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = bg;
    t.classList.remove('show');
    // Force reflow to restart animation
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  window.showToast = showToast;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // ── شريط التقدم ──
  function showProgress(pct, label = '') {
    const container = document.getElementById('progressContainer');
    const bar = document.getElementById('uploadProgressBar');
    const lbl = document.getElementById('progressLabel');
    const status = document.getElementById('uploadStatus');
    if (container) { container.style.display = 'block'; }
    if (bar) { bar.style.width = pct + '%'; }
    if (lbl) { lbl.style.display = label ? 'block' : 'none'; lbl.textContent = label; }
    if (status) { status.textContent = pct < 100 ? `${Math.round(pct)}%` : ''; }
  }
  function hideProgress() {
    const container = document.getElementById('progressContainer');
    const lbl = document.getElementById('progressLabel');
    const status = document.getElementById('uploadStatus');
    if (container) container.style.display = 'none';
    if (lbl) lbl.style.display = 'none';
    if (status) status.textContent = '';
  }

  // ─────────────────────────────────────────────────────────────────
  // رفع الصورة عبر Cloudinary — مجاني بدون فوترة
  // ─────────────────────────────────────────────────────────────────
  async function uploadOriginalImage(uid, entryId, base64DataUrl, mimeType) {
    if (!base64DataUrl) throw new Error('لا توجد صورة للرفع');

    // ديمو: أرجع الـ base64 مباشرة بدون رفع
    if (isDemo) return base64DataUrl;

    showProgress(5, '⏳ جاري الرفع إلى Cloudinary...');
    document.getElementById('uploadStatus').textContent = '⏳ جاري الرفع...';

    // بناء FormData للرفع
    const formData = new FormData();
    formData.append('file', base64DataUrl);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('folder', `vault/${uid || 'demo'}`);
    formData.append('public_id', entryId);

    try {
      const xhr = new XMLHttpRequest();
      const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

      return new Promise((resolve, reject) => {
        // تتبع تقدم الرفع الحقيقي
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = (e.loaded / e.total) * 90;
            const sent = (e.loaded / 1024).toFixed(0);
            const total = (e.total / 1024).toFixed(0);
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
            } catch (e) {
              hideProgress();
              reject(new Error('فشل قراءة رد Cloudinary'));
            }
          } else {
            hideProgress();
            let errMsg = 'فشل الرفع';
            try {
              const errData = JSON.parse(xhr.responseText);
              errMsg = errData.error?.message || errMsg;
            } catch(_) {}
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

        xhr.timeout = 120000; // دقيقتان
        xhr.open('POST', url, true);
        xhr.send(formData);
      });

    } catch (err) {
      hideProgress();
      showToast('خطأ: ' + err.message, '#ef4444');
      throw err;
    }
  }

  // ── عرض البطاقات ──
  function renderCards() {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const filtered = entries.filter(e =>
      (activeCategory === 'all' || e.category === activeCategory) &&
      ((e.name || '').toLowerCase().includes(q) || (e.note || '').toLowerCase().includes(q))
    );

    document.getElementById('totalCount').textContent = entries.length;
    const container = document.getElementById('cardsList');

    if (!filtered.length) {
      container.innerHTML = '<div style="text-align:center; padding:60px; color:var(--muted2);">🔒 لا توجد عناصر<br><small>➕ أضف حساباً أو صورة</small></div>';
      return;
    }

    container.innerHTML = filtered.map(e => {
      if (e.type === 'image') {
        const dateStr = e.createdAt ? new Date(e.createdAt).toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'}) : '';
        return `<div class="card" id="card-${e.id}" onclick="window.toggleCard('${e.id}')">
          <div class="card-header-row">
            <div class="card-title">
              <div class="card-icon" style="padding:0;">
                <img src="${escapeHtml(e.imageUrl)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 52 52%22><text y=%2238%22 font-size=%2236%22>🖼️</text></svg>'">
              </div>
              <div>
                <div style="font-weight:700;">${escapeHtml(e.name)}</div>
                <div style="font-size:11px; color:var(--muted2);">📷 صورة${dateStr ? ' · ' + dateStr : ''}</div>
              </div>
            </div>
          </div>
          <div class="card-body">
            ${e.note ? `<div class="field"><span>📝 ${escapeHtml(e.note)}</span></div>` : ''}
            <div style="margin-top:8px; border-radius:16px; overflow:hidden; max-height:260px;">
              <img src="${escapeHtml(e.imageUrl)}" style="width:100%; object-fit:contain; max-height:260px; display:block;">
            </div>
            <div style="display:flex;gap:8px;margin-top:12px;" onclick="event.stopPropagation()">
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
        const colors = [
          {bg:'#1e3a5f',text:'#60a5fa'},{bg:'#1a3a2a',text:'#34d399'},{bg:'#3a1a1a',text:'#f87171'},
          {bg:'#3a2a1a',text:'#fbbf24'},{bg:'#2a1a3a',text:'#a78bfa'},{bg:'#3a2010',text:'#fb923c'},
          {bg:'#3a1a2a',text:'#f472b6'},{bg:'#0f2a3a',text:'#22d3ee'},{bg:'#0f2a1a',text:'#4ade80'},
          {bg:'#2a2a0f',text:'#facc15'}
        ];
        const c = colors[(e.color || 0) % 5];
        const iconHtml = e.imageUrl
          ? `<div class="card-icon" style="padding:0;"><img src="${escapeHtml(e.imageUrl)}" style="width:100%;height:100%;object-fit:cover;"></div>`
          : e.icon
            ? `<div class="card-icon" style="background:${c.bg};font-size:28px;display:flex;align-items:center;justify-content:center;">${e.icon}</div>`
            : `<div class="card-icon" style="background:${c.bg};color:${c.text};font-size:18px;">${escapeHtml(e.name.substring(0,2)).toUpperCase()}</div>`;
        const catMap = {work:'💼 عمل',personal:'👤 شخصي',banking:'🏦 بنوك',entertainment:'🎬 ترفيه',websites:'🌐 مواقع',other:'📁 أخرى',photos:'🖼️ صور'};
        const catLabel = catMap[e.category] || '📁 أخرى';
        const safePass = escapeHtml(e.pass || '');
        const safeEmail = escapeHtml(e.email || '');
        const dateStr = e.createdAt ? new Date(e.createdAt).toLocaleDateString('ar-SA',{year:'numeric',month:'short',day:'numeric'}) : '';
        return `<div class="card" id="card-${e.id}" onclick="window.toggleCard('${e.id}')">
          <div class="card-header-row">
            <div class="card-title">
              ${iconHtml}
              <div>
                <div style="font-weight:700;">${escapeHtml(e.name)}</div>
                <div style="font-size:11px; color:var(--muted2);">${catLabel}${dateStr ? ' · ' + dateStr : ''}</div>
                ${e.note ? `<div style="font-size:11px; color:var(--muted2); margin-top:2px; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📝 ${escapeHtml(e.note)}</div>` : ''}
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

  // ── دالة نسخ النص (تعمل على جميع المتصفحات) ──
  window.copyText = function(text, label) {
    const doSuccess = () => {
      showToast('✅ تم نسخ ' + label);
      // تأثير بصري على الزر الذي ضُغط
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
      navigator.clipboard.writeText(text).then(doSuccess).catch(() => fallbackCopy(text, label));
    } else {
      fallbackCopy(text, label);
    }
  };
  function fallbackCopy(text, label) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showToast('✅ تم نسخ ' + label);
    } catch(e) {
      showToast('❌ فشل النسخ — انسخ يدوياً', '#ef4444');
    }
    document.body.removeChild(ta);
  }

  // ── حفظ حساب ──
  window.saveAccountEntry = async function() {
    if (!isDemo && !currentUser) { showToast('يجب تسجيل الدخول أولاً', '#ef4444'); return; }
    const name = document.getElementById('fName').value.trim();
    const pass = document.getElementById('fPass').value.trim();
    if (!name) { showToast('اسم الحساب مطلوب', '#ef4444'); return; }
    if (!pass) { showToast('كلمة المرور مطلوبة', '#ef4444'); return; }
    const entryData = {
      name,
      email: document.getElementById('fEmail').value,
      pass,
      url: document.getElementById('fUrl').value,
      note: document.getElementById('fNote').value,
      category: document.getElementById('fCategory').value,
      color: selectedColorIdx,
      icon: window._selectedIcon || null,
      type: 'account'
    };

    try {
      if (currentEditId) {
        const old = entries.find(e => e.id === currentEditId);
        const updated = { ...old, ...entryData, updatedAt: Date.now() };
        if (isDemo) {
          entries = entries.map(e => e.id === currentEditId ? updated : e);
          renderCards(); showToast('✅ تم التعديل (تجريبي)');
        } else {
          await setDoc(doc(db, 'users', currentUser.uid, 'entries', currentEditId), updated);
          showToast('✅ تم التعديل والمزامنة');
        }
      } else {
        const newId = Date.now().toString();
        const newEntry = { id: newId, ...entryData, createdAt: Date.now() };
        if (isDemo) {
          entries.unshift(newEntry); renderCards(); showToast('✅ تمت الإضافة (تجريبي)');
        } else {
          await setDoc(doc(db, 'users', currentUser.uid, 'entries', newId), newEntry);
          showToast('✅ تم الحفظ في السحابة');
        }
      }
      window.closeModalAccount();
    } catch (err) {
      showToast('خطأ في الحفظ: ' + err.message, '#ef4444');
    }
  };

  // ── حفظ صورة (الإصلاح الرئيسي هنا) ──
  window.saveImageEntry = async function() {
    if (!isDemo && !currentUser) { showToast('يجب تسجيل الدخول أولاً', '#ef4444'); return; }
    if (isUploading) { showToast('جارٍ الرفع، انتظر...', '#f5a623'); return; }

    const name = document.getElementById('imgName').value.trim();
    if (!name) { showToast('عنوان الصورة مطلوب', '#ef4444'); return; }

    const note = document.getElementById('imgNote').value;
    const entryId = currentEditId || Date.now().toString();
    let finalImageUrl = null;

    // إذا كان تعديلاً ولم تُختر صورة جديدة، احتفظ بالرابط القديم
    if (currentEditId && !selectedImageBase64) {
      const old = entries.find(e => e.id === currentEditId);
      if (old) finalImageUrl = old.imageUrl;
    }

    // رفع الصورة الجديدة إن وجدت
    if (selectedImageBase64) {
      if (!isDemo && !currentUser?.uid) {
        showToast('يجب تسجيل الدخول لرفع الصور', '#ef4444'); return;
      }
      isUploading = true;
      const btn = document.getElementById('btnSaveImage');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الرفع...'; }

      try {
        finalImageUrl = await uploadOriginalImage(
          currentUser?.uid,
          entryId,
          selectedImageBase64,
          selectedImageType || 'image/jpeg'
        );
      } catch (err) {
        isUploading = false;
        if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الصورة'; }
        return; // الخطأ ظهر بالفعل في uploadOriginalImage
      }
      isUploading = false;
      if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الصورة'; }
    }

    if (!finalImageUrl) {
      showToast('اختر صورة أولاً', '#ef4444'); return;
    }

    const entryData = {
      id: entryId,
      name,
      type: 'image',
      imageUrl: finalImageUrl,
      note,
      category: 'photos'
    };

    try {
      if (currentEditId) {
        const old = entries.find(e => e.id === currentEditId);
        const updated = { ...old, ...entryData, updatedAt: Date.now() };
        if (isDemo) {
          entries = entries.map(e => e.id === currentEditId ? updated : e);
          renderCards(); showToast('✅ تم تعديل الصورة (تجريبي)');
        } else {
          await setDoc(doc(db, 'users', currentUser.uid, 'entries', currentEditId), updated);
          showToast('✅ تم تحديث الصورة في السحابة');
        }
      } else {
        const newEntry = { ...entryData, createdAt: Date.now() };
        if (isDemo) {
          entries.unshift(newEntry); renderCards(); showToast('✅ تمت إضافة الصورة (تجريبي)');
        } else {
          await setDoc(doc(db, 'users', currentUser.uid, 'entries', entryId), newEntry);
          showToast('✅ تم حفظ الصورة في السحابة');
        }
      }
      window.closeModalImage();
    } catch (err) {
      showToast('خطأ في حفظ البيانات: ' + err.message, '#ef4444');
    }
  };

  // ── تحميل صورة للجهاز ──
  window.downloadImage = async (id) => {
    const e = entries.find(x => x.id === id);
    if (!e || !e.imageUrl) return;
    try {
      showToast('⏳ جاري التحميل...', '#f5a623');
      const resp = await fetch(e.imageUrl);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (e.name || 'image').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_') + '.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('✅ تم تحميل الصورة');
    } catch {
      // Fallback: open in new tab
      window.open(e.imageUrl, '_blank');
      showToast('✅ تم فتح الصورة');
    }
  };

  // ── مشاركة عنصر ──
  window.shareEntry = (id) => {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    const text = e.type === 'image'
      ? `🖼️ ${e.name}\n${e.imageUrl}`
      : `🔐 ${e.name}\n📧 ${e.email||''}\n🔑 ${e.pass||''}${e.url ? '\n🔗 '+e.url : ''}`;
    if (navigator.share) {
      navigator.share({ title: e.name, text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      showToast('تم نسخ البيانات للمشاركة 📋');
    }
  };

  // ── حذف عنصر ──
  window.deleteEntry = async (id) => {
    const entry = entries.find(e => e.id === id);
    const entryName = entry ? entry.name : 'هذا العنصر';
    const confirmed = await window.showDeleteConfirm(entryName);
    if (!confirmed) return;
    if (isDemo) {
      entries = entries.filter(e => e.id !== id); renderCards(); showToast('تم الحذف', '#ef4444');
    } else {
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'entries', id));
        showToast('تم الحذف', '#ef4444');
      } catch(e) { showToast('خطأ في الحذف', '#ef4444'); }
    }
  };

  // ── مودال تأكيد الحذف ──
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
      const close = (val) => {
        overlay.style.display = 'none';
        resolve(val);
      };
      document.getElementById('deleteConfirmBtn').onclick = () => close(true);
      document.getElementById('deleteCancelBtn').onclick = () => close(false);
      overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    });
  };

  // ── واجهات الإضافة والتعديل ──
  window.showAddChoice = () => document.getElementById('choiceOverlay').classList.add('open');
  window.closeChoice = () => document.getElementById('choiceOverlay').classList.remove('open');

  window.openAddAccount = () => {
    window.closeChoice();
    currentEditId = null;
    window._selectedIcon = null;
    document.getElementById('fName').value = '';
    document.getElementById('fEmail').value = '';
    document.getElementById('fPass').value = '';
    document.getElementById('fUrl').value = '';
    document.getElementById('fNote').value = '';
    document.getElementById('fCategory').value = 'websites';
    document.getElementById('modalTitleAccount').textContent = 'إضافة كلمة مرور';
    // إعادة ضبط التبويبات
    window.switchAccountTab('basic');
    // إعادة ضبط الأيقونة
    const iconEl = document.getElementById('iconPickerEmoji');
    if (iconEl) iconEl.textContent = '📷';
    // إعادة ضبط الـ chips
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    const firstChip = document.querySelector('.cat-chip[data-cat="websites"]');
    if (firstChip) firstChip.classList.add('active');
    // إعادة ضبط شريط القوة
    for(let i=1;i<=4;i++){const b=document.getElementById('sb'+i); if(b) b.style.background='var(--border2)';}
    const lbl=document.getElementById('strengthLabel'); if(lbl) lbl.textContent='';
    // زر الحفظ
    const saveBtn = document.querySelector('#overlayAccount button[onclick="window.saveAccountEntry()"]');
    if (saveBtn) saveBtn.textContent = 'إضافة كلمة المرور';
    document.getElementById('overlayAccount').classList.add('open');
  };

  window.openAddImage = () => {
    window.closeChoice();
    currentEditId = null;
    selectedImageBase64 = null;
    selectedImageType = null;
    uploadMode = 'crop';
    const fileInput = document.getElementById('imgFileInput');
    if (fileInput) fileInput.value = '';
    document.getElementById('imgName').value = '';
    document.getElementById('imgNote').value = '';
    document.getElementById('imagePreviewWrap').style.display = 'none';
    document.getElementById('previewImgOnly').src = '';
    document.getElementById('modalTitleImage').textContent = '🖼️ إضافة صورة جديدة';
    document.getElementById('uploadStatus').textContent = '';
    // Reset mode buttons
    setTimeout(() => window.setUploadMode('crop'), 10);
    // Reset dropzone so it can be re-initialized
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
    document.getElementById('fName').value = e.name;
    document.getElementById('fEmail').value = e.email || '';
    document.getElementById('fPass').value = e.pass;
    document.getElementById('fUrl').value = e.url || '';
    document.getElementById('fNote').value = e.note || '';
    document.getElementById('fCategory').value = e.category || 'work';
    document.getElementById('modalTitleAccount').textContent = 'تعديل الحساب';
    document.getElementById('overlayAccount').classList.add('open');
  };

  window.openEditImage = (id) => {
    const e = entries.find(x => x.id === id);
    if (!e || e.type !== 'image') return;
    currentEditId = id;
    selectedImageBase64 = null;
    selectedImageType = null;
    document.getElementById('imgName').value = e.name;
    document.getElementById('imgNote').value = e.note || '';
    document.getElementById('modalTitleImage').textContent = '✏️ تعديل الصورة';
    const wrap = document.getElementById('imagePreviewWrap');
    const img = document.getElementById('previewImgOnly');
    wrap.style.display = 'block';
    img.src = e.imageUrl;
    document.getElementById('uploadStatus').textContent = 'الصورة الحالية معروضة أعلاه';
    hideProgress();
    document.getElementById('overlayImage').classList.add('open');
  };

  window.closeModalAccount = () => {
    document.getElementById('overlayAccount').classList.remove('open');
    currentEditId = null;
  };
  window.closeModalImage = () => {
    document.getElementById('overlayImage').classList.remove('open');
    currentEditId = null;
    selectedImageBase64 = null;
    selectedImageType = null;
    hideProgress();
    isUploading = false;
    const btn = document.getElementById('btnSaveImage');
    if (btn) { btn.disabled = false; btn.textContent = '💾 حفظ الصورة'; }
  };

  // ── فلاتر التصنيف ──
  window.setUploadMode = (mode) => {
    uploadMode = mode;
    const cropBtn = document.getElementById('modeCropBtn');
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

  // ────────────────────────────────────────────────────────────
  // نظام اقتصاص الصورة (Crop)
  // ────────────────────────────────────────────────────────────
  let cropImg = null, cropBox = null, cropCanvas = null, cropContainer = null;
  let cropDrag = false, cropStartX = 0, cropStartY = 0, cropBx = 0, cropBy = 0;
  let cropBw = 0, cropBh = 0, cropScale = 1;
  let _pendingCropFile = null;

  function openCrop(file) {
    _pendingCropFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const overlay = document.getElementById('cropOverlay');
      overlay.style.display = 'flex';
      cropContainer = document.getElementById('cropContainer');
      cropCanvas = document.getElementById('cropCanvas');
      cropBox = document.getElementById('cropBox');
      cropImg = new Image();
      cropImg.onload = () => {
        const cw = cropContainer.offsetWidth;
        const ch = cropContainer.offsetHeight;
        cropScale = Math.min(cw / cropImg.width, ch / cropImg.height);
        const dw = cropImg.width * cropScale;
        const dh = cropImg.height * cropScale;
        cropCanvas.width = dw; cropCanvas.height = dh;
        const ctx = cropCanvas.getContext('2d');
        ctx.drawImage(cropImg, 0, 0, dw, dh);
        cropCanvas.style.left = ((cw - dw) / 2) + 'px';
        cropCanvas.style.top = ((ch - dh) / 2) + 'px';
        // Initial crop box = 80% of image
        const ix = parseFloat(cropCanvas.style.left), iy = parseFloat(cropCanvas.style.top);
        cropBw = dw * 0.8; cropBh = dh * 0.8;
        cropBx = ix + dw * 0.1; cropBy = iy + dh * 0.1;
        updateCropBox();
        initCropDrag();
      };
      cropImg.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function updateCropBox() {
    cropBox.style.left = cropBx + 'px'; cropBox.style.top = cropBy + 'px';
    cropBox.style.width = cropBw + 'px'; cropBox.style.height = cropBh + 'px';
  }

  function initCropDrag() {
    const cbox = document.getElementById('cropBox');
    // Drag to move
    const onDown = (ex, ey) => { cropDrag = true; cropStartX = ex - cropBx; cropStartY = ey - cropBy; };
    const onMove = (ex, ey) => {
      if (!cropDrag) return;
      cropBx = Math.max(0, ex - cropStartX);
      cropBy = Math.max(0, ey - cropStartY);
      const ix = parseFloat(cropCanvas.style.left), iy = parseFloat(cropCanvas.style.top);
      const maxX = ix + parseFloat(cropCanvas.width) - cropBw;
      const maxY = iy + parseFloat(cropCanvas.height) - cropBh;
      cropBx = Math.min(cropBx, maxX); cropBy = Math.min(cropBy, maxY);
      updateCropBox();
    };
    const onUp = () => { cropDrag = false; };
    cbox.addEventListener('mousedown', e => { e.preventDefault(); onDown(e.clientX, e.clientY); });
    document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    document.addEventListener('mouseup', onUp);
    cbox.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onDown(t.clientX, t.clientY); }, {passive:false});
    document.addEventListener('touchmove', e => { const t = e.touches[0]; onMove(t.clientX, t.clientY); }, {passive:true});
    document.addEventListener('touchend', onUp);
  }

  window.cancelCrop = () => {
    document.getElementById('cropOverlay').style.display = 'none';
    _pendingCropFile = null;
  };

  window.applyCrop = () => {
    const ix = parseFloat(cropCanvas.style.left), iy = parseFloat(cropCanvas.style.top);
    const sx = (cropBx - ix) / cropScale;
    const sy = (cropBy - iy) / cropScale;
    const sw = cropBw / cropScale;
    const sh = cropBh / cropScale;
    const out = document.createElement('canvas');
    out.width = Math.round(sw); out.height = Math.round(sh);
    const ctx = out.getContext('2d');
    ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL(_pendingCropFile?.type || 'image/jpeg', 0.92);
    selectedImageBase64 = dataUrl;
    selectedImageType = _pendingCropFile?.type || 'image/jpeg';
    const wrap = document.getElementById('imagePreviewWrap');
    const img = document.getElementById('previewImgOnly');
    img.src = dataUrl;
    wrap.style.display = 'block';
    document.getElementById('uploadStatus').textContent = '✅ تم الاقتصاص — جاهز للرفع';
    showToast('✅ تم اقتصاص الصورة', '#10b981');
    document.getElementById('cropOverlay').style.display = 'none';
    _pendingCropFile = null;
  };

  // ────────────────────────────────────────────────────────────
  // الإصلاح الثاني: معالجة الصورة (بدون تشابك مراجع DOM)
  // ────────────────────────────────────────────────────────────
  function handleImageSelection(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('الرجاء اختيار ملف صورة صالح (jpg, png, webp...)', '#ef4444'); return;
    }
    const maxMB = 20;
    if (file.size > maxMB * 1024 * 1024) {
      showToast(`حجم الصورة كبير جداً (الحد الأقصى ${maxMB}MB)`, '#ef4444'); return;
    }

    if (uploadMode === 'direct') {
      // رفع مباشر بدون اقتصاص — تصغير تلقائي إذا كانت أكبر من 2MB
      showProgress(10, '⏳ جاري قراءة الصورة...');
      const reader = new FileReader();
      reader.onload = (ev) => {
        const original = ev.target.result;
        // تصغير تلقائي إذا تجاوز الحجم 2MB
        if (file.size > 2 * 1024 * 1024) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxDim = 1920;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
              else { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            selectedImageBase64 = canvas.toDataURL(file.type || 'image/jpeg', 0.88);
            selectedImageType = file.type || 'image/jpeg';
            const wrap = document.getElementById('imagePreviewWrap');
            const previewImg = document.getElementById('previewImgOnly');
            previewImg.src = selectedImageBase64;
            wrap.style.display = 'block';
            showProgress(100, '');
            setTimeout(hideProgress, 400);
            document.getElementById('uploadStatus').textContent = `✅ جاهز للرفع — ${file.name}`;
            showToast('✅ تم اختيار الصورة', '#10b981');
          };
          img.src = original;
        } else {
          selectedImageBase64 = original;
          selectedImageType = file.type;
          const wrap = document.getElementById('imagePreviewWrap');
          const previewImg = document.getElementById('previewImgOnly');
          previewImg.src = original;
          wrap.style.display = 'block';
          showProgress(100, '');
          setTimeout(hideProgress, 400);
          document.getElementById('uploadStatus').textContent = `✅ جاهز للرفع — ${file.name}`;
          showToast('✅ تم اختيار الصورة', '#10b981');
        }
      };
      reader.onerror = () => { hideProgress(); showToast('فشل قراءة الصورة', '#ef4444'); };
      reader.readAsDataURL(file);
    } else {
      // فتح أداة الاقتصاص
      openCrop(file);
    }
  }

  // ── السحب والإفلات واختيار الملف ──
  // نربط المستمعات مرة واحدة فقط (بدون cloneNode)
  function initImageDropzone() {
    const dropZone = document.getElementById('imageDropZone');
    const fileInput = document.getElementById('imgFileInput');
    if (!dropZone || dropZone._initDone) return;
    dropZone._initDone = true;

    dropZone.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.value = '';
      fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleImageSelection(file);
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        handleImageSelection(file);
      }
    });
  }

  // استدعاء initImageDropzone عند فتح مودال الصورة للتعديل فقط
  const origOpenEditImage = window.openEditImage;
  window.openEditImage = function(id) {
    origOpenEditImage(id);
    const dz = document.getElementById('imageDropZone');
    if (dz) dz._initDone = false;
    setTimeout(initImageDropzone, 50);
  };

  // ── تذكر الإيميل تلقائياً ──
  let _pendingVerifyEmail = null, _pendingVerifyPass = null, _verifyCodeSent = null;

  window.saveEmailDraft = (val) => {
    if (val) localStorage.setItem('vault_last_email', val);
  };

  // تعبئة الإيميل المحفوظ عند فتح الصفحة
  (function() {
    const saved = localStorage.getItem('vault_last_email');
    if (saved) {
      const el = document.getElementById('authEmail');
      if (el) el.value = saved;
    }
  })();

  window.loginWithEmail = async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass  = document.getElementById('authPass').value;
    if (!email || !pass) { showToast('أدخل الإيميل والرقم السري', '#ef4444'); return; }

    // ── محاولة الدخول بالإيميل وكلمة المرور ──
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      localStorage.setItem('vault_last_email', email);
      return; // ✅ نجح
    } catch(e) {

      // الإيميل صحيح لكن كلمة المرور خاطئة
      if (e.code === 'auth/wrong-password') {
        showToast('❌ الرقم السري خاطئ', '#ef4444'); return;
      }
      if (e.code === 'auth/invalid-email') {
        showToast('❌ صيغة الإيميل غير صحيحة', '#ef4444'); return;
      }
      if (e.code === 'auth/too-many-requests') {
        showToast('⏳ محاولات كثيرة — انتظر قليلاً', '#ef4444'); return;
      }

      // auth/invalid-credential أو auth/user-not-found
      // → نتحقق هل الإيميل مسجل بـ Google أو طريقة أخرى
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found') {
        showToast('⏳ جاري التحقق من الحساب...', '#f5a623');

        // نحاول إنشاء حساب جديد — إذا فشل بـ email-already-in-use
        // فهذا يعني الإيميل موجود لكن بطريقة أخرى (Google مثلاً)
        try {
          const testCred = await createUserWithEmailAndPassword(auth, email, '__PROBE__' + Math.random());
          // نجح = الإيميل غير مسجل أصلاً → نحذف الحساب التجريبي ونُبلّغ
          try { await testCred.user.delete(); } catch(_) {}
          await signOut(auth);
          showToast('❌ هذا الإيميل غير مسجل — سجّل حساباً جديداً', '#ef4444');
          const hint = document.getElementById('authEmailHint');
          if (hint) { hint.textContent = '⚠️ الإيميل غير موجود — اضغط "تسجيل جديد"'; hint.style.display = 'block'; }
        } catch(probeErr) {
          if (probeErr.code === 'auth/email-already-in-use') {
            // الإيميل موجود لكن بطريقة أخرى (Google / Facebook...)
            showToast('ℹ️ هذا الإيميل مسجل بـ Google — استخدم زر Google للدخول', '#3b82f6');
            // إبراز زر Google
            const hint = document.getElementById('authEmailHint');
            if (hint) {
              hint.innerHTML = '🔵 هذا الحساب مسجل عبر <strong>Google</strong> — استخدم زر <strong>"تسجيل الدخول بـ Google"</strong> أعلاه';
              hint.style.display = 'block';
              hint.style.background = 'rgba(59,130,246,0.12)';
              hint.style.color = '#3b82f6';
            }
            // تمييز زر Google بصرياً
            const googleBtn = document.querySelector('.social-btn[onclick*="loginWithGoogle"]');
            if (googleBtn) {
              googleBtn.style.transform = 'scale(1.04)';
              googleBtn.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.5)';
              setTimeout(() => { googleBtn.style.transform = ''; googleBtn.style.boxShadow = ''; }, 3000);
            }
          } else {
            showToast('خطأ: ' + probeErr.message, '#ef4444');
          }
        }
        return;
      }

      showToast('خطأ: ' + e.message, '#ef4444');
    }
  };

  // ── توليد كود عشوائي 6 أرقام وإرساله عبر EmailJS ──
  function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async function sendVerifyCode(email) {
    const code = generateCode();
    _verifyCodeSent = code;
    try {
      emailjs.init(EMAILJS_PUBLIC_KEY);
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        subject: '🔐 رمز تأكيد بريدك في خزنة المرور',
        message: `رمز التحقق الخاص بك هو:\n\n${code}\n\nصالح لمدة 10 دقائق.`,
        to_email: email,
        from_name: 'خزنة المرور السحابية'
      });
      return true;
    } catch(err) {
      console.error('EmailJS error:', err);
      return false;
    }
  }

  window.registerWithEmail = async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass  = document.getElementById('authPass').value;
    const hint  = document.getElementById('authEmailHint');

    if (!email || !pass) { showToast('أدخل الإيميل والرقم السري', '#ef4444'); return; }
    if (pass.length < 6) { showToast('الرقم السري 6 أحرف على الأقل', '#ef4444'); return; }

    // ══════════════════════════════════════════════════════════════
    // الطريقة الوحيدة الموثوقة في Firebase v10:
    // نحاول إنشاء الحساب مباشرةً — إذا أعاد email-already-in-use
    // فهذا يعني الإيميل موجود بالتأكيد → نوقف ونُبلّغ.
    // إذا نجح الإنشاء مباشرةً نحذف الحساب المؤقت ونكمل بالتحقق.
    // ══════════════════════════════════════════════════════════════
    showToast('⏳ جاري التحقق من الإيميل...', '#f5a623');

    let tempUser = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      tempUser = cred.user;
    } catch (checkErr) {
      // ── الإيميل موجود مسبقاً ──
      if (checkErr.code === 'auth/email-already-in-use') {
        showToast('❌ هذا الإيميل مسجل مسبقاً', '#ef4444');
        if (hint) {
          hint.textContent = '⚠️ الإيميل موجود — استخدم "دخول" أو "نسيت كلمة المرور"';
          hint.style.display = 'block';
        }
        return;
      }
      if (checkErr.code === 'auth/invalid-email') {
        showToast('❌ صيغة الإيميل غير صحيحة', '#ef4444'); return;
      }
      if (checkErr.code === 'auth/weak-password') {
        showToast('❌ الرقم السري ضعيف جداً (6 أحرف على الأقل)', '#ef4444'); return;
      }
      showToast('خطأ: ' + checkErr.message, '#ef4444'); return;
    }

    // ── الحساب أُنشئ مؤقتاً — نحذفه الآن ونُرسل كود التحقق ──
    try { await tempUser.delete(); } catch(_) {}
    await signOut(auth);

    if (hint) hint.style.display = 'none';

    // إرسال كود التحقق قبل الإنشاء الفعلي
    showToast('⏳ جاري إرسال رمز التحقق...', '#f5a623');
    _pendingVerifyEmail = email;
    _pendingVerifyPass  = pass;

    const sent = await sendVerifyCode(email);
    if (!sent) {
      // Fallback: إنشاء مباشر بدون كود (EmailJS غير مهيأ)
      try {
        await createUserWithEmailAndPassword(auth, email, pass);
        localStorage.setItem('vault_last_email', email);
        showToast('✅ تم إنشاء الحساب بنجاح!');
      } catch(e) {
        showToast(e.code === 'auth/email-already-in-use'
          ? '❌ الإيميل مسجل مسبقاً — حاول تسجيل الدخول'
          : ('خطأ: ' + e.message), '#ef4444');
      }
      return;
    }

    document.getElementById('emailAuthSection').style.display = 'none';
    document.getElementById('verifySection').style.display = 'block';
    document.getElementById('verifyEmailHint').textContent = `📨 تم إرسال رمز التحقق إلى ${email}`;
    document.getElementById('verifyCode').value = '';
    showToast('📨 تحقق من بريدك الإلكتروني');
  };

  window.forgotPassword = async () => {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) { showToast('أدخل الإيميل أولاً', '#ef4444'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('📨 تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك', '#10b981');
    } catch(e) {
      const msgs = {
        'auth/user-not-found': '❌ هذا الإيميل غير مسجل',
        'auth/invalid-email': '❌ صيغة الإيميل غير صحيحة',
        'auth/too-many-requests': '⏳ طلبات كثيرة — انتظر قليلاً'
      };
      showToast(msgs[e.code] || ('خطأ: ' + e.message), '#ef4444');
    }
  };

  window.checkVerifyCode = async () => {
    const entered = document.getElementById('verifyCode').value.trim();
    if (!entered) { showToast('أدخل الرمز', '#ef4444'); return; }
    if (entered !== _verifyCodeSent) {
      showToast('الرمز غير صحيح ❌', '#ef4444');
      document.getElementById('verifyCode').value = '';
      return;
    }
    // الكود صحيح — إنشاء الحساب
    try {
      await createUserWithEmailAndPassword(auth, _pendingVerifyEmail, _pendingVerifyPass);
      localStorage.setItem('vault_last_email', _pendingVerifyEmail);
      showToast('✅ تم التحقق وإنشاء الحساب بنجاح!');
      window.cancelVerify();
    } catch(e) {
      const msgs = { 'auth/email-already-in-use': 'الإيميل مسجل مسبقاً — حاول الدخول', 'auth/weak-password': 'الرقم السري ضعيف جداً' };
      showToast(msgs[e.code] || ('خطأ: ' + e.message), '#ef4444');
    }
  };

  window.resendVerifyCode = async () => {
    if (!_pendingVerifyEmail) return;
    showToast('⏳ إعادة إرسال الرمز...', '#f5a623');
    const sent = await sendVerifyCode(_pendingVerifyEmail);
    showToast(sent ? '📨 تم إعادة إرسال الرمز' : 'فشل الإرسال', sent ? '#10b981' : '#ef4444');
  };

  window.cancelVerify = () => {
    _pendingVerifyEmail = null; _pendingVerifyPass = null; _verifyCodeSent = null;
    document.getElementById('verifySection').style.display = 'none';
    document.getElementById('emailAuthSection').style.display = 'block';
  };

  // ── المصادقة ──
  window.loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    } catch(e) {
      showToast('فشل تسجيل الدخول: ' + e.message, '#ef4444');
    }
  };

  window.loginWithFacebook = async () => {
    try {
      const provider = new FacebookAuthProvider();
      // نستخدم redirect بدل popup لأن popup يُحجب في كثير من المتصفحات
      await signInWithRedirect(auth, provider);
    } catch(e) {
      showToast('فشل Facebook: ' + (e.message || e.code), '#ef4444');
    }
  };

  window.loginWithTwitter = async () => {
    try {
      const provider = new TwitterAuthProvider();
      await signInWithRedirect(auth, provider);
    } catch(e) {
      showToast('فشل Twitter/X: ' + (e.message || e.code), '#ef4444');
    }
  };

  const DEMO_ENTRIES = [
    { id: 'd1', name: 'Gmail', email: 'demo@gmail.com', pass: 'Demo@123', type: 'account', category: 'work', color: 0, note: 'حساب تجريبي', url: '', createdAt: Date.now() },
    { id: 'd2', name: 'صورة تجريبية', type: 'image', imageUrl: 'https://picsum.photos/id/1015/400/300', note: 'منظر طبيعي', category: 'photos', createdAt: Date.now() - 1000 }
  ];

  window.startDemo = () => {
    isDemo = true;
    currentUser = null;
    entries = [...DEMO_ENTRIES];
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    document.getElementById('demoBar').style.display = 'flex';
    document.getElementById('syncStatus').textContent = '🎮 تجريبي';
    renderCards();
    renderCategoryFilters();
    updateSidebarUI();
  };

  window.exitDemo = () => {
    isDemo = false; entries = [];
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('demoBar').style.display = 'none';
    document.getElementById('syncStatus').textContent = '☁️ سحابية';
  };

  window.logoutUser = async () => {
    if (unsubscribe) unsubscribe();
    if (isDemo) { window.exitDemo(); return; }
    try { await signOut(auth); } catch(e) {}
    window.location.reload();
  };

  function updateSidebarUI() {
    const avatarDiv = document.getElementById('sidebarAvatar');
    const userNameSpan = document.getElementById('sidebarUserName');
    const emailSpan = document.getElementById('sidebarEmail');
    const headerAvatar = document.getElementById('menuAvatar');

    if (currentUser && !isDemo) {
      const letter = (currentUser.displayName?.[0] || currentUser.email?.[0] || 'U').toUpperCase();
      const photoHtml = currentUser.photoURL
        ? `<img src="${currentUser.photoURL}" style="width:100%;height:100%;object-fit:cover;">`
        : `<span style="font-size:24px;">${letter}</span>`;
      avatarDiv.innerHTML = photoHtml;
      headerAvatar.innerHTML = photoHtml;
      userNameSpan.textContent = currentUser.displayName || currentUser.email?.split('@')[0] || 'مستخدم';
      emailSpan.textContent = currentUser.email || '';
    } else if (isDemo) {
      avatarDiv.innerHTML = '<span style="font-size:24px;">🎮</span>';
      headerAvatar.innerHTML = '<span>🎮</span>';
      userNameSpan.textContent = 'الوضع التجريبي';
      emailSpan.textContent = 'demo@example.com';
    } else {
      avatarDiv.innerHTML = '<span style="font-size:24px;">👤</span>';
      headerAvatar.innerHTML = '<span>👤</span>';
      userNameSpan.textContent = 'زائر';
      emailSpan.textContent = 'غير مسجل';
    }
  }

  // معالجة نتيجة الـ redirect بعد عودة المستخدم من Google
  getRedirectResult(auth).catch((e) => {
    if (e.code && e.code !== 'auth/no-current-user') {
      showToast('فشل تسجيل الدخول: ' + e.message, '#ef4444');
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user && !isDemo) {
      currentUser = user;
      document.getElementById('loginScreen').style.display = 'none';
      if (localStorage.getItem('vault_pin_hash')) {
        document.getElementById('lockScreen').style.display = 'flex';
        document.getElementById('appScreen').style.display = 'none';
      } else {
        document.getElementById('appScreen').style.display = 'block';
      }
      document.getElementById('syncStatus').textContent = '☁️ متصل';
      updateSidebarUI();
      const q = query(collection(db, 'users', user.uid, 'entries'), orderBy('createdAt', 'desc'));
      unsubscribe = onSnapshot(q,
        snap => { entries = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderCards(); },
        err => { console.error('Firestore error:', err); showToast('خطأ في المزامنة', '#ef4444'); }
      );
      renderCards();
      renderCategoryFilters();
    } else if (!isDemo) {
      currentUser = null;
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('appScreen').style.display = 'none';
    }
  });

  // ── PIN ──
  window.checkPin = async () => {
    const pin = document.getElementById('pinInput').value;
    if (!pin) { showToast('أدخل الرقم السري', '#ef4444'); return; }
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
    if (hashHex === localStorage.getItem('vault_pin_hash')) {
      document.getElementById('lockScreen').style.display = 'none';
      document.getElementById('appScreen').style.display = 'block';
    } else {
      showToast('رقم سري خاطئ ❌', '#ef4444');
      document.getElementById('pinInput').value = '';
    }
  };

  window.setupPin = async () => {
    const p1 = document.getElementById('newPin').value;
    const p2 = document.getElementById('newPin2').value;
    if (p1.length < 4) { showToast('4 أرقام على الأقل', '#ef4444'); return; }
    if (p1 !== p2) { showToast('الرقمان غير متطابقين', '#ef4444'); return; }
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p1));
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
    localStorage.setItem('vault_pin_hash', hashHex);
    showToast('✅ تم تفعيل قفل PIN');
    window.closePinSetup();
  };

  window.removePin = () => {
    localStorage.removeItem('vault_pin_hash');
    showToast('تم إزالة القفل', '#f5a623');
    document.getElementById('securityOverlay').classList.remove('open');
  };

  window.tryBiometric = () => {
    if (!window.PublicKeyCredential) { showToast('جهازك لا يدعم البصمة', '#ef4444'); return; }
    navigator.credentials.get({
      publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname, userVerification: 'required' }
    }).then(() => {
      document.getElementById('lockScreen').style.display = 'none';
      document.getElementById('appScreen').style.display = 'block';
    }).catch((e) => { showToast('البصمة غير متاحة: ' + e.message, '#ef4444'); });
  };

  window.closePinSetup = () => { document.getElementById('pinSetupOverlay').style.display = 'none'; };
  window.openPinSetup = () => {
    document.getElementById('newPin').value = '';
    document.getElementById('newPin2').value = '';
    document.getElementById('pinSetupOverlay').style.display = 'flex';
    document.getElementById('securityOverlay').classList.remove('open');
  };

  // ── المظهر ──
  window.toggleTheme = () => {
    const th = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', th);
    localStorage.setItem('vault_theme', th);
    document.getElementById('themeBtn').textContent = th === 'dark' ? '🌙' : '☀️';
  };
  // دائماً اللون الشمسي عند الفتح
  document.documentElement.setAttribute('data-theme', 'light');
  document.getElementById('themeBtn').textContent = '☀️';

  // ── الشريط الجانبي ──
  window.openSidebar = () => {
    updateSidebarUI();
    document.getElementById('sidebarOverlay').classList.add('open');
    document.getElementById('sidebarPanel').classList.add('open');
  };
  window.closeSidebar = () => {
    document.getElementById('sidebarOverlay').classList.remove('open');
    document.getElementById('sidebarPanel').classList.remove('open');
  };

  // ── إرسال رسالة عبر EmailJS ──
  window.openSendMessage = () => {
    document.getElementById('msgSubject').value = '';
    document.getElementById('msgBody').value = '';
    document.getElementById('msgStatus').textContent = '';
    document.getElementById('sendMessageOverlay').classList.add('open');
  };
  window.closeSendMessage = () => {
    document.getElementById('sendMessageOverlay').classList.remove('open');
  };
  window.sendMessageToEmail = async () => {
    const subject = document.getElementById('msgSubject').value.trim();
    const body = document.getElementById('msgBody').value.trim();
    const statusEl = document.getElementById('msgStatus');
    if (!subject) { showToast('موضوع الرسالة مطلوب', '#ef4444'); return; }
    if (!body) { showToast('نص الرسالة مطلوب', '#ef4444'); return; }

    // إذا لم يُعيَّن EmailJS بعد → افتح mailto كبديل
    if (EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
      const mailto = `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailto, '_blank');
      showToast('✅ تم فتح تطبيق البريد');
      window.closeSendMessage();
      return;
    }

    const btn = document.getElementById('btnSendMsg');
    btn.disabled = true;
    btn.textContent = '⏳ جاري الإرسال...';
    statusEl.textContent = '';

    try {
      emailjs.init(EMAILJS_PUBLIC_KEY);
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        subject,
        message: body,
        to_email: OWNER_EMAIL,
        from_name: currentUser?.displayName || currentUser?.email || 'زائر'
      });
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = '✅ تم إرسال الرسالة بنجاح!';
      showToast('✅ تم إرسال الرسالة');
      setTimeout(() => window.closeSendMessage(), 1500);
    } catch(err) {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = '❌ فشل الإرسال — تحقق من إعدادات EmailJS';
      showToast('فشل الإرسال', '#ef4444');
    } finally {
      btn.disabled = false;
      btn.textContent = '📨 إرسال';
    }
  };

  // ── المشاركة ──
  window.openShareApp = () => {
    // تحديث اسم المرسل في معاينة الرسالة
    const nameEl = document.getElementById('shareFromName');
    if (nameEl) {
      const senderName = currentUser?.displayName || currentUser?.email?.split('@')[0] || (isDemo ? 'المستخدم التجريبي' : 'مستخدم');
      nameEl.textContent = senderName;
    }
    document.getElementById('shareAppOverlay').classList.add('open');
  };
  window.closeShareApp = () => document.getElementById('shareAppOverlay').classList.remove('open');
  window.shareAppLink = (type) => {
    const url = 'https://aamer777.github.io/asd/';
    const senderName = currentUser?.displayName || currentUser?.email?.split('@')[0] || (isDemo ? 'المستخدم التجريبي' : 'مستخدم');
    const msg = `🔐 خزنة المرور السحابية\nتطبيق مجاني لحفظ كلمات المرور بأمان مع مزامنة سحابية فورية ورفع صور أصلية.\n\n🌐 الرابط: ${url}\n\n📤 أرسلها: ${senderName} عبر موقع خزنة`;
    if (type === 'wa') window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    else if (type === 'tg') window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`, '_blank');
    else if (type === 'em') window.open(`mailto:?subject=تطبيق خزنة المرور السحابية&body=${encodeURIComponent(msg)}`, '_blank');
    else if (type === 'cp') { navigator.clipboard.writeText(url).then(()=>showToast('✅ تم نسخ رابط التطبيق')).catch(()=>{const ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('✅ تم نسخ رابط التطبيق')}); }
    if (type !== 'cp') window.closeShareApp();
  };

  // ── فلاتر التصنيف ──
  function renderCategoryFilters() {
    const bar = document.getElementById('categoryBar');
    const cats = [
      { id: 'all',      label: '🌐 الكل' },
      { id: 'websites', label: '🔗 مواقع' },
      { id: 'work',     label: '💼 عمل' },
      { id: 'personal', label: '👤 شخصي' },
      { id: 'banking',  label: '🏦 بنوك' },
      { id: 'other',    label: '📁 أخرى' },
      { id: 'photos',   label: '🖼️ صور' }
    ];
    bar.innerHTML = cats.map(c =>
      `<button class="cat-btn ${activeCategory === c.id ? 'active' : ''}" onclick="window.setCategory('${c.id}')">${c.label}</button>`
    ).join('');
  }

  window.setCategory = (c) => { activeCategory = c; renderCategoryFilters(); renderCards(); };
  document.getElementById('searchInput').addEventListener('input', renderCards);

  // ── PWA: حفظ على الشاشة الرئيسية ──
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    // لا نمنع الحدث — نتركه يظهر تلقائياً من Chrome
    // لكن نحفظه أيضاً لاستخدامه من الأزرار
    deferredPrompt = e;

    // عرض شريط التثبيت المخصص بعد ثانيتين
    setTimeout(() => {
      const bar = document.getElementById('pwaInstallBar');
      if (bar && !window._pwaBarDismissed) {
        bar.style.transform = 'translateY(0)';
        bar.style.opacity = '1';
        bar.style.pointerEvents = 'auto';
      }
    }, 2000);
  });

  window.addEventListener('appinstalled', () => {
    const bar = document.getElementById('pwaInstallBar');
    if (bar) bar.style.transform = 'translateY(100%)';
    showToast('✅ تم تثبيت التطبيق على شاشتك الرئيسية!');
    deferredPrompt = null;
  });

  window.triggerInstallPrompt = async () => {
    const bar = document.getElementById('pwaInstallBar');
    if (deferredPrompt) {
      if (bar) bar.style.transform = 'translateY(100%)';
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('✅ تم إضافة التطبيق للشاشة الرئيسية');
      } else {
        // أعد إظهار الشريط إذا رفض
        setTimeout(() => {
          if (bar) bar.style.transform = 'translateY(0)';
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
    const androidSteps = document.getElementById('installStepsAndroid');
    const iosSteps     = document.getElementById('installStepsIos');
    const btnA         = document.getElementById('installTabAndroid');
    const btnI         = document.getElementById('installTabIos');
    if (tab === 'android') {
      androidSteps.style.display = 'block'; iosSteps.style.display = 'none';
      btnA.style.background = 'var(--accent)'; btnA.style.color = '#0a0e1a';
      btnI.style.background = 'transparent';  btnI.style.color = 'var(--muted2)';
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
    window.triggerInstallPrompt();
  };

  window.showIosInstall = () => { window.closeSidebar(); _openInstallGuide(); };

  window.loginInstallApp = () => {
    window.triggerInstallPrompt();
  };

  // iOS Safari: اكتشاف تلقائي
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;

  // ── تبويبات مودال الإضافة ──
  window.switchAccountTab = (tab) => {
    const basic = document.getElementById('tabBasic');
    const adv   = document.getElementById('tabAdv');
    const btnB  = document.getElementById('tabBasicBtn');
    const btnA  = document.getElementById('tabAdvBtn');
    if (tab === 'basic') {
      basic.style.display = 'block'; adv.style.display = 'none';
      btnB.style.background = 'var(--accent)'; btnB.style.color = '#0a0e1a';
      btnA.style.background = 'transparent'; btnA.style.color = 'var(--muted2)';
    } else {
      basic.style.display = 'none'; adv.style.display = 'block';
      btnA.style.background = 'var(--accent)'; btnA.style.color = '#0a0e1a';
      btnB.style.background = 'transparent'; btnB.style.color = 'var(--muted2)';
    }
  };

  // ── اختيار الفئة بالـ chip ──
  window.selectCatChip = (el, cat) => {
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('fCategory').value = cat;
  };

  // ── أيقونة الحساب ──
  const iconEmojis = ['🔐','🌐','📱','✉️','🏦','🎮','🛒','📸','💼','🎬','🏠','🚗','☁️','🔑','💳','📚'];
  window.pickAccountIcon = () => {
    let picker = document.getElementById('iconPickerPopup');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'iconPickerPopup';
      picker.style.cssText = 'position:fixed;inset:0;z-index:9200;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.5);';
      picker.innerHTML = `<div style="background:var(--card);border-radius:28px 28px 0 0;padding:20px;width:100%;max-width:480px;">
        <div style="font-weight:900;font-size:16px;text-align:center;margin-bottom:14px;">اختر أيقونة</div>
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:10px;margin-bottom:16px;">
          ${iconEmojis.map(e=>`<button onclick="window.setAccountIcon('${e}')" style="font-size:28px;background:var(--card2);border:none;border-radius:12px;padding:8px;cursor:pointer;">${e}</button>`).join('')}
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

  // ── توليد كلمة مرور ──
  window.generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$=';
    const len = 16;
    let pass = '';
    const arr = crypto.getRandomValues(new Uint8Array(len));
    arr.forEach(b => pass += chars[b % chars.length]);
    const inp = document.getElementById('fPass');
    if (inp) { inp.value = pass; inp.type = 'text'; window.updateStrength(); }
  };

  // ── إظهار/إخفاء كلمة المرور ──
  window.togglePassVis = () => {
    const inp = document.getElementById('fPass');
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  // ── قوة كلمة المرور ──
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

  // اربط حدث input بكلمة المرور
  document.addEventListener('input', e => { if (e.target && e.target.id === 'fPass') window.updateStrength(); });

  // ── اختيار اللون في المودال ──
  window.selectColorInModal = (idx, el) => {
    document.querySelectorAll('#colorRowAccount .color-dot').forEach(d => d.classList.remove('selected'));
    el.classList.add('selected');
    selectedColorIdx = idx;
  };

  // ── تهيئة أولية ──
  renderCategoryFilters();
  document.dispatchEvent(new CustomEvent('vault-ready'));
