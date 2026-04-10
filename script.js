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

// --- ⚙️ 설정 ---
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

// --- 🧊 전역 변수 ---
let allQuestions = [];
let quizData = [];
let currentIndex = 0;
let correctAnswersCount = 0;
let timerInterval;
let timeLeft = 60;
let subjectStats = {};
let currentUser = null;
const STORAGE_KEY = "wrong_answers_ids";

// 🦑 기본 오징어 아바타 URL
const DEFAULT_AVATAR =
  "https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Squid&backgroundColor=00897b,00acc1,039be5,1976d2,3949ab,43a047,7cb342,c0ca33,fdd835,ffb300,f57c00,f4511e,6d4c41,757575,546e7a&eyes=happy,hearts,robotic,wink&mouth=smile";

// --- 🔑 로그인 로직 (자동 가입형) ---
const loginBtn = document.getElementById("btn-login-submit");
if (loginBtn) {
  loginBtn.onclick = async () => {
    const userId = document.getElementById("login-id").value.trim();
    const userPw = document.getElementById("login-pw").value.trim();

    if (!userId || !userPw) return alert("아이디와 비밀번호를 입력해주세요.");
    if (userPw.length < 6) return alert("비밀번호는 최소 6자리여야 합니다.");

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
          // 가입 시 기본 오징어 정보 저장
          await setDoc(doc(db, "rankings", auth.currentUser.uid), {
            name: userId,
            photo: DEFAULT_AVATAR,
            highScore: 0,
            updatedAt: new Date(),
          });
          alert(`반갑습니다! ${userId}님으로 등록되었습니다.`);
        } catch (e) {
          alert("로그인 실패: 이미 사용 중인 아이디거나 비번이 틀렸습니다.");
        }
      } else {
        alert("인증 오류가 발생했습니다.");
      }
    }
  };
}

// --- 📷 이미지 자동 압축 및 DB 저장 (Storage 안 씀) ---
const avatarInput = document.getElementById("avatar-input");
if (avatarInput) {
  avatarInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = async () => {
        // 128px 크기로 강제 축소 (Canvas)
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = 128;
        canvas.height = 128;

        const scale = Math.max(
          canvas.width / img.width,
          canvas.height / img.height,
        );
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // 텍스트(Base64)로 변환
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);

        try {
          document.getElementById("user-photo").src = compressedDataUrl;
          await setDoc(
            doc(db, "rankings", currentUser.uid),
            {
              photo: compressedDataUrl,
              updatedAt: new Date(),
            },
            { merge: true },
          );
          alert("프로필 사진이 저장되었습니다! 🦑");
        } catch (err) {
          console.error(err);
          alert("사진 저장 실패!");
        }
      };
    };
  });
}

// --- 🔑 인증 상태 감시 ---
onAuthStateChanged(auth, async (user) => {
  const loginUnit = document.getElementById("login-unit");
  const userUnit = document.getElementById("user-unit");

  if (user) {
    currentUser = user;
    const displayName = user.email.split("@")[0];
    if (loginUnit) loginUnit.classList.add("hidden");
    if (userUnit) {
      userUnit.classList.remove("hidden");
      document.getElementById("user-name").innerText = displayName;

      const rankDoc = await getDoc(doc(db, "rankings", user.uid));
      document.getElementById("user-photo").src =
        rankDoc.exists() && rankDoc.data().photo
          ? rankDoc.data().photo
          : DEFAULT_AVATAR;
    }
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) updateUserLevelUI(userDoc.data());
  } else {
    currentUser = null;
    if (loginUnit) loginUnit.classList.remove("hidden");
    if (userUnit) userUnit.classList.add("hidden");
  }
});

// 로그아웃
const logoutBtn = document.getElementById("btn-logout");
if (logoutBtn)
  logoutBtn.onclick = () => {
    if (confirm("로그아웃 하시겠습니까?")) signOut(auth);
  };

// --- 📊 데이터 저장 ---
async function saveScoreToFirebase(score) {
  if (!currentUser) return;
  const userId = currentUser.email.split("@")[0];
  const userRef = doc(db, "users", currentUser.uid);
  const rankRef = doc(db, "rankings", currentUser.uid);

  try {
    const userDoc = await getDoc(userRef);
    const prevData = userDoc.exists() ? userDoc.data() : { totalCorrect: 0 };
    await setDoc(
      userRef,
      {
        name: userId,
        totalCorrect: (prevData.totalCorrect || 0) + correctAnswersCount,
      },
      { merge: true },
    );

    const rankDoc = await getDoc(rankRef);
    if (!rankDoc.exists() || score > (rankDoc.data().highScore || 0)) {
      await setDoc(
        rankRef,
        {
          name: userId,
          photo:
            rankDoc.exists() && rankDoc.data().photo
              ? rankDoc.data().photo
              : DEFAULT_AVATAR,
          highScore: score,
          updatedAt: new Date(),
        },
        { merge: true },
      );
    }
  } catch (e) {
    console.error(e);
  }
}

// --- 🎨 테마 및 퀴즈 로직 (기존 유지) ---
const themeToggleBtn = document.getElementById("theme-toggle");
function initThemeIcon() {
  const isDark = document.documentElement.classList.contains("dark");
  const lightIcon = document.getElementById("theme-toggle-light-icon");
  const darkIcon = document.getElementById("theme-toggle-dark-icon");
  if (lightIcon) lightIcon.classList.toggle("hidden", !isDark);
  if (darkIcon) darkIcon.classList.toggle("hidden", isDark);
}
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    initThemeIcon();
  });
}

