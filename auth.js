/* ══════════════════════════════════════════════
   auth.js — Firebase + تسجيل الدخول
   خزنة المرور السحابية v2.1
══════════════════════════════════════════════ */

import { initializeApp }                          from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth, signInWithPopup, signInWithRedirect, getRedirectResult,
  GoogleAuthProvider, FacebookAuthProvider, TwitterAuthProvider,
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore, collection, onSnapshot, setDoc, deleteDoc, query, orderBy, doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ── إعداد Firebase ── */
const firebaseConfig = {
  apiKey:            "AIzaSyCCPmhcxaq7-xGqnUBNR1vsFRsIWQjwchU",
  authDomain:        "asdf-736d2.firebaseapp.com",
  projectId:         "asdf-736d2",
  messagingSenderId: "462090265735",
  appId:             "1:462090265735:web:5fc5eeb8295bcea1568422"
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

/* ── تصدير db للاستخدام في app.js ── */
export { auth, db, doc, setDoc, deleteDoc, collection, query, orderBy, onSnapshot };

/* ══════════════════════════════════════════════
   EmailJS
══════════════════════════════════════════════ */
const EMAILJS_PUBLIC_KEY  = 'AAqRxMl4frLp82l-7';
const EMAILJS_SERVICE_ID  = 'service_jmk7uc5';
const EMAILJS_TEMPLATE_ID = 'template_5qrk29k';
const OWNER_EMAIL         = 'aamer777@gmail.com';

let _pendingVerifyEmail = null;
let _pendingVerifyPass  = null;
let _verifyCodeSent     = null;

/* ══════════════════════════════════════════════
   مراقبة حالة المصادقة — تُخبر app.js
══════════════════════════════════════════════ */
export function watchAuthState(onLogin, onLogout) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      onLogin(user);
    } else {
      onLogout();
    }
  });
}

/* ══════════════════════════════════════════════
   تسجيل الدخول بـ Google
══════════════════════════════════════════════ */
window.loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch(e) {
    window.showToast?.('فشل تسجيل الدخول: ' + e.message, '#ef4444');
  }
};

/* ══════════════════════════════════════════════
   تسجيل الدخول بالإيميل
══════════════════════════════════════════════ */
window.loginWithEmail = async () => {
  const email = document.getElementById('authEmail')?.value.trim();
  const pass  = document.getElementById('authPass')?.value;
  if (!email || !pass) { window.showToast?.('أدخل الإيميل والرقم السري', '#ef4444'); return; }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    localStorage.setItem('vault_last_email', email);
    return;
  } catch(e) {
    if (e.code === 'auth/wrong-password') { window.showToast?.('❌ الرقم السري خاطئ', '#ef4444'); return; }
    if (e.code === 'auth/invalid-email')  { window.showToast?.('❌ صيغة الإيميل غير صحيحة', '#ef4444'); return; }
    if (e.code === 'auth/too-many-requests') { window.showToast?.('⏳ محاولات كثيرة — انتظر قليلاً', '#ef4444'); return; }

    if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found') {
      window.showToast?.('⏳ جاري التحقق من الحساب...', '#f5a623');
      try {
        const testCred = await createUserWithEmailAndPassword(auth, email, '__PROBE__' + Math.random());
        try { await testCred.user.delete(); } catch(_) {}
        await signOut(auth);
        window.showToast?.('❌ هذا الإيميل غير مسجل — سجّل حساباً جديداً', '#ef4444');
        _showEmailHint('⚠️ الإيميل غير موجود — اضغط "تسجيل جديد"');
      } catch(probeErr) {
        if (probeErr.code === 'auth/email-already-in-use') {
          window.showToast?.('ℹ️ هذا الإيميل مسجل بـ Google — استخدم زر Google للدخول', '#3b82f6');
          _showEmailHint('🔵 هذا الحساب مسجل عبر <strong>Google</strong> — استخدم زر <strong>"تسجيل الدخول بـ Google"</strong> أعلاه', '#3b82f6');
          const googleBtn = document.querySelector('.social-btn.google');
          if (googleBtn) {
            googleBtn.style.transform = 'scale(1.04)';
            googleBtn.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.5)';
            setTimeout(() => { googleBtn.style.transform = ''; googleBtn.style.boxShadow = ''; }, 3000);
          }
        } else {
          window.showToast?.('خطأ: ' + probeErr.message, '#ef4444');
        }
      }
      return;
    }
    window.showToast?.('خطأ: ' + e.message, '#ef4444');
  }
};

