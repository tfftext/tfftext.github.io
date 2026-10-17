# Let's Grow With Mamta consultation portal

A static, mobile-friendly consultation website with a Firebase Authentication admin dashboard and a shared Firestore form schema. The original starter ZIP was not present in the current workspace, so this package rebuilds the seven described site files from the available conversation details and includes Firebase setup and Firestore rules.

## What is included

- `index.html`, `style.css`, `app.js` — public consultation website and live question form.
- `admin.html`, `admin.css`, `admin.js` — email/password admin login, question manager, submissions, search, status updates, delete, and CSV export.
- `firebase-config.js` — public Firebase web-app placeholders and sensible default questions.
- `firestore.rules` — database rules with the admin UID you supplied already set.

Default questions are full name, gender, contact number, email address, consultation topic, preferred contact time, and an additional message. An admin can add, edit, hide, enable, or remove questions. Publishing a change updates the one shared schema document; open public pages receive changes in real time.

## Firebase setup

1. Create a Firebase project and register a Web app. In `firebase-config.js`, replace `YOUR_API_KEY`, `YOUR_PROJECT_ID`, and `YOUR_APP_ID` with the Web app settings from Firebase Console → Project settings. The Firebase web config is visible to site visitors by design; never put a service-account key, private key, or admin password in these files.
2. In Firebase Authentication, enable **Email/Password** and create your admin user. Add your GitHub Pages domain (for example, `yourname.github.io`) to Authentication's authorized domains if needed.
3. The supplied admin UID is already set in `firestore.rules`. Publish that file from Firestore Database → Rules. If you add another admin later, add that user's UID to the same list.
4. Create a Cloud Firestore database. Sign in at `admin.html` with the admin account. On first login, choose **Publish default questions**. This creates `settings/formSchema` with the defaults; no public writes to the schema are allowed.
5. Upload the project files to your GitHub Pages site. Open `/admin.html` to manage questions and view submissions. Once the defaults are published, public form submissions are enabled.

Until Firebase is configured, the public page still renders the default questions as a preview, and the admin page explains how to connect Firebase. If the shared schema is missing or unavailable, the public page continues showing the defaults but disables submission until an admin publishes the schema.

## Firestore data shape

The admin publishes one document at `settings/formSchema`. It contains:

```text
schemaVersion: integer
questions: [ { id, label, type, required, enabled, options } ]
publicFieldIds: [enabled question IDs]
requiredFieldIds: [enabled and required question IDs]
```

Public submissions are documents in `submissions`. Each has `answers` (a map keyed by question ID, with string values), `schemaVersion`, `createdAt` (server timestamp), and `status` (`new`). The dashboard can update the status to `contacted` or delete the document.

## Firestore security rules

The full, ready-to-paste rules are in `firestore.rules`. They allow public reads of the single published schema and public **create-only** submission writes. Submission creation is bounded to currently enabled question IDs, requires every published required ID, caps the form at 20 fields and each answer at 2,000 characters, rejects extra document fields, and requires a server timestamp and initial `new` status. Only the configured admin UID can create/update/delete the schema or read/update/delete submissions.

The rules validate every dynamic answer as a bounded string; the browser additionally applies required, email, and dropdown input checks. Rules cannot generically validate a different data type for every dynamic map entry, so the schema deliberately stores answers as strings. Admin output uses text rendering, and CSV export escapes spreadsheet formula prefixes.

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.uid in ['WQcQKgvJb3Wj1rsP1cWZRsQak8m1'];
    }

    function validSchema() {
      let data = request.resource.data;
      return data.keys().hasOnly([
          'schemaVersion', 'questions', 'publicFieldIds', 'requiredFieldIds'
        ])
        && data.keys().hasAll([
          'schemaVersion', 'questions', 'publicFieldIds', 'requiredFieldIds'
        ])
        && data.schemaVersion is int
        && data.schemaVersion >= 1
        && data.questions is list
        && data.questions.size() >= 1
        && data.questions.size() <= 20
        && data.publicFieldIds is list
        && data.publicFieldIds.size() >= 1
        && data.publicFieldIds.size() <= 20
        && data.requiredFieldIds is list
        && data.requiredFieldIds.size() <= 20
        && data.publicFieldIds.hasAll(data.requiredFieldIds);
    }

    function validText(value) {
      return value is string && value.size() <= 2000;
    }

    function validTextValues(values) {
      return values.size() <= 20
        && (values.size() < 1 || validText(values[0]))
        && (values.size() < 2 || validText(values[1]))
        && (values.size() < 3 || validText(values[2]))
        && (values.size() < 4 || validText(values[3]))
        && (values.size() < 5 || validText(values[4]))
        && (values.size() < 6 || validText(values[5]))
        && (values.size() < 7 || validText(values[6]))
        && (values.size() < 8 || validText(values[7]))
        && (values.size() < 9 || validText(values[8]))
        && (values.size() < 10 || validText(values[9]))
        && (values.size() < 11 || validText(values[10]))
        && (values.size() < 12 || validText(values[11]))
        && (values.size() < 13 || validText(values[12]))
        && (values.size() < 14 || validText(values[13]))
        && (values.size() < 15 || validText(values[14]))
        && (values.size() < 16 || validText(values[15]))
        && (values.size() < 17 || validText(values[16]))
        && (values.size() < 18 || validText(values[17]))
        && (values.size() < 19 || validText(values[18]))
        && (values.size() < 20 || validText(values[19]));
    }

    function validSubmission() {
      let schemaPath = /databases/$(database)/documents/settings/formSchema;
      return exists(schemaPath)
        && request.resource.data.keys().hasOnly([
          'answers', 'schemaVersion', 'createdAt', 'status'
        ])
        && request.resource.data.keys().hasAll([
          'answers', 'schemaVersion', 'createdAt', 'status'
        ])
        && request.resource.data.schemaVersion is int
        && request.resource.data.schemaVersion == get(schemaPath).data.schemaVersion
        && request.resource.data.createdAt == request.time
        && request.resource.data.status == 'new'
        && request.resource.data.answers is map
        && request.resource.data.answers.size() <= 20
        && request.resource.data.answers.keys().hasOnly(get(schemaPath).data.publicFieldIds)
        && request.resource.data.answers.keys().hasAll(get(schemaPath).data.requiredFieldIds)
        && validTextValues(request.resource.data.answers.values());
    }

    match /settings/formSchema {
      allow get: if true;
      allow create, update: if isAdmin() && validSchema();
      allow delete: if isAdmin();
    }

    match /submissions/{submissionId} {
      allow create: if validSubmission();
      allow get, list, update, delete: if isAdmin();
    }
  }
}
```

Firestore rules cannot rate-limit anonymous creates. For a public site receiving spam, add Firebase App Check and/or move intake behind a rate-limited backend. Keep Firestore rules enabled; hiding the admin page is not an access control.

## Hosting note

Open the site over GitHub Pages or another HTTP(S) host. Some browsers block Firebase modules when the HTML file is opened directly from disk. Firebase quotas and GitHub Pages limits apply.
