require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const youtubedl = require('youtube-dl-exec');

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error("BOT_TOKEN is missing in environment variables.");
    process.exit(1);
}
const bot = new Telegraf(TOKEN);

const DB_FILE = path.join(__dirname, 'users.json');

// Global in-memory DB
let globalDB = { users: {}, stats: { totalDownloadedVideos: 0 } };

// Helper to read DB
function initDB() {
    if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        try {
            const parsed = JSON.parse(data);
            if (parsed.stats) globalDB.stats = parsed.stats;
            if (parsed.users) globalDB.users = parsed.users;
        } catch (e) {
            console.error("Failed to parse DB, starting fresh.");
        }
    }
}
initDB();

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(globalDB, null, 2), 'utf8');
}

// Translations
const i18n = {
    en: {
        welcome: "Welcome! Please choose your language:",
        mainMenu: "Main Menu",
        profile: "👤 Profile",
        language: "⚙️ Language",
        invite: "🤝 Invite Friend",
        subscribe_msg: "Please subscribe to @barnichok to use this bot.",
        subscribe_btn: "Subscribe",
        check_sub_btn: "Check Subscription",
        sub_thanks: "Thanks for subscribing!",
        sub_fail: "You are not subscribed yet.",
        profile_text: "ID: {id}\nPremium Status: Active\nInvited Friends: {refCount}\nTotal Data Processed: {randomData} GB",
        invite_text: "Invite friends to support the bot!\nYour link: https://t.me/{botUsername}?start={id}",
        downloading: "⏳ Downloading video...",
        download_success: "✅ Download complete!",
        download_fail: "❌ Cannot download this link",
        quota_exceeded: "❌ Daily quota exceeded. Invite friends for more!"
    },
    ru: {
        welcome: "Добро пожаловать! Выберите язык:",
        mainMenu: "Главное меню",
        profile: "👤 Профиль",
        language: "⚙️ Язык",
        invite: "🤝 Пригласить друга",
        subscribe_msg: "Пожалуйста, подпишитесь на @barnichok для использования бота.",
        subscribe_btn: "Подписаться",
        check_sub_btn: "Проверить подписку",
        sub_thanks: "Спасибо за подписку!",
        sub_fail: "Вы еще не подписались.",
        profile_text: "ID: {id}\nПремиум Статус: Активен\nПриглашенные друзья: {refCount}\nВсего обработано данных: {randomData} ГБ",
        invite_text: "Приглашайте друзей, чтобы поддержать бота!\nВаша ссылка: https://t.me/{botUsername}?start={id}",
        downloading: "⏳ Загрузка видео...",
        download_success: "✅ Загрузка завершена!",
        download_fail: "❌ Не удалось скачать по этой ссылке",
        quota_exceeded: "❌ Дневной лимит исчерпан. Приглашайте друзей для увеличения лимита!"
    },
    am: {
        welcome: "Բարի գալուստ Ընտրեք ձեր լեզուն:",
        mainMenu: "Գլխավոր Մենյու",
        profile: "👤 Պրոֆիլ",
        language: "⚙️ Լեզու",
        invite: "🤝 Հրավիրել ընկերոջը",
        subscribe_msg: "Խնդրում ենք բաժանորդագրվել @barnichok բոտը օգտագործելու համար:",
        subscribe_btn: "Բաժանորդագրվել",
        check_sub_btn: "Ստուգել բաժանորդագրությունը",
        sub_thanks: "Շնորհակալություն բաժանորդագրվելու համար:",
        sub_fail: "Դուք դեռ բաժանորդագրված չեք:",
        profile_text: "ID: {id}\nՊրեմիում կարգավիճակ: Ակտիվ\nՀրավիրված ընկերներ: {refCount}\nԸնդհանուր մշակված տվյալները: {randomData} ԳԲ",
        invite_text: "Հրավիրեք ընկերներին աջակցելու բոտին:\nՁեր հղումը՝ https://t.me/{botUsername}?start={id}",
        downloading: "⏳ Տեսանյութի ներբեռնում...",
        download_success: "✅ Ներբեռնումը ավարտված է",
        download_fail: "❌ Անհնար է ներբեռնել այս հղումը",
        quota_exceeded: "❌ Օրական քվոտան գերազանցված է:"
    }
};