/* ══════════════════════════════════════════════
   تسجيل حساب جديد بالإيميل (مع كود تحقق)
══════════════════════════════════════════════ */
window.registerWithEmail = async () => {
  const email = document.getElementById('authEmail')?.value.trim();
  const pass  = document.getElementById('authPass')?.value;
  const hint  = document.getElementById('authEmailHint');

  if (!email || !pass) { window.showToast?.('أدخل الإيميل والرقم السري', '#ef4444'); return; }
  if (pass.length < 6) { window.showToast?.('الرقم السري 6 أحرف على الأقل', '#ef4444'); return; }

  window.showToast?.('⏳ جاري التحقق من الإيميل...', '#f5a623');

  let tempUser = null;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    tempUser = cred.user;
  } catch (checkErr) {
    if (checkErr.code === 'auth/email-already-in-use') {
      window.showToast?.('❌ هذا الإيميل مسجل مسبقاً', '#ef4444');
      _showEmailHint('⚠️ الإيميل موجود — استخدم "دخول" أو "نسيت كلمة المرور"');
      return;
    }
    if (checkErr.code === 'auth/invalid-email') { window.showToast?.('❌ صيغة الإيميل غير صحيحة', '#ef4444'); return; }
    if (checkErr.code === 'auth/weak-password')  { window.showToast?.('❌ الرقم السري ضعيف جداً (6 أحرف على الأقل)', '#ef4444'); return; }
    window.showToast?.('خطأ: ' + checkErr.message, '#ef4444'); return;
  }

  try { await tempUser.delete(); } catch(_) {}
  await signOut(auth);
  if (hint) hint.style.display = 'none';

  window.showToast?.('⏳ جاري إرسال رمز التحقق...', '#f5a623');
  _pendingVerifyEmail = email;
  _pendingVerifyPass  = pass;

  const sent = await _sendVerifyCode(email);
  if (!sent) {
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
      localStorage.setItem('vault_last_email', email);
      window.showToast?.('✅ تم إنشاء الحساب بنجاح!');
    } catch(e) {
      window.showToast?.(
        e.code === 'auth/email-already-in-use' ? '❌ الإيميل مسجل مسبقاً — حاول تسجيل الدخول' : ('خطأ: ' + e.message),
        '#ef4444'
      );
    }
    return;
  }

  document.getElementById('emailAuthSection').style.display = 'none';
  document.getElementById('verifySection').style.display = 'block';
  document.getElementById('verifyEmailHint').textContent = `📨 تم إرسال رمز التحقق إلى ${email}`;
  document.getElementById('verifyCode').value = '';
  window.showToast?.('📨 تحقق من بريدك الإلكتروني');
};

/* ══════════════════════════════════════════════
   التحقق من الكود
══════════════════════════════════════════════ */
window.checkVerifyCode = async () => {
  const entered = document.getElementById('verifyCode')?.value.trim();
  if (!entered) { window.showToast?.('أدخل الرمز', '#ef4444'); return; }
  if (entered !== _verifyCodeSent) {
    window.showToast?.('الرمز غير صحيح ❌', '#ef4444');
    document.getElementById('verifyCode').value = '';
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, _pendingVerifyEmail, _pendingVerifyPass);
    localStorage.setItem('vault_last_email', _pendingVerifyEmail);
    window.showToast?.('✅ تم التحقق وإنشاء الحساب بنجاح!');
    window.cancelVerify();
  } catch(e) {
    const msgs = {
      'auth/email-already-in-use': 'الإيميل مسجل مسبقاً — حاول الدخول',
      'auth/weak-password': 'الرقم السري ضعيف جداً'
    };
    window.showToast?.(msgs[e.code] || ('خطأ: ' + e.message), '#ef4444');
  }
};

window.resendVerifyCode = async () => {
  if (!_pendingVerifyEmail) return;
  window.showToast?.('⏳ إعادة إرسال الرمز...', '#f5a623');
  const sent = await _sendVerifyCode(_pendingVerifyEmail);
  window.showToast?.(sent ? '📨 تم إعادة إرسال الرمز' : 'فشل الإرسال', sent ? '#10b981' : '#ef4444');
};

window.cancelVerify = () => {
  _pendingVerifyEmail = null; _pendingVerifyPass = null; _verifyCodeSent = null;
  document.getElementById('verifySection').style.display = 'none';
  document.getElementById('emailAuthSection').style.display = 'block';
};

