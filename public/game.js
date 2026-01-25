// Game.js - Unicycle Balance Game
// Physics-based balancing game with progressive difficulty

// ===== STATE MANAGEMENT =====
let currentUser = null;
let gameState = 'start'; // 'start', 'playing', 'gameover'
let animationId = null;

// Game physics
let angle = 0; // Current tilt angle in radians
let angularVelocity = 0; // Rate of angle change
let targetAngle = 0; // Target angle based on player input

// Game stats
let score = 0;
let gameStartTime = 0;
let gameDuration = 0;
let difficulty = 1;
let lastDifficultyIncrease = 0;

// Physics constants
const GRAVITY_BASE = 0.5;
const GRAVITY_INCREASE = 0.05;
const STABILITY_BASE = 0.15;
const STABILITY_DECREASE = 0.002;
const DAMPING = 0.95;
const MAX_ANGLE = Math.PI / 4; // 45 degrees
const DIFFICULTY_INTERVAL = 10000; // 10 seconds
const INPUT_STRENGTH = 0.03;

// Controls
const keys = {
    left: false,
    right: false
};

// ===== DOM ELEMENTS =====
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// HUD
const gameHud = document.getElementById('game-hud');
const hudScore = document.getElementById('hud-score');
const hudLevel = document.getElementById('hud-level');
const hudTime = document.getElementById('hud-time');

// Screens
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const startGameBtn = document.getElementById('start-game-btn');
const restartGameBtn = document.getElementById('restart-game-btn');

// Game over stats
const finalScore = document.getElementById('final-score');
const finalTime = document.getElementById('final-time');
const finalLevel = document.getElementById('final-level');
const saveStatus = document.getElementById('save-status');

// Navigation
const backToGalleryBtn = document.getElementById('back-to-gallery-btn');
const gameNavBtn = document.getElementById('game-nav-btn');
const adminNavBtn = document.getElementById('admin-nav-btn');
const faqNavBtn = document.getElementById('faq-nav-btn');
const gameUserMenuBtn = document.getElementById('game-user-menu-btn');
const gameUserDropdown = document.getElementById('game-user-dropdown');
const gameUserInfo = document.getElementById('game-user-info');
const gameChangePasswordBtn = document.getElementById('game-change-password-btn');
const gameLogoutBtn = document.getElementById('game-logout-btn');

// Leaderboard & Stats
const leaderboardLoading = document.getElementById('leaderboard-loading');
const leaderboardError = document.getElementById('leaderboard-error');
const leaderboardList = document.getElementById('leaderboard-list');
const statsLoading = document.getElementById('stats-loading');
const statsError = document.getElementById('stats-error');
const statsContent = document.getElementById('stats-content');
const bestScoreEl = document.getElementById('best-score');
const bestScoreDetails = document.getElementById('best-score-details');
const userRankEl = document.getElementById('user-rank');
const recentScoresEl = document.getElementById('recent-scores');

// ===== INITIALIZATION =====
checkAuth();

async function checkAuth() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/';
            return;
        }

        currentUser = data.user;
        gameUserInfo.textContent = `${currentUser.displayName}`;

        // Show admin button for admins and uploaders
        if (currentUser.role === 'admin' || currentUser.role === 'uploader') {
            adminNavBtn.classList.remove('hidden');
        }

        // Load leaderboard and stats
        loadLeaderboard();
        loadStats();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/';
    }
}

// ===== NAVIGATION HANDLERS =====
backToGalleryBtn.addEventListener('click', () => {
    window.location.href = '/';
});

gameNavBtn.addEventListener('click', () => {
    window.location.href = '/game.html';
});

adminNavBtn.addEventListener('click', () => {
    window.location.href = '/admin.html';
});

faqNavBtn.addEventListener('click', () => {
    window.location.href = '/faq.html';
});

