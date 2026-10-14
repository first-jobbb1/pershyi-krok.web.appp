// ====================================
// ЗАСТАВКА: відео «krok» на весь екран
// ====================================
// Кладемо файл krok.mp4 поруч із index.html.
// Відео програється без звуку, після завершення заставка плавно зникає.
// Якщо файлу немає або браузер не дає запустити відео, показується
// запасна анімація зі словом «krok» і заставка зникає за кілька секунд.

function initSplash() {
    const splash = document.getElementById("splash");
    if (!splash) return;

    const video = document.getElementById("splashVideo");
    const fallback = document.getElementById("splashFallback");
    const skipBtn = document.getElementById("splashSkip");

    const FALLBACK_TIME = 3500;   // скільки показуємо запасний варіант, мс
    const START_TIMEOUT = 4000;   // скільки чекаємо старту відео, мс
    const MAX_TIME = 30000;       // страховка: заставка не висить довше, мс

    let closed = false;
    let fallbackShown = false;
    let videoStarted = false;

    document.body.classList.add("splash-active");

    function closeSplash() {
        if (closed) return;
        closed = true;

        document.body.classList.remove("splash-active");
        splash.classList.add("splash-hide");
        if (video) video.pause();

        setTimeout(() => splash.remove(), 800);
    }

    function showFallback() {
        if (closed || fallbackShown) return;
        fallbackShown = true;

        if (video) video.classList.add("hidden");
        if (fallback) fallback.classList.remove("hidden");

        setTimeout(closeSplash, FALLBACK_TIME);
    }

    // Закриття: кнопка «Пропустити» і клавіша Escape
    if (skipBtn) skipBtn.addEventListener("click", closeSplash);
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") closeSplash();
    });

    if (video) {
        video.muted = true;

        video.addEventListener("ended", closeSplash);
        video.addEventListener("error", showFallback);
        video.addEventListener("playing", () => { videoStarted = true; });

        // Якщо файл не знайдено, подія error приходить від <source>
        const source = video.querySelector("source");
        if (source) source.addEventListener("error", showFallback);

        // Деякі браузери блокують автозапуск: тоді показуємо запасний варіант
        const attempt = video.play();
        if (attempt) attempt.catch(showFallback);

        setTimeout(() => {
            if (!videoStarted) showFallback();
        }, START_TIMEOUT);
    } else {
        showFallback();
    }

    setTimeout(closeSplash, MAX_TIME);
}

try {
    initSplash();
} catch (error) {
    console.error(error);
    const stuck = document.getElementById("splash");
    if (stuck) stuck.remove();
    document.body.classList.remove("splash-active");
}

// ====================================
// 0. НАЛАШТУВАННЯ FIREBASE
// ====================================
// Встав сюди свої дані з Firebase:
// Project settings → General → Your apps → Web app → firebaseConfig

const firebaseConfig = {
    apiKey: "AIzaSyAiKjOrnsN4clavCFeYLcjO7AuqtjlAj7A",
    authDomain: "pershyi-krok.firebaseapp.com",
    projectId: "pershyi-krok",
    storageBucket: "pershyi-krok.firebasestorage.app",
    messagingSenderId: "774046668509",
    appId: "1:774046668509:web:3d8ca1252122d510b22d34"
};

let configMissing = firebaseConfig.apiKey.startsWith("ВСТАВ");

let db = null;
let auth = null;
let currentUid = null;

function showBanner(text) {
    const banner = document.getElementById("dbBanner");
    if (!banner) {
        console.warn(text);
        return;
    }
    banner.textContent = text;
    banner.classList.remove("hidden");
}

if (configMissing) {
    showBanner("База даних не підключена: встав дані firebaseConfig на початку файлу script.js.");
} else if (typeof firebase === "undefined") {
    configMissing = true;
    showBanner("Не завантажилась бібліотека Firebase. Перевір інтернет і відкрий сайт через http/https, а не як файл.");
} else {
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();
    } catch (error) {
        configMissing = true;
        console.error(error);
        showBanner("Не вдалося запустити Firebase: " + error.message);
    }
}

// ====================================
// 1. ДАНІ
// ====================================

