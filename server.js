require('dotenv').config();
const express = require('express');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;
const SERVER_NAME = os.hostname();

if (!APP_ID || !APP_KEY) {
  console.warn('WARNING: ADZUNA_APP_ID or ADZUNA_APP_KEY is missing. Create a .env file (see .env.example).');
}

const CURRENCIES = {
  gb: 'GBP', us: 'USD', za: 'ZAR', ca: 'CAD', au: 'AUD', nz: 'NZD',
  in: 'INR', de: 'EUR', fr: 'EUR', at: 'EUR', pl: 'PLN', br: 'BRL',
};
const DAYS = { all: null, today: 1, '3days': 3, week: 7, month: 30 };
const TYPES = ['', 'FULLTIME', 'PARTTIME', 'CONTRACTOR', 'INTERN'];

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(key, { time: Date.now(), data });
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Served-By', SERVER_NAME);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function jobType(job) {
  if (/intern/i.test(job.title || '')) return 'INTERN';
  if (job.contract_type === 'contract') return 'CONTRACTOR';
  if (job.contract_time === 'part_time') return 'PARTTIME';
  if (job.contract_time === 'full_time') return 'FULLTIME';
  return '';
}

function simplifyJob(job, country) {
  const text = `${job.title || ''} ${job.description || ''} ${job.location?.display_name || ''}`;
  return {
    id: String(job.id),
    title: (job.title || 'Untitled role').replace(/<[^>]*>/g, ''),
    company: job.company?.display_name || 'Unknown company',
    logo: null,
    city: job.location?.display_name || '',
    country: country.toUpperCase(),
    remote: /remote|work from home/i.test(text),
    type: jobType(job),
    postedAt: job.created || null,
    minSalary: job.salary_min || null,
    maxSalary: job.salary_max || null,
    salaryCurrency: CURRENCIES[country],
    salaryPeriod: 'YEAR',
    applyLink: job.redirect_url || null,
    description: (job.description || '').replace(/<[^>]*>/g, '').slice(0, 1500),
  };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: SERVER_NAME, time: new Date().toISOString() });
});

app.get('/api/jobs', async (req, res) => {
  const query = String(req.query.query || '').trim();
  const location = String(req.query.location || '').trim();
  const datePosted = String(req.query.date_posted || 'all');
  const type = String(req.query.type || '');
  const country = String(req.query.country || 'gb');
  const remote = req.query.remote === 'true';
  const page = Number.parseInt(req.query.page, 10) || 1;

  if (query.length < 2 || query.length > 100) {
    return res.status(400).json({ error: 'Please type a job title or keyword (2 to 100 characters).' });
  }
  if (location.length > 60) {
    return res.status(400).json({ error: 'Location is too long (max 60 characters).' });
  }
  if (!/^[\p{L}\p{N}\s.,+#&\-/']*$/u.test(query + location)) {
    return res.status(400).json({ error: 'Search contains characters that are not allowed.' });
  }
  if (!(datePosted in DAYS) || !TYPES.includes(type) || !(country in CURRENCIES) || page < 1 || page > 10) {
    return res.status(400).json({ error: 'One of the filters has an invalid value.' });
  }
  if (!APP_ID || !APP_KEY) {
    return res.status(500).json({ error: 'Server is missing its API key. Contact the site owner.' });
  }

  let what = query;
  if (type === 'INTERN') what += ' intern';
  if (remote) what += ' remote';

  const params = new URLSearchParams({
    app_id: APP_ID,
    app_key: APP_KEY,
    results_per_page: '20',
    what,
    'content-type': 'application/json',
  });
  if (location) params.set('where', location);
  if (DAYS[datePosted]) params.set('max_days_old', String(DAYS[datePosted]));
  if (type === 'FULLTIME') params.set('full_time', '1');
  if (type === 'PARTTIME') params.set('part_time', '1');
  if (type === 'CONTRACTOR') params.set('contract', '1');

  const cacheKey = `${country}|${page}|${what}|${location}|${datePosted}|${type}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true, server: SERVER_NAME });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`;
    const apiRes = await fetch(url, { signal: controller.signal });

    if (apiRes.status === 401 || apiRes.status === 403) {
      return res.status(502).json({ error: 'The job API rejected our key. Check the Adzuna app ID and key.' });
    }
    if (apiRes.status === 429) {
      return res.status(503).json({ error: 'Too many searches right now (API limit reached). Try again later.' });
    }
    if (!apiRes.ok) {
      return res.status(502).json({ error: `The job API is having problems (status ${apiRes.status}). Try again soon.` });
    }

    const body = await apiRes.json();
    if (!body || !Array.isArray(body.results)) {
      return res.status(502).json({ error: 'The job API sent an unexpected response.' });
    }

    const result = { jobs: body.results.map((job) => simplifyJob(job, country)), page };
    setCached(cacheKey, result);
    return res.json({ ...result, cached: false, server: SERVER_NAME });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'The job API took too long to answer. Please try again.' });
    }
    console.error('API call failed:', err.message);
    return res.status(502).json({ error: 'Could not reach the job API. Check your internet connection.' });
  } finally {
    clearTimeout(timer);
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`JobScout running on http://localhost:${PORT} (server: ${SERVER_NAME})`);
});