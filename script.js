import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

// --- ⚙️ 설정 ---
const firebaseConfig = {
  apiKey: 'AIzaSyDfwvasngxsyUNvoF_xDH1RnfTcx73JFsU',
  authDomain: 'pastly-9eb9d.firebaseapp.com',
  projectId: 'pastly-9eb9d',
  storageBucket: 'pastly-9eb9d.firebasestorage.app',
  messagingSenderId: '487960509557',
  appId: '1:487960509557:web:1fb9c90a5a8f89df9ecc3c',
};

function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /(FBAN|FBAV|Instagram|Line\/|KAKAOTALK|KakaoTalk|NAVER|DaumApps)/i.test(
    ua,
  );
}

/** iPhone·iPad·iPod Safari/Chrome(동일 WebKit). 데스크톱 모드 iPad는 MacIntel+터치로 판별 */
function isIOSWebKit() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

const app = initializeApp(firebaseConfig);

let auth;
try {
  if (isIOSWebKit()) {
    auth = initializeAuth(app, {
      persistence: [browserLocalPersistence, indexedDBLocalPersistence],
    });
  } else {
    auth = getAuth(app);
  }
} catch (e) {
  console.warn('initializeAuth 실패, getAuth 사용:', e);
  auth = getAuth(app);
}

const db = getFirestore(app);
const provider = new GoogleAuthProvider();

/**
 * iOS: 팝업·다른 탭 혼선 방지 → 전체 페이지 리다이렉트만 사용.
 * Android: 리다이렉트 우선.
 * PC: 팝업 우선.
 */
function preferAuthRedirect() {
  const ua = navigator.userAgent || '';
  if (isIOSWebKit()) return true;
  if (/Android/i.test(ua)) return true;
  return false;
}

/** iOS WebKit은 리졸버와 함께 쓰면 새 탭으로 열리는 경우가 있어 2인자 호출 */
function signInRedirectForPlatform() {
  if (isIOSWebKit()) {
    return signInWithRedirect(auth, provider);
  }
  return signInWithRedirect(auth, provider, browserPopupRedirectResolver);
}

function showAuthHint(message) {
  const el = document.getElementById('auth-browser-hint');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

// --- 🧊 전역 변수 ---
let allQuestions = [];
let quizData = [];
let currentIndex = 0;
let correctAnswersCount = 0;
let timerInterval;
let timeLeft = 60;
let subjectStats = {};
let currentUser = null;
const STORAGE_KEY = 'wrong_answers_ids';

if (isInAppBrowser()) {
  showAuthHint(
    '카카오톡·인스타 등 앱 안 브라우저에서는 Google 로그인이 동작하지 않는 경우가 많습니다. 메뉴(⋮)에서 "Chrome으로 열기" 또는 "Safari에서 열기"를 선택한 뒤 다시 시도해 주세요.',
  );
}

async function initAuthUi() {
  try {
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
  } catch (_) {
    /* no-op */
  }
  try {
    await getRedirectResult(auth);
  } catch (error) {
    console.warn('getRedirectResult:', error?.code, error?.message);
    const code = error?.code || '';
    if (code === 'auth/unauthorized-domain') {
      showAuthHint(
        '이 사이트 도메인이 Firebase 인증에 등록되어 있지 않습니다. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인을 확인해 주세요.',
      );
    } else if (
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/web-storage-unsupported'
    ) {
      showAuthHint(
        '이 브라우저 환경에서는 로그인 저장소를 사용할 수 없습니다. Chrome 또는 Safari에서 페이지를 열어 주세요.',
      );
    }
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      document.getElementById('login-unit').classList.add('hidden');
      document.getElementById('user-unit').classList.remove('hidden');
      document.getElementById('user-name').innerText = user.displayName;
      document.getElementById('user-photo').src = user.photoURL;

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) updateUserUI(userDoc.data());
      } catch (err) {
        console.warn('Firestore 사용자 문서 로드 실패(로그인은 유지):', err);
      }
    } else {
      currentUser = null;
      document.getElementById('login-unit').classList.remove('hidden');
      document.getElementById('user-unit').classList.add('hidden');
    }
  });
}

initAuthUi();