const demoJobs = [
    {
        id: "demo1",
        title: "Помічник бариста",
        company: "Кав'ярня «Ранок»",
        city: "Івано-Франківськ",
        salary: "8 000–12 000 грн/міс.",
        schedule: "Після навчання, 4 години на день",
        duties: "Допомога команді, підготовка робочого місця.",
        requirements: "Ввічливість, відповідальність, бажання вчитися.",
        demo: true
    },
    {
        id: "demo2",
        title: "Помічник у магазині",
        company: "Магазин «Добрий вибір»",
        city: "Львів",
        salary: "90–110 грн/год",
        schedule: "У вихідні",
        duties: "Допомога з викладкою товарів і підтримання порядку.",
        requirements: "Уважність, охайність, привітне спілкування.",
        demo: true
    },
    {
        id: "demo3",
        title: "Помічник для соцмереж",
        company: "Студія «Крапка»",
        city: "Віддалено",
        salary: "За домовленістю",
        schedule: "Гнучкий графік",
        duties: "Допомога з ідеями для дописів та оформленням контенту.",
        requirements: "Грамотність, цікавість до соцмереж.",
        demo: true
    }
];

let jobs = [];     // вакансії з бази
let resumes = [];  // резюме з бази
let myApplications = [];
let myInvitations = [];

// ====================================
// 2. ПІДКЛЮЧЕННЯ ДО БАЗИ
// ====================================

function handleDbError(error) {
    console.error(error);
    showBanner("Помилка бази даних: " + (error.code || error.message) +
        ". Перевір правила Firestore та налаштування Firebase.");
}

function startDatabase() {
    if (configMissing) return;

    // Анонімний вхід: дає кожному відвідувачу свій id,
    // завдяки якому він може видаляти лише свої вакансії та резюме
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUid = user.uid;
            listenPrivateData();
            refreshAll();
        }
    });

    auth.signInAnonymously().catch(handleDbError);

    // Публічні дані: бачать усі, оновлюються в реальному часі
    db.collection("jobs")
        .orderBy("createdAt", "desc")
        .onSnapshot(snapshot => {
            jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderJobs();
            renderHome();
            renderMyJobs();
        }, handleDbError);

    db.collection("resumes")
        .orderBy("createdAt", "desc")
        .onSnapshot(snapshot => {
            resumes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderResumes();
        }, handleDbError);
}

function listenPrivateData() {
    // Заявки на мої вакансії (бачу лише я як роботодавець)
    db.collection("applications")
        .where("employerUid", "==", currentUid)
        .onSnapshot(snapshot => {
            myApplications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderMyJobs();
        }, handleDbError);

    // Запрошення, адресовані мені як кандидату
    db.collection("invitations")
        .where("candidateUid", "==", currentUid)
        .onSnapshot(snapshot => {
            myInvitations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderMyInvitations();
        }, handleDbError);
}

function refreshAll() {
    renderHome();
    renderJobs();
    renderResumes();
    renderMyJobs();
    renderMyInvitations();
}

// ====================================
// 3. ПЕРЕХОДИ МІЖ СТОРІНКАМИ
// ====================================

let currentPage = "choice";
const pageHistory = [];

function goBack() {
    const previous = pageHistory.pop() || "choice";
    showPage(previous, true);
}

function showPage(pageId, fromBack = false) {
    // Запам'ятовуємо, звідки прийшли, щоб кнопка «назад» вела на попередню сторінку
    if (!fromBack && pageId !== currentPage) {
        pageHistory.push(currentPage);
        if (pageHistory.length > 30) pageHistory.shift();
    }
    currentPage = pageId;
    applyRoleButtons();

    document.querySelectorAll(".page").forEach(page => {
        page.classList.add("hidden");
    });

    document.getElementById(pageId).classList.remove("hidden");

    // На екрані вибору меню ховаємо
    document.getElementById("mainNav")
        .classList.toggle("hidden", pageId === "choice");

    // Підсвічуємо кнопку меню поточної сторінки
    document.querySelectorAll("#mainNav button[data-page]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.page === pageId);
    });

    // На екрані вибору кнопка «назад» не потрібна
    document.getElementById("backBtn")
        .classList.toggle("hidden", pageId === "choice");

    if (pageId === "jobs") renderJobs();
    if (pageId === "resumes") renderResumes();
    if (pageId === "home") renderHome();
    if (pageId === "myJobs") renderMyJobs();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

let selectedRole = null;

// Показуємо в меню тільки кнопки обраної ролі (поки роль не обрана, жодної)
function applyRoleButtons() {
    document.querySelectorAll("#mainNav button[data-role]").forEach(btn => {
        btn.classList.toggle("hidden", btn.dataset.role !== selectedRole);
    });
}

function chooseRole(role) {
    selectedRole = role;
    applyRoleButtons();
    showPage(role === "seeker" ? "home" : "employerHub");
}

