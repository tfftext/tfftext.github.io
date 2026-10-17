import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, onSnapshot, orderBy, query, limit, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig, DEFAULT_SCHEMA, isFirebaseConfigured } from "./firebase-config.js";

const loginPanel = document.querySelector("#login-panel");
const loginForm = document.querySelector("#login-form");
const loginNotice = document.querySelector("#login-notice");
const dashboard = document.querySelector("#dashboard");
const dashboardNotice = document.querySelector("#dashboard-notice");
const schemaStatus = document.querySelector("#schema-status");
const publishDefaultsButton = document.querySelector("#publish-defaults");
const questionForm = document.querySelector("#question-form");
const questionList = document.querySelector("#question-list");
const questionType = document.querySelector("#question-type");
const optionsGroup = document.querySelector("#options-group");
const cancelEditButton = document.querySelector("#cancel-edit");
const submissionRows = document.querySelector("#submission-rows");
const searchInput = document.querySelector("#submission-search");
const exportButton = document.querySelector("#export-csv");

let auth = null;
let db = null;
let schemaRef = null;
let currentSchema = cloneDefaultSchema();
let schemaPublished = false;
let currentSubmissions = [];
let stopSubmissions = null;

if (isFirebaseConfigured()) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    schemaRef = doc(db, "settings", "formSchema");
    onAuthStateChanged(auth, handleAuthChange);
  } catch (error) {
    console.error("Firebase could not be initialized", error);
    showNotice(loginNotice, "Firebase could not be initialized. Check the settings in firebase-config.js.", "error");
  }
} else {
  showNotice(loginNotice, "Add your Firebase web-app settings to firebase-config.js before signing in.", "error");
  loginForm.querySelector("button[type=submit]").disabled = true;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth) return;
  const email = document.querySelector("#admin-email").value.trim();
  const password = document.querySelector("#admin-password").value;
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
    showNotice(loginNotice, "", "info");
  } catch (error) {
    console.error("Admin sign-in failed", error);
    showNotice(loginNotice, "Sign-in failed. Check the email, password, and Firebase Authentication setup.", "error");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#sign-out").addEventListener("click", () => signOut(auth));
questionType.addEventListener("change", () => { optionsGroup.hidden = questionType.value !== "select"; });
cancelEditButton.addEventListener("click", resetQuestionEditor);
searchInput.addEventListener("input", renderSubmissions);
exportButton.addEventListener("click", exportCsv);
publishDefaultsButton.addEventListener("click", async () => {
  await saveSchema(cloneDefaultSchema().questions, true);
});

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const idToEdit = document.querySelector("#question-id").value;
  const label = document.querySelector("#question-label").value.trim();
  const type = questionType.value;
  const options = type === "select"
    ? document.querySelector("#question-options").value.split("\n").map((value) => value.trim()).filter(Boolean).slice(0, 20).map((value) => value.slice(0, 120))
    : [];
  if (type === "select" && !options.length) {
    showNotice(dashboardNotice, "Add at least one dropdown option, with one option on each line.", "error");
    return;
  }
  const question = {
    id: idToEdit || createQuestionId(label),
    label,
    type,
    required: document.querySelector("#question-required").checked,
    enabled: document.querySelector("#question-enabled").checked,
    options
  };
  const nextQuestions = currentSchema.questions.map((item) => ({ ...item, options: [...item.options] }));
  if (idToEdit) {
    const index = nextQuestions.findIndex((item) => item.id === idToEdit);
    if (index < 0) return;
    nextQuestions[index] = question;
  } else {
    if (nextQuestions.length >= 20) {
      showNotice(dashboardNotice, "This form supports up to 20 questions. Remove one before adding another.", "error");
      return;
    }
    nextQuestions.push(question);
  }
  await saveSchema(nextQuestions, false);
});