// 로그인 버튼 (모바일·iOS: 리다이렉트만 / PC: 팝업)
const loginBtn = document.getElementById('btn-login');
if (loginBtn) {
  loginBtn.onclick = async () => {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    try {
      if (preferAuthRedirect()) {
        try {
          await signInRedirectForPlatform();
        } catch (redirectErr) {
          const rc = redirectErr?.code || '';
          console.warn('signInWithRedirect 실패:', rc, redirectErr);
          if (rc === 'auth/unauthorized-domain') {
            showAuthHint(
              '이 사이트 도메인이 Firebase 인증에 등록되어 있지 않습니다. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인을 확인해 주세요.',
            );
            return;
          }
          if (
            rc === 'auth/web-storage-unsupported' ||
            rc === 'auth/operation-not-supported-in-this-environment'
          ) {
            showAuthHint(
              '이 브라우저에서 로그인 저장을 사용할 수 없습니다. 시크릿 모드를 끄거나, 일반 Chrome/Safari에서 다시 시도해 주세요.',
            );
            return;
          }
          if (isAndroid) {
            await signInWithPopup(
              auth,
              provider,
              browserPopupRedirectResolver,
            );
            return;
          }
          if (isIOSWebKit()) {
            showAuthHint(
              'Google 페이지로 이동하지 못했습니다. 설정 → Safari → 고급에서 「모든 쿠키 차단」이 꺼져 있는지 확인한 뒤, 이 사이트의 저장 공간을 지우지 않았는지 확인해 주세요.',
            );
            return;
          }
          showAuthHint(
            'Google 로그인 이동에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도하거나, 잠시 후 시도해 주세요.',
          );
        }
      } else {
        await signInWithPopup(
          auth,
          provider,
          browserPopupRedirectResolver,
        );
      }
    } catch (e) {
      console.error('Login 시도 중 에러:', e);
      const code = e.code || '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user'
      ) {
        try {
          await signInRedirectForPlatform();
        } catch (e2) {
          console.error(e2);
          showAuthHint(
            '팝업이 차단되었고 리다이렉트 로그인도 시작되지 않았습니다. 팝업을 허용하거나 주소창에 사이트 주소를 직접 입력해 접속해 주세요.',
          );
        }
      } else if (code === 'auth/unauthorized-domain') {
        showAuthHint(
          'Firebase에 이 사이트 도메인이 등록되어 있는지 확인해 주세요.',
        );
      } else if (isIOSWebKit()) {
        showAuthHint(
          '아이폰에서 로그인이 끝나도 계정이 안 보이면, 설정 → Safari → 고급 → 「모든 쿠키 차단」이 켜져 있지 않은지, 「교차 사이트 추적 방지」를 잠시 끄고 다시 시도해 보세요. iOS Chrome도 Safari와 동일한 웹 엔진을 씁니다.',
        );
      } else {
        showAuthHint(
          '로그인을 완료할 수 없습니다. 네트워크를 확인하거나 잠시 후 다시 시도해 주세요.',
        );
      }
    }
  };
}

// 로그아웃
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
  logoutBtn.onclick = () => signOut(auth);
}

// --- 📊 사용자 UI & 리더보드 ---
function updateUserUI(data) {
  const total = data.totalCorrect || 0;
  const level = Math.floor(total / 50) + 1;
  const titles = ['인턴', '주니어', '디자이너', '마스터', '조형의 신'];
  const title = titles[Math.min(level - 1, 4)];
  document.getElementById('user-level').innerText = `LV.${level} ${title}`;
}

const q = query(
  collection(db, 'rankings'),
  orderBy('highScore', 'desc'),
  limit(5),
);
onSnapshot(q, (snapshot) => {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '';
  snapshot.forEach((doc) => {
    const d = doc.data();
    list.innerHTML += `
        <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
            <div class="flex items-center gap-3">
                <img src="${d.photo}" class="w-8 h-8 rounded-full border border-indigo-200">
                <span class="font-bold text-sm">${d.name}</span>
            </div>
            <span class="text-indigo-600 font-black">${d.highScore}점</span>
        </div>`;
  });
});

// --- 🎮 퀴즈 로직 ---
async function startApp(mode) {
  try {
    const response = await fetch('./data/graphics.json');
    const data = await response.json();
    allQuestions = Array.isArray(data) ? data : data.questions || [];

    if (mode === 'random') {
      quizData = shuffleArray([...allQuestions]).slice(0, 60);
    } else if (mode === 'wrong') {
      const wrongIds = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      quizData = allQuestions.filter((q) => wrongIds.includes(q.id));
      if (quizData.length === 0) return alert('오답이 없습니다!');
      shuffleArray(quizData);
    }

    currentIndex = 0;
    correctAnswersCount = 0;
    subjectStats = {};
    quizData.forEach((q) => {
      if (!subjectStats[q.category])
        subjectStats[q.category] = { total: 0, correct: 0 };
      subjectStats[q.category].total++;
    });

    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('quiz-container').classList.remove('hidden');
    renderQuestion();
  } catch (e) {
    alert('데이터 로드 실패!');
  }
}

