# IIT KGP ERP — CDC Placement Portal

A fast, client-direct web workspace for IIT Kharagpur CDC placements and notices.

## Getting Started

### 1. Install the Chrome Extension Bridge
The portal talks directly from your browser to `https://erp.iitkgp.ac.in` using a lightweight local extension bridge:

1. Open Chrome/Brave/Edge and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the [`extension/`](./extension) folder from this repository.

### 2. Run the Portal
Start the frontend and local cache server with a single script:

```bash
./scripts/run_erp_portal.sh
```

Then open **[http://127.0.0.1:5173](http://127.0.0.1:5173)** in your browser, click **Edit Login** once to save your roll number, password, and security answers locally in your browser, and use **Send OTP** to log in.

---

## Privacy & Security

Privacy and credential isolation are the top priorities of this project:

- **100% Client-Side ERP Authentication:** Your roll number, ERP password, security question answers, email OTP, and ERP session cookies stay strictly inside your browser (`localStorage` and browser cookie jar).
- **Direct Browser-to-ERP Traffic:** All login, role fetching, JD viewing, and CV application/cancellation requests go directly from your browser extension to `https://erp.iitkgp.ac.in`. The extension strictly blocks outbound requests to any other domain.
- **Zero-Credential Backend Boundary:** The backend API explicitly inspects and rejects (`HTTP 400`) any request payload containing credential fields (`rollno`, `password`, `security_answers`, `answer`, `otp`, `ssotoken`, `cookies`).
- **No Raw Roll Number Storage:** Even if you opt into AI features, your roll number is never stored on the server—only a one-way SHA-256 digest and a cryptographic `cvset_hash` of your 3 CVs are used to bind your cache session.

---

## Smart Apply (Optional)

**Smart Apply** is a completely **optional** feature that uses AI to compare your 3 ERP CVs (`CV1`, `CV2`, `CV3`) against open Job Descriptions and recommend or auto-apply with the best-matching CV.

- **Opt-In Only:** Disabled by default. No CV PDFs, roles, or JDs are ever sent to the backend unless you explicitly grant consent in the portal.
- **Full Manual Control:** You can use the entire portal—browsing roles, reading notices, viewing JDs, and applying or switching between `CV1`, `CV2`, and `CV3`—without ever enabling Smart Apply.