async function handleAuthChange(user) {
  if (!user) {
    if (stopSubmissions) stopSubmissions();
    stopSubmissions = null;
    currentSubmissions = [];
    loginPanel.hidden = false;
    dashboard.hidden = true;
    return;
  }
  loginPanel.hidden = true;
  dashboard.hidden = false;
  document.querySelector("#signed-in-email").textContent = user.email || "Admin account";
  showNotice(dashboardNotice, "Loading your admin workspace…", "info");
  try {
    const schemaSnapshot = await getDoc(schemaRef);
    if (schemaSnapshot.exists()) {
      const loaded = normalizeSchema(schemaSnapshot.data());
      if (!loaded) throw new Error("The saved form schema is invalid.");
      currentSchema = loaded;
      schemaPublished = true;
      publishDefaultsButton.hidden = true;
      setSchemaStatus(`Published to visitors · Version ${currentSchema.schemaVersion}`, "success");
    } else {
      currentSchema = cloneDefaultSchema();
      schemaPublished = false;
      publishDefaultsButton.hidden = false;
      setSchemaStatus("The shared form has not been published yet. Publish the defaults to let visitors submit requests.");
    }
    renderQuestionList();
    showNotice(dashboardNotice, "", "info");
  } catch (error) {
    console.error("Could not load the form schema", error);
    currentSchema = cloneDefaultSchema();
    schemaPublished = false;
    publishDefaultsButton.hidden = true;
    setSchemaStatus("The form settings could not be read. Check that this account's UID is listed in the Firestore admin rules.", "error");
    showNotice(dashboardNotice, "Firestore denied access to the admin workspace. Check the authorized admin UID and deployed rules.", "error");
  }
  watchSubmissions();
}

function watchSubmissions() {
  if (stopSubmissions) stopSubmissions();
  const submissionsQuery = query(collection(db, "submissions"), orderBy("createdAt", "desc"), limit(500));
  stopSubmissions = onSnapshot(submissionsQuery, (snapshot) => {
    currentSubmissions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    document.querySelector("#submission-count").textContent = `${currentSubmissions.length} recent request${currentSubmissions.length === 1 ? "" : "s"}${currentSubmissions.length === 500 ? " · showing latest 500" : ""}`;
    renderSubmissions();
  }, (error) => {
    console.error("Could not load submissions", error);
    document.querySelector("#submission-count").textContent = "Submissions are unavailable";
    submissionRows.replaceChildren(emptyTableRow("Check the authorized admin UID in Firestore rules."));
  });
}

async function saveSchema(questions, isDefaultPublish) {
  const active = questions.filter((question) => question.enabled);
  if (!active.length) {
    showNotice(dashboardNotice, "Keep at least one question visible on the public form.", "error");
    return;
  }
  const button = questionForm.querySelector("button[type=submit]");
  button.disabled = true;
  const nextSchema = {
    schemaVersion: Math.max(1, Number(currentSchema.schemaVersion) || 1) + (schemaPublished ? 1 : 1),
    questions,
    publicFieldIds: active.map((question) => question.id),
    requiredFieldIds: active.filter((question) => question.required).map((question) => question.id)
  };
  try {
    await setDoc(schemaRef, nextSchema);
    currentSchema = nextSchema;
    schemaPublished = true;
    publishDefaultsButton.hidden = true;
    setSchemaStatus(`Published to visitors · Version ${currentSchema.schemaVersion}`, "success");
    showNotice(dashboardNotice, isDefaultPublish ? "Default questions are published. Visitors can now send requests." : "Question changes are saved and published.", "success");
    renderQuestionList();
    resetQuestionEditor();
  } catch (error) {
    console.error("Could not save the form schema", error);
    showNotice(dashboardNotice, "Could not publish the form. Check your connection and the Firestore schema write rule.", "error");
  } finally {
    button.disabled = false;
  }
}

