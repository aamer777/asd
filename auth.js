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
   إرسال رسالة للمطور
══════════════════════════════════════════════ */
window.openSendMessage = () => {
  document.getElementById('msgSubject').value  = '';
  document.getElementById('msgBody').value     = '';
  document.getElementById('msgStatus').textContent = '';
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

  if (EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
    const mailto = `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, '_blank');
    window.showToast?.('✅ تم فتح تطبيق البريد');
    window.closeSendMessage();
    return;
  }

  const btn = document.getElementById('btnSendMsg');
  btn.disabled = true; btn.textContent = '⏳ جاري الإرسال...';
  statusEl.textContent = '';

  try {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    const currentUser = auth.currentUser;
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      subject,
      message:   body,
      to_email:  OWNER_EMAIL,
      from_name: currentUser?.displayName || currentUser?.email || 'زائر'
    });
    statusEl.style.color   = 'var(--green)';
    statusEl.textContent   = '✅ تم إرسال الرسالة بنجاح!';
    window.showToast?.('✅ تم إرسال الرسالة');
    setTimeout(() => window.closeSendMessage(), 1500);
  } catch(err) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = '❌ فشل الإرسال — تحقق من إعدادات EmailJS';
    window.showToast?.('فشل الإرسال', '#ef4444');
  } finally {
    btn.disabled = false; btn.textContent = '📨 إرسال';
  }
};