// ====================================
// 4. БЕЗПЕЧНЕ ВІДОБРАЖЕННЯ ТЕКСТУ
// ====================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function formatDate(timestamp) {
    if (!timestamp || !timestamp.toDate) return "";
    return timestamp.toDate().toLocaleString("uk-UA");
}

// ====================================
// 5. ПОКАЗ ВАКАНСІЙ
// ====================================

function getAllJobs() {
    return [...jobs, ...demoJobs];
}

function jobCard(job) {
    const isMine = job.ownerUid && job.ownerUid === currentUid;

    return `
        <article class="job-card">
            <h3>${escapeHTML(job.title)}</h3>

            <p class="muted">${escapeHTML(job.company)}</p>

            <p>📍 ${escapeHTML(job.city)}</p>

            <div class="salary">${escapeHTML(job.salary)}</div>

            <p><strong>Графік:</strong> ${escapeHTML(job.schedule)}</p>
            <p><strong>Обов'язки:</strong> ${escapeHTML(job.duties)}</p>
            <p><strong>Вимоги:</strong> ${escapeHTML(job.requirements)}</p>

            ${job.contact ? `<p><strong>Контакт:</strong> ${escapeHTML(job.contact)}</p>` : ""}

            <button class="primary" onclick="applyForJob('${escapeHTML(job.id)}')">
                Подати заявку
            </button>

            ${isMine ? `
                <button class="danger" onclick="deleteJob('${escapeHTML(job.id)}')">
                    Видалити вакансію
                </button>` : ""}
        </article>
    `;
}

function renderJobs() {
    const search = document.getElementById("jobSearch").value.toLowerCase();
    const city = document.getElementById("jobCity").value;

    const filteredJobs = getAllJobs().filter(job => {
        const matchesSearch =
            (job.title + " " + job.company).toLowerCase().includes(search);
        const matchesCity = !city || job.city === city;
        return matchesSearch && matchesCity;
    });

    document.getElementById("jobsList").innerHTML =
        filteredJobs.length
            ? filteredJobs.map(jobCard).join("")
            : "<p>За цим запитом вакансій не знайдено.</p>";
}

document.getElementById("jobSearch").addEventListener("input", renderJobs);
document.getElementById("jobCity").addEventListener("change", renderJobs);

function renderHome() {
    document.getElementById("homeJobs").innerHTML =
        getAllJobs().slice(0, 3).map(jobCard).join("");
}

// ====================================
// 6. ПУБЛІКАЦІЯ ВАКАНСІЇ
// ====================================

function requireDatabase() {
    if (configMissing || !db) {
        alert("База даних ще не підключена. Встав дані Firebase у script.js.");
        return false;
    }
    if (!currentUid) {
        alert("Підключення ще триває. Спробуй за кілька секунд.");
        return false;
    }
    return true;
}