// User menu dropdown
gameUserMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    gameUserDropdown.classList.toggle('hidden');
    gameUserMenuBtn.classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (!gameUserMenuBtn.contains(e.target) && !gameUserDropdown.contains(e.target)) {
        gameUserDropdown.classList.add('hidden');
        gameUserMenuBtn.classList.remove('active');
    }
});

gameChangePasswordBtn.addEventListener('click', () => {
    alert('Passwort-Änderung: Bitte zur Galerie-Seite wechseln');
});

gameLogoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// ===== GAME CONTROLS =====
startGameBtn.addEventListener('click', startGame);
restartGameBtn.addEventListener('click', startGame);

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (gameState !== 'playing') return;

    if (e.key === 'ArrowLeft') {
        keys.left = true;
        e.preventDefault();
    } else if (e.key === 'ArrowRight') {
        keys.right = true;
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') {
        keys.left = false;
    } else if (e.key === 'ArrowRight') {
        keys.right = false;
    }
});

// ===== GAME LOGIC =====
function startGame() {
    // Reset state
    gameState = 'playing';
    angle = (Math.random() - 0.5) * 0.1; // Small random initial tilt
    angularVelocity = 0;
    targetAngle = 0;
    score = 0;
    difficulty = 1;
    gameStartTime = Date.now();
    lastDifficultyIncrease = gameStartTime;
    keys.left = false;
    keys.right = false;

    // Update UI
    startScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    gameHud.classList.remove('hidden');

    // Start game loop
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    gameLoop();
}

function gameLoop() {
    if (gameState !== 'playing') return;

    // Update game time
    const now = Date.now();
    gameDuration = Math.floor((now - gameStartTime) / 1000);

    // Update difficulty every 10 seconds
    if (now - lastDifficultyIncrease >= DIFFICULTY_INTERVAL) {
        difficulty++;
        lastDifficultyIncrease = now;
    }

    // Update physics
    updatePhysics();

    // Update score (higher difficulty = more points)
    score += difficulty * 0.1;

    // Update HUD
    updateHUD();

    // Render
    render();

    // Check game over
    if (Math.abs(angle) > MAX_ANGLE) {
        endGame();
        return;
    }

    // Continue loop
    animationId = requestAnimationFrame(gameLoop);
}

function updatePhysics() {
    // Calculate target angle based on input
    targetAngle = 0;
    if (keys.left) {
        targetAngle = -INPUT_STRENGTH;
    }
    if (keys.right) {
        targetAngle = INPUT_STRENGTH;
    }

    // Gravity force (increases with difficulty)
    const gravity = GRAVITY_BASE + (difficulty - 1) * GRAVITY_INCREASE;
    const gravityForce = angle * gravity;

    // Stability (player's ability to correct, decreases with difficulty)
    const stability = Math.max(0.05, STABILITY_BASE - (difficulty - 1) * STABILITY_DECREASE);
    const correctionForce = (targetAngle - angle) * stability;

    // Update angular velocity
    angularVelocity += gravityForce - correctionForce;
    angularVelocity *= DAMPING;

    // Update angle
    angle += angularVelocity;
}

function updateHUD() {
    hudScore.textContent = Math.floor(score);
    hudLevel.textContent = difficulty;
    hudTime.textContent = gameDuration + 's';
}

function endGame() {
    gameState = 'gameover';
    gameHud.classList.add('hidden');

    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // Show game over screen with stats
    finalScore.textContent = Math.floor(score);
    finalTime.textContent = gameDuration + 's';
    finalLevel.textContent = difficulty;
    saveStatus.textContent = '';
    gameoverScreen.classList.remove('hidden');

    // Save score
    saveScore();
}

