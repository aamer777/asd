// ╔══════════════════════════════════════════════╗
// ║  app.js — خزنة المرور السحابية v3.0          ║
// ║  كود نظيف · بدون أخطاء · يعمل على كل جهاز   ║
// ╚══════════════════════════════════════════════╝

import { auth, db } from "./firebase.js";
import {
  GoogleAuthProvider, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot,
  setDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ── ثوابت ──
const CLOUDINARY_CLOUD  = "dwbhzpobd";
const CLOUDINARY_PRESET = "vault_upload";
const EMAILJS_KEY       = "AAqRxMl4frLp82l-7";
const EMAILJS_SVC       = "service_jmk7uc5";
const EMAILJS_TPL       = "template_5qrk29k";
const OWNER_EMAIL       = "aamer777@gmail.com";
const APP_URL           = "https://aamer777.github.io/asd/";

// ── حالة التطبيق ──
let user        = null;
let entries     = [];
let unsub       = null;
let isDemo      = false;
let activeCat   = "all";
let editId      = null;
let colorIdx    = 0;
let imgBase64   = null;
let imgType     = null;
let uploading   = false;
let cropImg, cropCanvas, cropBox, cropScale = 1;
let cropBx = 0, cropBy = 0, cropBw = 0, cropBh = 0;
let cropFile    = null;
let deferredPWA = null;

// ────────────────────────────────────────────────
// 🛠️ مساعدات
// ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

function toast(msg, color="#10b981") {
  const t = $("toast");
  t.textContent = msg;
  t.style.background = color;
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 3000);
}
window.showToast = toast;

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function show(id)  { const el=$(id); if(el) el.style.display="block"; }
function hide(id)  { const el=$(id); if(el) el.style.display="none"; }
function flex(id)  { const el=$(id); if(el) el.style.display="flex"; }

// ────────────────────────────────────────────────
// 🔐 تسجيل الدخول بـ Google (redirect — يعمل على كل جهاز)
// ────────────────────────────────────────────────
let loginBusy = false;
window.loginWithGoogle = async () => {
  if (loginBusy) return;
  loginBusy = true;
  const btn = document.querySelector(".btn-google");
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> جاري التوجيه...`; }
  try {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    await signInWithRedirect(auth, p);
  } catch(e) {
    toast("فشل: " + e.message, "#ef4444");
    loginBusy = false;
    if (btn) { btn.disabled = false; btn.innerHTML = btnGoogleHTML(); }
  }
};

function btnGoogleHTML() {
  return `<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#fff" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#fff" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#fff" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#fff" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> تسجيل الدخول بـ Google`;
}

// معالجة نتيجة الـ redirect
getRedirectResult(auth).then(r => {
  if (r?.user) console.log("✅ Google login:", r.user.email);
}).catch(e => {
  const skip = ["auth/no-current-user","auth/null-user","auth/missing-initial-state","auth/cancelled-popup-request"];
  if (!skip.includes(e.code)) toast("خطأ في تسجيل الدخول: " + e.message, "#ef4444");
});

// ────────────────────────────────────────────────
// 🎮 الوضع التجريبي
// ────────────────────────────────────────────────
const DEMO_DATA = [
  { id:"d1", name:"Gmail", email:"demo@gmail.com", pass:"Demo@2025!", type:"account", category:"work", color:0, note:"حساب تجريبي", url:"https://gmail.com", createdAt:Date.now()-86400000 },
  { id:"d2", name:"Netflix", email:"demo@netflix.com", pass:"Stream#99", type:"account", category:"entertainment", color:4, note:"", url:"", createdAt:Date.now()-3600000 },
  { id:"d3", name:"صورة جميلة", type:"image", imageUrl:"https://picsum.photos/id/1015/400/300", note:"منظر طبيعي", category:"photos", createdAt:Date.now() }
];

window.startDemo = () => {
  isDemo = true; user = null;
  entries = [...DEMO_DATA];
  hide("loginScreen");
  show("appScreen");
  flex("demoBar");
  $("syncStatus").textContent = "🎮 تجريبي";
  renderAll();
};

window.exitDemo = () => {
  isDemo = false; entries = [];
  hide("appScreen");
  flex("loginScreen");
  hide("demoBar");
};

window.logoutUser = async () => {
  if (unsub) unsub();
  if (isDemo) { window.exitDemo(); return; }
  await signOut(auth).catch(()=>{});
  window.location.reload();
};

// ────────────────────────────────────────────────
// 👂 مراقبة حالة الدخول
// ────────────────────────────────────────────────
onAuthStateChanged(auth, u => {
  if (u && !isDemo) {
    user = u;
    hide("loginScreen");
    if (localStorage.getItem("vault_pin_hash")) {
      flex("lockScreen");
      hide("appScreen");
    } else {
      show("appScreen");
    }
    $("syncStatus").textContent = "☁️ متصل";
    updateAvatar();
    const q = query(collection(db,"users",u.uid,"entries"), orderBy("createdAt","desc"));
    unsub = onSnapshot(q,
      snap => { entries = snap.docs.map(d=>({id:d.id,...d.data()})); renderCards(); },
      e    => { console.error(e); toast("خطأ في المزامنة","#ef4444"); }
    );
    renderAll();
  } else if (!isDemo) {
    user = null;
    flex("loginScreen");
    hide("appScreen");
  }
});

