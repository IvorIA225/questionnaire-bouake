/*
 * -------------------------------------------------------------
 * ENQUÊTES DE TERRAIN - BOUAKÉ
 * APPLICATION LOGIC & OFFLINE DATA MANAGER
 * -------------------------------------------------------------
 */

// --- DATA DEFINITIONS FOR SURVEYS ---
const LIKERT_LABELS = {
    1: { emoji: "😡", text: "Pas du tout d'accord" },
    2: { emoji: "😞", text: "Pas d'accord" },
    3: { emoji: "😐", text: "Neutre" },
    4: { emoji: "😊", text: "D'accord" },
    5: { emoji: "😍", text: "Tout à fait d'accord" }
};

const SURVEY_ITEMS = [
    // PARTIE 2 : Perception de la voix (PDLV)
    { code: "PDLV1", category: "Partie 2 : Perception de la voix", text: "La voix que j'ai entendue sonnait naturelle, comme une vraie voix humaine." },
    { code: "PDLV2", category: "Partie 2 : Perception de la voix", text: "Cette voix me semblait claire et facile à comprendre." },
    { code: "PDLV3", category: "Partie 2 : Perception de la voix", text: "La voix que j'ai entendue était agréable à écouter." },
    { code: "PDLV4", category: "Partie 2 : Perception de la voix", text: "La voix que j'ai entendue me donnait l'impression de parler avec une vraie personne." },

    // PARTIE 3 : Distance psychologique (DP)
    { code: "DP1", category: "Partie 3 : Distance psychologique", text: "Cette voix me donnait le sentiment que la boutique me comprend et me connaît." },
    { code: "DP2", category: "Partie 3 : Distance psychologique", text: "La voix entendue me semblait froide et lointaine, comme si la boutique ne me ressemblait pas." },
    { code: "DP3", category: "Partie 3 : Distance psychologique", text: "Je me sentais proche de cette boutique, comme avec un commerçant familier." },
    { code: "DP4", category: "Partie 3 : Distance psychologique", text: "En écoutant cette voix, j’avais l’impression de parler avec quelqu’un d’étranger à mon monde." },
    { code: "DP5", category: "Partie 3 : Distance psychologique", text: "Cette voix me donnait l’impression que cette boutique s’adresse vraiment à des gens comme moi." },
    { code: "DP6", category: "Partie 3 : Distance psychologique", text: "Cette voix ne me donnait pas l’impression que cette boutique s’adressait à des gens comme moi." },
    { code: "DP7", category: "Partie 3 : Distance psychologique", text: "Grâce à cette voix, j’avais envie d’échanger avec cette boutique." },

    // PARTIE 4 : L'intention d'achat (IA)
    { code: "IA1", category: "Partie 4 : Intention d'achat", text: "J'envisagerais d'acheter un produit sur cette boutique en ligne." },
    { code: "IA2", category: "Partie 4 : Intention d'achat", text: "Je serais prêt(e) à passer une commande sur cette boutique avec mon téléphone." },
    { code: "IA3", category: "Partie 4 : Intention d'achat", text: "Je choisirais cette boutique plutôt que d'aller au marché pour certains achats." }
];

// --- APP STATE ---
let currentTheme = 'dark';
let currentTab = 'tab-dashboard';
let currentSurveyGroup = 'A'; // 'A' or 'B'
let currentSurveyStep = 1;
let isEligible = true;
let collectedResponses = [];

// Audio Player variables
let audioPlayerElement = null;
let playPauseBtn = null;
let audioProgressBarFill = null;
let audioTimeCurrent = null;
let audioTimeDuration = null;
let audioPlaybackTimer = null;
let simulatedAudioDuration = 15; // 15 seconds simulation if no file loaded
let simulatedAudioProgress = 0;
let isAudioPlaying = false;
let isCustomAudioLoaded = false;

// Custom Persistent Audio Files in IndexedDB
let localDb = null;
const DB_NAME = "EnquetesBouakeDB";
const DB_VERSION = 1;

// --- INITIALIZE APPLICATION ---
document.addEventListener("DOMContentLoaded", () => {
    initAppSelectors();
    initIndexedDB();
    setupTheme();
    setupTabs();
    selectSurveyGroup('A'); // Set Group A by default
    evaluateEligibility();
    
    // Listen to custom audio progress bar clicks
    const track = document.getElementById("audio-progress-bar-track");
    if (track) {
        track.addEventListener("click", seekAudio);
    }
    
    // Register Service Worker for PWA offline capability
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered successfully!', reg.scope))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }
});

function initAppSelectors() {
    audioPlayerElement = document.getElementById("survey-audio-element");
    playPauseBtn = document.getElementById("audio-play-pause-btn");
    audioProgressBarFill = document.getElementById("audio-progress-bar-fill");
    audioTimeCurrent = document.getElementById("audio-time-current");
    audioTimeDuration = document.getElementById("audio-time-duration");
    
    // Synchronize HTML audio elements with custom controls
    if (audioPlayerElement) {
        audioPlayerElement.addEventListener("timeupdate", updateAudioProgress);
        audioPlayerElement.addEventListener("durationchange", () => {
            if (audioTimeDuration && audioPlayerElement.duration) {
                audioTimeDuration.textContent = formatAudioTime(audioPlayerElement.duration);
            }
        });
        audioPlayerElement.addEventListener("ended", () => {
            setAudioPlayState(false);
        });
    }
}

// --- INDEXEDDB STORAGE SYSTEM ---
function initIndexedDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
        console.error("IndexedDB Error:", event);
        // Fallback to LocalStorage if IndexedDB fails
        loadFromLocalStorageFallback();
        updateDashboard();
    };
    
    request.onsuccess = (event) => {
        localDb = event.target.result;
        loadAllSurveys();
        checkStoredAudioFiles();
    };
    
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create surveys store
        if (!db.objectStoreNames.contains("surveys")) {
            db.createObjectStore("surveys", { keyPath: "id" });
        }
        
        // Create audio files store for persistent offline mp3 storage
        if (!db.objectStoreNames.contains("audio_files")) {
            db.createObjectStore("audio_files", { keyPath: "group" });
        }
    };
}

function loadAllSurveys() {
    if (!localDb) {
        loadFromLocalStorageFallback();
        return;
    }
    
    const transaction = localDb.transaction(["surveys"], "readonly");
    const store = transaction.objectStore("surveys");
    const request = store.getAll();
    
    request.onsuccess = () => {
        collectedResponses = request.result;
        // Sort by timestamp descending
        collectedResponses.sort((a, b) => new Date(b.rawTimestamp) - new Date(a.rawTimestamp));
        updateDashboard();
        renderDataTable();
    };
    
    request.onerror = () => {
        loadFromLocalStorageFallback();
    };
}