function getUser(db, userId) {
    if (!db.users[userId]) {
        return null;
    }
    const user = db.users[userId];
    const today = new Date().toISOString().split('T')[0];
    if (user.lastResetDate !== today) {
        user.quota = 5 + (user.referralCount * 3);
        user.lastResetDate = today;
    }
    return user;
}

function createUser(db, userId) {
    const today = new Date().toISOString().split('T')[0];
    db.users[userId] = {
        lang: null,
        referralCount: 0,
        quota: 5,
        lastResetDate: today
    };
    return db.users[userId];
}

function getKeyboard(lang) {
    const t = i18n[lang] || i18n['en'];
    return Markup.keyboard([
        [t.profile, t.language],
        [t.invite]
    ]).resize();
}

// Middleware to load user
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const db = globalDB;
    const userId = ctx.from.id.toString();
    ctx.db = db;
    ctx.userId = userId;
    ctx.user = getUser(db, userId);
    await next();
});

const ADMIN_ID = process.env.ADMIN_ID;

// Admin commands
bot.command('stats', (ctx) => {
    if (ctx.userId !== ADMIN_ID) return;
    const db = ctx.db;
    const totalUsers = Object.keys(db.users).length;
    const totalDownloaded = db.stats.totalDownloadedVideos || 0;
    ctx.reply(`📊 Stats:\nTotal Users: ${totalUsers}\nTotal Downloaded Videos: ${totalDownloaded}`);
});

bot.command('send', async (ctx) => {
    if (ctx.userId !== ADMIN_ID) return;
    const msg = ctx.message.text.substring(6).trim();
    if (!msg) return ctx.reply("Usage: /send [message]");

    const db = ctx.db;
    let sent = 0;
    for (const uId of Object.keys(db.users)) {
        try {
            await ctx.telegram.sendMessage(uId, msg);
            sent++;
        } catch (e) {
            // User might have blocked the bot
        }
    }
    ctx.reply(`Broadcast sent to ${sent} users.`);
});

bot.start(async (ctx) => {
    const db = ctx.db;
    const userId = ctx.userId;
    let user = ctx.user;

    const payload = ctx.message.text.split(' ')[1]; // Get start payload (referral id)

    if (!user) {
        user = createUser(db, userId);

        // Handle referral
        if (payload && payload !== userId && db.users[payload]) {
            db.users[payload].referralCount += 1;
        }
        saveDB();
    }
    ctx.user = user;

    const langs = Markup.inlineKeyboard([
        [Markup.button.callback('English', 'setlang_en')],
        [Markup.button.callback('Русский', 'setlang_ru')],
        [Markup.button.callback('Հայերեն', 'setlang_am')]
    ]);

    await ctx.reply(i18n.en.welcome, langs);
});

bot.action(/setlang_(.+)/, async (ctx) => {
    const lang = ctx.match[1];
    const db = ctx.db;
    ctx.user.lang = lang;
    saveDB();

    await ctx.deleteMessage();
    const t = i18n[lang];
    await ctx.reply(t.mainMenu, getKeyboard(lang));
});

// Button actions from keyboard
bot.hears(['👤 Profile', '👤 Профиль', '👤 Պրոֆիլ'], (ctx) => {
    if (!ctx.user || !ctx.user.lang) return;
    const t = i18n[ctx.user.lang];

    // Generate a random number between 500 and 2000 for a cool stat
    const randomData = Math.floor(Math.random() * (2000 - 500 + 1)) + 500;

    const text = t.profile_text
        .replace('{id}', ctx.userId)
        .replace('{refCount}', ctx.user.referralCount)
        .replace('{randomData}', randomData);
    ctx.reply(text);
});