// ────────────────────────────────────────────────
// 🎨 عرض الأفاتار
// ────────────────────────────────────────────────
function updateAvatar() {
  const els = [document.getElementById("menuAvatar"), document.getElementById("sidebarAvatar")];
  const nameEl  = $("sidebarUserName");
  const emailEl = $("sidebarEmail");

  if (user && !isDemo) {
    const letter = (user.displayName?.[0] || user.email?.[0] || "U").toUpperCase();
    const html   = user.photoURL
      ? `<img src="${user.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : `<span style="font-size:22px;font-weight:900;">${letter}</span>`;
    els.forEach(el => { if(el) el.innerHTML = html; });
    if (nameEl)  nameEl.textContent  = user.displayName || user.email?.split("@")[0] || "مستخدم";
    if (emailEl) emailEl.textContent = user.email || "";
  } else if (isDemo) {
    els.forEach(el => { if(el) el.innerHTML = "🎮"; });
    if (nameEl)  nameEl.textContent  = "الوضع التجريبي";
    if (emailEl) emailEl.textContent = "demo@example.com";
  } else {
    els.forEach(el => { if(el) el.innerHTML = "<span>👤</span>"; });
    if (nameEl)  nameEl.textContent  = "زائر";
    if (emailEl) emailEl.textContent = "";
  }
}

// ────────────────────────────────────────────────
// 🃏 عرض البطاقات
// ────────────────────────────────────────────────
const COLORS = [
  {bg:"#1e3a5f",tx:"#60a5fa",ac:"#3b82f6"},
  {bg:"#1a3a2a",tx:"#34d399",ac:"#10b981"},
  {bg:"#3a1a1a",tx:"#f87171",ac:"#ef4444"},
  {bg:"#3a2a1a",tx:"#fbbf24",ac:"#f59e0b"},
  {bg:"#2a1a3a",tx:"#a78bfa",ac:"#8b5cf6"},
  {bg:"#3a2010",tx:"#fb923c",ac:"#f97316"},
  {bg:"#3a1a2a",tx:"#f472b6",ac:"#ec4899"},
  {bg:"#0f2a3a",tx:"#22d3ee",ac:"#06b6d4"},
  {bg:"#0f2a1a",tx:"#4ade80",ac:"#22c55e"},
  {bg:"#2a2a0f",tx:"#facc15",ac:"#eab308"}
];

const CAT_LABELS = {
  work:"💼 عمل", personal:"👤 شخصي", banking:"🏦 بنوك",
  entertainment:"🎬 ترفيه", websites:"🌐 مواقع", other:"📁 أخرى",
  photos:"🖼️ صور"
};

function renderCards() {
  const q = ($("searchInput")?.value || "").toLowerCase();
  const list = entries.filter(e =>
    (activeCat === "all" || e.category === activeCat) &&
    ((e.name||"").toLowerCase().includes(q) || (e.note||"").toLowerCase().includes(q))
  );

  $("totalCount").textContent = entries.length;
  const cont = $("cardsList");
  if (!cont) return;

  if (!list.length) {
    cont.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔒</div>
      <div>لا توجد عناصر</div>
      <small>اضغط ＋ للإضافة</small>
    </div>`;
    return;
  }

  cont.innerHTML = list.map((e,i) => {
    const delay = `style="animation-delay:${i*0.06}s"`;
    if (e.type === "image") return cardImage(e, delay);
    return cardAccount(e, delay);
  }).join("");
}

function cardImage(e, delay) {
  const date = e.createdAt ? new Date(e.createdAt).toLocaleDateString("ar-SA",{year:"numeric",month:"short",day:"numeric"}) : "";
  return `<div class="card card-anim" id="card-${e.id}" ${delay} onclick="window.toggleCard('${e.id}')">
    <div class="card-hdr">
      <div class="card-title">
        <div class="card-icon" style="padding:0;overflow:hidden;">
          <img src="${esc(e.imageUrl)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
        </div>
        <div>
          <div class="card-name">${esc(e.name)}</div>
          <div class="card-meta">📷 صورة${date?" · "+date:""}</div>
        </div>
      </div>
    </div>
    <div class="card-body">
      ${e.note?`<div class="field"><span>📝 ${esc(e.note)}</span></div>`:""}
      <div style="border-radius:14px;overflow:hidden;margin:8px 0;max-height:240px;">
        <img src="${esc(e.imageUrl)}" style="width:100%;object-fit:contain;max-height:240px;display:block;" loading="lazy">
      </div>
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="act-btn act-red"   onclick="window.deleteEntry('${e.id}')">🗑️ حذف</button>
        <button class="act-btn act-blue"  onclick="window.shareEntry('${e.id}')">↗️ مشاركة</button>
        <button class="act-btn act-green" onclick="window.downloadImage('${e.id}')">⬇️ تحميل</button>
        <button class="act-btn act-gray"  onclick="window.openEditImage('${e.id}')">✏️ تعديل</button>
      </div>
    </div>
  </div>`;
}

