// Глобальные переменные
let currentUser = null;
let isAdmin = false;
let userData = null;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
});

// Проверить статус входа
async function checkLoginStatus() {
    const response = await fetch('/api/user/me');
    if (response.ok) {
        const data = await response.json();
        if (data.success) {
            loginSuccess(data.user);
        }
    }
}

// Вход
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    showMessage(data.message, data.success ? 'success' : 'error');
    
    if (data.success) {
        loginSuccess(data.user);
    }
}

// Регистрация
async function register() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    showMessage(data.message, data.success ? 'success' : 'error');
    
    if (data.success) {
        loginSuccess(data.user);
    }
}

// Успешный вход
function loginSuccess(user) {
    currentUser = user.username;
    isAdmin = user.isAdmin;
    userData = user;
    
    document.getElementById('authPanel').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    
    document.getElementById('currentUser').textContent = user.username;
    document.getElementById('userBalance').textContent = user.balance + ' SLC';
    document.getElementById('friendCode').textContent = user.friendCode;
    
    if (isAdmin) {
        document.getElementById('adminTabBtn').style.display = 'block';
        document.getElementById('adminLoginSection').style.display = 'none';
    } else {
        document.getElementById('adminLoginSection').style.display = 'block';
    }
    
    loadUserData();
    showTab('dashboard');
}

// Загрузить данные пользователя
async function loadUserData() {
    const response = await fetch(`/api/user/${currentUser}`);
    if (response.ok) {
        const data = await response.json();
        if (data.success) {
            userData = data.user;
            updateUserDisplay();
            loadFriends();
        }
    }
}

// Обновить отображение
function updateUserDisplay() {
    document.getElementById('userBalance').textContent = userData.balance + ' SLC';
    document.getElementById('friendsCount').textContent = userData.friends ? userData.friends.length : 0;
    
    // Подсчитать статистику
    if (userData.transactions) {
        document.getElementById('totalTransfers').textContent = userData.transactions.filter(t => t.type === 'send').length;
        const totalCommission = userData.transactions
            .filter(t => t.type === 'commission' || t.commission)
            .reduce((sum, t) => sum + (t.commission || t.amount), 0);
        document.getElementById('totalCommission').textContent = totalCommission.toFixed(2) + ' SLC';
    }
}

// Перевод средств
async function sendTransfer() {
    const transferType = document.querySelector('.transfer-type-btn.active').id.includes('friends') ? 'friends' : 'all';
    let recipient = '';
    
    if (transferType === 'friends') {
        recipient = document.getElementById('recipient').value;
    } else {
        recipient = document.getElementById('recipientUsername').value.trim();
    }
    
    const amount = parseFloat(document.getElementById('transferAmount').value);
    const note = document.getElementById('transferNote').value.trim();
    
    if (!recipient || !amount || amount <= 0) {
        showMessage('Заполните все поля правильно!', 'error');
        return;
    }
    
    const response = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: currentUser,
            to: recipient,
            amount: amount,
            note: note,
            transferType: transferType
        })
    });
    
    const data = await response.json();
    showMessage(data.message, data.success ? 'success' : 'error');
    
    if (data.success) {
        document.getElementById('transferAmount').value = '';
        document.getElementById('transferNote').value = '';
        loadUserData();
        updateQuickTransfers();
    }
}

// Загрузить друзей
async function loadFriends() {
    const response = await fetch(`/api/user/${currentUser}`);
    if (response.ok) {
        const data = await response.json();
        if (data.success && data.user.friends) {
            const select = document.getElementById('recipient');
            select.innerHTML = '<option value="">Выберите друга</option>' +
                data.user.friends.map(friend => 
                    `<option value="${friend}">${friend}</option>`
                ).join('');
        }
    }
}

// Быстрые переводы
function updateQuickTransfers() {
    if (!userData || !userData.transactions) return;
    
    const recentTransfers = userData.transactions
        .filter(t => t.type === 'send')
        .slice(0, 5);
    
    const container = document.getElementById('quickTransfersList');
    if (recentTransfers.length === 0) {
        container.innerHTML = '<p class="hint">Нет последних переводов</p>';
        return;
    }
    
    container.innerHTML = recentTransfers.map(transfer => `
        <div class="quick-transfer-item">
            <div class="transfer-info">
                <strong>${transfer.to}</strong>
                <span class="transfer-amount">-${transfer.amount} SLC</span>
            </div>
            <small>${new Date(transfer.time).toLocaleDateString()}</small>
        </div>
    `).join('');
}

// Выход
async function logout() {
    await fetch('/api/logout');
    location.reload();
}

// Показать сообщение
function showMessage(text, type) {
    const msg = document.getElementById('systemMessage');
    msg.textContent = text;
    msg.className = `system-message ${type}`;
    msg.classList.remove('hidden');
    
    setTimeout(() => {
        msg.classList.add('hidden');
    }, 3000);
}

// Переключение вкладок
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabName + 'Tab').classList.remove('hidden');
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    
    if (tabName === 'dashboard') {
        loadUserData();
    } else if (tabName === 'transfer') {
        loadFriends();
        updateQuickTransfers();
    }
}

// Выбор типа перевода
function selectTransferType(type) {
    document.querySelectorAll('.transfer-type-btn').forEach(btn => btn.classList.remove('active'));
    
    if (type === 'friends') {
        document.getElementById('friendsTransferBtn').classList.add('active');
        document.getElementById('recipient').style.display = 'block';
        document.getElementById('recipientUsername').classList.add('hidden');
    } else {
        document.getElementById('allTransferBtn').classList.add('active');
        document.getElementById('recipient').style.display = 'none';
        document.getElementById('recipientUsername').classList.remove('hidden');
    }
}

// Админ: получить доступ
async function checkAdminAccess() {
    const code = document.getElementById('adminCode').value.trim();
    
    // Проверка кодов (в реальном проекте это должно быть на сервере)
    const adminCodes = {
        'qqslonadm144': 'admin',
        'superqqslonadm1441': 'superadmin'
    };
    
    if (adminCodes[code]) {
        isAdmin = true;
        document.getElementById('adminTabBtn').style.display = 'block';
        document.getElementById('adminLoginSection').style.display = 'none';
        showMessage('✅ Доступ администратора предоставлен!', 'success');
    } else {
        showMessage('❌ Неверный код доступа!', 'error');
    }
}

// Модальные окна
function showAddFriendModal() {
    document.getElementById('addFriendModal').classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// Добавить друга
async function addFriend() {
    const friendCode = document.getElementById('friendCodeInput').value.trim();
    
    // Здесь должна быть логика добавления друга через API
    showMessage('Функция в разработке', 'info');
    closeModal('addFriendModal');
}
