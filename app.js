import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig, DEFAULT_SCHEMA, isFirebaseConfigured } from "./firebase-config.js";

const form = document.querySelector("#consultation-form");
if (form) startPublicForm();

function startPublicForm() {
  const fieldsRoot = document.querySelector("#question-fields");
  const notice = document.querySelector("#form-notice");
  const submitButton = document.querySelector("#submit-button");
  const successPanel = document.querySelector("#success-panel");
  const anotherButton = document.querySelector("#another-request");
  let activeSchema = cloneDefaultSchema();
  let isPublished = false;
  let db = null;
  let schemaSignature = "";

  renderQuestions();
  showConfigurationState();

  anotherButton.addEventListener("click", () => {
    successPanel.hidden = true;
    form.hidden = false;
    form.reset();
    showConfigurationState();
    document.querySelector("#consultation").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isPublished || !db) {
      showNotice("The shared form is not published yet. Please try again later.", "error");
      return;
    }
    if (!form.reportValidity()) return;

    const answers = {};
    for (const question of activeSchema.questions.filter((item) => item.enabled)) {
      const control = form.elements.namedItem(question.id);
      const answer = String(control?.value ?? "").trim();
      if (question.required && !answer) {
        control?.setCustomValidity("Please complete this field.");
        control?.reportValidity();
        control?.setCustomValidity("");
        return;
      }
      if (answer) answers[question.id] = answer;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Sending your request…";
    try {
      await addDoc(collection(db, "submissions"), {
        answers,
        schemaVersion: activeSchema.schemaVersion,
        createdAt: serverTimestamp(),
        status: "new"
      });
      form.hidden = true;
      notice.hidden = true;
      successPanel.hidden = false;
    } catch (error) {
      console.error("Could not submit consultation request", error);
      showNotice("We couldn't send your request right now. Please check your connection and try again.", "error");
    } finally {
      submitButton.disabled = !isPublished;
      submitButton.innerHTML = 'Send consultation request <span aria-hidden="true">→</span>';
    }
  });

  if (!isFirebaseConfigured()) return;
  try {
    db = getFirestore(initializeApp(firebaseConfig));
    const schemaRef = doc(db, "settings", "formSchema");
    onSnapshot(schemaRef, (snapshot) => {
      if (!snapshot.exists()) {
        isPublished = false;
        applySchema(cloneDefaultSchema());
        showConfigurationState("The default questions are shown while the shared form is being set up. Submissions will open after an admin publishes it.");
        return;
      }
      const remoteSchema = normalizeSchema(snapshot.data());
      if (!remoteSchema) {
        isPublished = false;
        applySchema(cloneDefaultSchema());
        showConfigurationState("The published form configuration could not be read. Please contact the site administrator.", "error");
        return;
      }
      isPublished = true;
      applySchema(remoteSchema);
      showConfigurationState();
    }, (error) => {
      console.error("Could not load the shared form", error);
      isPublished = false;
      applySchema(cloneDefaultSchema());
      showConfigurationState("The shared questions could not be loaded. The default questions are shown, but submissions are temporarily unavailable.", "error");
    });
  } catch (error) {
    console.error("Firebase could not be initialized", error);
    isPublished = false;
    showConfigurationState("Add your Firebase web-app settings to firebase-config.js to connect this form.", "error");
  }

  function applySchema(nextSchema) {
    const previousAnswers = readAnswers();
    const signature = JSON.stringify(nextSchema);
    activeSchema = nextSchema;
    if (signature !== schemaSignature) {
      schemaSignature = signature;
      renderQuestions(previousAnswers);
    }
    submitButton.disabled = !isPublished || !activeSchema.questions.some((question) => question.enabled);
  }

  function renderQuestions(previousAnswers = {}) {
    fieldsRoot.replaceChildren();
    const enabledQuestions = activeSchema.questions.filter((question) => question.enabled);
    if (!enabledQuestions.length) {
      const empty = document.createElement("p");
      empty.className = "empty-form-message";
      empty.textContent = "The consultation form is being updated. Please check back soon.";
      fieldsRoot.append(empty);
      return;
    }

    for (const question of enabledQuestions) {
      const wrapper = document.createElement("div");
      wrapper.className = `field${question.type === "long" ? " field-full" : ""}`;
      const label = document.createElement("label");
      label.htmlFor = question.id;
      label.append(document.createTextNode(question.label));
      if (question.required) {
        const required = document.createElement("span");
        required.className = "required-mark";
        required.textContent = " *";
        label.append(required);
      }

      let control;
      if (question.type === "select") {
        control = document.createElement("select");
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose an option";
        placeholder.disabled = true;
        placeholder.selected = true;
        control.append(placeholder);
        for (const optionText of question.options) {
          const option = document.createElement("option");
          option.value = optionText;
          option.textContent = optionText;
          control.append(option);
        }
      } else if (question.type === "long") {
        control = document.createElement("textarea");
        control.placeholder = "Write your answer here";
      } else {
        control = document.createElement("input");
        control.type = question.type === "phone" ? "tel" : question.type === "email" ? "email" : "text";
        control.placeholder = question.type === "phone" ? "Your phone number" : question.type === "email" ? "you@example.com" : "Your answer";
        if (question.type === "phone") control.autocomplete = "tel";
        if (question.type === "email") control.autocomplete = "email";
      }
      control.id = question.id;
      control.name = question.id;
      control.required = question.required;
      control.maxLength = 2000;
      control.dataset.questionId = question.id;
      control.value = previousAnswers[question.id] || "";
      wrapper.append(label, control);
      fieldsRoot.append(wrapper);
    }
  }

  function readAnswers() {
    const answers = {};
    fieldsRoot.querySelectorAll("[data-question-id]").forEach((control) => {
      answers[control.dataset.questionId] = control.value;
    });
    return answers;
  }

  function showConfigurationState(message, kind = "info") {
    if (!message && !isFirebaseConfigured()) message = "Add your Firebase web-app settings to firebase-config.js to connect this form.";
    else if (!message && !isPublished) message = "The default questions are shown while the shared form is being set up. Submissions will open after an admin publishes it.";
    if (!message) {
      notice.hidden = true;
      submitButton.disabled = !activeSchema.questions.some((question) => question.enabled);
      return;
    }
    showNotice(message, kind);
    submitButton.disabled = !isPublished || !activeSchema.questions.some((question) => question.enabled);
  }

  function showNotice(message, kind = "info") {
    notice.textContent = message;
    notice.dataset.kind = kind;
    notice.hidden = false;
  }
}

function cloneDefaultSchema() {
  return JSON.parse(JSON.stringify(DEFAULT_SCHEMA));
}

function normalizeSchema(data) {
  if (!data || !Number.isInteger(data.schemaVersion) || !Array.isArray(data.questions)) return null;
  const questions = data.questions.slice(0, 20).map((question) => {
    if (!question || typeof question !== "object") return null;
    const id = typeof question.id === "string" ? question.id : "";
    const label = typeof question.label === "string" ? question.label.trim().slice(0, 120) : "";
    const type = ["short", "long", "email", "phone", "select"].includes(question.type) ? question.type : "short";
    const options = Array.isArray(question.options) ? question.options.filter((option) => typeof option === "string" && option.trim()).slice(0, 20).map((option) => option.trim().slice(0, 120)) : [];
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id) || !label || (type === "select" && !options.length)) return null;
    return { id, label, type, required: question.required === true, enabled: question.enabled !== false, options: type === "select" ? options : [] };
  }).filter(Boolean);
  if (!questions.length || new Set(questions.map((question) => question.id)).size !== questions.length) return null;
  return { schemaVersion: data.schemaVersion, questions };
}