function renderQuestion() {
  const q = quizData[currentIndex];
  const optionsList = document.getElementById('options-list');
  document.getElementById('feedback').classList.add('hidden');
  optionsList.innerHTML = '';

  document.getElementById('current-pos').innerText = currentIndex + 1;
  document.getElementById('total-pos').innerText = quizData.length;
  document.getElementById('progress-bar').style.width =
    `${(currentIndex / quizData.length) * 100}%`;
  document.getElementById('category-badge').innerText = q.category;
  document.getElementById('question-text').innerText = q.question_text;

  const fig = document.getElementById('question-figure');
  const img = document.getElementById('question-image');
  if (q.image || q.image_url) {
    img.src = q.image || q.image_url;
    fig.classList.remove('hidden');
  } else {
    fig.classList.add('hidden');
  }

  q.options.forEach((text, idx) => {
    const btn = document.createElement('button');
    btn.className =
      'option-btn w-full text-left p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-500 transition-all flex items-start gap-4 group';
    btn.innerHTML = `<span class="flex-none w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-sm font-bold flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white">${idx + 1}</span>
                     <span class="text-slate-700 dark:text-slate-300 font-bold">${text}</span>`;
    btn.onclick = () => checkAnswer(idx);
    optionsList.appendChild(btn);
  });
  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  timeLeft = 60;
  const display = document.getElementById('timer-display');
  display.innerText = timeLeft;
  timerInterval = setInterval(() => {
    timeLeft--;
    display.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      checkAnswer(-1);
    }
  }, 1000);
}

function checkAnswer(selectedIdx) {
  clearInterval(timerInterval);
  const q = quizData[currentIndex];
  const isCorrect = selectedIdx === q.answer_index;
  const btns = document.querySelectorAll('.option-btn');
  btns.forEach((b) => (b.disabled = true));

  if (isCorrect) {
    correctAnswersCount++;
    subjectStats[q.category].correct++;
    let ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(ids.filter((id) => id !== q.id)),
    );
  } else {
    let ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    if (!ids.includes(q.id)) {
      ids.push(q.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
  }

  const feedbackDiv = document.getElementById('feedback');
  const card = feedbackDiv.querySelector('div');
  card.className = `p-6 rounded-3xl text-white shadow-2xl ${isCorrect ? 'bg-emerald-600' : 'bg-rose-600'}`;
  document.getElementById('explanation-text').innerText = q.explanation;
  feedbackDiv.classList.remove('hidden');
}

function showResult() {
  const score = Math.round((correctAnswersCount / quizData.length) * 100);
  document.getElementById('result-modal').classList.remove('hidden');
  document.getElementById('final-score').innerText = score;
  saveScoreToFirebase(score);
}

async function saveScoreToFirebase(score) {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  const rankRef = doc(db, 'rankings', currentUser.uid);
  const userDoc = await getDoc(userRef);
  const prevData = userDoc.exists() ? userDoc.data() : { totalCorrect: 0 };
  await setDoc(
    userRef,
    {
      name: currentUser.displayName,
      totalCorrect: (prevData.totalCorrect || 0) + correctAnswersCount,
    },
    { merge: true },
  );
  const rankDoc = await getDoc(rankRef);
  if (!rankDoc.exists() || score > rankDoc.data().highScore) {
    await setDoc(rankRef, {
      name: currentUser.displayName,
      photo: currentUser.photoURL,
      highScore: score,
      updatedAt: new Date(),
    });
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 이벤트 리스너
document.getElementById('start-random-btn').onclick = () => startApp('random');
document.getElementById('start-wrong-btn').onclick = () => startApp('wrong');
document.getElementById('next-btn').onclick = () => {
  currentIndex++;
  if (currentIndex < quizData.length) renderQuestion();
  else showResult();
};

// 테마 토글
document.getElementById('theme-toggle').onclick = () => {
  const isD = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isD ? 'dark' : 'light');
};

// 오답 개수 표시
const wrids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
if (wrids.length > 0 && document.getElementById('wrong-count-text')) {
  document.getElementById('wrong-count-text').innerText =
    `현재 ${wrids.length}개의 오답이 있습니다.`;
}