/* ══════════════════════════════════════════════
   نسيت كلمة المرور
══════════════════════════════════════════════ */
window.forgotPassword = async () => {
  const email = document.getElementById('authEmail')?.value.trim();
  if (!email) { window.showToast?.('أدخل الإيميل أولاً', '#ef4444'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    window.showToast?.('📨 تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك', '#10b981');
  } catch(e) {
    const msgs = {
      'auth/user-not-found':    '❌ هذا الإيميل غير مسجل',
      'auth/invalid-email':     '❌ صيغة الإيميل غير صحيحة',
      'auth/too-many-requests': '⏳ طلبات كثيرة — انتظر قليلاً'
    };
    window.showToast?.(msgs[e.code] || ('خطأ: ' + e.message), '#ef4444');
  }
};

/* ══════════════════════════════════════════════
   تسجيل الخروج
══════════════════════════════════════════════ */
export async function logoutFromFirebase() {
  try { await signOut(auth); } catch(e) {}
}

/* ══════════════════════════════════════════════
   ذاكرة الإيميل
══════════════════════════════════════════════ */
export function prefillSavedEmail() {
  const saved = localStorage.getItem('vault_last_email');
  if (saved) {
    const el = document.getElementById('authEmail');
    if (el) el.value = saved;
  }
}
window.saveEmailDraft = (val) => {
  if (val) localStorage.setItem('vault_last_email', val);
};

/* ══════════════════════════════════════════════
   PIN — قفل التطبيق
══════════════════════════════════════════════ */
window.checkPin = async () => {
  const pin = document.getElementById('pinInput')?.value;
  if (!pin) { window.showToast?.('أدخل الرقم السري', '#ef4444'); return; }
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
  if (hashHex === localStorage.getItem('vault_pin_hash')) {
    document.getElementById('lockScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
  } else {
    window.showToast?.('رقم سري خاطئ ❌', '#ef4444');
    document.getElementById('pinInput').value = '';
  }
};

window.setupPin = async () => {
  const p1 = document.getElementById('newPin')?.value;
  const p2 = document.getElementById('newPin2')?.value;
  if (p1.length < 4) { window.showToast?.('4 أرقام على الأقل', '#ef4444'); return; }
  if (p1 !== p2) { window.showToast?.('الرقمان غير متطابقين', '#ef4444'); return; }
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p1));
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
  localStorage.setItem('vault_pin_hash', hashHex);
  window.showToast?.('✅ تم تفعيل قفل PIN');
  window.closePinSetup?.();
};

window.removePin = () => {
  localStorage.removeItem('vault_pin_hash');
  window.showToast?.('تم إزالة القفل', '#f5a623');
  document.getElementById('securityOverlay')?.classList.remove('open');
};

window.tryBiometric = () => {
  if (!window.PublicKeyCredential) { window.showToast?.('جهازك لا يدعم البصمة', '#ef4444'); return; }
  navigator.credentials.get({
    publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname, userVerification: 'required' }
  }).then(() => {
    document.getElementById('lockScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
  }).catch((e) => { window.showToast?.('البصمة غير متاحة: ' + e.message, '#ef4444'); });
};

window.closePinSetup = () => { document.getElementById('pinSetupOverlay').style.display = 'none'; };
window.openPinSetup  = () => {
  document.getElementById('newPin').value  = '';
  document.getElementById('newPin2').value = '';
  document.getElementById('pinSetupOverlay').style.display = 'flex';
  document.getElementById('securityOverlay').classList.remove('open');
};

/* ══════════════════════════════════════════════
   مساعدات داخلية
══════════════════════════════════════════════ */
function _showEmailHint(html, color = '') {
  const hint = document.getElementById('authEmailHint');
  if (!hint) return;
  hint.innerHTML = html;
  hint.style.display = 'block';
  if (color) { hint.style.background = `rgba(59,130,246,0.12)`; hint.style.color = color; }
}

function _generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function _sendVerifyCode(email) {
  const code = _generateCode();
  _verifyCodeSent = code;
  try {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      subject:   '🔐 رمز تأكيد بريدك في خزنة المرور',
      message:   `رمز التحقق الخاص بك هو:\n\n${code}\n\nصالح لمدة 10 دقائق.`,
      to_email:  email,
      from_name: 'خزنة المرور السحابية'
    });
    return true;
  } catch(err) {
    console.error('EmailJS error:', err);
    return false;
  }
}