function cardAccount(e, delay) {
  const c    = COLORS[(e.color||0) % COLORS.length];
  const date = e.createdAt ? new Date(e.createdAt).toLocaleDateString("ar-SA",{year:"numeric",month:"short",day:"numeric"}) : "";
  const icon = e.imageUrl
    ? `<div class="card-icon" style="padding:0;"><img src="${esc(e.imageUrl)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"></div>`
    : e.icon
    ? `<div class="card-icon" style="background:${c.bg};font-size:28px;display:flex;align-items:center;justify-content:center;">${e.icon}</div>`
    : `<div class="card-icon" style="background:${c.bg};color:${c.tx};font-weight:900;font-size:17px;">${esc(e.name.substring(0,2)).toUpperCase()}</div>`;
  const cat  = CAT_LABELS[e.category] || "📁 أخرى";
  const pass = esc(e.pass||"");
  const mail = esc(e.email||"");

  return `<div class="card card-anim" id="card-${e.id}" ${delay}
    onclick="window.toggleCard('${e.id}')"
    style="border-right:4px solid ${c.ac};">
    <div class="card-hdr">
      <div class="card-title">
        ${icon}
        <div>
          <div class="card-name">${esc(e.name)}</div>
          <div class="card-meta">${cat}${date?" · "+date:""}</div>
          ${e.note?`<div class="card-meta" style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📝 ${esc(e.note)}</div>`:""}
        </div>
      </div>
    </div>
    <div class="card-body">
      <div class="field">
        <span>📧 ${mail}</span>
        <button class="btn-sm copy-btn" onclick="event.stopPropagation();window.copyText('${mail}','الإيميل')">📋 نسخ</button>
      </div>
      <div class="field">
        <span>🔑 ${pass}</span>
        <button class="btn-sm copy-btn" onclick="event.stopPropagation();window.copyText('${pass}','كلمة المرور')">📋 نسخ</button>
      </div>
      ${e.url?`<div class="field"><span>🔗 <a href="${esc(e.url)}" target="_blank" style="color:var(--blue);">${esc(e.url)}</a></span></div>`:""}
      <div class="card-actions" onclick="event.stopPropagation()">
        <button class="act-btn act-red"  onclick="window.deleteEntry('${e.id}')">🗑️ حذف</button>
        <button class="act-btn act-blue" onclick="window.shareEntry('${e.id}')">↗️ مشاركة</button>
        <button class="act-btn act-gray" onclick="window.openEdit('${e.id}')">✏️ تعديل</button>
      </div>
    </div>
  </div>`;
}

window.toggleCard = id => $(`card-${id}`)?.classList.toggle("expanded");

function renderAll() { renderCards(); renderCategoryFilters(); updateAvatar(); }

// ────────────────────────────────────────────────
// 📋 نسخ
// ────────────────────────────────────────────────
window.copyText = (text, label) => {
  const ok = () => toast("✅ تم نسخ " + label);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok).catch(()=>fallbackCopy(text,ok));
  else fallbackCopy(text, ok);
};
function fallbackCopy(text, cb) {
  const t = document.createElement("textarea");
  t.value = text; t.style.cssText = "position:fixed;opacity:0;";
  document.body.appendChild(t); t.focus(); t.select();
  try { document.execCommand("copy"); cb(); } catch(_) {}
  document.body.removeChild(t);
}

// ────────────────────────────────────────────────
// 💾 حفظ حساب
// ────────────────────────────────────────────────
window.saveAccountEntry = async () => {
  const name = $("fName").value.trim();
  const pass = $("fPass").value.trim();
  if (!name) { toast("اسم الحساب مطلوب","#ef4444"); return; }
  if (!pass) { toast("كلمة المرور مطلوبة","#ef4444"); return; }

  const data = {
    name, pass,
    email:    $("fEmail").value,
    url:      $("fUrl").value,
    note:     $("fNote").value,
    category: $("fCategory").value || "websites",
    color:    colorIdx,
    icon:     window._selIcon || null,
    type:     "account"
  };

  try {
    const id = editId || Date.now().toString();
    if (isDemo) {
      if (editId) entries = entries.map(e=>e.id===editId?{...e,...data}:e);
      else entries.unshift({id,...data,createdAt:Date.now()});
      renderCards(); toast(editId?"✅ تم التعديل":"✅ تمت الإضافة");
    } else {
      const ref = doc(db,"users",user.uid,"entries",id);
      await setDoc(ref, editId
        ? {...entries.find(e=>e.id===editId)||{}, ...data, updatedAt:Date.now()}
        : {id,...data,createdAt:Date.now()}
      );
      toast(editId?"✅ تم التعديل":"✅ تم الحفظ");
    }
    closeModal("overlayAccount");
  } catch(e) { toast("خطأ: "+e.message,"#ef4444"); }
};

