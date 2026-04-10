import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDfwvasngxsyUNvoF_xDH1RnfTcx73JFsU",
  authDomain: "pastly-9eb9d.web.app",
  projectId: "pastly-9eb9d",
  storageBucket: "pastly-9eb9d.firebasestorage.app",
  messagingSenderId: "487960509557",
  appId: "1:487960509557:web:1fb9c90a5a8f89df9ecc3c",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allQuestions = [];
let quizData = [];
let currentIndex = 0;
let correctAnswersCount = 0;
let timerInterval;
let timeLeft = 60;
let subjectStats = {};
let currentUser = null;
const STORAGE_KEY = "wrong_answers_ids";
const DEFAULT_AVATAR =
  "https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Squid&backgroundColor=00897b,00acc1,039be5,1976d2,3949ab,43a047,7cb342,c0ca33,fdd835,ffb300,f57c00,f4511e,6d4c41,757575,546e7a&eyes=happy,hearts,robotic,wink&mouth=smile";

function initThemeIcon() {
  const isDark = document.documentElement.classList.contains("dark");
  const lightIcon = document.getElementById("theme-toggle-light-icon");
  const darkIcon = document.getElementById("theme-toggle-dark-icon");
  if (lightIcon && darkIcon) {
    lightIcon.classList.toggle("hidden", !isDark);
    darkIcon.classList.toggle("hidden", isDark);
  }
}

document.getElementById("theme-toggle").onclick = () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  initThemeIcon();
};

function updateWrongCountUI() {
  const ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  const badge = document.getElementById("wrong-count-badge");
  const wrongBtn = document.getElementById("start-wrong-btn");
  if (badge) badge.innerText = ids.length;
  if (wrongBtn) wrongBtn.style.opacity = ids.length === 0 ? "0.6" : "1";
}

document.getElementById("btn-login-submit").onclick = async () => {
  const userId = document.getElementById("login-id").value.trim();
  const userPw = document.getElementById("login-pw").value.trim();
  if (!userId || !userPw) return alert("닉네임과 비밀번호를 입력해주세요.");
  const email = `${userId}@pastly.com`;
  try {
    await signInWithEmailAndPassword(auth, email, userPw);
  } catch (error) {
    if (
      error.code === "auth/user-not-found" ||
      error.code === "auth/invalid-credential"
    ) {
      try {
        await createUserWithEmailAndPassword(auth, email, userPw);
        await setDoc(doc(db, "rankings", auth.currentUser.uid), {
          name: userId,
          photo: DEFAULT_AVATAR,
          highScore: 0,
          updatedAt: new Date(),
        });
      } catch (e) {
        alert("입력 정보를 다시 확인해주세요.");
      }
    }
  }
};

onAuthStateChanged(auth, async (user) => {
  const loginUnit = document.getElementById("login-unit");
  const userUnit = document.getElementById("user-unit");
  if (user) {
    currentUser = user;
    loginUnit.classList.add("hidden");
    userUnit.classList.remove("hidden");
    document.getElementById("user-name").innerText = user.email.split("@")[0];
    const rankDoc = await getDoc(doc(db, "rankings", user.uid));
    document.getElementById("user-photo").src =
      rankDoc.exists() && rankDoc.data().photo
        ? rankDoc.data().photo
        : DEFAULT_AVATAR;
    updateWrongCountUI();
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) updateUserLevelUI(userDoc.data());
  } else {
    currentUser = null;
    loginUnit.classList.remove("hidden");
    userUnit.classList.add("hidden");
  }
});

document.getElementById("btn-logout").onclick = () => {
  if (confirm("로그아웃 하시겠습니까?")) signOut(auth);
};

async function startApp(mode) {
  try {
    const response = await fetch("./data/graphics.json");
    const data = await response.json();
    allQuestions = data.questions;
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    if (mode === "wrong") {
      quizData = allQuestions.filter((q) => ids.includes(q.id));
      if (quizData.length === 0) return alert("오답이 없습니다!");
    } else {
      quizData = shuffleArray([...allQuestions]).slice(0, 60);
    }
    currentIndex = 0;
    correctAnswersCount = 0;
    subjectStats = {};
    quizData.forEach((q) => {
      if (!subjectStats[q.category])
        subjectStats[q.category] = { total: 0, correct: 0 };
      subjectStats[q.category].total++;
    });
    document.getElementById("main-menu").classList.add("hidden");
    document.getElementById("quiz-container").classList.remove("hidden");
    renderQuestion();
  } catch (e) {
    alert("데이터를 불러오지 못했습니다.");
  }
}

