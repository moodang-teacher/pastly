import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
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
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// --- ⚙️ 설정 ---
const firebaseConfig = {
  apiKey: 'AIzaSyDfwvasngxsyUNvoF_xDH1RnfTcx73JFsU',
  authDomain: 'pastly-9eb9d.firebaseapp.com',
  projectId: 'pastly-9eb9d',
  storageBucket: 'pastly-9eb9d.firebasestorage.app',
  messagingSenderId: '487960509557',
  appId: '1:487960509557:web:1fb9c90a5a8f89df9ecc3c',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

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

// --- 🔑 [핵심] 모바일 리다이렉트 결과 수신 로직 ---
// 이 부분이 onAuthStateChanged 보다 위에 있어야 모바일에서 정상 작동합니다.
getRedirectResult(auth)
  .then((result) => {
    if (result && result.user) {
      console.log('모바일 로그인 성공:', result.user.displayName);
      // 리다이렉트 성공 직후의 로직이 필요하다면 여기에 작성
    }
  })
  .catch((error) => {
    console.error('리다이렉트 인증 에러:', error.code, error.message);
  });

// --- 🔑 인증 상태 감시 ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('login-unit').classList.add('hidden');
    document.getElementById('user-unit').classList.remove('hidden');
    document.getElementById('user-name').innerText = user.displayName;
    document.getElementById('user-photo').src = user.photoURL;

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) updateUserUI(userDoc.data());
  } else {
    currentUser = null;
    document.getElementById('login-unit').classList.remove('hidden');
    document.getElementById('user-unit').classList.add('hidden');
  }
});

// 로그인 버튼 (기기별 분기)
const loginBtn = document.getElementById('btn-login');
if (loginBtn) {
  loginBtn.onclick = async () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    try {
      if (isMobile) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (e) {
      console.error('Login 시도 중 에러:', e);
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