// ────────────────────────────────────────────────
// 🖼️ حفظ صورة
// ────────────────────────────────────────────────
window.saveImageEntry = async () => {
  const name = $("imgName").value.trim();
  if (!name) { toast("عنوان الصورة مطلوب","#ef4444"); return; }
  if (uploading) { toast("جارٍ الرفع...","#f5a623"); return; }

  let url = null;
  if (editId && !imgBase64) { const old=entries.find(e=>e.id===editId); url=old?.imageUrl; }

  if (imgBase64) {
    if (!isDemo && !user) { toast("يجب تسجيل الدخول لرفع صور","#ef4444"); return; }
    uploading = true;
    const btn = $("btnSaveImage");
    if (btn) { btn.disabled=true; btn.textContent="⏳ جارٍ الرفع..."; }
    try {
      const id = editId || Date.now().toString();
      url = await uploadToCloudinary(user?.uid, id, imgBase64);
    } catch(_) {
      uploading = false;
      const btn=$("btnSaveImage"); if(btn){btn.disabled=false;btn.textContent="💾 حفظ";}
      return;
    }
    uploading = false;
    const b=$("btnSaveImage"); if(b){b.disabled=false;b.textContent="💾 حفظ";}
  }

  if (!url) { toast("اختر صورة أولاً","#ef4444"); return; }

  const data = { name, type:"image", imageUrl:url, note:$("imgNote").value, category:"photos" };
  const id = editId || Date.now().toString();

  try {
    if (isDemo) {
      if (editId) entries=entries.map(e=>e.id===editId?{...e,...data}:e);
      else entries.unshift({id,...data,createdAt:Date.now()});
      renderCards(); toast("✅ تمت الإضافة");
    } else {
      await setDoc(doc(db,"users",user.uid,"entries",id),
        editId?{...entries.find(e=>e.id===editId)||{},...data,updatedAt:Date.now()}:{id,...data,createdAt:Date.now()});
      toast("✅ تم الحفظ");
    }
    closeModal("overlayImage"); imgBase64=null; imgType=null;
  } catch(e) { toast("خطأ: "+e.message,"#ef4444"); }
};

