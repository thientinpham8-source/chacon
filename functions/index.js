'use strict';

const crypto = require('crypto');
const express = require('express');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

initializeApp();
const db = getFirestore();
const app = express();
const stateRef = db.collection('diary').doc('state');
const authRef = db.collection('diary').doc('auth');
const privateRef = db.collection('diary').doc('private');

const blank = () => ({
  stars: 0,
  days: {},
  rewards: [
    { id: '1', label: 'Nhãn dán xinh', icon: '🌈', color: '#FFCA42', weight: 1 },
    { id: '2', label: 'Đọc truyện cùng cha', icon: '📚', color: '#FFB3C6', weight: 1 },
    { id: '3', label: 'Đồ chơi nhỏ', icon: '🧸', color: '#A5F3CE', weight: 1 },
    { id: '4', label: 'Thêm giờ hoạt hình', icon: '📺', color: '#B5E6FF', weight: 1 },
    { id: '5', label: 'Món ăn yêu thích', icon: '🍦', color: '#B997FC', weight: 1 },
    { id: '6', label: 'Quà bí mật', icon: '🎁', color: '#FF9F59', weight: 1 },
  ],
  prizes: [],
  notes: [],
  customTasks: [],
  schedule: { mode: 'random', randomCount: 3, days: {} },
  seen: [],
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

app.use(express.json({ limit: '1.4mb' }));

function requestOrigin(req) {
  const origin = req.get('origin');
  if (origin) return new URL(origin).origin;
  const host = req.get('x-forwarded-host') || req.get('host');
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  return `${protocol}://${host}`;
}

async function ensureDoc(ref, create) {
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) transaction.create(ref, create());
  });
  return (await ref.get()).data();
}

async function ensureDefaults() {
  await ensureDoc(stateRef, blank);
  await ensureDoc(authRef, () => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(process.env.DIARY_PIN || '1234', salt, 32).toString('hex');
    return { salt, hash, version: 1 };
  });
  return ensureDoc(privateRef, () => ({ childKey: crypto.randomBytes(32).toString('hex') }));
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function authorize(req) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Cần liên kết truy cập của con hoặc đăng nhập góc của cha');

  const privateData = await ensureDefaults();
  if (constantTimeEqual(token, privateData.childKey)) return 'child';

  const sessionId = crypto.createHash('sha256').update(token).digest('hex');
  const [sessionSnapshot, authData] = await Promise.all([
    db.collection('diarySessions').doc(sessionId).get(),
    authRef.get().then(snapshot => snapshot.data()),
  ]);
  const session = sessionSnapshot.data();
  if (!session || !authData || session.version !== authData.version || session.expiresAt <= Date.now()) {
    throw new HttpError(401, 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
  }
  return 'admin';
}

function apply(state, action, isAdmin) {
  if (!action || typeof action.id !== 'string' || !action.id) throw new HttpError(400, 'Thao tác không hợp lệ');
  if (state.seen.includes(action.id)) return;
  const date = action.date;

  if (action.type === 'task' && /^\d{4}-\d\d-\d\d$/.test(date)) {
    const day = state.days[date] || (state.days[date] = {});
    if (!day[action.task]) {
      day[action.task] = { value: action.value || true, at: Date.now(), confirmed: false };
      state.stars += Math.max(0, Math.min(3, Number(action.points) || 0));
    }
  } else if (action.type === 'game') {
    state.stars += Math.max(0, Math.min(3, Number(action.points) || 0));
  } else if (action.type === 'spin') {
    if (state.stars < 10) throw new HttpError(400, 'Chưa đủ 10 sao');
    const reward = state.rewards.find(item => item.id === action.reward);
    if (!reward) throw new HttpError(400, 'Phần quà không tồn tại');
    state.stars -= 10;
    state.prizes.unshift({ label: reward.label, icon: reward.icon, at: Date.now() });
  } else if (isAdmin && action.type === 'confirm') {
    const item = state.days[date] && state.days[date][action.task];
    if (item) item.confirmed = true;
  } else if (isAdmin && action.type === 'note') {
    state.notes.unshift({ text: String(action.text || '').slice(0, 300), at: Date.now() });
    state.stars += Math.max(0, Math.min(50, Number(action.points) || 0));
  } else if (isAdmin && action.type === 'rewards') {
    if (!Array.isArray(action.rewards) || !action.rewards.length || action.rewards.length > 12) {
      throw new HttpError(400, 'Cần 1–12 phần quà');
    }
    state.rewards = action.rewards.map((reward, index) => ({
      id: String(reward.id || index),
      label: String(reward.label).slice(0, 50),
      icon: String(reward.icon || '🎁').slice(0, 8),
      color: String(reward.color || '#FFCA42').slice(0, 15),
      weight: 1,
    }));
  } else if (isAdmin && action.type === 'tasks') {
    state.customTasks = Array.isArray(action.tasks)
      ? action.tasks.map(item => String(item).slice(0, 120)).filter(Boolean).slice(0, 15)
      : [];
  } else if (isAdmin && action.type === 'schedule_mode') {
    if (action.mode !== 'random' || Number(action.count) !== 3) throw new HttpError(400, 'Mỗi ngày có đúng 3 nhiệm vụ');
    state.schedule.mode = 'random';
    state.schedule.randomCount = 3;
  } else if (isAdmin && action.type === 'schedule_day') {
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new HttpError(400, 'Ngày không hợp lệ');
    if (action.tasks === null) {
      delete state.schedule.days[date];
    } else {
      const allowed = new Set(['hello', 'voice', 'call', 'story', 'quiz', 'habit', ...state.customTasks.map((item, index) => `custom-${index}-${item}`)]);
      if (!Array.isArray(action.tasks) || action.tasks.length !== 3 || new Set(action.tasks).size !== 3 || action.tasks.some(task => !allowed.has(task))) {
        throw new HttpError(400, 'Hãy chọn đúng 3 nhiệm vụ hợp lệ');
      }
      state.schedule.days[date] = [...action.tasks];
    }
  } else {
    throw new HttpError(403, 'Không có quyền thực hiện thao tác này');
  }

  state.seen.push(action.id);
  if (state.seen.length > 3000) state.seen.splice(0, 1000);
}

