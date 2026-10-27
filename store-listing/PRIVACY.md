# Privacy tab answers

Use these on the Chrome Web Store Privacy form.

## Single purpose

This extension is a local browser bridge so the IIT Kharagpur CDC Placement Portal can call https://erp.iitkgp.ac.in with the student’s existing ERP session cookies.

## Permission justifications

**cookies**
Needed to read and clear ERP session cookies for https://erp.iitkgp.ac.in so the portal can stay signed in, fetch roles/notices/JDs, apply or cancel, and log out. Cookies are used only for that ERP origin and are not sent to any other site.

**Host permission https://erp.iitkgp.ac.in/**
Needed to send login, OTP, role, notice, JD, apply, and cancel requests only to official ERP. The extension rejects any other host.

**Content scripts on localhost / 127.0.0.1 / 34.100.133.60 / ewrpkgp.in**
Needed so the CDC Placement Portal page can send messages to the extension. Public use is limited to https://ewrpkgp.in and https://www.ewrpkgp.in. The background script rejects every other site.

## Data usage

- The extension does not collect analytics.
- The extension does not sell or share user data.
- Credentials stay in the student’s browser storage and cookie jar.
- ERP requests stay between Chrome and erp.iitkgp.ac.in.
- Optional AI matching is a separate portal setting and is off by default.

## Privacy policy URL

Paste:

`https://ewrpkgp.in/privacy.html`

The URL must return HTTP 200 over HTTPS before you submit.

## Certification

- You certify the extension complies with the Chrome Web Store Developer Program Policies.
- You certify the privacy disclosures are accurate.
- You certify you do not sell personal data.

## Test instructions tab

```
This extension only works with the CDC Placement Portal.

1. Install the uploaded package.
2. Open https://ewrpkgp.in/ or http://127.0.0.1:5173/
3. Confirm the portal detects the extension (no “extension bridge required” error after reload).
4. Open Set up login. Enter a test IIT KGP ERP roll number and click Fetch questions. Three ERP security questions should appear.
5. Save login locally, click Send OTP, enter the official ERP email OTP, then Open CDC.
6. Roles and notices should load from erp.iitkgp.ac.in.
7. Logout should clear the ERP session in this browser.

Reviewer note: A live IIT Kharagpur ERP account is required. The extension cannot log in without the student’s official ERP credentials and email OTP. Credentials are stored only in the reviewer’s browser.

Do not test against any host except erp.iitkgp.ac.in.
```