async function startApp(mode) {
  try {
    const response = await fetch("./data/graphics.json");
    const data = await response.json();
    allQuestions = data.questions;
    document.getElementById("exam-title").innerText = data.subject_name;

    if (mode === "random")
      quizData = shuffleArray([...allQuestions]).slice(0, 60);
    else if (mode === "wrong") {
      const ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      quizData = allQuestions.filter((q) => ids.includes(q.id));
      if (quizData.length === 0) return alert("오답이 없습니다!");
      shuffleArray(quizData);
    }

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
    alert("데이터 로드 실패!");
  }
}

function renderQuestion() {
  const q = quizData[currentIndex];
  const optionsList = document.getElementById("options-list");
  document.getElementById("feedback").classList.add("hidden");
  optionsList.innerHTML = "";

  document.getElementById("current-pos").innerText = currentIndex + 1;
  document.getElementById("total-pos").innerText = quizData.length;
  document.getElementById("progress-bar").style.width =
    `${(currentIndex / quizData.length) * 100}%`;
  document.getElementById("category-badge").innerText = q.category;
  document.getElementById("question-text").innerText = q.question_text;

  const fig = document.getElementById("question-figure");
  const img = document.getElementById("question-image");
  const src = q.image || q.image_url;
  if (src) {
    img.src = src;
    img.onload = () => fig.classList.remove("hidden");
    img.onerror = () => fig.classList.add("hidden");
  } else {
    fig.classList.add("hidden");
  }

  q.options.forEach((text, idx) => {
    const btn = document.createElement("button");
    btn.className =
      "option-btn w-full text-left p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all flex items-start gap-3 group";
    btn.innerHTML = `<span class="flex-none w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-sm font-bold flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">${idx + 1}</span>
                     <span class="text-slate-700 dark:text-slate-300 font-medium">${text}</span>`;
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

function checkAnswer(selectedIdx) {
  clearInterval(timerInterval);
  const q = quizData[currentIndex];
  const btns = document.querySelectorAll(".option-btn");
  btns.forEach((b) => (b.disabled = true));
  const isCorrect = selectedIdx === q.answer_index;

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

  const fbDiv = document.getElementById("feedback");
  fbDiv.querySelector("div").className =
    `rounded-3xl p-6 text-white shadow-lg ${isCorrect ? "bg-emerald-600" : "bg-rose-600"}`;
  document.getElementById("next-btn").className =
    `w-full py-4 bg-white font-bold rounded-2xl shadow-md ${isCorrect ? "text-emerald-600" : "text-rose-600"}`;
  document.getElementById("explanation-text").innerText = isCorrect
    ? `정답입니다! 😊\n\n${q.explanation}`
    : `정답은 ${q.answer_index + 1}번입니다. 😥\n\n${q.explanation}`;
  fbDiv.classList.remove("hidden");
}

function showResult() {
  const score = Math.round((correctAnswersCount / quizData.length) * 100);
  document.getElementById("result-modal").classList.remove("hidden");
  document.getElementById("final-score").innerText = score;
  document.getElementById("result-status").innerText =
    score >= 60 ? "합격입니다! 🎊" : "불합격입니다. 😰";

  const container = document.getElementById("subject-results");
  container.innerHTML =
    '<h3 class="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">과목별 성취도</h3>';
  for (const [cat, stat] of Object.entries(subjectStats)) {
    const per = Math.round((stat.correct / stat.total) * 100);
    container.insertAdjacentHTML(
      "beforeend",
      `<div class="mb-3"><div class="flex justify-between text-xs font-bold"><span>${cat}</span><span class="${per >= 60 ? "text-emerald-600" : "text-rose-600"}">${per}%</span></div><div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1"><div id="bar-${cat}" class="${per >= 60 ? "bg-emerald-500" : "bg-rose-500"} h-full transition-all duration-1000" style="width: 0%"></div></div></div>`,
    );
    setTimeout(() => {
      document.getElementById(`bar-${cat}`).style.width = per + "%";
    }, 100);
  }
  saveScoreToFirebase(score);
}

function updateUserLevelUI(data) {
  const total = data.totalCorrect || 0;
  const level = Math.floor(total / 50) + 1;
  const titles = ["인턴", "주니어", "디자이너", "마스터", "조형의 신"];
  document.getElementById("user-level").innerText =
    `LV.${level} ${titles[Math.min(level - 1, 4)]}`;
}

const qRank = query(
  collection(db, "rankings"),
  orderBy("highScore", "desc"),
  limit(10),
);
onSnapshot(qRank, (snapshot) => {
  const list = document.getElementById("leaderboard-list");
  if (!list) return;
  list.innerHTML = "";
  snapshot.forEach((doc) => {
    const d = doc.data();
    list.innerHTML += `<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 mb-2">
      <div class="flex items-center gap-3"><img src="${d.photo || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full border border-indigo-200 object-cover"><span class="font-bold text-sm">${d.name}</span></div>
      <span class="text-indigo-600 font-black">${d.highScore}점</span></div>`;
  });
});

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

document.getElementById("start-random-btn").onclick = () => startApp("random");
document.getElementById("start-wrong-btn").onclick = () => startApp("wrong");
document.getElementById("next-btn").onclick = () => {
  currentIndex++;
  if (currentIndex < quizData.length) renderQuestion();
  else showResult();
};
// 결과창 메인 이동 버튼
const goMain = document.getElementById("btn-go-main");
if (goMain) goMain.onclick = () => location.reload();

initThemeIcon();
