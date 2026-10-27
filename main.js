import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPKT5bYhadiJpvI6sPw2rfBIjt8wMAPyQ",
  authDomain: "quran-32fac.firebaseapp.com",
  projectId: "quran-32fac",
  storageBucket: "quran-32fac.firebasestorage.app",
  messagingSenderId: "878077024112",
  appId: "1:878077024112:web:47326260fd9d2d93d7e1b5",
  measurementId: "G-YGVQF32KCB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

let currentUser = null;
let currentSubscription = null;
let selectedPlan = null;
let currentSurah = 1;
let totalSurahs = 114;
let authRequestInProgress = false;
let paymentRequestInProgress = false;

const plans = {
  7: { days: 7, price: 10 },
  14: { days: 14, price: 20 },
  30: { days: 30, price: 50 }
};

function showMessage(id, message, error = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = error ? "#b00020" : "#126747";
}

function readableError(error) {
  const messages = {
    "auth/email-already-in-use": "یہ ای میل پہلے سے رجسٹر ہے۔",
    "auth/invalid-email": "ای میل درست نہیں ہے۔",
    "auth/weak-password": "پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے۔",
    "auth/invalid-credential": "ای میل یا پاس ورڈ درست نہیں ہے۔",
    "auth/user-not-found": "اس ای میل کا اکاؤنٹ موجود نہیں۔",
    "auth/wrong-password": "پاس ورڈ درست نہیں ہے۔",
    "auth/network-request-failed": "انٹرنیٹ کنکشن چیک کریں۔",
  "permission-denied": "رسائی کی اجازت نہیں ملی۔ براہِ کرم کچھ دیر بعد دوبارہ کوشش کریں۔"
  };

  return messages[error.code] ||
    error.message ||
    "ایک مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔";
}

function formatDate(value) {
  if (!value) return "دستیاب نہیں";

  const date = typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);

  if (Number.isNaN(date.getTime())) return "دستیاب نہیں";

  return date.toLocaleDateString("ur-PK", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function timestampToDate(value) {
  if (!value) return null;

  const date = typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function subscriptionIsActive(subscription) {
  if (!subscription || subscription.active !== true) {
    return false;
  }

  const expiry = timestampToDate(subscription.expiresAt);

  return Boolean(expiry && expiry.getTime() > Date.now());
}

function renderSubscription(subscription) {
  const status = $("subscriptionStatus");
  const details = $("subscriptionDetails");
  const lock = $("readerLock");
  const reader = $("reader");

  const active = subscriptionIsActive(subscription);

  if (status) {
    status.textContent = active
      ? "آپ کی سبسکرپشن فعال ہے۔"
      : "آپ کی سبسکرپشن فعال نہیں ہے۔";
  }

  
if (details) {
  details.textContent = active
    ? `آغاز کی تاریخ: ${formatDate(subscription.startedAt)} | ` +
      `اختتام کی تاریخ: ${formatDate(subscription.expiresAt)} | ` +
      `مدت: ${subscription.days || 0} دن | ` +
      `قیمت: ${subscription.price || 0} روپے`
    : "ابھی کوئی فعال سبسکرپشن موجود نہیں۔";
}


  if (lock) {
    lock.hidden = active;

    if (!active) {
      lock.textContent = "قرآن پڑھنے کے لیے فعال سبسکرپشن ضروری ہے۔";
    }
  }

  if (reader) {
    reader.hidden = !active;
  }
}

async function loadSubscription() {
  if (!currentUser) {
    currentSubscription = null;
    renderSubscription(null);
    return;
  }

  try {
    const snapshot = await getDoc(
      doc(db, "subscriptions", currentUser.uid)
    );

    currentSubscription = snapshot.exists()
      ? snapshot.data()
      : null;

    renderSubscription(currentSubscription);

    if (subscriptionIsActive(currentSubscription)) {
      await loadSurah(currentSurah);
    }
  } catch (error) {
    console.error("Subscription error:", error);

    showMessage(
  "authMsg",
  "سبسکرپشن کی معلومات لوڈ نہیں ہوئیں۔ براہِ کرم صفحہ ریفریش کریں۔",
  true
);
  }
}

async function hasActiveSubscription() {
  if (!currentUser) return false;

  const snapshot = await getDoc(
    doc(db, "subscriptions", currentUser.uid)
  );

  currentSubscription = snapshot.exists()
    ? snapshot.data()
    : null;

  renderSubscription(currentSubscription);

  return subscriptionIsActive(currentSubscription);
}

async function signup() {
  if (authRequestInProgress) return;

  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    showMessage("authMsg", "ای میل اور پاس ورڈ درج کریں۔", true);
    return;
  }

  authRequestInProgress = true;

  try {
    await createUserWithEmailAndPassword(auth, email, password);

    if ($("authMsg")) {
      $("authMsg").textContent = "";
    }
  } catch (error) {
    console.error("Signup error:", error);
    showMessage("authMsg", readableError(error), true);
  } finally {
    authRequestInProgress = false;
  }
}

async function login() {
  if (authRequestInProgress) return;

  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    showMessage("authMsg", "ای میل اور پاس ورڈ درج کریں۔", true);
    return;
  }

  authRequestInProgress = true;

  try {
    await signInWithEmailAndPassword(auth, email, password);

    if ($("authMsg")) {
      $("authMsg").textContent = "";
    }
  } catch (error) {
    console.error("Login error:", error);
    showMessage("authMsg", readableError(error), true);
  } finally {
    authRequestInProgress = false;
  }
}