// ===== RENDERING =====
function render() {
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    drawBackground();

    // Calculate danger level for color feedback
    const dangerLevel = Math.abs(angle) / MAX_ANGLE;

    // Draw ground
    drawGround();

    // Save context for rotation
    ctx.save();
    ctx.translate(width / 2, height - 150);
    ctx.rotate(angle);

    // Draw unicycle
    drawUnicycle(dangerLevel);

    // Restore context
    ctx.restore();

    // Draw rider
    ctx.save();
    ctx.translate(width / 2, height - 150);
    ctx.rotate(angle);
    drawRider(dangerLevel);
    ctx.restore();
}

function drawBackground() {
    const width = canvas.width;
    const height = canvas.height;

    // Sky gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height - 100);
    skyGradient.addColorStop(0, '#87CEEB');
    skyGradient.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height - 100);
}

function drawGround() {
    const width = canvas.width;
    const height = canvas.height;

    // Ground
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, height - 100, width, 100);

    // Ground line
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, height - 100);
    ctx.lineTo(width, height - 100);
    ctx.stroke();
}

function drawUnicycle(dangerLevel) {
    // Color shifts from orange to red based on danger
    const r = Math.floor(255);
    const g = Math.floor(107 - dangerLevel * 107);
    const b = Math.floor(53 - dangerLevel * 53);
    const unicycleColor = `rgb(${r}, ${g}, ${b})`;

    // Wheel
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.strokeStyle = unicycleColor;
    ctx.lineWidth = 6;
    ctx.stroke();

    // Spokes
    ctx.strokeStyle = unicycleColor;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
        const spokeAngle = (Math.PI * 2 / 8) * i;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(spokeAngle) * 35, Math.sin(spokeAngle) * 35);
        ctx.stroke();
    }

    // Fork/Frame
    ctx.strokeStyle = unicycleColor;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -80);
    ctx.stroke();

    // Seat
    ctx.fillStyle = '#f7931e';
    ctx.fillRect(-25, -90, 50, 15);
    ctx.strokeStyle = unicycleColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(-25, -90, 50, 15);

    // Pedals
    ctx.fillStyle = '#666';
    ctx.fillRect(-50, -10, 20, 10);
    ctx.fillRect(30, -10, 20, 10);
}

function drawRider(dangerLevel) {
    // Rider is a simple stick figure
    const armAngle = angle * 2; // Arms swing more dramatically

    // Head
    ctx.beginPath();
    ctx.arc(0, -120, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD4A3';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Body
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -105);
    ctx.lineTo(0, -75);
    ctx.stroke();

    // Arms (balance based on tilt)
    ctx.strokeStyle = dangerLevel > 0.7 ? '#e74c3c' : '#333';
    ctx.lineWidth = 4;

    // Left arm
    ctx.beginPath();
    ctx.moveTo(0, -95);
    ctx.lineTo(-30 - armAngle * 100, -85 - Math.abs(armAngle) * 50);
    ctx.stroke();

    // Right arm
    ctx.beginPath();
    ctx.moveTo(0, -95);
    ctx.lineTo(30 + armAngle * 100, -85 - Math.abs(armAngle) * 50);
    ctx.stroke();

    // Legs (on pedals)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;

    // Left leg
    ctx.beginPath();
    ctx.moveTo(0, -75);
    ctx.lineTo(-40, -5);
    ctx.stroke();

    // Right leg
    ctx.beginPath();
    ctx.moveTo(0, -75);
    ctx.lineTo(40, -5);
    ctx.stroke();
}

// ===== API INTEGRATION =====
async function loadLeaderboard() {
    try {
        leaderboardLoading.classList.remove('hidden');
        leaderboardError.textContent = '';

        const response = await fetch('/api/game/leaderboard?limit=10');
        if (!response.ok) throw new Error('Fehler beim Laden');

        const data = await response.json();
        displayLeaderboard(data.scores);
    } catch (error) {
        console.error('Load leaderboard error:', error);
        leaderboardError.textContent = 'Fehler beim Laden der Bestenliste';
    } finally {
        leaderboardLoading.classList.add('hidden');
    }
}