// ────────────────────────────────────────────────
// ☁️ رفع Cloudinary
// ────────────────────────────────────────────────
async function uploadToCloudinary(uid, entryId, base64) {
  const bar = $("uploadBar"); const pct=$("uploadPct");
  if(bar) bar.style.display="block";

  const fd = new FormData();
  fd.append("file",           base64);
  fd.append("upload_preset",  CLOUDINARY_PRESET);
  fd.append("folder",         `vault/${uid||"demo"}`);
  fd.append("public_id",      entryId);

  return new Promise((res, rej) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && pct) pct.textContent = Math.round(e.loaded/e.total*100)+"%";
    };
    xhr.onload = () => {
      if(bar) bar.style.display="none";
      if (xhr.status===200) {
        const r = JSON.parse(xhr.responseText);
        res(r.secure_url);
      } else {
        let msg="فشل الرفع";
        try{msg=JSON.parse(xhr.responseText).error?.message||msg;}catch(_){}
        toast("⛔ "+msg,"#ef4444"); rej(new Error(msg));
      }
    };
    xhr.onerror = () => { if(bar)bar.style.display="none"; toast("⛔ خطأ في الاتصال","#ef4444"); rej(new Error("network")); };
    xhr.timeout = 120000;
    xhr.ontimeout = () => { if(bar)bar.style.display="none"; toast("⛔ انتهت المهلة","#ef4444"); rej(new Error("timeout")); };
    xhr.open("POST",`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,true);
    xhr.send(fd);
  });
}

// ────────────────────────────────────────────────
// 🗑️ حذف
// ────────────────────────────────────────────────
window.deleteEntry = async id => {
  const e = entries.find(x=>x.id===id);
  if (!confirm(`حذف "${e?.name||"هذا العنصر"}"؟ لا يمكن التراجع.`)) return;
  if (isDemo) { entries=entries.filter(x=>x.id!==id); renderCards(); toast("تم الحذف","#ef4444"); return; }
  try { await deleteDoc(doc(db,"users",user.uid,"entries",id)); toast("تم الحذف","#ef4444"); }
  catch(e) { toast("خطأ في الحذف","#ef4444"); }
};

// ────────────────────────────────────────────────
// ↗️ مشاركة + تحميل
// ────────────────────────────────────────────────
window.shareEntry = id => {
  const e = entries.find(x=>x.id===id);
  if (!e) return;
  const txt = e.type==="image"
    ? `🖼️ ${e.name}\n${e.imageUrl}`
    : `🔐 ${e.name}\n📧 ${e.email||""}\n🔑 ${e.pass||""}${e.url?"\n🔗 "+e.url:""}`;
  if (navigator.share) navigator.share({title:e.name,text:txt}).catch(()=>{});
  else { navigator.clipboard?.writeText(txt)||fallbackCopy(txt,()=>{}); toast("📋 تم نسخ البيانات"); }
};

window.downloadImage = async id => {
  const e = entries.find(x=>x.id===id);
  if (!e?.imageUrl) return;
  try {
    const r = await fetch(e.imageUrl);
    const b = await r.blob();
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href=u; a.download=(e.name||"image").replace(/[^a-zA-Z0-9\u0600-\u06FF]/g,"_")+".jpg";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(u); toast("✅ تم التحميل");
  } catch { window.open(e.imageUrl,"_blank"); }
};

// ────────────────────────────────────────────────
// ✏️ تعديل
// ────────────────────────────────────────────────
window.openEdit = id => {
  const e = entries.find(x=>x.id===id);
  if (!e || e.type==="image") return;
  editId = id;
  $("fName").value     = e.name;
  $("fEmail").value    = e.email||"";
  $("fPass").value     = e.pass||"";
  $("fUrl").value      = e.url||"";
  $("fNote").value     = e.note||"";
  $("fCategory").value = e.category||"websites";
  $("modalTitleAccount").textContent = "✏️ تعديل الحساب";
  openModal("overlayAccount");
};

window.openEditImage = id => {
  const e = entries.find(x=>x.id===id);
  if (!e || e.type!=="image") return;
  editId=id; imgBase64=null;
  $("imgName").value = e.name; $("imgNote").value = e.note||"";
  $("imgPreviewWrap").style.display="block";
  $("imgPreviewEl").src = e.imageUrl;
  $("modalTitleImage").textContent = "✏️ تعديل الصورة";
  openModal("overlayImage");
};

// ────────────────────────────────────────────────
// ➕ فتح مودالات الإضافة
// ────────────────────────────────────────────────
window.showAddChoice = () => openModal("choiceOverlay");
window.closeChoice   = () => closeModal("choiceOverlay");

window.openAddAccount = () => {
  window.closeChoice(); editId=null; window._selIcon=null; colorIdx=0;
  ["fName","fEmail","fPass","fUrl","fNote"].forEach(id=>$(id).value="");
  $("fCategory").value="websites";
  $("modalTitleAccount").textContent="➕ إضافة كلمة مرور";
  document.querySelectorAll(".cat-chip").forEach(c=>c.classList.remove("active"));
  document.querySelector('.cat-chip[data-cat="websites"]')?.classList.add("active");
  document.querySelectorAll(".color-dot").forEach((d,i)=>d.classList.toggle("selected",i===0));
  openModal("overlayAccount");
};

window.openAddImage = () => {
  window.closeChoice(); editId=null; imgBase64=null; imgType=null;
  ["imgName","imgNote"].forEach(id=>$(id).value="");
  $("imgPreviewWrap").style.display="none";
  $("imgPreviewEl").src="";
  $("imgFileInput").value="";
  $("uploadBar").style.display="none";
  $("modalTitleImage").textContent="🖼️ إضافة صورة";
  openModal("overlayImage");
  initDropzone();
};

function openModal(id)  { const el=$(id); if(el){el.classList.add("open");el.style.display="flex";} }
function closeModal(id) { const el=$(id); if(el){el.classList.remove("open");el.style.display="";} editId=null; }
window.closeModalAccount = () => closeModal("overlayAccount");
window.closeModalImage   = () => { closeModal("overlayImage"); imgBase64=null; imgType=null; };

// ────────────────────────────────────────────────
// 🖼️ Dropzone + اقتصاص
// ────────────────────────────────────────────────
function initDropzone() {
  const dz = $("imgDropZone");
  const fi = $("imgFileInput");
  if (!dz||dz._init) return;
  dz._init = true;
  dz.addEventListener("click",  e=>{e.preventDefault();fi.value="";fi.click();});
  dz.addEventListener("dragover",e=>{e.preventDefault();dz.classList.add("dz-over");});
  dz.addEventListener("dragleave",()=>dz.classList.remove("dz-over"));
  dz.addEventListener("drop",   e=>{e.preventDefault();dz.classList.remove("dz-over");handleFile(e.dataTransfer?.files?.[0]);});
  fi.addEventListener("change", e=>handleFile(e.target.files?.[0]));
}

function handleFile(f) {
  if (!f) return;
  if (!f.type.startsWith("image/")) { toast("اختر ملف صورة صالح","#ef4444"); return; }
  if (f.size > 20*1024*1024) { toast("الصورة أكبر من 20MB","#ef4444"); return; }
  openCrop(f);
}

function openCrop(f) {
  cropFile = f;
  const reader = new FileReader();
  reader.onload = ev => {
    $("cropOverlay").style.display = "flex";
    const cont = $("cropContainer");
    cropCanvas = $("cropCanvas");
    cropBox    = $("cropBox");
    cropImg    = new Image();
    cropImg.onload = () => {
      const cw=cont.offsetWidth, ch=cont.offsetHeight;
      cropScale = Math.min(cw/cropImg.width, ch/cropImg.height);
      const dw=cropImg.width*cropScale, dh=cropImg.height*cropScale;
      cropCanvas.width=dw; cropCanvas.height=dh;
      cropCanvas.getContext("2d").drawImage(cropImg,0,0,dw,dh);
      cropCanvas.style.left=((cw-dw)/2)+"px"; cropCanvas.style.top=((ch-dh)/2)+"px";
      const ix=parseFloat(cropCanvas.style.left), iy=parseFloat(cropCanvas.style.top);
      cropBw=dw*0.8; cropBh=dh*0.8; cropBx=ix+dw*0.1; cropBy=iy+dh*0.1;
      updCrop(); initCropDrag();
    };
    cropImg.src = ev.target.result;
  };
  reader.readAsDataURL(f);
}

function updCrop() {
  cropBox.style.left=cropBx+"px"; cropBox.style.top=cropBy+"px";
  cropBox.style.width=cropBw+"px"; cropBox.style.height=cropBh+"px";
}

function initCropDrag() {
  let drag=false, sx=0, sy=0;
  const dn=(ex,ey)=>{drag=true;sx=ex-cropBx;sy=ey-cropBy;};
  const mv=(ex,ey)=>{
    if(!drag) return;
    const ix=parseFloat(cropCanvas.style.left), iy=parseFloat(cropCanvas.style.top);
    cropBx=Math.min(Math.max(0,ex-sx), ix+cropCanvas.width-cropBw);
    cropBy=Math.min(Math.max(0,ey-sy), iy+cropCanvas.height-cropBh);
    updCrop();
  };
  const up=()=>{drag=false;};
  cropBox.addEventListener("mousedown",  e=>{e.preventDefault();dn(e.clientX,e.clientY);});
  document.addEventListener("mousemove", e=>mv(e.clientX,e.clientY));
  document.addEventListener("mouseup",   up);
  cropBox.addEventListener("touchstart", e=>{e.preventDefault();const t=e.touches[0];dn(t.clientX,t.clientY);},{passive:false});
  document.addEventListener("touchmove", e=>{const t=e.touches[0];mv(t.clientX,t.clientY);},{passive:true});
  document.addEventListener("touchend",  up);
}

window.cancelCrop = () => { $("cropOverlay").style.display="none"; cropFile=null; };
window.applyCrop  = () => {
  const ix=parseFloat(cropCanvas.style.left), iy=parseFloat(cropCanvas.style.top);
  const out=document.createElement("canvas");
  out.width=Math.round(cropBw/cropScale); out.height=Math.round(cropBh/cropScale);
  out.getContext("2d").drawImage(cropImg,(cropBx-ix)/cropScale,(cropBy-iy)/cropScale,out.width,out.height,0,0,out.width,out.height);
  imgBase64 = out.toDataURL(cropFile?.type||"image/jpeg",0.92);
  imgType   = cropFile?.type||"image/jpeg";
  $("imgPreviewEl").src = imgBase64;
  $("imgPreviewWrap").style.display="block";
  toast("✅ تم الاقتصاص","#10b981");
  $("cropOverlay").style.display="none"; cropFile=null;
};

// ────────────────────────────────────────────────
// 🎨 مساعدات المودال
// ────────────────────────────────────────────────
window.selectCatChip = (el, cat) => {
  document.querySelectorAll(".cat-chip").forEach(c=>c.classList.remove("active"));
  el.classList.add("active");
  $("fCategory").value = cat;
};

window.selectColor = (idx, el) => {
  document.querySelectorAll(".color-dot").forEach(d=>d.classList.remove("selected"));
  el.classList.add("selected");
  colorIdx = idx;
};

window.generatePassword = () => {
  const chars="ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  const arr = crypto.getRandomValues(new Uint8Array(16));
  $("fPass").value = Array.from(arr).map(b=>chars[b%chars.length]).join("");
  $("fPass").type = "text";
  updateStrength();
};

window.togglePassVis = () => {
  const i=$("fPass"); if(i) i.type=i.type==="password"?"text":"password";
};

window.updateStrength = () => {
  const v=$("fPass")?.value||"";
  let s=0;
  if(v.length>=8)s++; if(v.length>=12)s++;
  if(/[A-Z]/.test(v)&&/[a-z]/.test(v))s++;
  if(/[0-9]/.test(v)&&/[^A-Za-z0-9]/.test(v))s++;
  const cols=["#ef4444","#f97316","#eab308","#10b981"];
  const lbls=["ضعيفة","متوسطة","جيدة","قوية جداً"];
  for(let i=1;i<=4;i++){const b=$("sb"+i);if(b)b.style.background=i<=s?(cols[s-1]||"var(--border2)"):"var(--border2)";}
  const lbl=$("strengthLabel"); if(lbl) lbl.textContent=v.length?"قوة: "+(lbls[s-1]||"ضعيفة"):"";
};
document.addEventListener("input",e=>{if(e.target?.id==="fPass")window.updateStrength();});

const ICONS = ["🔐","🌐","📱","✉️","🏦","🎮","🛒","📸","💼","🎬","🏠","🚗","☁️","🔑","💳","📚","🔒","📧","🖥️","📡"];
window.pickIcon = () => {
  let p=$("iconPickerPop");
  if(p){p.remove();return;}
  p=document.createElement("div"); p.id="iconPickerPop";
  p.style.cssText="position:fixed;inset:0;z-index:9200;display:flex;align-items:flex-end;background:rgba(0,0,0,0.6);";
  p.innerHTML=`<div style="background:var(--card);border-radius:24px 24px 0 0;padding:20px;width:100%;max-width:480px;margin:auto;">
    <div style="font-weight:900;text-align:center;margin-bottom:14px;">اختر أيقونة</div>
    <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:10px;margin-bottom:14px;">
      ${ICONS.map(e=>`<button onclick="window.setIcon('${e}')" style="font-size:26px;background:var(--card2);border:none;border-radius:12px;padding:8px;cursor:pointer;">${e}</button>`).join("")}
    </div>
    <button onclick="document.getElementById('iconPickerPop').remove()" style="width:100%;padding:12px;background:var(--card2);border-radius:40px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;color:var(--muted2);">إلغاء</button>
  </div>`;
  document.body.appendChild(p);
  p.addEventListener("click",e=>{if(e.target===p)p.remove();});
};
window.setIcon = em => {
  window._selIcon=em;
  const el=$("iconEmoji"); if(el)el.textContent=em;
  $("iconPickerPop")?.remove();
};

// ────────────────────────────────────────────────
// 📂 فلاتر التصنيف
// ────────────────────────────────────────────────
function renderCategoryFilters() {
  const cats=[
    {id:"all",l:"🌐 الكل"},{id:"websites",l:"🔗 مواقع"},{id:"work",l:"💼 عمل"},
    {id:"personal",l:"👤 شخصي"},{id:"banking",l:"🏦 بنوك"},
    {id:"entertainment",l:"🎬 ترفيه"},{id:"other",l:"📁 أخرى"},{id:"photos",l:"🖼️ صور"}
  ];
  const bar=$("categoryBar");
  if(bar) bar.innerHTML=cats.map(c=>
    `<button class="cat-btn${activeCat===c.id?" active":""}" onclick="window.setCategory('${c.id}')">${c.l}</button>`
  ).join("");
}
window.setCategory = c => { activeCat=c; renderCategoryFilters(); renderCards(); };
$("searchInput")?.addEventListener("input", renderCards);

// ────────────────────────────────────────────────
// 🔒 PIN
// ────────────────────────────────────────────────
window.checkPin = async () => {
  const pin=$("pinInput").value;
  if(!pin){toast("أدخل الرقم السري","#ef4444");return;}
  const h=await sha256(pin);
  if(h===localStorage.getItem("vault_pin_hash")){
    hide("lockScreen"); show("appScreen");
  } else {
    toast("رقم سري خاطئ ❌","#ef4444");
    $("pinInput").value="";
  }
};
window.setupPin = async () => {
  const p1=$("newPin").value, p2=$("newPin2").value;
  if(p1.length<4){toast("4 أرقام على الأقل","#ef4444");return;}
  if(p1!==p2){toast("الرقمان غير متطابقين","#ef4444");return;}
  localStorage.setItem("vault_pin_hash", await sha256(p1));
  toast("✅ تم تفعيل قفل PIN");
  closeModal("pinSetupOverlay");
};
window.removePin = () => {
  localStorage.removeItem("vault_pin_hash");
  toast("تم إزالة القفل","#f5a623");
  closeModal("securityOverlay");
};
window.openPinSetup  = () => {$("newPin").value="";$("newPin2").value="";openModal("pinSetupOverlay");closeModal("securityOverlay");};
window.closePinSetup = () => closeModal("pinSetupOverlay");

// ────────────────────────────────────────────────
// 🎨 المظهر
// ────────────────────────────────────────────────
window.toggleTheme = () => {
  const th=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme",th);
  localStorage.setItem("vault_theme",th);
  $("themeBtn").textContent=th==="dark"?"🌙":"☀️";
};
const savedTheme = localStorage.getItem("vault_theme")||"light";
document.documentElement.setAttribute("data-theme",savedTheme);
if($("themeBtn")) $("themeBtn").textContent=savedTheme==="dark"?"🌙":"☀️";

// ────────────────────────────────────────────────
// 📤 الشريط الجانبي
// ────────────────────────────────────────────────
window.openSidebar  = () => { updateAvatar(); $("sidebarOverlay").classList.add("open"); $("sidebarPanel").classList.add("open"); };
window.closeSidebar = () => { $("sidebarOverlay").classList.remove("open"); $("sidebarPanel").classList.remove("open"); };

// ────────────────────────────────────────────────
// ✉️ إرسال رسالة
// ────────────────────────────────────────────────
window.openSendMessage  = () => { ["msgSubject","msgBody"].forEach(id=>$(id).value=""); $("msgStatus").textContent=""; openModal("sendMessageOverlay"); };
window.closeSendMessage = () => closeModal("sendMessageOverlay");
window.sendMessageToEmail = async () => {
  const sub=$("msgSubject").value.trim(), body=$("msgBody").value.trim();
  if(!sub){toast("الموضوع مطلوب","#ef4444");return;}
  if(!body){toast("نص الرسالة مطلوب","#ef4444");return;}
  const sName=user?.displayName||user?.email?.split("@")[0]||"زائر";
  const sEmail=user?.email||"";
  const sPhoto=user?.photoURL?.replace(/=s\d+(-c)?$/,"=s96-c")||"";
  const sTime=new Date().toLocaleString("ar-SA",{weekday:"long",year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"});
  const btn=$("btnSendMsg"); btn.disabled=true; btn.textContent="⏳ جاري الإرسال...";
  try {
    emailjs.init(EMAILJS_KEY);
    await emailjs.send(EMAILJS_SVC,EMAILJS_TPL,{name:sName,from_name:sName,from_email:sEmail,reply_to:sEmail,to_email:OWNER_EMAIL,subject:sub,time:sTime,sender_photo:sPhoto,message:body.replace(/\n/g,"<br>")});
    $("msgStatus").style.color="var(--green)"; $("msgStatus").textContent="✅ تم الإرسال!";
    toast("✅ تم إرسال الرسالة");
    setTimeout(()=>window.closeSendMessage(),1500);
  } catch(e) {
    $("msgStatus").style.color="var(--red)"; $("msgStatus").textContent="❌ فشل الإرسال";
    toast("فشل الإرسال","#ef4444");
  } finally { btn.disabled=false; btn.textContent="📨 إرسال"; }
};

// ────────────────────────────────────────────────
// 📤 مشاركة التطبيق
// ────────────────────────────────────────────────
window.openShareApp  = () => { openModal("shareAppOverlay"); };
window.closeShareApp = () => closeModal("shareAppOverlay");
window.shareAppLink  = type => {
  const sName=user?.displayName||user?.email?.split("@")[0]||(isDemo?"تجريبي":"مستخدم");
  const msg=`🔐 خزنة المرور السحابية\nتطبيق مجاني لحفظ كلمات المرور مع مزامنة سحابية.\n\n🌐 ${APP_URL}\n\n📤 أرسلها: ${sName}`;
  if(type==="wa")  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,"_blank");
  if(type==="tg")  window.open(`https://t.me/share/url?url=${encodeURIComponent(APP_URL)}&text=${encodeURIComponent(msg)}`,"_blank");
  if(type==="em")  window.open(`mailto:?subject=خزنة المرور&body=${encodeURIComponent(msg)}`,"_blank");
  if(type==="cp")  { navigator.clipboard?.writeText(APP_URL)||fallbackCopy(APP_URL,()=>{}); toast("✅ تم نسخ الرابط"); }
  if(type!=="cp")  window.closeShareApp();
};