async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    showMessage("authMsg", readableError(error), true);
  }
}

async function selectPlan(days, price) {
  const plan = plans[Number(days)];

  if (!plan || Number(price) !== plan.price) {
    showMessage("authMsg", "منتخب پیکیج درست نہیں ہے۔", true);
    return;
  }

  if (!currentUser) {
    showMessage(
      "authMsg",
      "پیکیج خریدنے کے لیے پہلے لاگ اِن کریں، پھر اپنا پیکیج منتخب کریں۔",
      true
    );

    $("accountSection")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    return;
  }

  try {
    if (await hasActiveSubscription()) {
      selectedPlan = null;

      if ($("paymentForm")) {
        $("paymentForm").hidden = true;
      }

      alert(
        "آپ کی سبسکرپشن پہلے سے فعال ہے۔ نیا پیکیج خریدنے کے لیے موجودہ سبسکرپشن ختم ہونے کا انتظار کریں۔"
      );

      showMessage(
        "authMsg",
        "آپ کی موجودہ سبسکرپشن فعال ہے۔",
        true
      );

      return;
    }
  } catch (error) {
    console.error("Select package error:", error);

    showMessage(
      "authMsg",
      "سبسکرپشن چیک نہیں ہو سکی۔ دوبارہ کوشش کریں۔",
      true
    );

    return;
  }

  selectedPlan = plan;

  if ($("selectedPlan")) {
    $("selectedPlan").textContent =
      `${plan.days} دن — ${plan.price} روپے`;
  }

  if ($("paymentForm")) {
    $("paymentForm").hidden = false;

    $("paymentForm").scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  showMessage(
    "paymentMsg",
    "اب ادائیگی کا طریقہ منتخب کریں اور ٹرانزیکشن نمبر درج کریں۔"
  );
}

async function sendPaymentRequest() {
  if (paymentRequestInProgress) return;

  if (!currentUser) {
    showMessage(
      "authMsg",
      "ادائیگی کی درخواست کے لیے پہلے لاگ اِن کریں۔",
      true
    );

    $("accountSection")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    return;
  }

  if (!selectedPlan) {
    showMessage(
      "paymentMsg",
      "پہلے سبسکرپشن پیکیج منتخب کریں۔",
      true
    );

    return;
  }

  paymentRequestInProgress = true;

  const button = $("sendRequest");

  if (button) {
    button.disabled = true;
  }

  try {
    if (await hasActiveSubscription()) {
      selectedPlan = null;

      if ($("paymentForm")) {
        $("paymentForm").hidden = true;
      }

      alert(
        "آپ کی سبسکرپشن پہلے سے فعال ہے۔ آپ نئی سبسکرپشن اس وقت خرید سکتے ہیں جب موجودہ سبسکرپشن ختم ہو جائے۔"
      );

      showMessage(
        "authMsg",
        "فعال سبسکرپشن کی وجہ سے نئی ادائیگی کی درخواست نہیں بھیجی جا سکتی۔",
        true
      );

      return;
    }

    const method = $("method")?.value;
    const transactionId = $("transactionId")?.value.trim();

    if (!method) {
      showMessage("paymentMsg", "ادائیگی کا طریقہ منتخب کریں۔", true);
      return;
    }

    if (!transactionId) {
      showMessage("paymentMsg", "ٹرانزیکشن نمبر درج کریں۔", true);
      return;
    }

    if (!["JazzCash", "Easypaisa", "Bank Transfer"].includes(method)) {
      showMessage("paymentMsg", "ادائیگی کا طریقہ درست نہیں۔", true);
      return;
    }

    await addDoc(collection(db, "paymentRequests"), {
      uid: currentUser.uid,
      email: currentUser.email || "",
      days: selectedPlan.days,
      price: selectedPlan.price,
      method,
      transactionId,
      status: "pending",
      createdAt: Timestamp.now()
    });

    showMessage(
      "paymentMsg",
      "درخواست بھیج دی گئی ہے۔ ادائیگی کی تصدیق کے بعد ایڈمن سبسکرپشن فعال کرے گا۔"
    );

    if ($("transactionId")) {
      $("transactionId").value = "";
    }

    selectedPlan = null;

    if ($("paymentForm")) {
      $("paymentForm").hidden = true;
    }

    await loadMyRequests();
  } catch (error) {
    console.error("Payment request error:", error);
    showMessage("paymentMsg", readableError(error), true);
  } finally {
    paymentRequestInProgress = false;

    if (button) {
      button.disabled = false;
    }
  }
}

async function loadMyRequests() {
  const target = $("myPaymentRequests");

  if (!target || !currentUser) return;

  target.textContent = "درخواستیں لوڈ ہو رہی ہیں…";

  try {
    const requestsQuery = query(
      collection(db, "paymentRequests"),
      where("uid", "==", currentUser.uid)
    );

    const snapshot = await getDocs(requestsQuery);

    target.innerHTML = "";

    if (snapshot.empty) {
      target.textContent = "ابھی کوئی ادائیگی درخواست موجود نہیں۔";
      return;
    }

    const rows = [];

    snapshot.forEach(item => {
      rows.push(item.data());
    });

    rows.sort((a, b) =>
      (b.createdAt?.toMillis?.() || 0) -
      (a.createdAt?.toMillis?.() || 0)
    );

    rows.forEach(data => {
      const row = document.createElement("p");

      row.textContent =
        `${data.days || 0} دن — ${data.price || 0} روپے — ` +
        `حیثیت: ${data.status || "pending"} — ` +
        `تاریخ: ${formatDate(data.createdAt)}`;

      target.appendChild(row);
    });
  } catch (error) {
    console.error("My requests error:", error);
    target.textContent = "درخواستیں لوڈ نہیں ہو سکیں۔";
  }
}

async function loadSurahList() {
  const select = $("surahSelect");

  if (!select) return;

  try {
    const response = await fetch(
      "https://api.alquran.cloud/v1/surah"
    );

    if (!response.ok) {
      throw new Error("سورتوں کی فہرست حاصل نہیں ہوئی۔");
    }

    const result = await response.json();

    if (result.code !== 200 || !Array.isArray(result.data)) {
      throw new Error("سورتوں کی فہرست درست نہیں۔");
    }

    totalSurahs = result.data.length;
    select.innerHTML = "";

    result.data.forEach(surah => {
      const option = document.createElement("option");

      option.value = surah.number;
      option.textContent =
        `${surah.number}. ${surah.name} — ${surah.englishName}`;

      select.appendChild(option);
    });

    select.value = String(currentSurah);
  } catch (error) {
    console.error("Surah list error:", error);

    showMessage(
      "authMsg",
      "سورتوں کی فہرست لوڈ نہیں ہوئی۔ انٹرنیٹ چیک کریں۔",
      true
    );
  }
}

async function loadSurah(number) {
  if (!subscriptionIsActive(currentSubscription)) {
    renderSubscription(currentSubscription);
    return;
  }

  const select = $("surahSelect");
  const verses = $("verses");

  if (!verses) return;

  const surahNumber = Number(number);

  if (
    !Number.isInteger(surahNumber) ||
    surahNumber < 1 ||
    surahNumber > totalSurahs
  ) {
    return;
  }

  currentSurah = surahNumber;

  if (select) {
    select.value = String(surahNumber);
  }

  verses.textContent = "قرآن پاک لوڈ ہو رہا ہے…";

  try {
    const [arabicResponse, urduResponse] = await Promise.all([
      fetch(
        `https://api.alquran.cloud/v1/surah/${surahNumber}/quran-uthmani`
      ),
      fetch(
        `https://api.alquran.cloud/v1/surah/${surahNumber}/ur.jalandhry`
      )
    ]);

   if (!arabicResponse.ok || !urduResponse.ok) {
  throw new Error("قرآن پاک کا متن موصول نہیں ہوا۔");
}

    const arabicResult = await arabicResponse.json();
    const urduResult = await urduResponse.json();

    if (
      arabicResult.code !== 200 ||
      urduResult.code !== 200
    ) {
      throw new Error("قرآن کا متن لوڈ نہیں ہوا۔");
    }

    const arabicAyahs = arabicResult.data.ayahs;
    const urduAyahs = urduResult.data.ayahs;

    verses.innerHTML = "";

    arabicAyahs.forEach((ayah, index) => {
      const verse = document.createElement("div");
      verse.className = "verse";

      const arabic = document.createElement("p");
      arabic.className = "arabic";
      arabic.dir = "rtl";
      arabic.textContent =
        `${ayah.text} ۝${ayah.numberInSurah}`;

      const translation = document.createElement("p");
      translation.className = "translation";
      translation.dir = "rtl";
      translation.textContent =
        urduAyahs[index]?.text || "ترجمہ دستیاب نہیں۔";

      verse.append(arabic, translation);
      verses.appendChild(verse);
    });

    if ($("prevSurah")) {
      $("prevSurah").disabled = surahNumber <= 1;
    }

    if ($("nextSurah")) {
      $("nextSurah").disabled = surahNumber >= totalSurahs;
    }
  } catch (error) {
    console.error("Quran load error:", error);

    verses.textContent =
      "قرآن لوڈ نہیں ہو سکا۔ انٹرنیٹ چیک کرکے دوبارہ کوشش کریں۔";
  }
}

async function previousSurah() {
  if (currentSurah > 1) {
    await loadSurah(currentSurah - 1);

    $("quranSection")?.scrollIntoView({
      behavior: "instant",
      block: "start"
    });
  }
}

async function nextSurah() {
  if (currentSurah < totalSurahs) {
    await loadSurah(currentSurah + 1);

    $("quranSection")?.scrollIntoView({
      behavior: "instant",
      block: "start"
    });
  }
}

function toggleMenu() {
  const menu = $("topMenu");

  if (!menu) return;

  menu.hidden = !menu.hidden;

  $("menuToggle")?.setAttribute(
    "aria-expanded",
    String(!menu.hidden)
  );
}

function closeMenu() {
  if ($("topMenu")) {
    $("topMenu").hidden = true;
  }

  $("menuToggle")?.setAttribute("aria-expanded", "false");
}

onAuthStateChanged(auth, async user => {
  currentUser = user;

  const authForm = $("authForm");
  const userTop = $("userTop");
  const topEmail = $("topEmail");
  const authMsg = $("authMsg");

  if (user) {
    if (authForm) authForm.hidden = true;
    if (userTop) userTop.hidden = false;
    if (topEmail) topEmail.textContent = user.email || "";
    if (authMsg) authMsg.textContent = "";

    await loadSubscription();
    await loadMyRequests();
  } else {
    currentSubscription = null;
    selectedPlan = null;

    if (authForm) authForm.hidden = false;
    if (userTop) userTop.hidden = true;
    if (topEmail) topEmail.textContent = "";
    if (authMsg) authMsg.textContent = "";

    renderSubscription(null);

    const requests = $("myPaymentRequests");

    if (requests) {
      requests.textContent = "درخواستیں دیکھنے کے لیے لاگ اِن کریں۔";
    }

    if ($("paymentForm")) {
      $("paymentForm").hidden = true;
    }
  }

  closeMenu();
});

document.addEventListener("DOMContentLoaded", async () => {
    // Password Show / Hide Button
  const passwordInput = $("password");
  const togglePassword = $("togglePassword");

  togglePassword?.addEventListener("click", () => {
    const isPasswordHidden =
      passwordInput.type === "password";

    passwordInput.type = isPasswordHidden
      ? "text"
      : "password";

    togglePassword.textContent = isPasswordHidden
      ? "🙈"
      : "👁️";

    togglePassword.setAttribute(
      "aria-pressed",
      String(isPasswordHidden)
    );

    togglePassword.setAttribute(
      "aria-label",
      isPasswordHidden
        ? "پاس ورڈ چھپائیں"
        : "پاس ورڈ دکھائیں"
    );
  });
  if ($("topMenu")) {
    $("topMenu").hidden = true;
  }

  $("signupBtn")?.addEventListener("click", signup);
  $("loginBtn")?.addEventListener("click", login);
  $("logoutBtn")?.addEventListener("click", logout);
  $("sendRequest")?.addEventListener("click", sendPaymentRequest);

  $("surahSelect")?.addEventListener("change", event => {
    loadSurah(Number(event.target.value));
  });

  $("prevSurah")?.addEventListener("click", previousSurah);
  $("nextSurah")?.addEventListener("click", nextSurah);
  $("menuToggle")?.addEventListener("click", toggleMenu);
  $("closeMenu")?.addEventListener("click", closeMenu);

  document.querySelectorAll("#topMenu [data-target]").forEach(button => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.target);

      closeMenu();

      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

        if (
          button.dataset.target === "accountSection" &&
          $("authMsg")
        ) {
          $("authMsg").textContent = "";
        }
      }
    });
  });

  // Buy Package buttons
  document.querySelectorAll(".package-buy").forEach(button => {
    button.addEventListener("click", () => {
      selectPlan(
        Number(button.dataset.days),
        Number(button.dataset.price)
      );
    });
  });

  await loadSurahList();
});