bot.hears(['⚙️ Language', '⚙️ Язык', '⚙️ Լեզու'], (ctx) => {
    if (!ctx.user) return;
    const t = i18n[ctx.user.lang || 'en'];
    const langs = Markup.inlineKeyboard([
        [Markup.button.callback('English', 'setlang_en')],
        [Markup.button.callback('Русский', 'setlang_ru')],
        [Markup.button.callback('Հայերեն', 'setlang_am')]
    ]);
    ctx.reply(t.welcome, langs);
});

bot.hears(['🤝 Invite Friend', '🤝 Пригласить друга', '🤝 Հրավիրել ընկերոջը'], async (ctx) => {
    if (!ctx.user || !ctx.user.lang) return;
    const t = i18n[ctx.user.lang];
    const botInfo = await ctx.telegram.getMe();
    const text = t.invite_text
        .replace('{botUsername}', botInfo.username)
        .replace('{id}', ctx.userId);
    ctx.reply(text);
});

// Listen for URLs
bot.on('text', async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return next();

    if (text.includes('http://') || text.includes('https://')) {
        const user = ctx.user;
        if (!user || !user.lang) {
            return ctx.reply("Please select language first via /start");
        }

        const t = i18n[user.lang];

        const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
        if (!urlMatch) return;
        const url = urlMatch[0];

        // Cache URL and message ID to avoid callback_data 64-byte limit
        // and to delete original message later
        const linkId = Math.random().toString(36).substring(2, 10);
        if (!globalDB.links) globalDB.links = {};
        globalDB.links[linkId] = {
            url: url,
            messageId: ctx.message.message_id
        };
        saveDB();

        // Format Selection
        const formatKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🎬 Video', `dl_video|${linkId}`), Markup.button.callback('🎵 MP3 Audio', `dl_audio|${linkId}`)]
        ]);
        return ctx.reply("Select format:", formatKeyboard);
    } else {
        return next();
    }
});

bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    if (!query || (!query.includes('http://') && !query.includes('https://'))) {
        return ctx.answerInlineQuery([]);
    }

    try {
        const urlMatch = query.match(/(https?:\/\/[^\s]+)/);
        if (!urlMatch) return ctx.answerInlineQuery([]);
        const url = urlMatch[0];

        // For inline query, we use the YouTube-dl exec output directly (get URL)
        // to avoid downloading a 50MB file to the server for every inline search.
        // However, yt-dlp can dump a direct video URL using -g / --get-url
        const result = await youtubedl(url, {
            dumpJson: true,
            noWarnings: true,
            maxFilesize: '50M',
        });

        let videoUrl = result.url;

        // TikTok sometimes doesn't give a direct URL easily in dump-json, or it's short lived.
        // But let's provide a basic InlineQueryResultVideo.

        if (videoUrl) {
            return ctx.answerInlineQuery([{
                type: 'video',
                id: String(Date.now()),
                video_url: videoUrl,
                mime_type: 'video/mp4',
                thumb_url: result.thumbnail || 'https://via.placeholder.com/150',
                title: result.title || 'Video',
                description: 'Send video without watermark'
            }], { cache_time: 0 });
        } else {
             return ctx.answerInlineQuery([]);
        }

    } catch (e) {
        return ctx.answerInlineQuery([]);
    }
});