function renderQuestion() {
  const q = quizData[currentIndex];
  const optionsList = document.getElementById("options-list");
  const fb = document.getElementById("feedback");
  fb.classList.add("hidden");
  fb.classList.replace("translate-y-0", "translate-y-full");
  optionsList.innerHTML = "";
  document.getElementById("current-pos").innerText = currentIndex + 1;
  document.getElementById("total-pos").innerText = quizData.length;
  document.getElementById("progress-bar").style.width =
    `${(currentIndex / quizData.length) * 100}%`;
  document.getElementById("category-badge").innerText = q.category;
  document.getElementById("question-text").innerText = q.question_text;
  const fig = document.getElementById("question-figure");
  const src = q.image || q.image_url;
  if (src) {
    document.getElementById("question-image").src = src;
    fig.classList.remove("hidden");
  } else {
    fig.classList.add("hidden");
  }
  q.options.forEach((text, idx) => {
    const btn = document.createElement("button");
    btn.className =
      "option-btn w-full text-left p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-500 transition-all flex items-start gap-5 active:bg-slate-50 dark:active:bg-slate-900 shadow-sm";
    btn.innerHTML = `<span class="flex-none w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-sm font-black flex items-center justify-center tracking-tighter">${idx + 1}</span><span class="dark:text-slate-200 font-bold text-base leading-snug">${text}</span>`;
    btn.onclick = () => checkAnswer(idx);
    optionsList.appendChild(btn);
  });
  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  timeLeft = 60;
  document.getElementById("timer-display").innerText = timeLeft;
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById("timer-display").innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      checkAnswer(-1);
    }
  }, 1000);
}

function checkAnswer(idx) {
  clearInterval(timerInterval);
  const q = quizData[currentIndex];
  const isCorrect = idx === q.answer_index;
  const ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  if (isCorrect) {
    correctAnswersCount++;
    subjectStats[q.category].correct++;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(ids.filter((id) => id !== q.id)),
    );
  } else {
    if (!ids.includes(q.id)) {
      ids.push(q.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
  }
  updateWrongCountUI();
  const fb = document.getElementById("feedback");
  fb.classList.remove("hidden");
  setTimeout(
    () => fb.classList.replace("translate-y-full", "translate-y-0"),
    10,
  );
  fb.querySelector("div").className =
    `rounded-[3rem] p-10 text-white shadow-2xl ${isCorrect ? "bg-emerald-600" : "bg-rose-600"}`;
  document.getElementById("next-btn").className =
    `w-full py-6 bg-white font-black rounded-2xl shadow-md ${isCorrect ? "text-emerald-600" : "text-rose-600"}`;
  document.getElementById("explanation-text").innerText = isCorrect
    ? `정답입니다!\n\n${q.explanation}`
    : `정답은 ${q.answer_index + 1}번입니다.\n\n${q.explanation}`;
}

function showResult() {
  const score = Math.round((correctAnswersCount / quizData.length) * 100);
  document.getElementById("result-modal").classList.remove("hidden");
  document.getElementById("final-score").innerText = score;
  document.getElementById("result-status").innerText =
    score >= 60 ? "합격입니다!" : "불합격입니다.";

  const container = document.getElementById("subject-results");
  container.innerHTML = "";

  for (const [cat, stat] of Object.entries(subjectStats)) {
    const per = Math.round((stat.correct / stat.total) * 100);
    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="space-y-2">
        <div class="flex justify-between text-xs font-black uppercase tracking-tighter text-slate-600 dark:text-slate-400">
          <span>${cat}</span>
          <span>${per}% (${stat.correct}/${stat.total})</span>
        </div>
        <div class="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden shadow-inner">
          <div class="bg-indigo-500 h-full shadow-lg" style="width: ${per}%"></div>
        </div>
      </div>
    `,
    );
  }
  saveScoreToFirebase(score);
}

async function saveScoreToFirebase(score) {
  if (!currentUser) return;
  const name = currentUser.email.split("@")[0];
  const rankRef = doc(db, "rankings", currentUser.uid);
  const rDoc = await getDoc(rankRef);
  if (!rDoc.exists() || score > (rDoc.data().highScore || 0)) {
    await setDoc(
      rankRef,
      {
        name,
        photo:
          rDoc.exists() && rDoc.data().photo
            ? rDoc.data().photo
            : DEFAULT_AVATAR,
        highScore: score,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  }
  const userRef = doc(db, "users", currentUser.uid);
  const uDoc = await getDoc(userRef);
  await setDoc(
    userRef,
    {
      name,
      totalCorrect:
        ((uDoc.exists() ? uDoc.data().totalCorrect : 0) || 0) +
        correctAnswersCount,
    },
    { merge: true },
  );
}

function updateUserLevelUI(data) {
  const total = data.totalCorrect || 0;
  const level = Math.floor(total / 50) + 1;
  const titles = ["인턴", "주니어", "디자이너", "마스터", "조형의 신"];
  document.getElementById("user-level").innerText =
    `LV.${level} ${titles[Math.min(level - 1, 4)]}`;
}

onSnapshot(
  query(collection(db, "rankings"), orderBy("highScore", "desc"), limit(10)),
  (snap) => {
    const list = document.getElementById("leaderboard-list");
    if (!list) return;
    list.innerHTML = "";
    snap.forEach((doc) => {
      const d = doc.data();
      list.innerHTML += `<div class="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all shadow-sm">
      <div class="flex items-center gap-4">
        <img src="${d.photo || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full border border-indigo-200 object-cover bg-white shadow-sm">
        <span class="font-bold text-[15px] text-slate-800 dark:text-white">${d.name}</span>
      </div>
      <span class="text-indigo-600 dark:text-indigo-400 font-black text-base">${d.highScore}점</span>
    </div>`;
    });
  },
);

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
document.getElementById("start-random-btn").onclick = () => startApp("random");
document.getElementById("start-wrong-btn").onclick = () => startApp("wrong");
document.getElementById("next-btn").onclick = () => {
  currentIndex++;
  if (currentIndex < quizData.length) renderQuestion();
  else showResult();
};

initThemeIcon();