function saveSurveyToDb(surveyData) {
    if (!localDb) {
        // LocalStorage fallback
        collectedResponses.unshift(surveyData);
        localStorage.setItem("surveys_data", JSON.stringify(collectedResponses));
        updateDashboard();
        renderDataTable();
        return;
    }
    
    const transaction = localDb.transaction(["surveys"], "readwrite");
    const store = transaction.objectStore("surveys");
    const request = store.put(surveyData);
    
    request.onsuccess = () => {
        loadAllSurveys();
    };
    
    request.onerror = (e) => {
        console.error("Error saving survey:", e);
    };
}

function deleteSurveyFromDb(id) {
    if (!localDb) {
        collectedResponses = collectedResponses.filter(s => s.id !== id);
        localStorage.setItem("surveys_data", JSON.stringify(collectedResponses));
        updateDashboard();
        renderDataTable();
        return;
    }
    
    const transaction = localDb.transaction(["surveys"], "readwrite");
    const store = transaction.objectStore("surveys");
    const request = store.delete(id);
    
    request.onsuccess = () => {
        loadAllSurveys();
    };
}

function clearAllSurveysFromDb() {
    if (!localDb) {
        collectedResponses = [];
        localStorage.removeItem("surveys_data");
        updateDashboard();
        renderDataTable();
        return;
    }
    
    const transaction = localDb.transaction(["surveys"], "readwrite");
    const store = transaction.objectStore("surveys");
    const request = store.clear();
    
    request.onsuccess = () => {
        loadAllSurveys();
    };
}

// Fallbacks
function loadFromLocalStorageFallback() {
    const data = localStorage.getItem("surveys_data");
    collectedResponses = data ? JSON.parse(data) : [];
}

// --- THEME MANAGEMENT ---
function setupTheme() {
    const savedTheme = localStorage.getItem("app_theme") || "dark";
    setTheme(savedTheme);
    
    document.getElementById("theme-toggle").addEventListener("click", () => {
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
    });
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
    
    const sunIcon = document.getElementById("sun-icon");
    const moonIcon = document.getElementById("moon-icon");
    
    if (theme === "dark") {
        sunIcon.style.display = "none";
        moonIcon.style.display = "block";
    } else {
        sunIcon.style.display = "block";
        moonIcon.style.display = "none";
    }
}

// --- TAB ROUTING ---
function setupTabs() {
    const tabButtons = document.querySelectorAll(".nav-tab");
    const tabContents = document.querySelectorAll(".tab-content");
    
    tabButtons.forEach(button => {
        button.addEventListener("click", () => {
            const target = button.getAttribute("data-target");
            
            // Switch tabs
            tabButtons.forEach(btn => btn.classList.remove("active"));
            tabContents.forEach(content => content.classList.remove("active"));
            
            button.classList.add("active");
            document.getElementById(target).classList.add("active");
            
            currentTab = target;
            
            // Auto update dashboard if entering dashboard
            if (target === "tab-dashboard") {
                updateDashboard();
            } else if (target === "tab-data") {
                renderDataTable();
            }
        });
    });
}

function switchToSurveyTab() {
    document.getElementById("nav-survey").click();
}

// --- DOUBLE QUESTIONNAIRE LOGIC ---
function selectSurveyGroup(group) {
    currentSurveyGroup = group;
    
    // UI selections cards
    const cardA = document.getElementById("card-group-a");
    const cardB = document.getElementById("card-group-b");
    
    if (group === 'A') {
        cardA.classList.add("selected");
        cardB.classList.remove("selected");
        document.getElementById("recap-group-name").textContent = "Groupe A — Voix robotique locale";
        document.getElementById("recap-group-name").style.color = "var(--primary)";
        document.getElementById("player-stimulus-title").textContent = "Stimulus Groupe A — Voix robotique locale";
        document.getElementById("player-stimulus-badge").textContent = "Robotique locale";
        document.getElementById("player-stimulus-badge").style.borderColor = "var(--primary)";
        document.getElementById("player-stimulus-badge").style.color = "var(--primary)";
    } else {
        cardA.classList.remove("selected");
        cardB.classList.add("selected");
        document.getElementById("recap-group-name").textContent = "Groupe B — Voix humaine locale clonée";
        document.getElementById("recap-group-name").style.color = "var(--accent)";
        document.getElementById("player-stimulus-title").textContent = "Stimulus Groupe B — Voix humaine locale clonée";
        document.getElementById("player-stimulus-badge").textContent = "Humaine clonée";
        document.getElementById("player-stimulus-badge").style.borderColor = "var(--accent)";
        document.getElementById("player-stimulus-badge").style.color = "var(--accent)";
    }
    
    // Update the profile indicator badge
    const profileBadge = document.getElementById("profile-active-group-badge");
    if (profileBadge) {
        if (group === 'A') {
            profileBadge.textContent = "Groupe A — Voix robotique locale";
            profileBadge.style.color = "var(--primary)";
            profileBadge.parentElement.style.borderLeftColor = "var(--primary)";
        } else {
            profileBadge.textContent = "Groupe B — Voix humaine locale clonée";
            profileBadge.style.color = "var(--accent)";
            profileBadge.parentElement.style.borderLeftColor = "var(--accent)";
        }
    }
    
    // (Language question QF2 is static in HTML step 1 - no dynamic injection needed)
    
    // Re-populate Likert questions matching the group
    populateLikertQuestions();
    
    // Set audio source to the correct persistent audio file or simulated
    loadAudioStimulusForGroup(group);
    
    // Re-evaluate eligibility
    evaluateEligibility();
}