function renderQuestionList() {
  questionList.replaceChildren();
  document.querySelector("#question-count").textContent = `(${currentSchema.questions.length})`;
  if (!currentSchema.questions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-question";
    empty.textContent = "No questions yet. Add one using the editor.";
    questionList.append(empty);
    return;
  }
  currentSchema.questions.forEach((question, index) => {
    const item = document.createElement("div");
    item.className = `question-item${question.enabled ? "" : " is-hidden"}`;
    const copy = document.createElement("div");
    const title = document.createElement("div");
    title.className = "question-title";
    title.textContent = question.label;
    const meta = document.createElement("div");
    meta.className = "question-meta";
    meta.textContent = `${typeLabel(question.type)}${question.required ? " · Required" : " · Optional"}${question.enabled ? " · Public" : " · Hidden"}`;
    copy.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "question-actions";
    actions.append(
      makeTinyButton("Edit", "edit", question.id),
      makeTinyButton(question.enabled ? "Hide" : "Enable", "toggle", question.id),
      makeTinyButton("Remove", "remove", question.id, true)
    );
    item.append(copy, actions);
    questionList.append(item);
  });
  questionList.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const question = currentSchema.questions.find((item) => item.id === button.dataset.id);
      if (!question) return;
      if (button.dataset.action === "edit") {
        beginEdit(question);
      } else if (button.dataset.action === "toggle") {
        await saveSchema(currentSchema.questions.map((item) => item.id === question.id ? { ...item, enabled: !item.enabled } : item), false);
      } else if (button.dataset.action === "remove") {
        if (!window.confirm(`Remove “${question.label}” from the form? Existing submissions will be kept.`)) return;
        await saveSchema(currentSchema.questions.filter((item) => item.id !== question.id), false);
      }
    });
  });
}

function beginEdit(question) {
  document.querySelector("#question-id").value = question.id;
  document.querySelector("#question-label").value = question.label;
  questionType.value = question.type;
  document.querySelector("#question-options").value = question.options.join("\n");
  document.querySelector("#question-required").checked = question.required;
  document.querySelector("#question-enabled").checked = question.enabled;
  optionsGroup.hidden = question.type !== "select";
  document.querySelector("#editor-title").textContent = "Edit question";
  document.querySelector("#save-question").innerHTML = 'Save changes <span>→</span>';
  cancelEditButton.hidden = false;
  document.querySelector("#question-label").focus();
}

function resetQuestionEditor() {
  questionForm.reset();
  document.querySelector("#question-id").value = "";
  document.querySelector("#question-enabled").checked = true;
  document.querySelector("#editor-title").textContent = "Add a question";
  document.querySelector("#save-question").innerHTML = 'Add question <span>→</span>';
  optionsGroup.hidden = true;
  cancelEditButton.hidden = true;
}

function renderSubmissions() {
  const needle = searchInput.value.trim().toLowerCase();
  const filtered = currentSubmissions.filter((submission) => {
    if (!needle) return true;
    const answers = submission.answers && typeof submission.answers === "object" ? Object.values(submission.answers) : [];
    const timestamp = submission.createdAt?.toDate ? submission.createdAt.toDate().toLocaleString() : "";
    return `${answers.join(" ")} ${submission.status || "new"} ${timestamp}`.toLowerCase().includes(needle);
  });
  submissionRows.replaceChildren();
  if (!filtered.length) {
    submissionRows.append(emptyTableRow(currentSubmissions.length ? "No submissions match this search." : "No submissions yet."));
    return;
  }
  for (const submission of filtered) {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    dateCell.textContent = submission.createdAt?.toDate ? submission.createdAt.toDate().toLocaleString() : "Just received";
    const answersCell = document.createElement("td");
    answersCell.className = "answers-cell";
    const answers = submission.answers && typeof submission.answers === "object" ? submission.answers : {};
    const labels = new Map(currentSchema.questions.map((question) => [question.id, question.label]));
    for (const [id, value] of Object.entries(answers)) {
      const line = document.createElement("p");
      line.className = "answer-line";
      const label = document.createElement("strong");
      label.textContent = `${labels.get(id) || id}: `;
      const answer = document.createElement("span");
      answer.textContent = typeof value === "string" ? value : JSON.stringify(value);
      line.append(label, answer);
      answersCell.append(line);
    }
    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    const contacted = submission.status === "contacted";
    status.className = `status-badge${contacted ? " contacted" : ""}`;
    status.textContent = contacted ? "Contacted" : "New";
    statusCell.append(status);
    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const markButton = makeTinyButton(contacted ? "Mark new" : "Contacted", "status", submission.id);
    const deleteButton = makeTinyButton("Delete", "delete", submission.id, true);
    actions.append(markButton, deleteButton);
    actionsCell.append(actions);
    row.append(dateCell, answersCell, statusCell, actionsCell);
    submissionRows.append(row);
  }
  submissionRows.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const submission = currentSubmissions.find((item) => item.id === button.dataset.id);
      if (!submission) return;
      try {
        if (button.dataset.action === "status") {
          await updateDoc(doc(db, "submissions", submission.id), { status: submission.status === "contacted" ? "new" : "contacted" });
        } else if (button.dataset.action === "delete" && window.confirm("Delete this consultation request? This cannot be undone.")) {
          await deleteDoc(doc(db, "submissions", submission.id));
        }
      } catch (error) {
        console.error("Could not update this submission", error);
        showNotice(dashboardNotice, "That submission could not be updated. Check your admin access and connection.", "error");
      }
    });
  });
}