function displayLeaderboard(scores) {
    leaderboardList.innerHTML = '';

    if (!scores || scores.length === 0) {
        leaderboardList.innerHTML = '<p style="text-align: center; color: #999;">Noch keine Scores</p>';
        return;
    }

    scores.forEach((scoreObj, index) => {
        const rank = index + 1;
        const isCurrentUser = scoreObj.username === currentUser.username;

        const entry = document.createElement('div');
        entry.className = 'leaderboard-entry' + (isCurrentUser ? ' current-user' : '');

        let rankClass = 'entry-rank';
        if (rank === 1) rankClass += ' top-1';
        else if (rank === 2) rankClass += ' top-2';
        else if (rank === 3) rankClass += ' top-3';

        const time = new Date(scoreObj.createdAt).toLocaleDateString('de-DE');

        entry.innerHTML = `
            <div class="${rankClass}">${rank}</div>
            <div class="entry-info">
                <div class="entry-name">${scoreObj.displayName || scoreObj.username}</div>
                <div class="entry-details">Level ${scoreObj.difficultyReached} • ${scoreObj.duration}s • ${time}</div>
            </div>
            <div class="entry-score">${scoreObj.score}</div>
        `;

        leaderboardList.appendChild(entry);
    });
}

async function loadStats() {
    try {
        statsLoading.classList.remove('hidden');
        statsError.textContent = '';

        const response = await fetch('/api/game/stats');
        if (!response.ok) throw new Error('Fehler beim Laden');

        const data = await response.json();
        displayStats(data);
    } catch (error) {
        console.error('Load stats error:', error);
        statsError.textContent = 'Fehler beim Laden der Statistiken';
    } finally {
        statsLoading.classList.add('hidden');
    }
}

function displayStats(data) {
    statsContent.classList.remove('hidden');

    // Best score
    if (data.bestScore) {
        bestScoreEl.textContent = data.bestScore.score;
        bestScoreDetails.textContent = `Level ${data.bestScore.difficultyReached} • ${data.bestScore.duration}s`;
    } else {
        bestScoreEl.textContent = '-';
        bestScoreDetails.textContent = 'Noch kein Spiel gespielt';
    }

    // Rank
    if (data.rank) {
        userRankEl.textContent = '#' + data.rank;
    } else {
        userRankEl.textContent = '-';
    }

    // Recent scores
    recentScoresEl.innerHTML = '';
    if (data.recentScores && data.recentScores.length > 0) {
        data.recentScores.forEach(scoreObj => {
            const item = document.createElement('div');
            item.className = 'recent-score-item';

            const time = new Date(scoreObj.createdAt).toLocaleDateString('de-DE');

            item.innerHTML = `
                <div><span class="recent-score-value">${scoreObj.score}</span> Punkte</div>
                <div class="recent-score-time">Level ${scoreObj.difficultyReached} • ${scoreObj.duration}s • ${time}</div>
            `;

            recentScoresEl.appendChild(item);
        });
    } else {
        recentScoresEl.innerHTML = '<p style="text-align: center; color: #999; font-size: 12px;">Noch keine Spiele</p>';
    }
}

async function saveScore() {
    try {
        saveStatus.textContent = 'Speichere Score...';
        saveStatus.className = 'save-status';

        const response = await fetch('/api/game/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                score: Math.floor(score),
                duration: gameDuration,
                difficultyReached: difficulty
            })
        });

        if (!response.ok) {
            throw new Error('Fehler beim Speichern');
        }

        saveStatus.textContent = 'Score gespeichert!';
        saveStatus.className = 'save-status success';

        // Reload leaderboard and stats
        setTimeout(() => {
            loadLeaderboard();
            loadStats();
        }, 500);
    } catch (error) {
        console.error('Save score error:', error);
        saveStatus.textContent = 'Fehler beim Speichern';
        saveStatus.className = 'save-status error';
    }
}

// Initial render of start screen
render();
