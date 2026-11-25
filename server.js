require('dotent').config();
const express =require('express');
const os = require('os');
const path = require('path');
const { URLSearchParams } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.RAPIDAPI_KEY;
const API_HOST ='jsearch.p.rapidapi.com';
const SERVER_NAME =os.hostname();

if (!API_KEY) {
    console.warn('WARNING: RAPIDAPI_KEY is missing .Create a .env file (see .env.example).');
}

const ALLOWED ={
    date_posted: ['all' ,'today' , '3days', 'week','month'],
    employment_types: ['', 'FULLTIME' , 'PARTTIME','CONTRACTOR','INTERN'],
    country: ['', 'us', 'gb','ca' ,'in' ,'de', 'fr', 'za', 'ng', 'ke', 'rw','au'],
};

const CACHE_TTL_MS = 10 * 60 *1000;
const cache = new Map();

function getCached(key) {
    const entry =cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.time > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCached(key, data) {
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    cache.set(key ,{ time: Date.now(), data });
}

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Served-By', SERVER_NAME);
    res.setHeader('X-Content-Type-Options', 'nonsniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

function simplifyJob(job) {
    return {
        id: job.job_id,
        title: job.job_title || 'Untitled role',
        company: job.employer_name || 'Unknown company',
        logo: job.employer_logo || null,
        city:job.job_city || '',
        country: job.job_country || '',
        remote: Boolean(job.job_is_remote),
        type: job.job_employment_type || '',
        postedAt: job.job_posted_at_datetime_utc || null,
        minSalary: job.job_min_salary || null,
        maxSalary: job.job_max_salary || null,
        salaryCurrency: job.job_salary_currency || '',
        salaryPeriod: job.job_salary_period || '',
        applyLink : job.job_apply_link || null,
        description: (job.job_description || '').slice(0, 1500),
    };
}

app.get('/api/health' , (req, res) => {
    res.json({status: 'ok', server: SERVER_NAME, time: new Date(). toISOString() });
});

app.get('/api/jobs', async (req, res) => {
    const query =String(req.query.query || '').trim();
    const location =String(req.query.location || '').trim();
    const datePosted = String(req.query.date_posted || 'all');
    const type =String(req.query.type || '');
    const country =String(req.query.country || '');
    const remote = req.query.remote === 'true';
    const page = Number.parseInt(req.query.page, 10) || 1;

    if (query.lenghth < 2 || query.length > 100) {
        return res.status(400).json({ error: 'Please type a job title or keyword (2 to 100 characters).'});
    }
    if (location.length > 60) {
        return res.status(400).json({ error: 'Location is too long (max 60 characters).'});
    }
if (!/^[\p{L}\p{N}\s.,+#&\-/']*$/u.test(query + location)) {
    return res.status(400).json({ error: 'Search contains characters that are not alllowed.'});
}
if (!ALLOWED.date_posted.includes(datePosted) ||
    !ALLOWED.employment_types.includes(type) ||
    !ALLOWED.country.includes(country) ||
    page < 1 || page > 10) {
  return res.status(400).json({ error: 'One of the filters has invalid value.'});
    }
    if (!API_KEY) {
        return res.status(500).json({ error: 'Server is missing its API key. Contact the site owner.'});
    }

    const params = new URLSearchParams({
        query: location ?  `${query} in ${location}` : query,
        page: String(page),
        num_pages: '1',
       date_posted: datePosted, 
    });
    if (country) params.set('country' , country);
    if(type) params.set('employment_types', type);
    if(remote) params.set('work_from_home', 'true');

    const cacheKey = params.toString();
    const cached = getCached(cacheKey);
    if (cached) {
        return res.json({ ...cached, cached: true, server: SERVER_NAME });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    
    try {
        const apiRes = await fetch('https://${API_HOST}/search?${params}',{
            headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST },
            signal: controller.signal,
        });

        if (apiRes.status === 401 || apiRes.status === 403) {
            return res.status(502).json({ error: 'The job API rejected our key. Check the RapidAPI subscription.' });
        }
        if (apiRes.status === 429) {
            return res.status(503).json({ error: 'Too many searches right now (API limit reached). Try again later.'});
        }
        if (!apiRes.ok) {
            return res.status(502).json({ error: 'The job API is having problems (status ${apiRes.status}). Try again soon.' });
        }

        const body = await apiRes.json();
        if (!body || !Array.isArray(body.data)) {
            return res.status(502).json({ error: 'The job API sent an unexpected response.' });
        }

        const result = { jobs: body.data.map(simplifyJob), page };
        setCached(cacheKey , result);
        return res.json({ ...result, cached: false, server: SERVER_NAME });
    } catch (err) {
      if (err.name === 'AbortError') {
        return res.status(504).json({ error: 'The job API took too long to answer. Please try again.'});
      }
      console.error('API call failed:', err.message);
      return res.status(502).json({ error: 'Could not reach the job API . Check your internet connection.' });
    } finally {
        clearTimeout(timer);
    }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
    console.log('JobScout running on http://localhost:${PORT} (server: ${SERVER_NAME})');
});