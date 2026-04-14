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
  storageBucket: "pastly-9eb9d.appspot.com",
  messagingSenderId: "487960509557",
  appId: "1:487960509557:web:1fb9c90a5a8f89df9ecc3c",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentMode;
let allQuestions = [];
let quizData = [];
let currentIndex = 0;
let correctAnswersCount = 0;
let timerInterval;
let timeLeft = 60;
let subjectStats = {};
let currentUser = null;
const STORAGE_KEY = "wrong_answers_ids";
const DEFAULT_AVATAR = "images/avata.png";

const $ = (id) => document.getElementById(id);
const getWrongIds = () => JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
const setWrongIds = (ids) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));

// 아바타 업로드 함수
async function uploadAvatar(file) {
  console.log("uploadAvatar 함수 호출됨, currentUser:", currentUser);
  if (!currentUser) {
    alert("로그인이 필요합니다.");
    return;
  }

  try {
    // 파일 존재 체크
    if (!file) {
      alert("파일을 선택해주세요.");
      return;
    }

    console.log("파일 검증 시작:", file.name, file.size, file.type);

    // 파일 크기 체크 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      alert("파일 크기가 5MB를 초과합니다. 더 작은 파일을 선택해주세요.");
      return;
    }

    // 파일 타입 체크
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드 가능합니다.");
      return;
    }

    // 로딩 표시
    const userPhoto = document.getElementById("user-photo");
    const originalSrc = userPhoto.src;
    userPhoto.style.opacity = "0.5";
    userPhoto.style.filter = "blur(2px)";

    console.log("이미지 base64 변환 시작");

    // 이미지 압축 및 base64 변환
    const imageDataUrl = await compressImage(file);

    console.log("Firestore에 이미지 데이터 저장 시작");

    // Firestore에 base64 문자열 저장
    await setDoc(
      doc(db, "rankings", currentUser.uid),
      {
        photo: imageDataUrl,
        updatedAt: new Date(),
      },
      { merge: true },
    );
    console.log("Firestore 저장 완료");

    // UI 업데이트
    userPhoto.src = imageDataUrl;
    userPhoto.style.opacity = "1";
    userPhoto.style.filter = "none";

    alert("아바타가 성공적으로 변경되었습니다! 🎉");

    // 입력 초기화
    document.getElementById("avatar-input").value = "";
  } catch (error) {
    console.error("아바타 업로드 오류:", error);

    // UI 복원
    const userPhoto = document.getElementById("user-photo");
    userPhoto.style.opacity = "1";
    userPhoto.style.filter = "none";

    // 사용자 친화적인 에러 메시지
    let errorMessage = "아바타 변경 중 오류가 발생했습니다.";
    if (
      error.code === "permission-denied" ||
      error.code === "storage/unauthorized"
    ) {
      errorMessage =
        "접근 권한이 없습니다. 다시 로그인하거나 권한을 확인해주세요.";
    } else if (error.code?.includes("network")) {
      errorMessage = "네트워크 연결을 확인해주세요.";
    }

    alert(errorMessage + " 다시 시도해주세요.");
  }
}

// 이미지 압축 함수 (모바일 최적화)
async function compressImage(file) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      // 최대 크기 설정 (모바일 최적화)
      const maxWidth = 300;
      const maxHeight = 300;

      let { width, height } = img;

      // 비율 유지하며 크기 조정
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // 이미지 그리기
      ctx.drawImage(img, 0, 0, width, height);

      // 압축된 이미지로 변환하여 base64 문자열로 반환
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      resolve(dataUrl);
    };

    img.src = URL.createObjectURL(file);
  });
}
const createDigitRoller = (value, direction) => {
  const digits = direction === "down" ? "9876543210" : "0123456789";
  const startOffset = direction === "down" ? "--start-offset: -9em; " : "";
  return `<span class="digit-roller"><div class="digit-roller-content roller-${direction}" style="${startOffset}--roll-distance: ${value}em;"><span>${digits.split("").join("</span><span>")}</span></div></span>`;
};

function initThemeIcon() {
  const isDark = document.documentElement.classList.contains("dark");
  const lightIcon = document.getElementById("theme-toggle-light-icon");
  const darkIcon = document.getElementById("theme-toggle-dark-icon");
  if (lightIcon && darkIcon) {
    lightIcon.classList.toggle("hidden", !isDark);
    darkIcon.classList.toggle("hidden", isDark);
  }
}

$("theme-toggle").onclick = () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  initThemeIcon();
};

function updateWrongCountUI() {
  const ids = getWrongIds();
  const badge = $("wrong-count-badge");
  const wrongBtn = $("start-wrong-btn");
  if (badge) badge.innerText = ids.length;
  if (wrongBtn) wrongBtn.style.opacity = ids.length === 0 ? "0.6" : "1";
}

