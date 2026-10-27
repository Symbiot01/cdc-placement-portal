# IIT Kharagpur ERP — CDC placement & bare-bones HTTP protocol

How to sign in, open Career Development Centre placement, read the company list, apply with the closer CV, read notices, and reproduce the entire sequence with raw HTTP calls. This is the flow used on the student portal for roll `22XX10001`.

Credentials, security answers, and session cookies stay in `.enverp` or the browser. This file is safe to commit. `.enverp` is gitignored.

Base host: `https://erp.iitkgp.ac.in`

---

## 1. End-to-end bare-bones HTTP / API specification

The ERP splits across three separate Java web-application contexts on the same origin:

1. `/SSOAdministration/` — Single Sign-On login, security question, and OTP verification.
2. `/IIT_ERP3/` — Main ERP shell, module menus, session keepalive, and `ssoToken` minting.
3. `/TrainingPlacementSSO/` — CDC placement/internship portal, jqGrid XML feeds, CV generator, and application endpoints.

Because each context maintains its own servlet session cookie (`JSID_SSOAdministration`, `JSID_IIT_ERP3`, `JSID_TrainingPlacementSSO`) alongside the shared `ssoToken` cookie, a programmatic client **must use a cookie jar** and initialize each context in order.

### Step 1.1 — Initialize SSO session

Do **not** start at `GET /` in a headless client (`/` only returns an HTML page with `<body onLoad="window.location.href='https://erp.iitkgp.ac.in/IIT_ERP3/'">`). Start at `/IIT_ERP3/`:

```http
GET /IIT_ERP3/ HTTP/1.1
Host: erp.iitkgp.ac.in
```

- **Response:** `302 Found`
- **Location:** `https://erp.iitkgp.ac.in/SSOAdministration/login.htm?sessionToken=<SSO_SESSION_TOKEN>&requestedUrl=https://erp.iitkgp.ac.in/IIT_ERP3/`
- **Cookies set:** `JSID_IIT_ERP3` (path `/IIT_ERP3`), `JSID_SSOAdministration` (path `/SSOAdministration`, HttpOnly), `LAST_ACCESS_TIME`.

Follow the redirect with `GET /SSOAdministration/login.htm?sessionToken=...&requestedUrl=...` so the SSO session is bound to that `sessionToken`.

### Step 1.2 — Fetch security question (loop until known question)

Each call picks one of the user's 3 security questions on the server side and binds it to the active SSO session. Repeat this POST until the returned string matches one of the known questions in `.enverp`:

```http
POST /SSOAdministration/getSecurityQues.htm HTTP/1.1
Host: erp.iitkgp.ac.in
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

user_id=22XX10001
```

- **Response (`200 OK`, `text/plain`):**
  - Invalid user: `"FALSE"`
  - Valid user: exact question string configured on the user's ERP profile (e.g. `What was your first school?`).

### Step 1.3 — Verify password + security answer and trigger Email OTP

Note the endpoint spelling on the server: `getEmilOTP.htm` (missing the `a` in Email).

```http
POST /SSOAdministration/getEmilOTP.htm HTTP/1.1
Host: erp.iitkgp.ac.in
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest

user_id=22XX10001&password=<URL_ENCODED_PASSWORD>&answer=<URL_ENCODED_ANSWER>&typeee=SI&sessionToken=&requestedUrl=https%3A%2F%2Ferp.iitkgp.ac.in%2FIIT_ERP3%2F&email_otp=
```

- **Note on `sessionToken` form field:** In the live DOM, `<input name="sessionToken" id="sessionToken" value="">` is submitted empty; the server tracks the token via the `JSID_SSOAdministration` session established in Step 1.1 (or you may pass the URL `sessionToken` if desired).
- **Response (`200 OK`, `application/json`):**
  - Success: `{"msg": "An OTP(valid for a short time) has been sent to your email id registered with ERP, IIT Kharagpur. Please use that OTP for further processing. "}`
  - Failure: JSON whose `.msg` contains `"unable to send otp"` / error reason.

### Step 1.4 — Submit OTP to complete login

Once you read the 6-digit OTP from the user or registered email, submit the login form:

```http
POST /SSOAdministration/auth.htm HTTP/1.1
Host: erp.iitkgp.ac.in
Content-Type: application/x-www-form-urlencoded

user_id=22XX10001&password=<URL_ENCODED_PASSWORD>&answer=<URL_ENCODED_ANSWER>&typeee=SI&sessionToken=&requestedUrl=https%3A%2F%2Ferp.iitkgp.ac.in%2FIIT_ERP3%2F&email_otp=<OTP_CODE>
```

- **Response:** `302 Found` redirecting into `/IIT_ERP3/home.htm` (with `ssoToken` cookie set for `/`).

### Step 1.5 — Mint placement `ssoToken` and open `TrainingPlacementSSO`

Calling `TrainingPlacementSSO/ERPMonitoring.htm` directly right after login returns an empty `<rows><page>1</page>` XML payload unless the `TrainingPlacementSSO` servlet session has been initialized with the user's roll number via `TPStudent.jsp`.