// Populate all 24 questions in step 4 with large touch emoji grids
function populateLikertQuestions() {
    const container = document.getElementById("likert-questions-container");
    if (!container) return;
    
    let html = '';
    let currentCategory = '';
    
    SURVEY_ITEMS.forEach((item, index) => {
        // Add Category dividers
        if (item.category !== currentCategory) {
            currentCategory = item.category;
            html += `<h3 style="margin: 24px 0 12px 0; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; color: var(--primary); font-size:1.1rem;">${currentCategory}</h3>`;
        }
        
        // Display the item text as-is
        let textToShow = item.text;
        
        html += `
            <div class="question-block" id="block-${item.code}">
                <div class="question-meta">${item.code}</div>
                <div class="question-text">${textToShow}</div>
                <div class="likert-grid">
                    ${Object.keys(LIKERT_LABELS).map(score => `
                        <label class="likert-option">
                            <input type="radio" name="likert_${item.code}" value="${score}" required>
                            <span class="likert-btn">
                                <span class="likert-emoji">${LIKERT_LABELS[score].emoji}</span>
                                <span class="likert-score">${score}</span>
                                <span class="likert-label">${LIKERT_LABELS[score].text}</span>
                            </span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// --- ELIGIBILITY SCREENING ---
function evaluateEligibility() {
    const qfAge = getSelectedRadioValue("qf_age");
    const qfLang = getSelectedRadioValue("qf_lang");
    const qfLecture = getSelectedRadioValue("qf_lecture");
    const qfResidence = getSelectedRadioValue("qf_residence");
    
    let isPass = true;
    
    // Screening Logic Check
    if (qfAge === "Non") isPass = false;
    
    // QF2: La question de langue est identique pour les deux groupes (Dioula Oui/Non)
    if (qfLang === "Non") isPass = false;
    
    if (qfLecture === "Lit bien") isPass = false;
    if (qfResidence === "Non") isPass = false;
    
    // Update eligibility state
    isEligible = isPass;
    
    const nextBtn = document.getElementById("survey-next-btn");
    const failBox = document.getElementById("filter-disqualified-box");
    
    // Hide/show other screening filters blocks when failing
    const blockLang = document.getElementById("block-qf-lang");
    const blockLect = document.getElementById("block-qf-lecture");
    const blockResi = document.getElementById("block-qf-residence");
    
    if (currentSurveyStep === 1) {
        if (!isEligible) {
            failBox.style.display = "flex";
            if (nextBtn) nextBtn.disabled = true;
            
            // Hide subsequent filters if previous filter already failed to make it clean
            if (qfAge === "Non") {
                blockLang.style.opacity = "0.3";
                blockLect.style.opacity = "0.3";
                blockResi.style.opacity = "0.3";
            } else if (qfLang === "Non" || qfLang === "Autre") {
                blockLang.style.opacity = "1";
                blockLect.style.opacity = "0.3";
                blockResi.style.opacity = "0.3";
            } else if (qfLecture === "Lit bien") {
                blockLang.style.opacity = "1";
                blockLect.style.opacity = "1";
                blockResi.style.opacity = "0.3";
            } else {
                blockLang.style.opacity = "1";
                blockLect.style.opacity = "1";
                blockResi.style.opacity = "1";
            }
        } else {
            failBox.style.display = "none";
            blockLang.style.opacity = "1";
            blockLect.style.opacity = "1";
            blockResi.style.opacity = "1";
            
            // Enable next button only if all screening questions are answered
            if (qfAge && qfLang && qfLecture && qfResidence) {
                if (nextBtn) nextBtn.disabled = false;
            } else {
                if (nextBtn) nextBtn.disabled = true;
            }
        }
    }
}

// --- SURVEY STEPPER NAVIGATION ---
function navSurveyStep(direction) {
    // Basic boundary checks
    if (direction === 1 && currentSurveyStep === 6) return;
    if (direction === -1 && currentSurveyStep === 1) return;
    
    // Pre-validation for switching steps
    if (direction === 1) {
        if (!validateStepCompletion(currentSurveyStep)) {
            // Trigger browser form validation or show standard visual shake
            shakeActiveStep();
            return;
        }
    }
    
    // Update step counter
    currentSurveyStep += direction;
    
    // Update Stepper UI view
    updateSurveyStepUI();
}

function validateStepCompletion(step) {
    const stepEl = document.querySelector(`.survey-step[data-step="${step}"]`);
    if (!stepEl) return true;
    
    // Standard HTML5 validation check for active inputs
    const requiredInputs = stepEl.querySelectorAll("[required]");
    let allValid = true;
    
    requiredInputs.forEach(input => {
        if (input.type === "radio") {
            // Check if radio group is checked
            const name = input.name;
            const checked = stepEl.querySelector(`input[name="${name}"]:checked`);
            if (!checked) {
                allValid = false;
            }
        } else if (!input.checkValidity()) {
            allValid = false;
        }
    });
    
    // Additional eligibility check for Step 1 (screening / Partie 0)
    if (step === 1 && !isEligible) {
        allValid = false;
    }
    
    return allValid;
}

function updateSurveyStepUI() {
    // Hide all steps, show active
    const steps = document.querySelectorAll(".survey-step");
    steps.forEach(step => {
        step.classList.remove("active");
        if (parseInt(step.getAttribute("data-step")) === currentSurveyStep) {
            step.classList.add("active");
        }
    });
    
    // Update step dots
    const dots = document.querySelectorAll("#survey-stepper .step-dot");
    dots.forEach((dot, index) => {
        dot.classList.remove("active", "completed");
        const dotStep = index + 1;
        if (dotStep === currentSurveyStep) {
            dot.classList.add("active");
        } else if (dotStep < currentSurveyStep) {
            dot.classList.add("completed");
        }
    });
    
    // Update titles and text
    const title = document.getElementById("survey-step-title");
    const subtitle = document.getElementById("survey-step-subtitle");
    
    const stepDetails = {
        1: { title: "Partie 0 : Questions filtres d'éligibilité", sub: "Étape 1 sur 6" },
        2: { title: "Sélection du Groupe", sub: "Étape 2 sur 6" },
        3: { title: "Partie 1 : Diffusion du stimulus vocal", sub: "Étape 3 sur 6" },
        4: { title: "Parties 2-4 : Évaluation des items", sub: "Étape 4 sur 6" },
        5: { title: "Partie 5 : Profil sociodémographique", sub: "Étape 5 sur 6" },
        6: { title: "Validation & Enregistrement", sub: "Étape 6 sur 6" }
    };
    
    if (title && subtitle) {
        title.textContent = stepDetails[currentSurveyStep].title;
        subtitle.textContent = stepDetails[currentSurveyStep].sub;
    }
    
    // Manage footer buttons states
    const prevBtn = document.getElementById("survey-prev-btn");
    const nextBtn = document.getElementById("survey-next-btn");
    
    if (prevBtn && nextBtn) {
        prevBtn.disabled = currentSurveyStep === 1;
        
        if (currentSurveyStep === 6) {
            nextBtn.textContent = "Sauvegarder l'enquête";
            nextBtn.classList.remove("btn-primary");
            nextBtn.classList.add("btn-success");
            nextBtn.disabled = false;
        } else {
            nextBtn.textContent = "Continuer";
            nextBtn.classList.remove("btn-success");
            nextBtn.classList.add("btn-primary");
            
            // Re-evaluate eligibility for step 1 button blocking
            if (currentSurveyStep === 1) {
                evaluateEligibility();
            } else {
                nextBtn.disabled = false;
            }
        }
    }
    
    // Stop audio when leaving step 3
    if (currentSurveyStep !== 3) {
        setAudioPlayState(false);
    }
    
    // Update step 6 recap data in real time
    if (currentSurveyStep === 6) {
        populateSurveyRecap();
    }
}

function populateSurveyRecap() {
    const groupName = currentSurveyGroup === 'A' ? "Groupe A — Voix robotique locale" : "Groupe B — Voix humaine locale clonée";
    document.getElementById("recap-group-name").textContent = groupName;
    document.getElementById("recap-group-name").style.color = currentSurveyGroup === 'A' ? "var(--primary)" : "var(--accent)";
    
    // Check completed Likert questions
    let checkedCount = 0;
    SURVEY_ITEMS.forEach(item => {
        if (document.querySelector(`input[name="likert_${item.code}"]:checked`)) {
            checkedCount++;
        }
    });
    
    const countEl = document.getElementById("recap-likert-completed");
    countEl.textContent = `${checkedCount} / ${SURVEY_ITEMS.length} items`;
    countEl.style.color = checkedCount === SURVEY_ITEMS.length ? "var(--success)" : "var(--danger)";
    
    // Profile completeness check
    const requiredProfile = ["profile_sexe", "profile_age", "profile_job", "profile_mobile", "profile_online_buy", "profile_online_pay"];
    let profileFilled = true;
    requiredProfile.forEach(name => {
        if (!document.querySelector(`input[name="${name}"]:checked`)) {
            profileFilled = false;
        }
    });
    
    const profEl = document.getElementById("recap-profile-completed");
    if (profileFilled) {
        profEl.textContent = "Complet ✓";
        profEl.style.color = "var(--success)";
    } else {
        profEl.textContent = "Incomplet ⚠️";
        profEl.style.color = "var(--warning)";
    }
}

// Shake action step on missing fields
// Dynamic floating toast notification
function showToast(message, type = "error") {
    // Remove existing toast if any
    const existing = document.getElementById("app-toast");
    if (existing) {
        existing.remove();
    }
    
    const toast = document.createElement("div");
    toast.id = "app-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "80px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = type === "error" ? "var(--danger)" : "var(--success)";
    toast.style.color = "white";
    toast.style.padding = "12px 24px";
    toast.style.borderRadius = "30px";
    toast.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
    toast.style.zIndex = "3000";
    toast.style.fontSize = "0.9rem";
    toast.style.fontWeight = "700";
    toast.style.textAlign = "center";
    toast.style.minWidth = "280px";
    toast.style.transition = "opacity 0.2s ease";
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Auto-remove
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => {
            toast.remove();
        }, 200);
    }, 3000);
}

