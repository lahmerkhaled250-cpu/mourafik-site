/* المرافق التربوي الرقمي — script.js */

// ---------- Firebase init ----------
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// نبني بريدًا داخليًا من رقم الهاتف لأن Firebase Auth يحتاج بريدًا لتسجيل الدخول بكلمة عبور
function phoneToInternalEmail(phone) {
  return `${phone.trim()}@mourafik-tarbawi.local`;
}

// ---------- التنقل بين الأقسام ----------
const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.tab-panel');

function goToTab(tabName) {
  navItems.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
  panels.forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
  if (tabName === 'news') loadNews();
}

navItems.forEach(btn => btn.addEventListener('click', () => goToTab(btn.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => goToTab(btn.dataset.goto));
});

// ---------- إنشاء حساب ----------
const signupForm = document.getElementById('signupForm');
const signupMsg = document.getElementById('signupMsg');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  signupMsg.textContent = '';
  signupMsg.className = 'form-msg';

  const data = new FormData(signupForm);
  const civilStatus = data.get('civilStatus');
  const fullName = data.get('fullName').trim();
  const school = data.get('school').trim();
  const phone = data.get('phone').trim();
  const email = data.get('email').trim();
  const password = data.get('password');

  if (!/^[0-9]{8}$/.test(phone)) {
    signupMsg.textContent = 'رقم الهاتف يجب أن يتكون من 8 أرقام.';
    signupMsg.classList.add('err');
    return;
  }

  const internalEmail = phoneToInternalEmail(phone);

  try {
    const cred = await auth.createUserWithEmailAndPassword(internalEmail, password);
    await cred.user.updateProfile({ displayName: fullName });

    await db.collection('teachers').doc(cred.user.uid).set({
      civilStatus, fullName, school, phone,
      email: email || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    signupMsg.textContent = 'تم إنشاء الحساب بنجاح. يمكنك الآن الدخول.';
    signupMsg.classList.add('ok');
    signupForm.reset();
    setTimeout(() => goToTab('login'), 1200);
  } catch (err) {
    signupMsg.textContent = translateAuthError(err.code) || err.message;
    signupMsg.classList.add('err');
  }
});

// ---------- تسجيل الدخول ----------
const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMsg');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMsg.textContent = '';
  loginMsg.className = 'form-msg';

  const data = new FormData(loginForm);
  const fullName = data.get('fullName').trim();
  const password = data.get('password');

  try {
    // نبحث عن المعلم بالاسم الكامل لنجيب رقم هاتفه ثم نبني منه البريد الداخلي
    const snap = await db.collection('teachers').where('fullName', '==', fullName).limit(1).get();
    if (snap.empty) {
      loginMsg.textContent = 'لم يتم العثور على حساب بهذا الاسم.';
      loginMsg.classList.add('err');
      return;
    }
    const phone = snap.docs[0].data().phone;
    const internalEmail = phoneToInternalEmail(phone);
    await auth.signInWithEmailAndPassword(internalEmail, password);
    loginMsg.textContent = 'تم الدخول بنجاح.';
    loginMsg.classList.add('ok');
    setTimeout(() => goToTab('home'), 800);
  } catch (err) {
    loginMsg.textContent = translateAuthError(err.code) || err.message;
    loginMsg.classList.add('err');
  }
});

// ---------- حالة الدخول / الخروج ----------
const userGreeting = document.getElementById('userGreeting');
const logoutBtn = document.getElementById('logoutBtn');
const showAddNewsBtn = document.getElementById('showAddNews');

let isAdmin = false;

auth.onAuthStateChanged(async (user) => {
  if (user) {
    userGreeting.textContent = `مرحبًا، ${user.displayName || 'معلم'}`;
    userGreeting.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');

    const adminDoc = await db.collection('admins').doc(user.uid).get();
    isAdmin = adminDoc.exists;
    showAddNewsBtn.classList.toggle('hidden', !isAdmin);
  } else {
    userGreeting.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    showAddNewsBtn.classList.add('hidden');
    isAdmin = false;
  }
});

logoutBtn.addEventListener('click', () => auth.signOut());

