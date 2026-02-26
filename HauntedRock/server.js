const express = require('express');
const path = require('path');
const fs = require('fs');
const svgCaptcha = require('svg-captcha');
const app = express();
const PORT = 3000;

const OPENROUTER_API_KEY = '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'; 

const CHATS_DIR = path.join(__dirname, 'public', 'AI Chats');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(POSTS_FILE)) fs.writeFileSync(POSTS_FILE, '[]');
if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true });

// --- СОЗДАНИЕ АДМИНОВ ---
let users = [];
if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE));

// Переименовали MrDave в Haunted Rock
if (!users.find(u => u.username === 'Haunted Rock')) {
    users.push({ id: 1, username: 'Haunted Rock', email: 'dave@haunted.rock', password: '123Dave', isAdmin: true });
}
if (!users.find(u => u.username === 'M1rMak')) {
    users.push({ id: 2, username: 'M1rMak', email: 'mak@haunted.rock', password: '123Mak', isAdmin: true });
}
fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let captchaStore = {}; 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/ai', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ai.html')));
app.get('/reg', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reg.html')));
// Добавили маршрут для страницы About
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));

app.get('/api/users', (req, res) => {
    const allUsers = JSON.parse(fs.readFileSync(USERS_FILE));
    const safeUsers = allUsers.map(u => ({
        username: u.username,
        id: u.id,
        // Проверка админа теперь с новым именем
        isAdmin: u.username === 'Haunted Rock' || u.username === 'M1rMak',
        avatar: u.avatar || `https://ui-avatars.com/api/?name=${u.username}&background=random&color=fff&bold=true`
    }));
    res.json(safeUsers);
});

app.post('/api/users/avatar', (req, res) => {
    const { username, avatar } = req.body;
    let currentUsers = JSON.parse(fs.readFileSync(USERS_FILE));
    const userIndex = currentUsers.findIndex(u => u.username === username);
    
    if (userIndex !== -1) {
        currentUsers[userIndex].avatar = avatar;
        fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2));
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
});

app.get('/api/posts', (req, res) => {
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE));
    const currentUsers = JSON.parse(fs.readFileSync(USERS_FILE));

    const getAvatar = (name) => {
        const u = currentUsers.find(user => user.username === name);
        return u && u.avatar ? u.avatar : `https://ui-avatars.com/api/?name=${name}&background=random&color=fff&bold=true`;
    };

    const mappedPosts = posts.map(p => {
        p.avatar = getAvatar(p.author);
        if (p.comments) {
            p.comments.forEach(c => c.avatar = getAvatar(c.author));
        }
        return p;
    });

    res.json(mappedPosts.reverse());
});

app.post('/api/posts', (req, res) => {
    const { content, image, video, type, author } = req.body;
    
    // Проверка права на публикацию с новым именем
    if (author !== 'Haunted Rock' && author !== 'M1rMak') {
        return res.status(403).json({ success: false, message: 'Only Admins can post.' });
    }
    
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE));
    posts.push({
        id: Date.now(), 
        author: author, 
        content: content || "", 
        image: image || null,
        video: video || null,
        type: type || 'text', 
        date: new Date().toLocaleDateString(),
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        comments: [],
        likes: []
    });
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
    res.json({ success: true });
});

app.delete('/api/posts/:id', (req, res) => {
    const { author } = req.body;
    
    // Проверка права на удаление с новым именем
    if (author !== 'Haunted Rock' && author !== 'M1rMak') {
        return res.status(403).json({ success: false, message: 'Only Admins can delete posts.' });
    }

    let posts = JSON.parse(fs.readFileSync(POSTS_FILE));
    const initialLength = posts.length;
    posts = posts.filter(p => p.id !== parseInt(req.params.id));

    if (posts.length < initialLength) {
        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Post not found.' });
    }
});

app.post('/api/posts/:id/comment', (req, res) => {
    const { author, text } = req.body;
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE));
    const postIndex = posts.findIndex(p => p.id === parseInt(req.params.id));
    
    if (postIndex !== -1) {
        if (!posts[postIndex].comments) posts[postIndex].comments = [];
        posts[postIndex].comments.push({ id: Date.now(), author, text });
        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true });
    } else { 
        res.status(404).json({ success: false }); 
    }
});