document.getElementById("btn-login-submit").onclick = async () => {
  const userId = document.getElementById("login-id").value.trim();
  const userPw = document.getElementById("login-pw").value.trim();
  if (!userId || !userPw) return alert("닉네임과 비밀번호를 입력해주세요.");
  if (userPw.length < 6) return alert("비밀번호는 6자리 이상이어야 합니다.");

  const email = `${userId}@pastly.com`;
  try {
    await signInWithEmailAndPassword(auth, email, userPw);
  } catch (error) {
    if (
      error.code === "auth/user-not-found" ||
      error.code === "auth/invalid-credential"
    ) {
      if (confirm(`${userId}님, 신규 회원으로 가입하시겠습니까?`)) {
        try {
          await createUserWithEmailAndPassword(auth, email, userPw);
          await setDoc(doc(db, "rankings", auth.currentUser.uid), {
            name: userId,
            photo: DEFAULT_AVATAR,
            highScore: 0,
            updatedAt: new Date(),
          });
          alert("회원가입이 완료되었습니다!");
        } catch (signupError) {
          if (signupError.code === "auth/weak-password") {
            alert("비밀번호가 너무 약합니다. 6자리 이상으로 설정해주세요.");
          } else if (signupError.code === "auth/email-already-in-use") {
            alert("이미 사용중인 닉네임입니다.");
          } else {
            alert("회원가입 중 오류가 발생했습니다. 다시 시도해주세요.");
          }
        }
      }
    } else {
      alert("로그인 정보가 올바르지 않습니다.");
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
    const photoUrl =
      rankDoc.exists() && rankDoc.data().photo
        ? rankDoc.data().photo
        : DEFAULT_AVATAR;
    document.getElementById("user-photo").src = photoUrl;

    // 기본 아바타일 경우 말풍선 표시
    if (photoUrl === DEFAULT_AVATAR) {
      const tooltip = document.querySelector(".avatar-tooltip");
      tooltip.classList.add("show");
      setTimeout(() => {
        tooltip.classList.remove("show");
      }, 3000); // 3초 후 사라짐
    }

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
  currentMode = mode;
  try {
    const response = await fetch("./data/graphics.json");
    const data = await response.json();
    allQuestions = data.questions;
    const ids = getWrongIds();
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
      "option-btn w-full text-left p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-500 transition-all flex items-center gap-5 active:bg-slate-50 dark:active:bg-slate-900 shadow-sm";
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
  const ids = getWrongIds();
  if (isCorrect) {
    correctAnswersCount++;
    subjectStats[q.category].correct++;
    setWrongIds(ids.filter((id) => id !== q.id));
  } else {
    if (!ids.includes(q.id)) {
      ids.push(q.id);
      setWrongIds(ids);
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

  const finalScoreEl = document.getElementById("final-score");
  const scoreText = score.toString();

  finalScoreEl.innerHTML = scoreText
    .split("")
    .map((digit, idx) =>
      createDigitRoller(Number(digit), idx % 2 === 0 ? "up" : "down"),
    )
    .join("");

  setTimeout(() => {
    finalScoreEl.querySelectorAll(".roller-up").forEach((content) => {
      content.classList.add("animate-digit-up");
    });
    finalScoreEl.querySelectorAll(".roller-down").forEach((content) => {
      content.classList.add("animate-digit-down");
    });
  }, 50);

  document.getElementById("result-status").innerText =
    score >= 60 ? "합격입니다!" : "불합격입니다.";

  const container = document.getElementById("subject-results");
  container.innerHTML = "";

  const categoryArray = Object.entries(subjectStats);
  for (let i = 0; i < categoryArray.length; i++) {
    const [cat, stat] = categoryArray[i];
    const per = Math.round((stat.correct / stat.total) * 100);
    const progressBarId = `progress-bar-${i}`;
    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="space-y-2">
        <div class="flex justify-between text-xs font-black uppercase tracking-tighter text-slate-600 dark:text-slate-400">
          <span>${cat}</span>
          <span>${per}% (${stat.correct}/${stat.total})</span>
        </div>
        <div class="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden shadow-inner">
          <div id="${progressBarId}" class="bg-indigo-500 h-full shadow-lg" style="width: 0%; --target-width: ${per}%"></div>
        </div>
      </div>
    `,
    );
  }

  setTimeout(() => {
    document.querySelectorAll("[id^='progress-bar-']").forEach((bar, idx) => {
      setTimeout(() => {
        bar.classList.add("progress-bar-animate");
      }, idx * 100);
    });
  }, 200);

  if (currentMode === "random") saveScoreToFirebase(score);
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
  const level = Math.floor(total / 100) + 1;
  const titles = ["뉴비", "루키", "프로", "마스터", "레전드", "갓", "슈퍼갓"];
  document.getElementById("user-level").innerText =
    `LV.${level} ${titles[Math.min(level - 1, 6)]}`;
}

onSnapshot(
  query(collection(db, "rankings"), orderBy("highScore", "desc"), limit(7)),
  (snap) => {
    const list = document.getElementById("leaderboard-list");
    if (!list) return;
    list.innerHTML = "";
    snap.forEach((rankingDoc) => {
      const d = rankingDoc.data();
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

document.getElementById("pastly-logo").onclick = () => {
  document.getElementById("main-menu").classList.remove("hidden");
  document.getElementById("quiz-container").classList.add("hidden");
  document.getElementById("result-modal").classList.add("hidden");
  document.getElementById("feedback").classList.add("hidden");
};

["login-id", "login-pw"].forEach((inputId) => {
  $(inputId)?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      $("btn-login-submit")?.click();
    }
  });
});

// 아바타 파일 선택 이벤트
document
  .getElementById("avatar-input")
  .addEventListener("change", async (e) => {
    console.log("아바타 파일 선택됨:", e.target.files[0]);
    const file = e.target.files[0];
    if (file) {
      // 간단한 테스트: 파일이 제대로 선택되는지 확인
      console.log("파일 정보:", {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      // 사용자에게 확인
      if (
        confirm(
          `선택한 파일: ${file.name}\n크기: ${Math.round(file.size / 1024)}KB\n업로드를 진행하시겠습니까?`,
        )
      ) {
        uploadAvatar(file);
      } else {
        // 입력 초기화
        e.target.value = "";
      }
    }
  });

initThemeIcon();