1. **Fetch the menu launcher shell (optional if you already have `ssoToken` cookie, required if you want the exact form token):**
   ```http
   POST /IIT_ERP3/showmenu.htm HTTP/1.1
   Host: erp.iitkgp.ac.in
   Content-Type: application/x-www-form-urlencoded

   module_id=26&menu_id=11&link=https%3A%2F%2Ferp.iitkgp.ac.in%2FTrainingPlacementSSO%2FTPStudent.jsp&module_name=CDC&parent_display_name=Student&display_name=Application+of+Placement%2FInternship
   ```
   The response HTML contains `<form id="menuform" action="https://erp.iitkgp.ac.in/TrainingPlacementSSO/TPStudent.jsp" method="post">` with hidden inputs `ssoToken`, `module_id=26`, `menu_id=11`.

2. **Initialize the CDC Placement session:**
   ```http
   POST /TrainingPlacementSSO/TPStudent.jsp HTTP/1.1
   Host: erp.iitkgp.ac.in
   Content-Type: application/x-www-form-urlencoded

   ssoToken=<SSO_TOKEN>&module_id=26&menu_id=11
   ```
   - **Cookies set/updated:** `JSID_TrainingPlacementSSO`.
   - Once this `POST` (or a subsequent `GET /TrainingPlacementSSO/TPStudent.jsp` in the same session) runs, the server binds `rollno=22XX10001` and `yop=2026-2027` into the `TrainingPlacementSSO` session.

### Step 1.6 — Fetch all placement companies (raw XML feed)

 ⚠️ **Important quirk discovered during reverse engineering:**
`GET /TrainingPlacementSSO/TPStudent.jsp` must be requested immediately before `jqqueryid=37` in the same `JSID_TrainingPlacementSSO` session, and you should call `jqqueryid=37` **without** pagination query parameters (`rows=20&page=1`), because `TPStudent.jsp` primes a one-shot/session-backed query for `jqqueryid=37`:

```http
GET /TrainingPlacementSSO/TPStudent.jsp HTTP/1.1
Host: erp.iitkgp.ac.in
```
followed by:
```http
GET /TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=37 HTTP/1.1
Host: erp.iitkgp.ac.in
```

- **Response (`200 OK`, XML inside `text/html;charset=UTF-8`):**
  Returns all 26 rows in one XML document (`<rows><page>null</page><row id='0'><cell><![CDATA[...]]></cell>...</row></rows>`).
- **Cell order in each `<row>` for `jqqueryid=37`:**
  1. `companyname` — HTML `<a>` containing `onclick='TPComView("2026-2027","<com_id>");'` and company title.
  2. `view2` — Additional company details download link (`TPComDescription("2026-2027","<com_id>")`).
  3. `view3` — PPT download link (`TPPPTDescription("2026-2027","<com_id>")`).
  4. `designation` — HTML `<a>` containing `onclick='TPJNFView("<jnf_id>","<com_id>","2026-2027");'` and role title.
  5. `description` — Apply link (`TPJNFView("<jnf_id>","<com_id>","2026-2027")`).
  6. `ctc` — CTC string.
  7. `Currency` — e.g. `INR`, `JPY`.
  8. `view1` — JNF attachment download (`TPJNFDescription("2026-2027","<com_id>","<jnf_id>")`).
  9. `apply` — `"Y"` if applied, `""` if not applied.
  10. `resumedeadline_st` — `YYYY-MM-DD HH:MM` start timestamp.
  11. `resumedeadline` — `YYYY-MM-DD HH:MM` end timestamp.
  12. `interview_date_confirmed` — interview/selection status.
  13. `contract` — bond/contract details.

### Step 1.7 — Fetch a role's full Job Description & applied CV number

```http
GET /TrainingPlacementSSO/TPJNFView.jsp?jnf_id=<JNF_ID>&com_id=<COM_ID>&yop=2026-2027&user_type=SU&rollno=22XX10001 HTTP/1.1
Host: erp.iitkgp.ac.in
```

- **Response (`200 OK`, HTML):**
  - Contains the full Job Profile table (Form Type, Designation, CTC, Bond, CGPA Cut-off), Job Description text, and Allowed Departments table.
  - If not yet applied (and deadline is open), includes `ApplyCV1`, `ApplyCV2`, `ApplyCV3` links.
  - If already applied, includes `TPStudenApply.jsp?mode=cancel...` and `TPStudentResume2('22XX10001', '<RESUME_NO>')` which tells you whether CV `1`, `2`, or `3` is currently submitted.

### Step 1.8 — Apply or cancel/re-apply

- **Apply with CV 1, CV 2, or CV 3:**
  ```http
  GET /TrainingPlacementSSO/TPJNFViewAction.jsp?mode=ApplyCV1&rollno=22XX10001&year=2026-2027&com_id=<COM_ID>&jnf_id=<JNF_ID> HTTP/1.1
  Host: erp.iitkgp.ac.in
  ```
  *(Use `mode=ApplyCV1`, `mode=ApplyCV2`, or `mode=ApplyCV3`. Always call `/TrainingPlacementSSO/TPJNFViewAction.jsp`, never `/IIT_ERP3/TPJNFViewAction.jsp`.)*