function shakeActiveStep() {
    const stepEl = document.querySelector(`.survey-step[data-step="${currentSurveyStep}"]`);
    if (stepEl) {
        stepEl.style.animation = "none";
        // Force reflow
        void stepEl.offsetWidth;
        stepEl.style.animation = "shake 0.4s cubic-bezier(.36,.07,.19,.97) both";
        
        // Find missing required question block and add highlight
        const required = stepEl.querySelectorAll("[required]");
        let firstMissingBlock = null;
        
        required.forEach(input => {
            const block = input.closest(".question-block");
            if (block) {
                // Check if answered
                const isRadio = input.type === "radio";
                const isAnswered = isRadio ? stepEl.querySelector(`input[name="${input.name}"]:checked`) : input.value;
                if (!isAnswered) {
                    block.style.borderColor = "var(--danger)";
                    block.style.boxShadow = "0 0 8px var(--danger-glow)";
                    
                    if (!firstMissingBlock) {
                        firstMissingBlock = block;
                    }
                    
                    setTimeout(() => {
                        block.style.borderColor = "var(--border-color)";
                        block.style.boxShadow = "none";
                    }, 3000);
                }
            }
        });
        
        if (firstMissingBlock) {
            // Scroll first missing block into view smoothly
            firstMissingBlock.scrollIntoView({ behavior: "smooth", block: "center" });
            
            // Show premium feedback alert
            showToast("Veuillez répondre à toutes les questions en rouge.");
        }
    }
}

// Add custom shake keyframe to style tag dynamically
const style = document.createElement('style');
style.innerHTML = `
@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
`;
document.head.appendChild(style);

// --- SUBMIT AND SAVE DATA ---
function saveActiveSurvey() {
    if (!validateStepCompletion(5) || !validateStepCompletion(4)) {
        alert("Certaines parties sont incomplètes. Veuillez vérifier toutes les sections.");
        return;
    }
    
    const now = new Date();
    const formattedDate = formatDate(now);
    const surveyId = "ENQ-" + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + "-" + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0') + "-" + Math.floor(100 + Math.random() * 900);
    
    // Build JSON survey object
    const surveyData = {
        id: surveyId,
        rawTimestamp: now.toISOString(),
        timestamp: formattedDate,
        group: currentSurveyGroup,
        eligibility: "ADMISSIBLE",
        screening: {
            age: getSelectedRadioValue("qf_age"),
            langue: getSelectedRadioValue("qf_lang"),
            lecture: getSelectedRadioValue("qf_lecture"),
            residence: getSelectedRadioValue("qf_residence")
        },
        answers: {},
        profile: {
            sexe: getSelectedRadioValue("profile_sexe"),
            age: getSelectedRadioValue("profile_age"),
            job: getSelectedRadioValue("profile_job"),
            mobile: getSelectedRadioValue("profile_mobile"),
            online_buy: getSelectedRadioValue("profile_online_buy"),
            online_pay: getSelectedRadioValue("profile_online_pay")
        }
    };
    
    // Collect all Likert responses
    SURVEY_ITEMS.forEach(item => {
        surveyData.answers[item.code] = parseInt(getSelectedRadioValue(`likert_${item.code}`));
    });
    
    // Save to IndexedDB
    saveSurveyToDb(surveyData);
    
    // Reset Form & Switch to dashboard with clean alerts
    alert("Enquête enregistrée avec succès localement !");
    resetSurveyForm();
    document.getElementById("nav-dashboard").click();
}