document.getElementById("jobForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!requireDatabase()) return;

    const form = this;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;

    try {
        await db.collection("jobs").add({
            title: document.getElementById("jobTitle").value.trim(),
            company: document.getElementById("company").value.trim(),
            city: document.getElementById("city").value,
            salary: document.getElementById("salary").value.trim(),
            schedule: document.getElementById("schedule").value.trim(),
            duties: document.getElementById("duties").value.trim(),
            requirements: document.getElementById("requirements").value.trim(),
            contact: document.getElementById("contact").value.trim(),
            ownerUid: currentUid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        form.reset();
        alert("Вакансію опубліковано! Її бачать усі відвідувачі.");
        showPage("myJobs");
    } catch (error) {
        handleDbError(error);
        alert("Не вдалося опублікувати вакансію. Спробуй ще раз.");
    } finally {
        button.disabled = false;
    }
});

async function deleteJob(jobId) {
    if (!requireDatabase()) return;
    if (!confirm("Видалити цю вакансію для всіх?")) return;

    try {
        await db.collection("jobs").doc(jobId).delete();
    } catch (error) {
        handleDbError(error);
        alert("Не вдалося видалити вакансію.");
    }
}

// ====================================
// 7. ЗАЯВКА НА ВАКАНСІЮ
// ====================================

async function applyForJob(jobId) {
    const job = getAllJobs().find(item => String(item.id) === String(jobId));
    if (!job) return;

    if (job.demo) {
        alert("Це демонстраційна вакансія. Заявки можна подавати на вакансії, опубліковані користувачами.");
        return;
    }

    if (!requireDatabase()) return;

    const name = prompt("Введи своє ім'я:");
    if (!name || !name.trim()) return;

    const email = prompt("Введи email для зв'язку:");
    if (!email || !email.includes("@")) {
        alert("Введи коректний email.");
        return;
    }

    try {
        await db.collection("applications").add({
            jobId: job.id,
            jobTitle: job.title,
            employerUid: job.ownerUid,
            applicantUid: currentUid,
            name: name.trim(),
            email: email.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("Заявку надіслано роботодавцю!");
    } catch (error) {
        handleDbError(error);
        alert("Не вдалося надіслати заявку.");
    }
}

function renderMyJobs() {
    const box = document.getElementById("myJobsList");
    if (!box) return;

    const mine = jobs.filter(job => job.ownerUid && job.ownerUid === currentUid);

    if (!mine.length) {
        box.innerHTML = `
            <div class="panel">
                <h3>Ти ще не опублікував вакансій</h3>
                <p class="muted">Створи першу вакансію, і вона з'явиться тут разом із заявками кандидатів.</p>
                <button class="primary" onclick="showPage('employer')">
                    Надати вакансію
                </button>
            </div>
        `;
        return;
    }

    box.innerHTML = mine.map(job => {
        const apps = myApplications
            .filter(item => String(item.jobId) === String(job.id))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        const appsHtml = apps.length
            ? apps.map(item => `
                <div class="note-item">
                    <p><strong>${escapeHTML(item.name)}</strong></p>
                    <p>Email: ${escapeHTML(item.email)}</p>
                    <p class="muted">${escapeHTML(formatDate(item.createdAt))}</p>
                </div>
            `).join("")
            : '<p class="muted">Поки немає заявок.</p>';

        return `
            <article class="job-card">
                <h3>${escapeHTML(job.title)}</h3>
                <p class="muted">${escapeHTML(job.company)}</p>
                <p>📍 ${escapeHTML(job.city)}</p>
                <div class="salary">${escapeHTML(job.salary)}</div>
                <p><strong>Графік:</strong> ${escapeHTML(job.schedule)}</p>

                <h4>Заявки (${apps.length})</h4>
                ${appsHtml}

                <button class="danger" onclick="deleteJob('${escapeHTML(job.id)}')">
                    Видалити вакансію
                </button>
            </article>
        `;
    }).join("");
}

// ====================================
// 8. РЕЗЮМЕ: ДАНІ З ФОРМИ
// ====================================

function getResumeData() {
    return {
        name: document.getElementById("rName").value.trim(),
        age: document.getElementById("rAge").value,
        city: document.getElementById("rCity").value.trim(),
        position: document.getElementById("rPosition").value.trim(),
        employment: document.getElementById("rEmployment").value,
        schedule: document.getElementById("rSchedule").value,
        education: document.getElementById("rEducation").value,
        experience: document.getElementById("rExperience").value,
        skills: document.getElementById("rSkills").value.trim(),
        about: document.getElementById("rAbout").value.trim(),
        email: document.getElementById("rEmail").value.trim()
    };
}

function updatePreview() {
    const resume = getResumeData();

    const fields = {
        pName: resume.name || "Твоє ім'я",
        pPosition: resume.position || "Бажана посада",
        pAge: resume.age ? "Вік: " + resume.age : "Вік",
        pCity: resume.city || "Місто",
        pEmployment: resume.employment,
        pSchedule: resume.schedule,
        pEducation: resume.education || "Інформація про освіту",
        pExperience: resume.experience,
        pSkills: resume.skills || "Твої навички з'являться тут",
        pAbout: resume.about || "Кілька слів про тебе",
        pEmail: resume.email || "Твій email"
    };

    for (const [id, value] of Object.entries(fields)) {
        document.getElementById(id).textContent = value;
    }
}

document.getElementById("resumeForm").addEventListener("input", updatePreview);
document.getElementById("resumeForm").addEventListener("change", updatePreview);

// ====================================
// 9. ПУБЛІКАЦІЯ РЕЗЮМЕ
// ====================================
// Одне резюме на одного відвідувача: повторне збереження оновлює його.
// Email НЕ потрапляє в публічне резюме — він лежить в окремому
// приватному документі, який може прочитати лише власник.

document.getElementById("resumeForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!requireDatabase()) return;

    const resume = getResumeData();
    const { email, ...publicData } = resume;
    const button = this.querySelector("button[type=submit]");
    button.disabled = true;

    try {
        const batch = db.batch();

        batch.set(db.collection("resumes").doc(currentUid), {
            ...publicData,
            ownerUid: currentUid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        batch.set(db.collection("contacts").doc(currentUid), {
            email,
            ownerUid: currentUid
        });

        await batch.commit();

        alert("Резюме опубліковано!");
        showPage("resumes");
    } catch (error) {
        handleDbError(error);
        alert("Не вдалося зберегти резюме. Спробуй ще раз.");
    } finally {
        button.disabled = false;
    }
});

async function deleteMyResume() {
    if (!requireDatabase()) return;
    if (!confirm("Видалити твоє резюме? Воно зникне для всіх.")) return;

    try {
        const batch = db.batch();
        batch.delete(db.collection("resumes").doc(currentUid));
        batch.delete(db.collection("contacts").doc(currentUid));
        await batch.commit();
    } catch (error) {
        handleDbError(error);
        alert("Не вдалося видалити резюме.");
    }
}

// ====================================
// 10. ПОКАЗ РЕЗЮМЕ РОБОТОДАВЦЯМ
// ====================================

function renderResumes() {
    const container = document.getElementById("resumeList");

    if (resumes.length === 0) {
        container.innerHTML = `
            <div class="panel">
                <h3>Поки немає резюме</h3>
                <p class="muted">Створи своє резюме, і воно з'явиться тут.</p>
                <button class="primary" onclick="showPage('builder')">
                    Створити резюме
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = resumes.map(resume => {
        const isMine = resume.id === currentUid;

        return `
        <article class="resume-card">
            <h3>${escapeHTML(resume.name)}</h3>

            <p class="muted">${escapeHTML(resume.position)}</p>

            <p>Вік: ${escapeHTML(resume.age)}</p>
            <p>Місто: ${escapeHTML(resume.city)}</p>
            <p>Освіта: ${escapeHTML(resume.education)}</p>
            <p>Графік: ${escapeHTML(resume.schedule)}</p>

            <p><strong>Навички:</strong> ${escapeHTML(resume.skills || "Не вказано")}</p>
            <p><strong>Про себе:</strong> ${escapeHTML(resume.about || "Не вказано")}</p>

            ${isMine ? `
                <button class="danger" onclick="deleteMyResume()">
                    Видалити моє резюме
                </button>` : `
                <button class="primary" onclick="inviteCandidate('${escapeHTML(resume.id)}')">
                    Запросити на співбесіду
                </button>`}
        </article>
    `;
    }).join("");
}

// ====================================
// 11. ЗАПРОШЕННЯ НА СПІВБЕСІДУ
// ====================================

async function inviteCandidate(resumeId) {
    const resume = resumes.find(item => String(item.id) === String(resumeId));
    if (!resume) return;
    if (!requireDatabase()) return;

    const company = prompt("Введи назву своєї компанії:");
    if (!company || !company.trim()) return;

    const message = prompt("Напиши повідомлення кандидату:");
    if (!message || !message.trim()) return;

    const contact = prompt("Як з тобою зв'язатися? (робоча пошта або телефон компанії)");
    if (!contact || !contact.trim()) return;

    try {
        await db.collection("invitations").add({
            candidateUid: resume.ownerUid,
            candidateName: resume.name,
            employerUid: currentUid,
            company: company.trim(),
            message: message.trim(),
            contact: contact.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert("Запрошення надіслано. Кандидат побачить його у розділі «Створити резюме».");
    } catch (error) {
        handleDbError(error);
        alert("Не вдалося надіслати запрошення.");
    }
}

function renderMyInvitations() {
    const box = document.getElementById("myInvitations");
    if (!box) return;

    if (!myInvitations.length) {
        box.innerHTML = '<p class="muted">Поки немає запрошень. Опублікуй резюме, і роботодавці зможуть тобі написати.</p>';
        return;
    }

    const sorted = [...myInvitations].sort((a, b) =>
        (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    box.innerHTML = sorted.map(item => `
        <div class="note-item">
            <p><strong>${escapeHTML(item.company)}</strong></p>
            <p>${escapeHTML(item.message)}</p>
            <p>Контакт: ${escapeHTML(item.contact)}</p>
            <p class="muted">${escapeHTML(formatDate(item.createdAt))}</p>
        </div>
    `).join("");
}

// ====================================
// 12. ЗАВАНТАЖЕННЯ РЕЗЮМЕ У JSON
// ====================================

function downloadResume() {
    const form = document.getElementById("resumeForm");

    if (!form.reportValidity()) return;

    const resume = getResumeData();

    const blob = new Blob(
        [JSON.stringify(resume, null, 2)],
        { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "moie-reziume.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

// ====================================
// 13. ЗАПУСК САЙТУ
// ====================================

refreshAll();
updatePreview();

try {
    startDatabase();
} catch (error) {
    handleDbError(error);
}