- **Cancel an existing application (while window is open):**
  ```http
  GET /TrainingPlacementSSO/TPStudenApply.jsp?mode=cancel&year=2026-2027&rollno=22XX10001&com_id=<COM_ID>&jnf_id=<JNF_ID> HTTP/1.1
  Host: erp.iitkgp.ac.in
  ```
  *(Note the server's spelling: `TPStudenApply.jsp` without a `t`.)*

### Step 1.9 — Fetch CDC Notices (raw XML feed)

Initialize the notice query in the session, then fetch `jqqueryid=54`:

```http
GET /TrainingPlacementSSO/Notice.jsp HTTP/1.1
Host: erp.iitkgp.ac.in
```
followed by:
```http
GET /TrainingPlacementSSO/ERPMonitoring.htm?action=fetchData&jqqueryid=54&_search=false&nd=<EPOCH_MS>&rows=20&page=1&sidx=&sord=asc&totalrows=50 HTTP/1.1
Host: erp.iitkgp.ac.in
```

- **Cell order in each `<row>` for `jqqueryid=54`:**
  1. `id` — Notice ID (e.g. `1221`).
  2. `type` — `PLACEMENT` or `INTERNSHIP`.
  3. `category` — Subject (`Urgent`, `Schedule`, `CV Submission`, `Date extension`, `PPT/Workshop/Seminars etc`, `Shortlist`, `PPO`).
  4. `company` — Company name.
  5. `notice` — HTML `<a title='<FULL_NOTICE_TEXT>'>` containing the full announcement text in the `title` attribute.
  6. `noticeby` — `CDC, IIT Kharagpur`.
  7. `noticeat` — `DD-MM-YYYY HH:MM` timestamp.
  8. `view1` — Attachment link if present (`NoticeView('<ID>','2026-2027')` -> `AdmFilePDF.htm?type=NOTICE&year=2026-2027&id=<ID>`).

### Step 1.10 — Keepalive & Logout

- **Keepalive (every 27 minutes in the browser UI):**
  ```http
  GET /IIT_ERP3/holdSession.htm?rand_id=<15_DIGIT_RANDOM_INT> HTTP/1.1
  Host: erp.iitkgp.ac.in
  ```
- **Logout (verified live):**
  ```http
  GET /IIT_ERP3/logout.htm HTTP/1.1
  Host: erp.iitkgp.ac.in
  ```
  - **Response:** `302 Found` -> redirects to `https://erp.iitkgp.ac.in/SSOAdministration/login.htm?sessionToken=<NEW_TOKEN>&requestedUrl=https://erp.iitkgp.ac.in/IIT_ERP3/home.htm`.
  - Clears `ssoToken`, `JSID_IIT_ERP3`, `JSID_Academic`, and `JSID_TrainingPlacementSSO`, leaving only `LAST_ACCESS_TIME` and a fresh `SSOAdministration` login page.

---

## 2. UI workflow reference & CV selection notes

### Which CV to send

Do not pick from a fixed "SDE versus AI" rule. Read the role name and the job text, then pick the CV whose evidence matches that text.

- **CV 1** is the systems and product resume: FastAPI/Celery services, the billing and access-control plane, React/Node, remote console, VR/Unity.
- **CV 2** is the model, evaluation, and analytics resume: clinical NER, Qwen, vLLM, PyTorch, Hugging Face, and the data-analytics competition.

Preview them from the placement page:
- CV 1: `TrainingPlacementSSO/cvGenerate.jsp?resume_no=1`
- CV 2: `TrainingPlacementSSO/cvGenerate.jsp?resume_no=2`
- CV 3: `TrainingPlacementSSO/cvGenerate.jsp?resume_no=3`

Judgement used on 27 Oct 2026:

| Role | CV | Reason |
|---|---|---|
| American Express, Data Science & Analytics | CV 2 | Title is data science and analytics. The portal had no description yet |
| HILABS, AI Engineer | CV 2 | Description names Qwen, vLLM, Ollama, PyTorch, Hugging Face, scikit-learn, and healthcare data through to production |
| HILABS, Associate Product Manager | CV 1 | Client delivery, SQL, and shipping with engineering. Model work is only "ideally" |
| Meesho, Business Management | CV 1 | Business ownership. The product and billing story is closer than a model-evaluation resume |
| Pocket FM, Management Trainee | CV 1 | Growth, retention, and product execution. Analytics is only one line, so the gap is small |
| WhiteOak Capital, Research Executive | CV 2 | Investment research and quantitative screening |

Cookie values and `ssoToken` are session secrets. Do not write them into this file or into git.

## 3. Read-only client

`scripts/erp_cdc.py` follows the calls above. It reads `ROLLNO`, `PASSWORD`, and the security answers from `.enverp`, rotates the security question until one of those answers matches, asks for the email OTP, then prints the placement grid and the newest notices. It does not apply or cancel.

```bash
python3 scripts/erp_cdc.py
python3 scripts/erp_cdc.py --json
python3 scripts/erp_cdc.py --probe
```

`--probe` stops after a known security question and does not send the password or request an OTP.