function saveDisqualifiedSurvey() {
    const now = new Date();
    const formattedDate = formatDate(now);
    const surveyId = "EXCL-" + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + "-" + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0') + "-" + Math.floor(100 + Math.random() * 900);
    
    const surveyData = {
        id: surveyId,
        rawTimestamp: now.toISOString(),
        timestamp: formattedDate,
        group: currentSurveyGroup,
        eligibility: "REJETE",
        screening: {
            age: getSelectedRadioValue("qf_age") || "Non spécifié",
            langue: getSelectedRadioValue("qf_lang") || "Non spécifié",
            lecture: getSelectedRadioValue("qf_lecture") || "Non spécifié",
            residence: getSelectedRadioValue("qf_residence") || "Non spécifié"
        },
        answers: {},
        profile: {
            sexe: "N/A",
            age: "N/A",
            job: "N/A",
            mobile: "N/A",
            online_buy: "N/A",
            online_pay: "N/A"
        }
    };
    
    saveSurveyToDb(surveyData);
    
    alert("Exclusion enregistrée avec succès. Merci d'avoir répertorié le filtrage !");
    resetSurveyForm();
    document.getElementById("nav-dashboard").click();
}

function resetSurveyForm() {
    document.getElementById("survey-form").reset();
    currentSurveyStep = 1;
    isEligible = true;
    updateSurveyStepUI();
    
    // Specific cleanup
    const failBox = document.getElementById("filter-disqualified-box");
    if (failBox) failBox.style.display = "none";
}

// Intercept standard next action if step 6 (save)
window.navSurveyStep = navSurveyStep;
function handleNextBtnClick() {
    if (currentSurveyStep === 6) {
        saveActiveSurvey();
    } else {
        navSurveyStep(1);
    }
}
document.getElementById("survey-next-btn").onclick = handleNextBtnClick;

// --- DYNAMIC AUDIO stimulus PLAYER (PWA OFFLINE COMPATIBLE) ---

// Check if IndexedDB has custom audio files and update status text
function checkStoredAudioFiles() {
    if (!localDb) return;
    
    const transaction = localDb.transaction(["audio_files"], "readonly");
    const store = transaction.objectStore("audio_files");
    
    const requestA = store.get("A");
    requestA.onsuccess = () => {
        const el = document.getElementById("audio-status-a");
        if (requestA.result) {
            el.textContent = "Chargé hors-ligne ✓";
            el.classList.add("loaded");
        } else {
            el.textContent = "Non chargé (simulé)";
            el.classList.remove("loaded");
        }
    };
    
    const requestB = store.get("B");
    requestB.onsuccess = () => {
        const el = document.getElementById("audio-status-b");
        if (requestB.result) {
            el.textContent = "Chargé hors-ligne ✓";
            el.classList.add("loaded");
        } else {
            el.textContent = "Non chargé (simulé)";
            el.classList.remove("loaded");
        }
    };
}

// Persist uploaded audio in IndexedDB as a Blob
function persistAudioFile(group, event) {
    const file = event.target.files[0];
    if (!file || !localDb) return;
    
    const transaction = localDb.transaction(["audio_files"], "readwrite");
    const store = transaction.objectStore("audio_files");
    
    const record = {
        group: group,
        filename: file.name,
        type: file.type,
        data: file // Store Blob directly
    };
    
    const request = store.put(record);
    request.onsuccess = () => {
        alert(`Fichier audio pour le Groupe ${group} enregistré hors-ligne de façon permanente !`);
        checkStoredAudioFiles();
        loadAudioStimulusForGroup(currentSurveyGroup);
    };
    
    request.onerror = (e) => {
        console.error("Audio persistence error:", e);
    };
}

// Load audio into audio element (Blob URL or virtual placeholder)
function loadAudioStimulusForGroup(group) {
    setAudioPlayState(false);
    
    if (!localDb) {
        setupSimulatedAudioPlayer();
        return;
    }
    
    const transaction = localDb.transaction(["audio_files"], "readonly");
    const store = transaction.objectStore("audio_files");
    const request = store.get(group);
    
    request.onsuccess = () => {
        const record = request.result;
        if (record && record.data) {
            // Revoke old URL if existing
            if (audioPlayerElement.src && audioPlayerElement.src.startsWith("blob:")) {
                URL.revokeObjectURL(audioPlayerElement.src);
            }
            
            const fileUrl = URL.createObjectURL(record.data);
            audioPlayerElement.src = fileUrl;
            audioPlayerElement.load();
            isCustomAudioLoaded = true;
            
            if (audioTimeDuration) {
                audioTimeDuration.textContent = "--:--"; // Loaded dynamically
            }
        } else {
            setupSimulatedAudioPlayer();
        }
    };
    
    request.onerror = () => {
        setupSimulatedAudioPlayer();
    };
}

function setupSimulatedAudioPlayer() {
    isCustomAudioLoaded = false;
    if (audioPlayerElement) {
        audioPlayerElement.src = "";
    }
    simulatedAudioProgress = 0;
    if (audioProgressBarFill) audioProgressBarFill.style.width = "0%";
    if (audioTimeCurrent) audioTimeCurrent.textContent = "0:00";
    if (audioTimeDuration) audioTimeDuration.textContent = formatAudioTime(simulatedAudioDuration);
}

function handleCustomAudioUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Revoke old URL if existing
    if (audioPlayerElement.src && audioPlayerElement.src.startsWith("blob:")) {
        URL.revokeObjectURL(audioPlayerElement.src);
    }
    
    const fileUrl = URL.createObjectURL(file);
    audioPlayerElement.src = fileUrl;
    audioPlayerElement.load();
    isCustomAudioLoaded = true;
    
    alert("Audio temporaire chargé ! (Pour le conserver hors-ligne, utilisez l'onglet Aide & Paramètres)");
}

function toggleAudioPlayback() {
    if (isCustomAudioLoaded && audioPlayerElement && audioPlayerElement.src !== "") {
        // Native HTML5 playing
        if (audioPlayerElement.paused) {
            audioPlayerElement.play()
                .then(() => setAudioPlayState(true))
                .catch(err => {
                    console.error("Playback error:", err);
                    runSimulatedPlayback();
                });
        } else {
            audioPlayerElement.pause();
            setAudioPlayState(false);
        }
    } else {
        // Simulate Playback
        runSimulatedPlayback();
    }
}

function runSimulatedPlayback() {
    if (isAudioPlaying) {
        // Pause simulation
        clearInterval(audioPlaybackTimer);
        setAudioPlayState(false);
    } else {
        // Play simulation
        setAudioPlayState(true);
        audioPlaybackTimer = setInterval(() => {
            simulatedAudioProgress += 0.25; // 4 updates per sec
            if (simulatedAudioProgress >= simulatedAudioDuration) {
                simulatedAudioProgress = simulatedAudioDuration;
                clearInterval(audioPlaybackTimer);
                setAudioPlayState(false);
            }
            
            // Update UI
            const pct = (simulatedAudioProgress / simulatedAudioDuration) * 100;
            if (audioProgressBarFill) audioProgressBarFill.style.width = `${pct}%`;
            if (audioTimeCurrent) audioTimeCurrent.textContent = formatAudioTime(simulatedAudioProgress);
        }, 250);
    }
}

