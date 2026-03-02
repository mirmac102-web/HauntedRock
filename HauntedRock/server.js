const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const svgCaptcha = require('svg-captcha');

const app = express();
const PORT = process.env.PORT || 3000;

// ====================================================================
// ⬇️ ⬇️ ⬇️ НАСТРОЙКА SUPABASE ⬇️ ⬇️ ⬇️
// Сервер сам возьмет ключи из переменных Render, которые ты добавил!
// В сам код буквы и цифры ключей писать НЕ НАДО.
// ====================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Ошибка: SUPABASE_URL или SUPABASE_ANON_KEY не заданы в настройках Render!");
} else {
    console.log("✅ Supabase ключи найдены, подключаемся...");
}

// Создаем подключение к твоей базе данных
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


// --- НАСТРОЙКА AI ---
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Настройки Express (лимит 50mb нужен для загрузки картинок)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let captchaStore = {}; 

// ====================================================================
// 🤖 МАРШРУТ ДЛЯ UPTIMEROBOT (ЧТОБЫ СЕРВЕР НЕ СПАЛ)
// В настройках бота поменяй ссылку на: https://твой-сайт.onrender.com/ping
// ====================================================================
app.get('/ping', (req, res) => {
    res.status(200).send('Haunted Rock Server is awake!');
});

// --- МАРШРУТЫ ДЛЯ СТРАНИЦ ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/ai', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai.html')));
app.get('/reg', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reg.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));

// --- API: ПОЛЬЗОВАТЕЛИ ---
app.get('/api/users', async (req, res) => {
    const { data: users, error } = await supabase
        .from('users')
        .select('username, is_admin, avatar');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(users);
});

// --- API: ПОСТЫ ---
app.get('/api/posts', async (req, res) => {
    const { data: posts, error } = await supabase
        .from('posts')
        .select('*')
        .order('id', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(posts);
});

app.post('/api/posts', async (req, res) => {
    const { content, image, video, type, author } = req.body;
    
    // Проверка прав (только админы Haunted Rock и M1rMak)
    if (author !== 'Haunted Rock' && author !== 'M1rMak') {
        return res.status(403).json({ success: false, message: 'Only Admins can post.' });
    }
    
    // Отправляем пост напрямую в Supabase!
    const { error } = await supabase.from('posts').insert([{
        author, content, image, video, type
    }]);

    if (error) {
        console.error("Ошибка сохранения поста:", error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
    res.json({ success: true });
});

// --- API: КАПЧА ---
app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({ size: 5, noise: 2, background: '#f0f2f5', color: true });
    captchaStore[req.ip] = captcha.text.toLowerCase();
    res.type('svg').status(200).send(captcha.data);
});

// --- API: ВХОД (LOGIN) ---
app.post('/api/login', async (req, res) => {
    const { identifier, password, captcha } = req.body;
    
    if (!captchaStore[req.ip] || captchaStore[req.ip] !== captcha.toLowerCase()) {
        return res.json({ success: false, message: 'Wrong Captcha!' });
    }

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .or(`email.eq."${identifier}",username.eq."${identifier}"`)
        .eq('password', password)
        .single();

    if (user) {
        delete captchaStore[req.ip];
        res.json({ success: true, username: user.username });
    } else {
        res.json({ success: false, message: 'Invalid credentials or password' });
    }
});

// --- API: ЧАТ С ИИ ---
app.post('/api/chat', async (req, res) => {
    const { message, history, username } = req.body;
    
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "arcee-ai/trinity-large-preview:free", 
                messages: [
                    { 
                        role: "system", 
                        content: `You are rock.ai, a modern AI built for Haunted Rock network. Admins: Haunted Rock, M1rMak. No RP (don't use *actions*). User: ${username || 'Guest'}.` 
                    },
                    ...history,
                    { role: "user", content: message }
                ]
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
            res.json({ reply: data.choices[0].message.content });
        } else {
            res.status(500).json({ reply: "AI is sleeping. Try again later." });
        }
    } catch (error) {
        res.status(500).json({ reply: "Signal lost. Check connection." });
    }
});

// Запуск сервера
app.listen(PORT, () => { 
    console.log(`🚀 Haunted Rock Server is LIVE on port ${PORT}`); 
});