// Download Action Handlers
bot.action(/dl_(video|audio)\|(.+)/, async (ctx) => {
    const type = ctx.match[1];
    const linkId = ctx.match[2];
    const linkData = globalDB.links ? globalDB.links[linkId] : null;

    if (!linkData || !linkData.url) {
        return ctx.answerCbQuery("❌ Link expired or invalid.", { show_alert: true });
    }

    const url = linkData.url;
    const originalMessageId = linkData.messageId;

    const user = ctx.user;
    if (!user || !user.lang) return;
    const t = i18n[user.lang];

    await ctx.answerCbQuery();
    const msg = await ctx.reply("⏳ Processing...");

    const tempDir = path.join(__dirname, `temp_${ctx.userId}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');

    try {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, "🔄 Fetching Meta-Data...");

        let caption = "";

        // Only fetch metadata for videos to create a caption
        if (type === 'video') {
            try {
                const meta = await youtubedl(url, {
                    dumpJson: true,
                    noWarnings: true
                });

                const width = meta.width || 'Unknown';
                const height = meta.height || 'Unknown';
                const filesizeMB = meta.filesize ? (meta.filesize / (1024 * 1024)).toFixed(2) : 'Unknown';

                caption = `📺 Resolution: ${width}x${height}\n📦 Size: ${filesizeMB} MB`;
            } catch (e) {
                // Ignore metadata errors
            }
        }

        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, "🔄 Downloading...");

        const options = {
            maxFilesize: '50M',
            noWarnings: true,
            outtmpl: outputTemplate,
            yesPlaylist: true, // Allow downloading slideshows as multiple files
            // yt-dlp generally downloads tiktok without watermark by default now
        };

        if (type === 'audio') {
            options.extractAudio = true;
            options.audioFormat = 'mp3';
        } else {
            // Speed optimization: --format "mp4" priority flag
            options.format = 'best[ext=mp4]/mp4/best';
        }

        await youtubedl(url, options);

        const downloadedFiles = fs.readdirSync(tempDir).map(file => path.join(tempDir, file));

        if (downloadedFiles.length === 0) {
            throw new Error("No files downloaded.");
        }

        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, "✅ Uploading...");

        if (downloadedFiles.length === 1) {
            // Single file
            if (type === 'audio') {
                await ctx.replyWithAudio({ source: downloadedFiles[0] });
            } else {
                const videoOptions = { source: downloadedFiles[0] };
                if (caption) videoOptions.caption = caption;
                await ctx.replyWithVideo(videoOptions);
            }
        } else {
            // Multiple files (Slideshow)
            if (type === 'audio') {
                // If it's audio and multiple, just send them all
                for (const file of downloadedFiles) {
                    await ctx.replyWithAudio({ source: file });
                }
            } else {
                // Media group for photos/videos
                let mediaGroup = [];
                let isFirstItem = true;

                for (const file of downloadedFiles) {
                    const ext = path.extname(file).toLowerCase();
                    let mediaObj = null;

                    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                        mediaObj = { type: 'photo', media: { source: file } };
                    } else if (['.mp4', '.mkv', '.webm'].includes(ext)) {
                        mediaObj = { type: 'video', media: { source: file } };
                    }

                    if (mediaObj) {
                        if (isFirstItem && caption) {
                            mediaObj.caption = caption;
                            isFirstItem = false;
                        }
                        mediaGroup.push(mediaObj);
                    }
                }

                // Telegram max media group size is 10
                for (let i = 0; i < mediaGroup.length; i += 10) {
                    await ctx.replyWithMediaGroup(mediaGroup.slice(i, i + 10));
                }

                // Also check if there's a separate audio file downloaded in the slideshow
                const audioFiles = downloadedFiles.filter(f => f.endsWith('.mp3') || f.endsWith('.m4a'));
                for (const file of audioFiles) {
                    await ctx.replyWithAudio({ source: file });
                }
            }
        }

        ctx.db.stats.totalDownloadedVideos = (ctx.db.stats.totalDownloadedVideos || 0) + 1;
        saveDB();

        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);

        // Smart Cleaning: Delete original message after 60 seconds
        if (originalMessageId) {
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat.id, originalMessageId).catch(() => {});
            }, 60000);
        }

    } catch (error) {
        console.error("Download Error:", error);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, t.download_fail);
    } finally {
        // Cleanup
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.error("Cleanup error:", e);
        }
    }
});

bot.launch().then(() => console.log('Bot started'));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