function setAudioPlayState(playing) {
    isAudioPlaying = playing;
    const playIcon = document.getElementById("audio-play-icon");
    const pauseIcon = document.getElementById("audio-pause-icon");
    
    if (playing) {
        playIcon.style.display = "none";
        pauseIcon.style.display = "block";
    } else {
        playIcon.style.display = "block";
        pauseIcon.style.display = "none";
        clearInterval(audioPlaybackTimer);
    }
}

function updateAudioProgress() {
    if (isCustomAudioLoaded && audioPlayerElement && audioPlayerElement.duration) {
        const pct = (audioPlayerElement.currentTime / audioPlayerElement.duration) * 100;
        if (audioProgressBarFill) audioProgressBarFill.style.width = `${pct}%`;
        if (audioTimeCurrent) audioTimeCurrent.textContent = formatAudioTime(audioPlayerElement.currentTime);
        if (audioTimeDuration) audioTimeDuration.textContent = formatAudioTime(audioPlayerElement.duration);
    }
}

function seekAudio(event) {
    const track = document.getElementById("audio-progress-bar-track");
    if (!track) return;
    
    const clickX = event.offsetX;
    const width = track.offsetWidth;
    const pct = clickX / width;
    
    if (isCustomAudioLoaded && audioPlayerElement && audioPlayerElement.duration) {
        audioPlayerElement.currentTime = pct * audioPlayerElement.duration;
    } else {
        // Seek simulated
        simulatedAudioProgress = pct * simulatedAudioDuration;
        if (audioProgressBarFill) audioProgressBarFill.style.width = `${pct * 100}%`;
        if (audioTimeCurrent) audioTimeCurrent.textContent = formatAudioTime(simulatedAudioProgress);
    }
}

// --- TABLEAU DE BORD (STATS & CHARTS INLINE SVG) ---
function updateDashboard() {
    const totalCount = collectedResponses.length;
    const admissible = collectedResponses.filter(s => s.eligibility === "ADMISSIBLE");
    const rejectedCount = totalCount - admissible.length;
    
    // Set text totals
    document.getElementById("stat-total-count").textContent = totalCount;
    document.getElementById("stat-a-count").textContent = collectedResponses.filter(s => s.group === "A").length;
    document.getElementById("stat-b-count").textContent = collectedResponses.filter(s => s.group === "B").length;
    
    const completionPctEl = document.getElementById("stat-completion-pct");
    if (totalCount > 0) {
        const pct = Math.round((admissible.length / totalCount) * 100);
        completionPctEl.textContent = `${pct}% admissibles (${rejectedCount} rejets)`;
    } else {
        completionPctEl.textContent = "Aucune enquête menée";
    }
    
    // Draw SVG Gender Chart (Donut)
    drawGenderDonutChart(admissible);
    
    // Draw Age Distribution Bars
    drawAgeBarChart(admissible);
}

function drawGenderDonutChart(data) {
    const circleM = document.getElementById("circle-masculin");
    const circleF = document.getElementById("circle-feminin");
    const centerText = document.getElementById("gender-center-text");
    
    if (!circleM || !circleF || !centerText) return;
    
    const males = data.filter(s => s.profile.sexe === "Masculin").length;
    const females = data.filter(s => s.profile.sexe === "Féminin").length;
    const total = males + females;
    
    const r = 40;
    const c = 2 * Math.PI * r; // ~251.2
    
    if (total === 0) {
        // Draw uniform default grey/inactive circle
        circleM.style.strokeDasharray = `${c}`;
        circleM.style.strokeDashoffset = `${c}`; // Full gap (hidden)
        circleF.style.strokeDasharray = `${c}`;
        circleF.style.strokeDashoffset = `${c}`; // Full gap (hidden)
        centerText.textContent = "0 Enq.";
        return;
    }
    
    const malePct = males / total;
    const femalePct = females / total;
    
    // Set dash lengths
    const maleLength = malePct * c;
    const femaleLength = femalePct * c;
    
    // Masculin circle settings
    circleM.style.strokeDasharray = `${c}`;
    circleM.style.strokeDashoffset = 0; // Starts from 12 o'clock (due to svg transform rotate -90)
    
    // Feminin circle settings (start it where masculin ends)
    circleF.style.strokeDasharray = `${c}`;
    circleF.style.strokeDashoffset = -maleLength; // Shift counter-clockwise by male length
    
    centerText.textContent = `${Math.round(femalePct * 100)}% F`;
}

function drawAgeBarChart(data) {
    const total = data.length;
    
    const ageGroups = {
        "Moins de 25 ans": 0,
        "25–40 ans": 0,
        "Plus de 40 ans": 0
    };
    
    data.forEach(s => {
        if (ageGroups[s.profile.age] !== undefined) {
            ageGroups[s.profile.age]++;
        }
    });
    
    // Update widths of progress bars
    const age1 = ageGroups["Moins de 25 ans"];
    const age2 = ageGroups["25–40 ans"];
    const age3 = ageGroups["Plus de 40 ans"];
    
    const pct1 = total > 0 ? Math.round((age1 / total) * 100) : 0;
    const pct2 = total > 0 ? Math.round((age2 / total) * 100) : 0;
    const pct3 = total > 0 ? Math.round((age3 / total) * 100) : 0;
    
    document.getElementById("age-val-1").textContent = `${pct1}% (${age1})`;
    document.getElementById("age-fill-1").style.width = `${pct1}%`;
    
    document.getElementById("age-val-2").textContent = `${pct2}% (${age2})`;
    document.getElementById("age-fill-2").style.width = `${pct2}%`;
    
    document.getElementById("age-val-3").textContent = `${pct3}% (${age3})`;
    document.getElementById("age-fill-3").style.width = `${pct3}%`;
}