// ---------- مستجدات تربوية ----------
const newsList = document.getElementById('newsList');
const addNewsCard = document.getElementById('addNewsCard');
const newsForm = document.getElementById('newsForm');
const newsMsg = document.getElementById('newsMsg');

showAddNewsBtn.addEventListener('click', () => addNewsCard.classList.toggle('hidden'));
document.getElementById('cancelNews').addEventListener('click', () => addNewsCard.classList.add('hidden'));

let newsLoaded = false;

async function loadNews() {
  if (newsLoaded) return;
  newsLoaded = true;
  try {
    const snap = await db.collection('news').orderBy('createdAt', 'desc').limit(30).get();
    if (snap.empty) {
      newsList.innerHTML = '<li class="news-empty">لا توجد مستجدات بعد.</li>';
      return;
    }
    newsList.innerHTML = '';
    snap.forEach(doc => {
      const n = doc.data();
      const date = n.createdAt ? n.createdAt.toDate().toLocaleDateString('ar-TN') : '';
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="news-item">
          <h3>${escapeHtml(n.title)}</h3>
          <time>${date}</time>
          <p>${escapeHtml(n.body)}</p>
        </div>`;
      newsList.appendChild(li);
    });
  } catch (err) {
    newsList.innerHTML = '<li class="news-empty">تعذّر تحميل المستجدات حاليًا.</li>';
  }
}

newsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isAdmin) return;
  newsMsg.textContent = '';
  newsMsg.className = 'form-msg';

  const data = new FormData(newsForm);
  try {
    await db.collection('news').add({
      title: data.get('title').trim(),
      body: data.get('body').trim(),
      authorId: auth.currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    newsForm.reset();
    addNewsCard.classList.add('hidden');
    newsLoaded = false;
    loadNews();
  } catch (err) {
    newsMsg.textContent = 'تعذّر نشر المستجد. حاول مجددًا.';
    newsMsg.classList.add('err');
  }
});

// ---------- اتصل بنا ----------
const contactForm = document.getElementById('contactForm');
const contactMsg = document.getElementById('contactMsg');
const CONTACT_EMAIL = 'eduspace.tn1968@gmail.com';

// إذا فعّلت EmailJS، عوّض هذه القيم بمعرفاتك من لوحة تحكم EmailJS
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';

contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  contactMsg.textContent = '';
  contactMsg.className = 'form-msg';

  const data = new FormData(contactForm);
  const name = data.get('name').trim();
  const email = data.get('email').trim();
  const message = data.get('message').trim();

  const useEmailJs = EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY' && window.emailjs;

  if (useEmailJs) {
    try {
      emailjs.init(EMAILJS_PUBLIC_KEY);
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        from_name: name, from_email: email, message, to_email: CONTACT_EMAIL
      });
      contactMsg.textContent = 'تم إرسال رسالتك بنجاح.';
      contactMsg.classList.add('ok');
      contactForm.reset();
      return;
    } catch (err) {
      // فشل الإرسال عبر EmailJS: ننتقل للبديل mailto أدناه
    }
  }

  // بديل مؤقت: يفتح تطبيق البريد على الهاتف مع رسالة معبأة مسبقًا
  const subject = encodeURIComponent(`رسالة من ${name} — المرافق التربوي الرقمي`);
  const body = encodeURIComponent(`${message}\n\nمن: ${name}\nالبريد: ${email}`);
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  contactMsg.textContent = 'سيفتح تطبيق البريد لإرسال رسالتك.';
  contactMsg.classList.add('ok');
});

// ---------- أدوات مساعدة ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function translateAuthError(code) {
  const map = {
    'auth/email-already-in-use': 'هذا الرقم مسجّل بالفعل، جرّب تسجيل الدخول.',
    'auth/weak-password': 'كلمة العبور ضعيفة جدًا (6 خانات على الأقل).',
    'auth/wrong-password': 'كلمة العبور غير صحيحة.',
    'auth/user-not-found': 'لا يوجد حساب بهذه المعلومات.',
    'auth/invalid-email': 'معلومات الدخول غير صالحة.',
    'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقًا.'
  };
  return map[code];
}