// ────────────────────────────────────────────────
// 📲 PWA
// ────────────────────────────────────────────────
window.addEventListener("beforeinstallprompt", e => {
  if(window.matchMedia("(display-mode:standalone)").matches){e.preventDefault();return;}
  deferredPWA = e;
  setTimeout(()=>{
    const bar=$("pwaInstallBar");
    if(bar&&!window._pwaDismissed){bar.style.transform="translateY(0)";bar.style.opacity="1";bar.style.pointerEvents="auto";}
  },3000);
});
window.addEventListener("appinstalled",()=>{
  const bar=$("pwaInstallBar"); if(bar)bar.style.transform="translateY(100%)";
  toast("✅ تم تثبيت التطبيق!");
});
window.triggerInstallPrompt = async () => {
  if(window.matchMedia("(display-mode:standalone)").matches){toast("✅ التطبيق مثبت بالفعل!","#10b981");return;}
  if(deferredPWA){
    const bar=$("pwaInstallBar"); if(bar)bar.style.transform="translateY(100%)";
    deferredPWA.prompt();
    const{outcome}=await deferredPWA.userChoice;
    if(outcome==="accepted")toast("✅ تم الإضافة للشاشة الرئيسية");
    deferredPWA=null;
  } else { openModal("iosInstallOverlay"); }
};
window.dismissInstallBar = () => {
  window._pwaDismissed=true;
  const bar=$("pwaInstallBar"); if(bar){bar.style.transform="translateY(100%)";bar.style.opacity="0";bar.style.pointerEvents="none";}
};
window.installPWA    = () => { window.closeSidebar(); window.triggerInstallPrompt(); };
window.showInstallTab = tab => {
  ["Android","Ios"].forEach(t=>{
    $("installSteps"+t).style.display=tab==="android"&&t==="Android"||tab==="ios"&&t==="Ios"?"block":"none";
    $("installTab"+t).style.background=tab==="android"&&t==="Android"||tab==="ios"&&t==="Ios"?"var(--accent)":"transparent";
    $("installTab"+t).style.color=tab==="android"&&t==="Android"||tab==="ios"&&t==="Ios"?"#0a0e1a":"var(--muted2)";
  });
};

// ────────────────────────────────────────────────
// 🚀 تهيئة
// ────────────────────────────────────────────────
renderCategoryFilters();

// SW
if("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(r=>{
    console.log("✅ SW:",r.scope);
    r.addEventListener("updatefound",()=>{
      const sw=r.installing;
      sw?.addEventListener("statechange",()=>{
        if(sw.state==="installed"&&navigator.serviceWorker.controller) sw.postMessage("SKIP_WAITING");
      });
    });
    setInterval(()=>r.update(),60000);
  }).catch(e=>console.warn("SW:",e));
  let ref=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!ref){ref=true;location.reload();}});
}