// --- DATA LIST AND MANAGER RENDERING ---
function renderDataTable() {
    const tbody = document.getElementById("responses-table-body");
    const emptyState = document.getElementById("responses-empty-state");
    const table = document.getElementById("responses-table");
    
    if (!tbody || !emptyState || !table) return;
    
    const searchVal = document.getElementById("data-search-input").value.toLowerCase();
    const groupFilter = document.getElementById("data-filter-group").value;
    const statusFilter = document.getElementById("data-filter-status").value;
    
    // Apply filters
    const filtered = collectedResponses.filter(s => {
        const matchesSearch = s.id.toLowerCase().includes(searchVal);
        const matchesGroup = groupFilter === "ALL" || s.group === groupFilter;
        const matchesStatus = statusFilter === "ALL" || s.eligibility === statusFilter;
        return matchesSearch && matchesGroup && matchesStatus;
    });
    
    // Toggle Empty State view
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        table.style.display = "none";
        emptyState.style.display = "flex";
        return;
    }
    
    table.style.display = "table";
    emptyState.style.display = "none";
    
    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td style="font-weight: 700;">${item.id}</td>
            <td>${item.timestamp}</td>
            <td>
                <span class="status-pill" style="background: ${item.group === 'A' ? 'rgba(99,102,241,0.15); color:var(--primary);' : 'rgba(139,92,246,0.15); color:var(--accent);'}; border:none;">
                    Groupe ${item.group}
                </span>
            </td>
            <td>
                <span class="status-pill ${item.eligibility === 'ADMISSIBLE' ? 'success' : 'fail'}">
                    ${item.eligibility === 'ADMISSIBLE' ? 'Admissible' : 'Rejeté'}
                </span>
            </td>
            <td>${item.profile.sexe}</td>
            <td>${item.profile.age}</td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="icon-btn" style="width:28px; height:28px; padding:2px;" onclick="viewSurveyDetail('${item.id}')" title="Voir détails">
                        <svg viewBox="0 0 24 24" style="width:16px; height:16px;"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                    </button>
                    <button class="icon-btn" style="width:28px; height:28px; padding:2px; color:var(--danger); border-color:rgba(244,63,94,0.15);" onclick="deleteSurvey('${item.id}')" title="Supprimer">
                        <svg viewBox="0 0 24 24" style="width:16px; height:16px;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Delete item
function deleteSurvey(id) {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette enquête ? Cette action est irréversible.")) {
        deleteSurveyFromDb(id);
    }
}

function confirmResetDatabase() {
    if (confirm("ATTENTION ! Vous allez supprimer toutes les enquêtes stockées sur cet appareil. Voulez-vous continuer ?")) {
        if (confirm("Pour des raisons de sécurité, veuillez confirmer une deuxième fois. Supprimer définitivement toutes les données ?")) {
            clearAllSurveysFromDb();
        }
    }
}

