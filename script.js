let allQuestions = [];
let quizData = [];
let currentIndex = 0;
let correctAnswersCount = 0;
let timerInterval;
let timeLeft = 60;
const STORAGE_KEY = 'wrong_answers_ids';

// 테마 제어
const themeToggleBtn = document.getElementById('theme-toggle');
function initThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  document
    .getElementById('theme-toggle-light-icon')
    .classList.toggle('hidden', !isDark);
  document
    .getElementById('theme-toggle-dark-icon')
    .classList.toggle('hidden', isDark);
}
themeToggleBtn.addEventListener('click', () => {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  initThemeIcon();
});

// 앱 시작
async function startApp(mode) {
  try {
    const response = await fetch('./data/graphics.json');
    const data = await response.json();
    allQuestions = data.questions;
    document.getElementById('exam-title').innerText = data.subject_name;

    if (mode === 'random') {
      quizData = shuffleArray([...allQuestions]).slice(0, 60);
    } else if (mode === 'wrong') {
      const wrongIds = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      quizData = allQuestions.filter((q) => wrongIds.includes(q.id));
      if (quizData.length === 0) {
        alert('복습할 오답이 없습니다! 랜덤 풀기를 먼저 진행해 주세요.');
        return;
      }
      shuffleArray(quizData);
    }

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

  q.options.forEach((text, idx) => {
    const btn = document.createElement('button');
    btn.className =
      'option-btn w-full text-left p-4 rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all flex items-start gap-3 group';
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
  const display = document.getElementById('timer-display');
  display.innerText = timeLeft;
  display.classList.remove('animate-pulse');
  timerInterval = setInterval(() => {
    timeLeft--;
    display.innerText = timeLeft;
    if (timeLeft <= 10) display.classList.add('animate-pulse');
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      checkAnswer(-1);
    }
  }, 1000);
}

function checkAnswer(selectedIdx) {
  clearInterval(timerInterval);
  const q = quizData[currentIndex];
  const btns = document.querySelectorAll('.option-btn');
  const feedbackCard = document.getElementById('feedback').querySelector('div');
  const nextBtn = document.getElementById('next-btn');

  btns.forEach((b) => (b.disabled = true));
  const isCorrect = selectedIdx === q.answer_index;

  if (isCorrect) {
    correctAnswersCount++;
    let ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(ids.filter((id) => id !== q.id)),
    ); // 맞히면 오답 리스트에서 제거
  } else {
    let ids = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    if (!ids.includes(q.id)) {
      ids.push(q.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } // 틀리면 저장
  }

  feedbackCard.className = `rounded-3xl p-6 text-white shadow-lg ${isCorrect ? 'bg-emerald-600' : 'bg-rose-600'}`;
  nextBtn.className = `w-full py-4 bg-white font-bold rounded-2xl shadow-md ${isCorrect ? 'text-emerald-600' : 'text-rose-600'}`;
  document.getElementById('explanation-text').innerText = isCorrect
    ? `정답입니다! 😊\n\n${q.explanation}`
    : `정답은 ${q.answer_index + 1}번입니다. 😥\n\n${q.explanation}`;
  document.getElementById('feedback').classList.remove('hidden');
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

document.getElementById('next-btn').onclick = () => {
  currentIndex++;
  if (currentIndex < quizData.length) renderQuestion();
  else showResult();
};

function showResult() {
  const score = Math.round((correctAnswersCount / quizData.length) * 100);
  const isPassed = score >= 60;
  document.getElementById('result-modal').classList.remove('hidden');
  document.getElementById('final-score').innerText = score;
  document.getElementById('result-status').innerText = isPassed
    ? '합격입니다! 🎊'
    : '불합격입니다. 😰';
  document.getElementById('result-status').className =
    `text-2xl font-bold mb-1 ${isPassed ? 'text-emerald-600' : 'text-rose-600'}`;
  document.getElementById('result-icon').innerText = isPassed ? '🎊' : '😰';
}

initThemeIcon();
