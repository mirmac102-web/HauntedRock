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
    const loginName = req.body.identifier || req.body.username;
    const password = req.body.password;
    const captcha = req.body.captcha;
    
    if (!captchaStore[req.ip] || captchaStore[req.ip] !== captcha.toLowerCase()) {
        return res.json({ success: false, message: 'Wrong Captcha!' });
    }

    // Ищем пользователя только по username без лишних кавычек
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', loginName)
        .eq('password', password)
        .single();

    if (user) {
        delete captchaStore[req.ip];
        res.json({ success: true, username: user.username });
    } else {
        console.error("❌ Ошибка входа для:", loginName, "| Детали из БД:", error?.message);
        res.json({ success: false, message: 'Invalid credentials or password' });
    }
});

// --- API: ЛАЙКИ ---
app.post('/api/posts/:id/like', async (req, res) => {
    const postId = req.params.id;
    const { username } = req.body;

    const { data: post } = await supabase.from('posts').select('likes').eq('id', postId).single();
    if (!post) return res.json({ success: false });

    let likes = post.likes || [];
    let isLiked = false;

    if (likes.includes(username)) {
        likes = likes.filter(u => u !== username); // Убираем лайк
    } else {
        likes.push(username); // Ставим лайк
        isLiked = true;
    }

    await supabase.from('posts').update({ likes }).eq('id', postId);
    res.json({ success: true, isLiked, likesCount: likes.length });
});

// --- API: КОММЕНТАРИИ ---
app.post('/api/posts/:id/comment', async (req, res) => {
    const postId = req.params.id;
    const { author, text } = req.body;

    const { data: user } = await supabase.from('users').select('avatar').eq('username', author).single();
    const avatar = user?.avatar || `https://ui-avatars.com/api/?name=${author}&background=random&color=fff`;

    const newComment = { author, text, avatar };
    const { data: post } = await supabase.from('posts').select('comments').eq('id', postId).single();
    
    let comments = post.comments || [];
    comments.push(newComment);

    await supabase.from('posts').update({ comments }).eq('id', postId);
    res.json({ success: true });
});

// --- API: УДАЛЕНИЕ ПОСТОВ ---
app.delete('/api/posts/:id', async (req, res) => {
    const { author } = req.body;
    if (author !== 'Haunted Rock' && author !== 'M1rMak') return res.status(403).json({ success: false });
    
    await supabase.from('posts').delete().eq('id', req.params.id);
    res.json({ success: true });
});

// --- API: УДАЛЕНИЕ АККАУНТА ---
app.delete('/api/account', async (req, res) => {
    const { username } = req.body;
    
    // Защита админских аккаунтов от случайного удаления через сайт
    if (username === 'Haunted Rock' || username === 'M1rMak') {
        return res.json({ success: false, message: 'Admins cannot delete their accounts here.' });
    }

    // Удаляем пользователя из таблицы users
    const { error } = await supabase.from('users').delete().eq('username', username);
    
    if (error) {
        console.error("❌ Ошибка удаления аккаунта:", error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
    
    res.json({ success: true });
});

// --- API: РЕГИСТРАЦИЯ (REGISTER) ---
app.post('/api/register', async (req, res) => {
    const { username, email, password, captcha } = req.body;
    
    // 1. Проверяем капчу
    if (!captchaStore[req.ip] || captchaStore[req.ip] !== (captcha || '').toLowerCase()) {
        return res.json({ success: false, message: 'Wrong Captcha!' });
    }

    // 2. Проверяем, не занят ли уже такой ник (чтобы не было клонов)
    const { data: existingUser } = await supabase
        .from('users')
        .select('username')
        .eq('username', username)
        .single();

    if (existingUser) {
        return res.json({ success: false, message: 'Username is already taken!' });
    }

    // 3. Создаем нового пользователя в базе Supabase
    const { error } = await supabase
        .from('users')
        .insert([{ 
            username: username, 
            email: email || null, 
            password: password, 
            is_admin: false, // Обычные юзеры не админы
            avatar: `https://ui-avatars.com/api/?name=${username}&background=random&color=fff&bold=true` // Ставим стандартную аватарку сразу
        }]);

    if (error) {
        console.error("❌ Ошибка при регистрации:", error.message);
        return res.json({ success: false, message: 'Database error: ' + error.message });
    }

    // Успех!
    delete captchaStore[req.ip];
    res.json({ success: true, message: 'Account created successfully!' });
});

// --- API: ОБНОВЛЕНИЕ АВАТАРКИ ---
app.post('/api/avatar', async (req, res) => {
    const { username, avatar } = req.body;

    if (!username || !avatar) {
        return res.status(400).json({ success: false, message: 'Username and avatar are required' });
    }

    // Говорим Supabase: обнови колонку avatar у конкретного пользователя
    const { error } = await supabase
        .from('users')
        .update({ avatar: avatar })
        .eq('username', username);

    if (error) {
        console.error("❌ Ошибка сохранения аватарки:", error.message);
        return res.status(500).json({ success: false, message: error.message });
    }

    res.json({ success: true, message: 'Avatar updated successfully!' });
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