// --- DETAIL MODAL LOGIC ---
function viewSurveyDetail(id) {
    const survey = collectedResponses.find(s => s.id === id);
    if (!survey) return;
    
    document.getElementById("modal-response-id").textContent = `Détail : ${survey.id}`;
    
    const body = document.getElementById("modal-details-body");
    
    // Screening detail HTML
    let screeningHtml = `
        <div class="detail-grid">
            <div class="detail-item"><span class="detail-key">Âge >= 18 :</span><span class="detail-val">${survey.screening.age}</span></div>
            <div class="detail-item"><span class="detail-key">Langue / Compréhension :</span><span class="detail-val">${survey.screening.langue}</span></div>
            <div class="detail-item"><span class="detail-key">Niveau Lecture :</span><span class="detail-val">${survey.screening.lecture}</span></div>
            <div class="detail-item"><span class="detail-key">Résidence Bouaké :</span><span class="detail-val">${survey.screening.residence}</span></div>
        </div>
    `;
    
    // Demographics detail HTML
    let profileHtml = `
        <div class="detail-grid">
            <div class="detail-item"><span class="detail-key">Sexe :</span><span class="detail-val">${survey.profile.sexe}</span></div>
            <div class="detail-item"><span class="detail-key">Âge :</span><span class="detail-val">${survey.profile.age}</span></div>
            <div class="detail-item"><span class="detail-key">Profession :</span><span class="detail-val">${survey.profile.job}</span></div>
            <div class="detail-item"><span class="detail-key">Téléphone mobile :</span><span class="detail-val">${survey.profile.mobile}</span></div>
            <div class="detail-item"><span class="detail-key">Achat en ligne :</span><span class="detail-val">${survey.profile.online_buy}</span></div>
            <div class="detail-item"><span class="detail-key">Paiement en ligne :</span><span class="detail-val">${survey.profile.online_pay}</span></div>
        </div>
    `;
    
    // Likert responses detail HTML
    let answersHtml = '';
    if (survey.eligibility === "REJETE") {
        answersHtml = `<p style="color:var(--text-secondary); font-style:italic;">Aucune réponse Likert enregistrée (Disqualifié au filtrage préliminaire).</p>`;
    } else {
        answersHtml = `
            <div style="display:flex; flex-direction:column; gap:6px; max-height: 250px; overflow-y:auto; padding-right:4px;">
                ${SURVEY_ITEMS.map(item => {
                    const val = survey.answers[item.code] || "N/A";
                    const itemData = LIKERT_LABELS[val] || { emoji: "❓", text: "Inconnu" };
                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-primary); padding:6px 10px; border-radius:4px; font-size:0.8rem;">
                            <span style="font-weight:700; color:var(--primary); min-width:48px;">${item.code}</span>
                            <span style="flex-grow:1; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; padding: 0 10px;" title="${item.text}">
                                ${item.text}
                            </span>
                            <span style="font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:4px;">
                                ${itemData.emoji} <span style="font-size:0.75rem;">(${val})</span>
                            </span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    body.innerHTML = `
        <div class="detail-section">
            <div class="detail-section-title">Informations Générales</div>
            <div class="detail-grid" style="margin-bottom: 10px;">
                <div class="detail-item"><span class="detail-key">Date d'enregistrement :</span><span class="detail-val">${survey.timestamp}</span></div>
                <div class="detail-item"><span class="detail-key">Groupe Stimulus :</span><span class="detail-val" style="color:${survey.group === 'A' ? 'var(--primary)' : 'var(--accent)'}">Groupe ${survey.group}</span></div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Filtrage (Note préliminaire)</div>
            ${screeningHtml}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Profil du répondant</div>
            ${profileHtml}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">Réponses Likert (Échelle 1-5)</div>
            ${answersHtml}
        </div>
    `;
    
    document.getElementById("detail-modal").classList.add("active");
}

function closeDetailModal() {
    document.getElementById("detail-modal").classList.remove("active");
}

// --- CSV EXPORTER (EXCEL & SPSS COMPATIBLE WITH BOM) ---
// --- CSV EXPORTER (EXCEL & SPSS COMPATIBLE WITH BOM) ---
function generateCSV(responses, groupSuffix) {
    // Sort responses chronologically within the group/selection
    const sortedResponses = [...responses].sort((a, b) => {
        return new Date(a.rawTimestamp) - new Date(b.rawTimestamp);
    });
    
    // Coding dictionary for respondent profiles based on official questionnaires
    const PROFILE_CODES = {
        sexe: { "Masculin": 1, "Féminin": 2 },
        age: { "Moins de 25 ans": 1, "25–40 ans": 2, "Plus de 40 ans": 3 },
        job: { "Sans emploi": 1, "Commerçant(e)": 2, "Artisan(e)": 3, "Ouvrier/ière": 4, "Autre": 5 },
        mobile: { "Oui": 1, "Non": 2 },
        online_buy: { "Oui": 1, "Non": 2 },
        online_pay: { "Oui": 1, "Non": 2 }
    };

    // Assemble headers row exactly matching academic matrix format
    const headers = [
        "ID",
        // Likert answers (PDLV1-4, DP1-7, IA1-3)
        ...SURVEY_ITEMS.map(item => item.code),
        // Grouping variable (1 = Groupe A, 2 = Groupe B)
        "GROUPE",
        "GROUPE_DE_REPONDANTS",
        // Profile numeric codes (Partie 5)
        "SEXE",
        "AGE",
        "SITUATION_PROFESSIONNELLE",
        "TELEPHONE_MOBILE",
        "ACHAT_EN_LIGNE",
        "PAIEMENT_EN_LIGNE",
        // Metadata / Quality assurance
        "ID_UNIQUE_ENQUETE",
        "DATE_HEURE",
        "ADMISSIBILITE",
        "FILTRE_AGE",
        "FILTRE_LANGUE",
        "FILTRE_LECTURE",
        "FILTRE_RESIDENCE"
    ];
    
    // Map responses to rows
    const rows = sortedResponses.map((s, index) => {
        return [
            index + 1, // Sequential ID (1, 2, 3...)
            // Likert scores or empty if rejected
            ...SURVEY_ITEMS.map(item => s.answers[item.code] !== undefined ? s.answers[item.code] : ""),
            // Group (1 = A, 2 = B)
            s.group === "A" ? 1 : 2,
            s.group === "A" ? "Groupe A — Voix robotique locale" : "Groupe B — Voix humaine locale clonée",
            // Profile data mapped to academic codes (1, 2, 3...)
            PROFILE_CODES.sexe[s.profile.sexe] !== undefined ? PROFILE_CODES.sexe[s.profile.sexe] : "",
            PROFILE_CODES.age[s.profile.age] !== undefined ? PROFILE_CODES.age[s.profile.age] : "",
            PROFILE_CODES.job[s.profile.job] !== undefined ? PROFILE_CODES.job[s.profile.job] : "",
            PROFILE_CODES.mobile[s.profile.mobile] !== undefined ? PROFILE_CODES.mobile[s.profile.mobile] : "",
            PROFILE_CODES.online_buy[s.profile.online_buy] !== undefined ? PROFILE_CODES.online_buy[s.profile.online_buy] : "",
            PROFILE_CODES.online_pay[s.profile.online_pay] !== undefined ? PROFILE_CODES.online_pay[s.profile.online_pay] : "",
            // UUID and metadata
            s.id,
            s.timestamp,
            s.eligibility,
            s.screening.age,
            s.screening.langue,
            s.screening.lecture,
            s.screening.residence
        ];
    });
    
    // Convert arrays of values to CSV format (semicolon separator is highly preferred for French Excel locales!)
    // But double quote values to prevent issues
    const csvContent = [
        headers.map(h => `"${h}"`).join(";"),
        ...rows.map(row => row.map(val => {
            // Escape double quotes inside values if any
            const strVal = String(val === null || val === undefined ? "" : val);
            return `"${strVal.replace(/"/g, '""')}"`;
        }).join(";"))
    ].join("\n");
    
    // Prepend the UTF-8 Byte Order Mark (BOM) for Excel compatibility
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    // Trigger download in browser
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const now = new Date();
    const groupStr = groupSuffix === "A" ? "GROUPE_A" : (groupSuffix === "B" ? "GROUPE_B" : "TOUS_GROUPES");
    const filename = `ENQUETES_BOUAKE_${groupStr}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.csv`;
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportDataToCSV() {
    if (collectedResponses.length === 0) {
        alert("Aucune donnée à exporter.");
        return;
    }
    
    const groupFilter = document.getElementById("data-filter-group").value;
    const statusFilter = document.getElementById("data-filter-status").value;
    const searchVal = document.getElementById("data-search-input").value.toLowerCase();
    
    // Filter responses based on UI filters
    const filteredResponses = collectedResponses.filter(s => {
        const matchesSearch = s.id.toLowerCase().includes(searchVal);
        const matchesGroup = groupFilter === "ALL" || s.group === groupFilter;
        const matchesStatus = statusFilter === "ALL" || s.eligibility === statusFilter;
        return matchesSearch && matchesGroup && matchesStatus;
    });
    
    if (filteredResponses.length === 0) {
        alert("Aucune donnée ne correspond aux filtres actifs pour l'exportation.");
        return;
    }
    
    if (groupFilter === "ALL") {
        const responsesA = filteredResponses.filter(s => s.group === "A");
        const responsesB = filteredResponses.filter(s => s.group === "B");
        
        let exportedGroups = [];
        if (responsesA.length > 0) {
            generateCSV(responsesA, "A");
            exportedGroups.push("Groupe A — Voix robotique locale");
        }
        if (responsesB.length > 0) {
            // Slight delay so the browser can queue both downloads properly
            setTimeout(() => {
                generateCSV(responsesB, "B");
            }, 500);
            exportedGroups.push("Groupe B (Voix Humaine Clonée)");
        }
        
        if (exportedGroups.length > 0) {
            alert(`Exportation réussie par groupe !\nFichiers CSV générés pour : ${exportedGroups.join(' et ')}.\n\nCes fichiers s'ouvrent directement dans Microsoft Excel.`);
        } else {
            alert("Aucune donnée à exporter pour les groupes A ou B.");
        }
    } else {
        generateCSV(filteredResponses, groupFilter);
        const groupLabel = groupFilter === "A" ? "Groupe A — Voix robotique locale" : "Groupe B — Voix humaine locale clonée";
        alert(`Exportation réussie pour le ${groupLabel} !\nLe fichier CSV a été généré.\n\nIl s'ouvre directement dans Microsoft Excel.`);
    }
}

// --- UTILITIES ---
function getSelectedRadioValue(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
}

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function formatAudioTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}