function exportCsv() {
  if (!currentSubmissions.length) {
    showNotice(dashboardNotice, "There are no submissions to export yet.", "info");
    return;
  }
  const labels = new Map(currentSchema.questions.map((question) => [question.id, question.label]));
  const answerIds = [...new Set(currentSubmissions.flatMap((submission) => Object.keys(submission.answers || {})))];
  const columns = ["Received", ...answerIds.map((id) => labels.get(id) || id), "Status"];
  const rows = currentSubmissions.map((submission) => {
    const answers = submission.answers || {};
    const received = submission.createdAt?.toDate ? submission.createdAt.toDate().toISOString() : "";
    return [received, ...answerIds.map((id) => answers[id] ?? ""), submission.status || "new"];
  });
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `consultation-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeSchema(data) {
  if (!data || !Number.isInteger(data.schemaVersion) || !Array.isArray(data.questions) || data.questions.length > 20) return null;
  const questions = data.questions.map((question) => {
    if (!question || typeof question !== "object") return null;
    const id = typeof question.id === "string" ? question.id : "";
    const label = typeof question.label === "string" ? question.label.trim().slice(0, 120) : "";
    const type = ["short", "long", "email", "phone", "select"].includes(question.type) ? question.type : "short";
    const options = Array.isArray(question.options) ? question.options.filter((value) => typeof value === "string" && value.trim()).slice(0, 20).map((value) => value.trim().slice(0, 120)) : [];
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id) || !label || (type === "select" && !options.length)) return null;
    return { id, label, type, required: question.required === true, enabled: question.enabled !== false, options: type === "select" ? options : [] };
  });
  if (questions.some((item) => !item) || !questions.length || new Set(questions.map((item) => item.id)).size !== questions.length) return null;
  return { schemaVersion: data.schemaVersion, questions };
}

function makeTinyButton(label, action, id, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `tiny-button${danger ? " danger" : ""}`;
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

function emptyTableRow(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 4;
  cell.className = "empty-row";
  cell.textContent = message;
  row.append(cell);
  return row;
}

function setSchemaStatus(message, kind = "info") {
  schemaStatus.textContent = message;
  schemaStatus.dataset.kind = kind;
}

function showNotice(element, message, kind = "info") {
  element.textContent = message;
  element.dataset.kind = kind;
  element.hidden = !message;
}

function typeLabel(type) {
  return ({ short: "Short text", long: "Long text", email: "Email", phone: "Phone", select: "Dropdown" })[type] || "Short text";
}

function createQuestionId(label) {
  const slug = label.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "question";
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function cloneDefaultSchema() {
  return JSON.parse(JSON.stringify(DEFAULT_SCHEMA));
}