app.get('/api/state', async (req, res, next) => {
  try {
    await authorize(req);
    await ensureDefaults();
    res.set('Cache-Control', 'no-store').json((await stateRef.get()).data());
  } catch (error) {
    next(error);
  }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const pin = String(req.body.pin || '');
    const ip = (req.get('x-forwarded-for') || req.ip).split(',')[0].trim();
    const limitId = crypto.createHash('sha256').update(ip).digest('hex');
    const limitRef = db.collection('diaryLoginLimits').doc(limitId);
    const now = Date.now();
    const limitSnapshot = await limitRef.get();
    if (limitSnapshot.exists && limitSnapshot.data().lockedUntil > now) {
      throw new HttpError(429, 'Thử đăng nhập lại sau ít phút');
    }
    const auth = await ensureDoc(authRef, () => {
      const salt = crypto.randomBytes(16).toString('hex');
      return { salt, hash: crypto.scryptSync(process.env.DIARY_PIN || '1234', salt, 32).toString('hex'), version: 1 };
    });
    const actual = crypto.scryptSync(pin, auth.salt, 32);
    const expected = Buffer.from(auth.hash, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(limitRef);
        const prior = snapshot.data();
        const attempts = prior && now - prior.windowStartedAt < 10 * 60 * 1000 ? prior.attempts + 1 : 1;
        transaction.set(limitRef, {
          attempts,
          windowStartedAt: prior && now - prior.windowStartedAt < 10 * 60 * 1000 ? prior.windowStartedAt : now,
          lockedUntil: attempts >= 5 ? now + 10 * 60 * 1000 : 0,
        });
      });
      throw new HttpError(401, 'PIN chưa đúng');
    }

    await limitRef.delete();
    const token = crypto.randomBytes(32).toString('hex');
    const sessionId = crypto.createHash('sha256').update(token).digest('hex');
    await db.collection('diarySessions').doc(sessionId).set({ version: auth.version, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
    const childKeyData = await ensureDefaults();
    res.set('Cache-Control', 'no-store').json({
      token,
      childLink: `${requestOrigin(req)}/?child=${childKeyData.childKey}`,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/pin', async (req, res, next) => {
  try {
    if (await authorize(req) !== 'admin') throw new HttpError(403, 'Cần quyền của cha');
    const pin = String(req.body.pin || '');
    if (!/^\d{4,12}$/.test(pin)) throw new HttpError(400, 'PIN gồm 4–12 chữ số');
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(authRef);
      const current = snapshot.data();
      const salt = crypto.randomBytes(16).toString('hex');
      transaction.set(authRef, {
        salt,
        hash: crypto.scryptSync(pin, salt, 32).toString('hex'),
        version: (current.version || 0) + 1,
      });
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/child-link', async (req, res, next) => {
  try {
    if (await authorize(req) !== 'admin') throw new HttpError(403, 'Cần quyền của cha');
    const privateData = await ensureDefaults();
    res.set('Cache-Control', 'no-store').json({ url: `${requestOrigin(req)}/?child=${privateData.childKey}` });
  } catch (error) {
    next(error);
  }
});

app.post('/api/action', async (req, res, next) => {
  try {
    const role = await authorize(req);
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(stateRef);
      const state = snapshot.exists ? snapshot.data() : blank();
      apply(state, req.body, role === 'admin');
      if (Buffer.byteLength(JSON.stringify(state), 'utf8') > 950000) {
        throw new HttpError(413, 'Dữ liệu nhật ký đã gần chạm giới hạn Firestore');
      }
      transaction.set(stateRef, state);
      return state;
    });
    res.set('Cache-Control', 'no-store').json(result);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) logger.error('Firestore API request failed', error);
  res.status(status).json({ error: status < 500 ? error.message : 'Lỗi máy chủ đồng bộ' });
});

exports.api = onRequest({ region: 'asia-southeast1', maxInstances: 5 }, app);
