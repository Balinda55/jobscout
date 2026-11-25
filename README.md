#JOBSCOUT

JobScout is a web app that helps students and job seekers find real, current job listings from many job boards(Linkedln, Indeed , Glassdoor,ZipRecruiter and more) in one place . You can search by keyword and location , filter by country,date posted,job type and remote work , sort the results, and save jobs you like.

**Live app (through the load balancer):**
**Demo video(max 2 min):**
**Author : Balinda Sonia ---** @Balinda55


**Why is this app Useful**
Job seekers usually have to check many different websites. JobScout puts listings form many job boards on one page and lets you narrow them down quickly -- for example "Internships in Kigaliposted this week" or "remote full-time developer jobs, highest salary first"


**FEATURES**

| Feature | How it works |
|---|---|
| **Search** | Keyword + optional location |
| **Filter (server)** | Country, date posted, job type, remote only |
| **Filter (instant)** | Type in the "Filter results" box to filter by company, title or city |
| **Sort** | Newest, oldest, highest salary, company A–Z, title A–Z |
| **Results overview** | Summary cards (jobs, companies, % remote, jobs with salary) and a bar chart of job types — updates live as you filter |
| **Save jobs** | ☆ Save button; saved jobs are kept in your browser (localStorage) |
| **Pagination** | Previous / Next pages of results |
| **Error handling** | Friendly messages for empty search, bad input, API down, API limit, timeout |
| **Caching** *(bonus)* | The same search within 10 minutes is answered from memory |
| **Security** *(bonus)* | Input validation, XSS-safe rendering, API key hidden on the server, security headers |
| **Load-balancer proof** | Footer shows "Served by: web-01/web-02"; every response has an `X-Served-By` header |



**THE API USED (and Credits)**
. **JSearch API** by **OpenWeb Ninja (letscrape)**, on RapidAPI
    . **Docs**: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
     .**Endpoint used:** GET https://jsearch.p.rapidapi.com/search
     . **Authentication** headers x-rapidapi-key and x-rapidapi-host
     . The free plan has a montly request limit , which is why JobScout caches results.



**PROJECT STRUCTURE**
```
jobscout/
├── server.js          # Backend: serves the site, /api/jobs and /api/health
├── package.json       # Project info and dependencies
├── .env.example       # Template for the API key (the real .env is NOT in git)
├── .gitignore         # Keeps .env and node_modules out of GitHub
├── README.md
└── public/
    └── index.html     # Frontend: page layout, design (CSS) and logic (JavaScript)
```


**How a request travels:**
```
Browser → lb-01 (HAProxy :80) → web-01 or web-02 (Nginx :80) → Node app (:3000) → JSearch API
```