/* ══════════════════════════════════════════════
   إرسال رسالة للمطور — مع قالب HTML متطور
══════════════════════════════════════════════ */

/* ── بناء قالب HTML للرسالة ── */
function _buildEmailHtml({ senderName, senderEmail, senderPhoto, subject, body, timeStr }) {
  /* ── الأفاتار ──
     Google photos: نستخدم =s80 لتغيير الحجم مباشرة في الـ URL
     بدون صورة: نرسم دائرة CSS بالحرف الأول مع Inline SVG fallback
  */
  const initial   = (senderName || 'U').charAt(0).toUpperCase();
  const colors    = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899'];
  const colorCode = colors[(initial.charCodeAt(0) || 0) % colors.length];

  /* Google photo → تغيير الحجم عبر URL parameter */
  const photoUrl = senderPhoto
    ? senderPhoto.replace(/=s\d+-c/, '=s80-c').replace(/\/photo\.jpg/, '/photo.jpg?sz=80')
    : null;

  /* Inline SVG دائرة بالحرف الأول — يعمل في كل بريد */
  const svgAvatar = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
    <circle cx="28" cy="28" r="28" fill="${colorCode}"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="24" font-weight="bold" fill="white">${initial}</text>
  </svg>`;

  /* الصورة الفعلية مع SVG fallback */
  const avatarHtml56 = photoUrl
    ? `<table cellpadding="0" cellspacing="0" border="0"><tr><td>
        <img src="${photoUrl}" width="56" height="56"
             style="border-radius:28px;display:block;border:3px solid #e2e8f0;"
             alt="${senderName}">
       </td></tr></table>`
    : `<table cellpadding="0" cellspacing="0" border="0"><tr><td
         width="56" height="56"
         style="width:56px;height:56px;border-radius:28px;background:${colorCode};
                text-align:center;vertical-align:middle;line-height:56px;">
         <span style="font-family:Arial,sans-serif;font-size:24px;color:white;font-weight:bold;">${initial}</span>
       </td></tr></table>`;

  const avatarHtml40 = photoUrl
    ? `<table cellpadding="0" cellspacing="0" border="0"><tr><td>
        <img src="${photoUrl}" width="40" height="40"
             style="border-radius:20px;display:block;border:2px solid #bae6fd;"
             alt="${senderName}">
       </td></tr></table>`
    : `<table cellpadding="0" cellspacing="0" border="0"><tr><td
         width="40" height="40"
         style="width:40px;height:40px;border-radius:20px;background:${colorCode};
                text-align:center;vertical-align:middle;line-height:40px;">
         <span style="font-family:Arial,sans-serif;font-size:18px;color:white;font-weight:bold;">${initial}</span>
       </td></tr></table>`;

  const bodyHtml = (body || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/
/g,'<br>');

  /* ── HTML الرسالة الكامل (email-safe، بدون CSS خارجي) ── */
  return [
    '<!DOCTYPE html>',
    '<html dir="rtl" lang="ar">',
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">',
    '<title>رسالة جديدة</title></head>',
    '<body style="margin:0;padding:0;background-color:#f4f7fb;font-family:Arial,Helvetica,sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb;padding:30px 0;">',
    '<tr><td align="center">',
    '<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">',

    /* ═══ الهيدر ═══ */
    '<tr><td style="text-align:center;padding:0 0 24px;">',
    '<div style="font-size:44px;margin-bottom:10px;">📩</div>',
    '<h2 style="margin:0;color:#1e293b;font-size:26px;font-weight:800;font-family:Arial,sans-serif;">رسالة جديدة</h2>',
    '<p style="color:#64748b;margin:8px 0 0;font-size:14px;font-family:Arial,sans-serif;">',
    'لديك رسالة جديدة من <strong style="color:#3b82f6;">' + senderName + '</strong></p>',
    '</td></tr>',

    /* ═══ شارة الموضوع ═══ */
    '<tr><td style="padding:0 0 20px;">',
    '<div style="background:#3b82f6;border-radius:40px;padding:12px 24px;text-align:center;',
    'color:#fff;font-size:15px;font-weight:700;font-family:Arial,sans-serif;">',
    '&#128204; ' + subject + '</div>',
    '</td></tr>',

    /* ═══ بطاقة الرسالة ═══ */
    '<tr><td style="background:#ffffff;border-radius:16px;padding:24px;',
    'border:1px solid #e2e8f0;box-shadow:0 4px 14px rgba(0,0,0,0.06);">',
    '<table width="100%" cellpadding="0" cellspacing="0" border="0">',
    '<tr>',

    /* أفاتار المرسل 56px */
    '<td width="72" valign="top" style="padding-left:0;padding-bottom:0;">',
    avatarHtml56,
    '</td>',

    /* اسم + إيميل + الرسالة */
    '<td valign="top" style="padding:0 0 0 4px;">',
    '<div style="font-size:18px;font-weight:700;color:#0f172a;font-family:Arial,sans-serif;">' + senderName + '</div>',
    '<div style="font-size:13px;color:#94a3b8;margin-top:4px;font-family:Arial,sans-serif;">' + senderEmail + '</div>',
    '<div style="font-size:12px;color:#cbd5e1;margin-top:2px;font-family:Arial,sans-serif;">&#128336; ' + timeStr + '</div>',
    '<div style="margin-top:18px;font-size:15px;line-height:1.9;color:#334155;',
    'background:#f8fafc;padding:16px 18px;border-radius:12px;',
    'border-right:4px solid #3b82f6;font-family:Arial,sans-serif;">',
    bodyHtml,
    '</div>',
    '</td>',
    '</tr>',
    '</table>',
    '</td></tr>',

    /* ═══ خط فاصل ═══ */
    '<tr><td style="border-top:1px solid #e2e8f0;padding:20px 0;"></td></tr>',

    /* ═══ بطاقة معلومات المرسل ═══ */
    '<tr><td style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);',
    'border-radius:14px;padding:16px 20px;border:1px solid #bae6fd;">',
    '<div style="font-size:12px;color:#0284c7;font-weight:700;margin-bottom:12px;font-family:Arial,sans-serif;">&#128100; معلومات المرسل</div>',
    '<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>',
    '<td width="52" valign="middle">' + avatarHtml40 + '</td>',
    '<td valign="middle" style="padding-right:14px;">',
    '<div style="font-size:14px;font-weight:700;color:#0f172a;font-family:Arial,sans-serif;">' + senderName + '</div>',
    '<div style="font-size:12px;color:#0284c7;font-family:Arial,sans-serif;">' + senderEmail + '</div>',
    '</td>',
    '</tr></table>',
    '</td></tr>',

    /* ═══ الفوتر ═══ */
    '<tr><td style="text-align:center;padding:20px 0 0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">',
    '&#128272; تم الإرسال عبر <strong>خزنة المرور السحابية</strong> &middot; ' + timeStr,
    '</td></tr>',

    '</table>',  /* inner 600px table */
    '</td></tr>',
    '</table>',  /* outer full-width table */
    '</body></html>'
  ].join('\n');
}

window.openSendMessage = () => {
  document.getElementById('msgSubject').value      = '';
  document.getElementById('msgBody').value         = '';
  document.getElementById('msgStatus').textContent = '';

  /* ── ملء بيانات المرسل أوتوماتيك ── */
  const cu = auth.currentUser;
  const senderName  = cu?.displayName  || cu?.email?.split('@')[0] || 'زائر';
  const senderEmail = cu?.email        || 'غير مسجل';
  const senderPhoto = cu?.photoURL     || null;

  const nameEl  = document.getElementById('msgSenderName');
  const emailEl = document.getElementById('msgSenderEmail');
  const avatarEl= document.getElementById('msgSenderAvatar');

  if (nameEl)  nameEl.textContent  = senderName;
  if (emailEl) emailEl.textContent = senderEmail;

  if (avatarEl) {
    if (senderPhoto) {
      avatarEl.innerHTML = `<img src="${senderPhoto}"
        style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"
        onerror="this.parentElement.innerHTML='<span style=font-size:20px;color:#fff;font-weight:900;>${senderName.charAt(0).toUpperCase()}</span>'"
        alt="${senderName}">`;
      avatarEl.style.padding = '0';
    } else {
      avatarEl.innerHTML = `<span style="font-size:20px;color:#fff;font-weight:900;">${senderName.charAt(0).toUpperCase()}</span>`;
    }
  }

  document.getElementById('sendMessageOverlay').classList.add('open');
};

window.closeSendMessage = () => {
  document.getElementById('sendMessageOverlay').classList.remove('open');
};

window.sendMessageToEmail = async () => {
  const subject  = document.getElementById('msgSubject').value.trim();
  const body     = document.getElementById('msgBody').value.trim();
  const statusEl = document.getElementById('msgStatus');
  if (!subject) { window.showToast?.('موضوع الرسالة مطلوب', '#ef4444'); return; }
  if (!body)    { window.showToast?.('نص الرسالة مطلوب', '#ef4444'); return; }

  /* ── بيانات المرسل من Firebase ── */
  const currentUser = auth.currentUser;
  const senderName  = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'زائر';
  const senderEmail = currentUser?.email       || 'غير مسجل';
  const senderPhoto = currentUser?.photoURL    || null;
  const timeStr     = new Date().toLocaleString('ar-SA', {
    weekday:'long', year:'numeric', month:'long',
    day:'numeric', hour:'2-digit', minute:'2-digit'
  });

  /* ── Fallback: mailto بدون EmailJS ── */
  if (EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
    const mailto = `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent('📩 ' + subject)}&body=${encodeURIComponent('من: ' + senderName + ' (' + senderEmail + ')\n\n' + body)}`;
    window.open(mailto, '_blank');
    window.showToast?.('✅ تم فتح تطبيق البريد');
    window.closeSendMessage();
    return;
  }

  const btn = document.getElementById('btnSendMsg');
  btn.disabled    = true;
  btn.innerHTML   = '⏳ جاري الإرسال...';
  statusEl.textContent = '';

  /* ── بناء قالب HTML الكامل ── */
  const htmlMessage = _buildEmailHtml({ senderName, senderEmail, senderPhoto, subject, body, timeStr });

  /* ══════════════════════════════════════════════
     إرسال عبر EmailJS REST API مباشرة
     (يدعم HTML حقيقي في الرسالة)
  ══════════════════════════════════════════════ */
  try {
    const payload = {
      service_id:  EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id:     EMAILJS_PUBLIC_KEY,
      template_params: {
        /* ─ متغيرات القالب في EmailJS ─ */
        subject:      '📩 رسالة جديدة: ' + subject,
        name:         senderName,
        from_name:    senderName,
        from_email:   senderEmail,
        to_email:     OWNER_EMAIL,
        time:         timeStr,
        /* message = الـ HTML كامل — يجب أن يكون في القالب كـ {{{message}}} (ثلاثة أقواس) */
        message:      htmlMessage,
        /* نص بديل للعملاء التي لا تدعم HTML */
        message_text: 'من: ' + senderName + ' (' + senderEmail + ')\n\n' + body + '\n\n' + timeStr,
        /* صورة المرسل كـ URL مباشر */
        sender_photo: senderPhoto || '',
        sender_name:  senderName,
        sender_email: senderEmail,
        reply_to:     senderEmail,
      }
    };

    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    if (res.ok || res.status === 200) {
      statusEl.style.color = '#10b981';
      statusEl.innerHTML   = '✅ تم إرسال الرسالة بنجاح!';
      window.showToast?.('✅ تم إرسال الرسالة');
      setTimeout(() => window.closeSendMessage(), 1800);
    } else {
      const errText = await res.text().catch(() => 'خطأ غير معروف');
      throw new Error(errText);
    }

  } catch(err) {
    /* ── Fallback: جرب emailjs.send() العادي ── */
    console.warn('REST API failed, trying emailjs.send():', err.message);
    try {
      emailjs.init(EMAILJS_PUBLIC_KEY);
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        subject:      '📩 رسالة جديدة: ' + subject,
        name:         senderName,
        from_name:    senderName,
        from_email:   senderEmail,
        to_email:     OWNER_EMAIL,
        time:         timeStr,
        message:      htmlMessage,
        message_text: body,
        sender_photo: senderPhoto || '',
        reply_to:     senderEmail,
      });
      statusEl.style.color = '#10b981';
      statusEl.innerHTML   = '✅ تم إرسال الرسالة بنجاح!';
      window.showToast?.('✅ تم إرسال الرسالة');
      setTimeout(() => window.closeSendMessage(), 1800);
    } catch(err2) {
      statusEl.style.color = '#ef4444';
      statusEl.innerHTML   = '❌ فشل الإرسال — تحقق من إعدادات EmailJS';
      window.showToast?.('فشل الإرسال', '#ef4444');
      console.error('EmailJS final error:', err2);
    }
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> إرسال الرسالة';
  }
};
