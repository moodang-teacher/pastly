/**
 * 자격증 필기 시험 앱 - 최종 결과 리포트 기능 추가
 */

let quizData = [];
let currentIndex = 0;
let correctAnswersCount = 0; // 맞은 개수 카운트 추가
const STORAGE_KEY = 'wrong_graphics_2016_4'; 
let wrongAnswers = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

// 테마 로직
const themeToggleBtn = document.getElementById('theme-toggle');
const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');

function initThemeIcon() {
    if (document.documentElement.classList.contains('dark')) {
        themeToggleLightIcon.classList.remove('hidden');
        themeToggleDarkIcon.classList.add('hidden');
    } else {
        themeToggleDarkIcon.classList.remove('hidden');
        themeToggleLightIcon.classList.add('hidden');
    }
}

themeToggleBtn.addEventListener('click', function() {
    themeToggleDarkIcon.classList.toggle('hidden');
    themeToggleLightIcon.classList.toggle('hidden');
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
});

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

async function loadQuizData() {
    try {
        const response = await fetch('./data/graphics.json');
        const data = await response.json();
        const round = data.exam_data.rounds[0];
        document.getElementById('exam-title').innerText = `${round.round_name} ${round.subject_name}`;
        quizData = shuffleArray([...round.questions]); 
        document.getElementById('total-pos').innerText = quizData.length;
        renderQuestion();
    } catch (error) {
        console.error("오류 발생:", error);
    }
}

function renderQuestion() {
    const q = quizData[currentIndex];
    const optionsList = document.getElementById('options-list');
    const feedback = document.getElementById('feedback');
    const progressBar = document.getElementById('progress-bar');
    
    feedback.classList.add('hidden');
    optionsList.innerHTML = '';
    
    const progressPercent = ((currentIndex) / quizData.length) * 100;
    progressBar.style.width = `${progressPercent}%`;
    document.getElementById('current-pos').innerText = currentIndex + 1;
    
    document.getElementById('category-badge').innerText = q.category;
    document.getElementById('question-text').innerText = `[No.${q.question_number}] ${q.question_text}`;

    q.options.forEach((text, idx) => {
        const btn = document.createElement('button');
        btn.className = "option-btn w-full text-left p-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/50 transition-all duration-200 flex items-start gap-3 group";
        btn.innerHTML = `
            <span class="flex-none w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-sm font-bold group-hover:bg-indigo-500 dark:group-hover:bg-indigo-400 group-hover:text-white transition-colors">${idx + 1}</span>
            <span class="text-slate-700 dark:text-slate-300 font-medium">${text}</span>
        `;
        btn.onclick = () => checkAnswer(idx);
        optionsList.appendChild(btn);
    });
}

function checkAnswer(selectedIdx) {
    const q = quizData[currentIndex];
    const btns = document.querySelectorAll('.option-btn');
    const feedbackArea = document.getElementById('feedback');
    const feedbackCard = feedbackArea.querySelector('div');
    const explanation = document.getElementById('explanation-text');
    const nextBtn = document.getElementById('next-btn');

    btns.forEach(btn => btn.disabled = true);
    feedbackCard.classList.remove('bg-emerald-600', 'dark:bg-emerald-700', 'bg-rose-600', 'dark:bg-rose-700');
    nextBtn.classList.remove('text-emerald-600', 'dark:text-emerald-800', 'text-rose-600', 'dark:text-rose-800');

    const isCorrect = (selectedIdx === q.answer_index);

    if (isCorrect) {
        correctAnswersCount++; // 정답 카운트 증가
        explanation.innerText = `정답입니다! 😊 \n\n해설: ${q.explanation}`;
        feedbackCard.classList.add('bg-emerald-600', 'dark:bg-emerald-700');
        nextBtn.classList.add('text-emerald-600', 'dark:text-emerald-800');
    } else {
        explanation.innerText = `틀렸습니다. 😥 정답은 ${q.answer_index + 1}번입니다. \n\n해설: ${q.explanation}`;
        feedbackCard.classList.add('bg-rose-600', 'dark:bg-rose-700');
        nextBtn.classList.add('text-rose-600', 'dark:text-rose-800');

        if (!wrongAnswers.includes(q.question_number)) {
            wrongAnswers.push(q.question_number);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(wrongAnswers));
        }
    }
    feedbackArea.classList.remove('hidden');
}

// 다음 문제 버튼 클릭 이벤트
document.getElementById('next-btn').addEventListener('click', () => {
    currentIndex++;
    if (currentIndex < quizData.length) {
        renderQuestion();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        showResult(); // 60문제 다 풀면 모달 실행
    }
});

/**
 * 최종 결과 모달 표시 함수
 */
function showResult() {
    const score = Math.round((correctAnswersCount / quizData.length) * 100);
    const isPassed = score >= 60; // 60점 이상 합격

    const modal = document.getElementById('result-modal');
    const statusText = document.getElementById('result-status');
    const iconBox = document.getElementById('result-icon');
    
    // 모달 데이터 업데이트
    document.getElementById('final-score').innerText = score;
    document.getElementById('correct-count').innerText = `${correctAnswersCount}개`;
    document.getElementById('wrong-count').innerText = `${quizData.length - correctAnswersCount}개`;

    if (isPassed) {
        statusText.innerText = "합격입니다!";
        statusText.className = "text-3xl font-bold mb-2 text-emerald-600";
        iconBox.innerText = "🎊";
        iconBox.className = "w-20 h-20 mx-auto rounded-full bg-emerald-100 text-4xl mb-4 flex items-center justify-center";
    } else {
        statusText.innerText = "불합격입니다.";
        statusText.className = "text-3xl font-bold mb-2 text-rose-600";
        iconBox.innerText = "😰";
        iconBox.className = "w-20 h-20 mx-auto rounded-full bg-rose-100 text-4xl mb-4 flex items-center justify-center";
    }

    modal.classList.remove('hidden');
}

initThemeIcon();
loadQuizData();