app.post('/api/posts/:id/like', (req, res) => {
    const { username } = req.body;
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE));
    const postIndex = posts.findIndex(p => p.id === parseInt(req.params.id));
    
    if (postIndex !== -1) {
        if (!posts[postIndex].likes) posts[postIndex].likes = [];
        
        const likeIndex = posts[postIndex].likes.indexOf(username);
        let isLiked = false;
        
        if (likeIndex === -1) {
            posts[postIndex].likes.push(username);
            isLiked = true;
        } else {
            posts[postIndex].likes.splice(likeIndex, 1);
        }
        
        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, likesCount: posts[postIndex].likes.length, isLiked });
    } else { 
        res.status(404).json({ success: false, message: 'Post not found' }); 
    }
});

app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({ size: 5, noise: 2, background: '#f0f2f5', color: true });
    captchaStore[req.ip] = captcha.text.toLowerCase();
    res.type('svg'); 
    res.status(200).send(captcha.data);
});

app.post('/api/register', (req, res) => {
    const { username, email, password, captcha } = req.body;
    
    if (!captchaStore[req.ip] || captchaStore[req.ip] !== captcha.toLowerCase()) {
        return res.json({ success: false, message: 'Wrong Captcha!' });
    }
    // Запрет на регистрацию с зарезервированными именами
    if (username.toLowerCase() === 'haunted rock' || username.toLowerCase() === 'm1rmak') {
        return res.json({ success: false, message: 'Reserved username.' });
    }
    
    const currentUsers = JSON.parse(fs.readFileSync(USERS_FILE));
    if (currentUsers.find(u => u.email === email || u.username === username)) {
        return res.json({ success: false, message: 'User already exists!' });
    }
    
    currentUsers.push({ id: Date.now(), username, email, password });
    fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2));
    delete captchaStore[req.ip];
    
    res.json({ success: true, username });
});

app.post('/api/login', (req, res) => {
    const { identifier, password, captcha } = req.body;
    
    if (!captchaStore[req.ip] || captchaStore[req.ip] !== captcha.toLowerCase()) {
        return res.json({ success: false, message: 'Wrong Captcha!' });
    }
    
    const currentUsers = JSON.parse(fs.readFileSync(USERS_FILE));
    const user = currentUsers.find(u => (u.email === identifier || u.username === identifier) && u.password === password);
    
    if (user) { 
        delete captchaStore[req.ip]; 
        return res.json({ success: true, username: user.username }); 
    }
    
    res.json({ success: false, message: 'Invalid credentials' });
});

app.post('/api/chat', async (req, res) => {
    const { message, history, chatId, username } = req.body;
    
    const SELECTED_MODEL = "arcee-ai/trinity-large-preview:free"; 
    
    // Обновили системный промпт с новыми именами админов
    const messages = [
        { 
            role: "system", 
            content: `You are rock.ai, a modern and helpful AI assistant built exclusively for the "Haunted Rock" private social network (managed by "Haunted Rock" and "M1rMak"). 
            IMPORTANT RULES:
            1. STRICTLY NO ROLEPLAY. Do not narrate physical actions, do not use asterisks for movements.
            2. Respond purely as a direct, conversational text AI.
            3. Keep your answers concise, stylish, and highly helpful. 
            4. Use Markdown for formatting.
            You are currently talking to user: ${username || 'Guest'}.` 
        },
        ...history,
        { role: "user", content: message }
    ];

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: SELECTED_MODEL, 
                messages: messages
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const aiReply = data.choices[0].message.content;
            
            const chatLogFile = path.join(CHATS_DIR, `${chatId}.txt`);
            const logEntry = `User (${username}): ${message}\nrock.ai: ${aiReply}\n---\n`;
            fs.appendFileSync(chatLogFile, logEntry);

            res.json({ reply: aiReply });
        } else {
            res.status(500).json({ reply: `API Error. Make sure the model '${SELECTED_MODEL}' is available on your OpenRouter account.` });
        }
    } catch (error) {
        res.status(500).json({ reply: "Signal disrupted. I couldn't process that." });
    }
});

app.listen(PORT, () => { 
    console.log(`🚀 Server running on http://localhost:${PORT}`); 
});