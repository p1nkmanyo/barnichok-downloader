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
        profile_text: "ID: {id}\nRemaining Quota: {quota}\nInvited Friends: {refCount}",
        invite_text: "Invite friends to get +3 daily downloads permanently!\nYour link: https://t.me/{botUsername}?start={id}",
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
        profile_text: "ID: {id}\nОстаток квот: {quota}\nПриглашенные друзья: {refCount}",
        invite_text: "Приглашайте друзей и получайте +3 загрузки навсегда!\nВаша ссылка: https://t.me/{botUsername}?start={id}",
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
        profile_text: "ID: {id}\nՄնացած քվոտան: {quota}\nՀրավիրված ընկերներ: {refCount}",
        invite_text: "Հրավիրեք ընկերներին և ստացեք +3 ներբեռնում:\nՁեր հղումը՝ https://t.me/{botUsername}?start={id}",
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
            db.users[payload].quota += 3; // +3 permanent quota
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

// Check subscription function
async function isSubscribed(ctx, userId) {
    try {
        const member = await ctx.telegram.getChatMember('@barnichok', userId);
        return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
    } catch (e) {
        // If bot is not an admin, it will fail, assume false for now
        return false;
    }
}

// Button actions from keyboard
bot.hears(['👤 Profile', '👤 Профиль', '👤 Պրոֆիլ'], (ctx) => {
    if (!ctx.user || !ctx.user.lang) return;
    const t = i18n[ctx.user.lang];
    const text = t.profile_text
        .replace('{id}', ctx.userId)
        .replace('{quota}', ctx.user.quota)
        .replace('{refCount}', ctx.user.referralCount);
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

        const subbed = await isSubscribed(ctx, ctx.userId);
        if (!subbed) {
            const subKeyboard = Markup.inlineKeyboard([
                [Markup.button.url(t.subscribe_btn, 'https://t.me/barnichok')],
                [Markup.button.callback(t.check_sub_btn, 'check_sub')]
            ]);
            return ctx.reply(t.subscribe_msg, subKeyboard);
        }

        // Check quota
        if (user.quota <= 0) {
            return ctx.reply(t.quota_exceeded);
        }

        // Deduct quota
        user.quota -= 1;
        saveDB();

        const msg = await ctx.reply(t.downloading);

        const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
        if (!urlMatch) return;
        const url = urlMatch[0];

        const tempFile = path.join(__dirname, `temp_${ctx.userId}_${Date.now()}.mp4`);

        try {
            await youtubedl(url, {
                maxFilesize: '50M',
                format: 'best',
                output: tempFile
            });

            if (fs.existsSync(tempFile)) {
                await ctx.replyWithVideo({ source: tempFile });
                fs.unlinkSync(tempFile);

                // Update stats
                ctx.db.stats.totalDownloadedVideos = (ctx.db.stats.totalDownloadedVideos || 0) + 1;
                saveDB();

                await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
            } else {
                throw new Error("File not found");
            }
        } catch (error) {
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, t.download_fail);

            // Refund quota
            user.quota += 1;
            saveDB();
        }
    } else {
        return next();
    }
});

bot.action('check_sub', async (ctx) => {
    const user = ctx.user;
    if (!user || !user.lang) return;
    const t = i18n[user.lang];

    const subbed = await isSubscribed(ctx, ctx.userId);
    if (subbed) {
        await ctx.answerCbQuery(t.sub_thanks);
        await ctx.deleteMessage();
        await ctx.reply(t.mainMenu, getKeyboard(user.lang));
    } else {
        await ctx.answerCbQuery(t.sub_fail, { show_alert: true });
    }
});

bot.launch().then(() => console.log('Bot started'));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
