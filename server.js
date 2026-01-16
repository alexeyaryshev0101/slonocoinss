const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Мидлвары
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Сессии
app.use(session({
    secret: 'slonocoin-secret-key-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// База данных в памяти (для демо)
let database = {
    users: {},
    transactions: [],
    friendCodes: {},
    credits: [],
    creditApplications: [],
    kommisaAccount: {
        username: 'Kommisa',
        balance: 0,
        isAdmin: true,
        isSystemAccount: true
    }
};

// Загрузка базы данных из файла
function loadDatabase() {
    try {
        if (fs.existsSync('./data/database.json')) {
            const data = fs.readFileSync('./data/database.json', 'utf8');
            database = JSON.parse(data);
            console.log('База данных загружена');
        }
    } catch (error) {
        console.log('Создаем новую базу данных...');
        saveDatabase();
    }
}

// Сохранение базы данных в файл
function saveDatabase() {
    try {
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data', { recursive: true });
        }
        fs.writeFileSync('./data/database.json', JSON.stringify(database, null, 2));
    } catch (error) {
        console.error('Ошибка сохранения базы:', error);
    }
}

// Инициализация Kommisa аккаунта
function initializeKommisa() {
    if (!database.users['Kommisa']) {
        database.users['Kommisa'] = {
            username: 'Kommisa',
            password: 'Kommisa',
            balance: 0,
            isAdmin: true,
            isSuperAdmin: true,
            isSystemAccount: true,
            registeredAt: new Date().toISOString(),
            transactions: [],
            commissionStats: {
                totalCollected: 0,
                transactionsCount: 0
            }
        };
        saveDatabase();
    }
}

// === API РОУТЫ ===

// Регистрация
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || username.length < 3) {
        return res.json({ success: false, message: 'Логин минимум 3 буквы!' });
    }
    
    if (!password || password.length < 4) {
        return res.json({ success: false, message: 'Пароль минимум 4 символа!' });
    }
    
    if (database.users[username]) {
        return res.json({ success: false, message: 'Логин уже занят!' });
    }
    
    if (username === 'Kommisa') {
        return res.json({ success: false, message: 'Это имя зарезервировано системой!' });
    }
    
    const isAdminUser = username.toLowerCase() === 'admin';
    
    database.users[username] = {
        username: username,
        password: password, // В реальном проекте хэшировать!
        balance: 100,
        isAdmin: isAdminUser,
        isSuperAdmin: false,
        registeredAt: new Date().toISOString(),
        transactions: [],
        friends: [],
        friendCode: generateFriendCode(username),
        credits: [],
        commissionPaid: 0,
        transferHistory: {}
    };
    
    saveDatabase();
    
    req.session.user = username;
    req.session.isAdmin = isAdminUser;
    
    res.json({ 
        success: true, 
        message: 'Аккаунт создан!',
        user: database.users[username]
    });
});

// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    const user = database.users[username];
    if (!user) {
        return res.json({ success: false, message: 'Пользователь не найден!' });
    }
    
    if (user.password !== password) {
        return res.json({ success: false, message: 'Неверный пароль!' });
    }
    
    req.session.user = username;
    req.session.isAdmin = user.isAdmin || user.isSuperAdmin || false;
    
    res.json({ 
        success: true, 
        message: 'Вход выполнен!',
        user: {
            username: user.username,
            balance: user.balance,
            isAdmin: user.isAdmin,
            isSuperAdmin: user.isSuperAdmin,
            friendCode: user.friendCode
        }
    });
});

// Выход
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Вы вышли из системы' });
});

// Получить данные пользователя
app.get('/api/user/:username', (req, res) => {
    const username = req.params.username;
    const user = database.users[username];
    
    if (!user) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    // Не отправляем пароль
    const { password, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// Получить список всех пользователей (только для админов)
app.get('/api/admin/users', (req, res) => {
    if (!req.session.isAdmin) {
        return res.json({ success: false, message: 'Требуются права администратора!' });
    }
    
    const usersList = Object.keys(database.users)
        .filter(username => username !== 'Kommisa')
        .map(username => {
            const user = database.users[username];
            return {
                username: user.username,
                balance: user.balance,
                isAdmin: user.isAdmin,
                isSuperAdmin: user.isSuperAdmin,
                registeredAt: user.registeredAt,
                creditsCount: user.credits ? user.credits.length : 0
            };
        });
    
    res.json({ success: true, users: usersList });
});

// Перевод средств
app.post('/api/transfer', (req, res) => {
    const { from, to, amount, note, transferType } = req.body;
    
    if (!req.session.user || req.session.user !== from) {
        return res.json({ success: false, message: 'Неавторизованный запрос' });
    }
    
    const sender = database.users[from];
    const recipient = database.users[to];
    
    if (!sender || !recipient) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    if (sender.balance < amount) {
        return res.json({ success: false, message: 'Недостаточно средств' });
    }
    
    const COMMISSION_RATE = 0.10;
    const commission = amount * COMMISSION_RATE;
    const totalDeduct = amount + commission;
    
    // Выполняем перевод
    sender.balance -= totalDeduct;
    recipient.balance += amount;
    
    // Комиссия Kommisa
    if (database.users['Kommisa']) {
        database.users['Kommisa'].balance += commission;
    }
    
    // Записываем транзакции
    const timestamp = new Date().toISOString();
    const transactionId = Date.now();
    
    sender.transactions.push({
        id: transactionId,
        type: 'send',
        amount: amount,
        commission: commission,
        to: to,
        note: note,
        time: timestamp,
        transferType: transferType
    });
    
    recipient.transactions.push({
        id: transactionId,
        type: 'receive',
        amount: amount,
        from: from,
        note: note,
        time: timestamp,
        transferType: transferType
    });
    
    saveDatabase();
    
    res.json({ 
        success: true, 
        message: `Перевод ${amount} SLC выполнен!`,
        newBalance: sender.balance,
        commission: commission
    });
});

// Админ: изменить баланс пользователя
app.post('/api/admin/balance', (req, res) => {
    if (!req.session.isAdmin) {
        return res.json({ success: false, message: 'Требуются права администратора!' });
    }
    
    const { username, newBalance } = req.body;
    
    if (!database.users[username]) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    const oldBalance = database.users[username].balance;
    database.users[username].balance = parseFloat(newBalance);
    
    database.users[username].transactions.push({
        type: 'admin_adjustment',
        amount: Math.abs(parseFloat(newBalance) - oldBalance),
        note: `Корректировка баланса администратором`,
        time: new Date().toISOString()
    });
    
    saveDatabase();
    
    res.json({ 
        success: true, 
        message: `Баланс ${username} изменен`,
        oldBalance: oldBalance,
        newBalance: newBalance
    });
});

// Админ: выдать SLC
app.post('/api/admin/give', (req, res) => {
    if (!req.session.isAdmin) {
        return res.json({ success: false, message: 'Требуются права администратора!' });
    }
    
    const { username, amount } = req.body;
    
    if (!database.users[username]) {
        return res.json({ success: false, message: 'Пользователь не найден' });
    }
    
    database.users[username].balance += parseFloat(amount);
    
    database.users[username].transactions.push({
        type: 'admin_receive',
        amount: amount,
        note: 'Перевод от администратора',
        time: new Date().toISOString()
    });
    
    saveDatabase();
    
    res.json({ 
        success: true, 
        message: `Выдано ${amount} SLC пользователю ${username}`,
        newBalance: database.users[username].balance
    });
});

// Функция генерации кода друга
function generateFriendCode(username) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'SLC-';
    for (let i = 0; i < 8; i++) {
        if (i === 4) code += '-';
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    database.friendCodes[code] = username;
    return code;
}

// Загрузка статичного HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Инициализация сервера
loadDatabase();
initializeKommisa();

app.listen(PORT, () => {
    console.log(`🚀 Сервер Банка Слонокоин запущен на порту ${PORT}`);
    console.log(`🌐 Доступно по адресу: http://localhost:${PORT}`);
});
