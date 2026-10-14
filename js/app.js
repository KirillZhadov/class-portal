import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';
import {
  collection, addDoc, getDocs, query, where, limit,
  updateDoc, deleteDoc, doc, getDoc, serverTimestamp,
  deleteField, increment
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';

// ============================================================
// 1. КОНФИГУРАЦИЯ КАТЕГОРИЙ (ИЕРАРХИЧЕСКАЯ СТРУКТУРА)
// ============================================================
const CATEGORIES_CONFIG = {
  "спорт": {
    sub: {
      "гто": {
        sub: {
          "золото": null,
          "серебро": null,
          "бронза": null,
          "участник": null
        }
      },
      "соревнования": {
        sub: {
          "вид спорта": {
            inputType: 'text',
            placeholder: 'Введите вид спорта (футбол, баскетбол...)',
            sub: {
              "золото": null,
              "серебро": null,
              "бронза": null,
              "участник": null
            }
          }
        }
      },
      "личные достижения": {
        sub: {
          "вид спорта": {
            inputType: 'text',
            placeholder: 'Введите вид спорта (футбол, баскетбол...)'
          }
        }
      }
    }
  },
  "проект": {
    sub: {
      "шаг в будущее": {
        sub: {
          "предмет": {
            inputType: 'text',
            placeholder: 'Введите предмет (физика, химия...)',
            sub: {
              "1 место": null,
              "2 место": null,
              "3 место": null,
              "участник": null
            }
          }
        }
      },
      "интеллектуалы 21в.": {
        sub: {
          "предмет": {
            inputType: 'text',
            placeholder: 'Введите предмет (физика, химия...)',
            sub: {
              "1 место": null,
              "2 место": null,
              "3 место": null,
              "участник": null
            }
          }
        }
      },
      "прочее": {
        sub: {
          "предмет": {
            inputType: 'text',
            placeholder: 'Введите предмет (физика, химия...)',
            sub: {
              "1 место": null,
              "2 место": null,
              "3 место": null,
              "участник": null
            }
          }
        }
      }
    }
  },
  "олимпиада": {
    sub: {
      "олимп 74": {
        sub: {
          "предмет": {
            inputType: 'text',
            placeholder: 'Введите предмет (математика, английский...)',
            sub: {
              "1 место": null,
              "2 место": null,
              "3 место": null,
              "участник": null
            }
          }
        }
      },
      "сириус": {
        sub: {
          "предмет": {
            inputType: 'text',
            placeholder: 'Введите предмет (математика, английский...)',
            sub: {
              "1 место": null,
              "2 место": null,
              "3 место": null,
              "участник": null
            }
          }
        }
      },
      "всош": {
        sub: {
          "предмет": {
            inputType: 'text',
            placeholder: 'Введите предмет (математика, английский...)',
            sub: {
              "1 место": null,
              "2 место": null,
              "3 место": null,
              "участник": null
            }
          }
        }
      },
      "прочее": {
        sub: {
          "предмет": {
            inputType: 'text',
            placeholder: 'Введите предмет (математика, английский...)',
            sub: {
              "1 место": null,
              "2 место": null,
              "3 место": null,
              "участник": null
            }
          }
        }
      }
    }
  },
  "творчество": {
    sub: {
      "музыка": null,
      "изо": null
    }
  }
};

// ============================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getClassDisplayWithQuotes(user) {
  const num = user.classNumber || '';
  const letter = user.classLetter || '';
  return letter ? `${num}"${letter}"` : `${num}${letter}`;
}

function validateRussianLetter(letter) {
  return /^[А-ЯЁ]$/i.test(letter);
}

// === ПРОВЕРКИ РОЛЕЙ ===
function hasRole(userDoc, roleName) {
  if (!userDoc || !userDoc.roles) return false;
  return Array.isArray(userDoc.roles) && userDoc.roles.includes(roleName);
}

const authorCache = {};
async function fetchAuthorName(userId) {
  if (authorCache[userId]) return authorCache[userId];
  try {
    const userQuery = query(collection(db, 'users'), where('uid', '==', userId));
    const userSnap = await getDocs(userQuery);
    if (!userSnap.empty) {
      const userData = userSnap.docs[0].data();
      const name = userData.fullName || userData.firstName || 'Неизвестно';
      const cls = userData.classLetter ? ` (${getClassDisplayWithQuotes(userData)})` : '';
      authorCache[userId] = name + cls;
      return authorCache[userId];
    }
  } catch (e) {
    console.error('Ошибка получения автора:', e);
  }
  return 'Неизвестно';
}

// ============================================================
// 3. ФУНКЦИИ ДЛЯ КАСКАДНЫХ СПИСКОВ
// ============================================================
function populateSelect(selectElement, options, defaultText = 'Выберите...') {
  selectElement.innerHTML = `<option value="">${defaultText}</option>`;
  if (!options) return;
  Object.keys(options).forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key.charAt(0).toUpperCase() + key.slice(1);
    selectElement.appendChild(option);
  });
}

function handleLevel1Change() {
  const level1 = document.getElementById('catLevel1');
  const level2 = document.getElementById('catLevel2');
  const level3 = document.getElementById('catLevel3');
  const textInputContainer = document.getElementById('catTextInputContainer');
  const placeSelect = document.getElementById('catLevelPlace');

  const selectedKey = level1.value;
  level2.style.display = 'none';
  level3.style.display = 'none';
  textInputContainer.style.display = 'none';
  placeSelect.style.display = 'none';
  level2.innerHTML = '<option value="">Выберите категорию</option>';
  level3.innerHTML = '<option value="">Выберите детали</option>';
  placeSelect.value = '';

  if (selectedKey) {
    const l1Config = CATEGORIES_CONFIG[selectedKey];
    if (l1Config && l1Config.sub) {
      const options = {};
      Object.keys(l1Config.sub).forEach(key => {
        options[key] = l1Config.sub[key];
      });
      populateSelect(level2, options, 'Выберите категорию');
      level2.style.display = 'block';
    }
  }
}

function handleLevel2Change() {
  const level1 = document.getElementById('catLevel1');
  const level2 = document.getElementById('catLevel2');
  const level3 = document.getElementById('catLevel3');
  const textInputContainer = document.getElementById('catTextInputContainer');
  const placeSelect = document.getElementById('catLevelPlace');

  const l1Key = level1.value;
  const l2Key = level2.value;

  level3.style.display = 'none';
  textInputContainer.style.display = 'none';
  placeSelect.style.display = 'none';
  level3.innerHTML = '<option value="">Выберите детали</option>';
  placeSelect.value = '';

  if (l1Key && l2Key) {
    const l2Config = CATEGORIES_CONFIG[l1Key].sub[l2Key];
    if (l2Config && l2Config.sub) {
      const options = {};
      Object.keys(l2Config.sub).forEach(key => {
        options[key] = l2Config.sub[key];
      });
      populateSelect(level3, options, 'Выберите детали');
      level3.style.display = 'block';
    } else if (l2Config && l2Config.inputType === 'text') {
      const textInput = document.getElementById('catTextInput');
      textInput.placeholder = l2Config.placeholder || 'Введите значение';
      textInput.value = '';
      textInputContainer.style.display = 'block';
      if (l2Config.sub && l2Config.sub['1 место']) {
        placeSelect.style.display = 'block';
      } else if (l2Config.sub && l2Config.sub['золото']) {
        placeSelect.style.display = 'block';
      }
    } else {
      if (l2Config && l2Config.sub && l2Config.sub['1 место']) {
        placeSelect.style.display = 'block';
      } else if (l2Config && l2Config.sub && l2Config.sub['золото']) {
        placeSelect.style.display = 'block';
      }
    }
  }
}

function handleLevel3Change() {
  const level1 = document.getElementById('catLevel1');
  const level2 = document.getElementById('catLevel2');
  const level3 = document.getElementById('catLevel3');
  const textInputContainer = document.getElementById('catTextInputContainer');
  const placeSelect = document.getElementById('catLevelPlace');

  const l1Key = level1.value;
  const l2Key = level2.value;
  const l3Key = level3.value;

  textInputContainer.style.display = 'none';
  placeSelect.style.display = 'none';
  placeSelect.value = '';

  if (l1Key && l2Key && l3Key) {
    const l3Config = CATEGORIES_CONFIG[l1Key].sub[l2Key].sub[l3Key];
    if (l3Config && l3Config.inputType === 'text') {
      const textInput = document.getElementById('catTextInput');
      textInput.placeholder = l3Config.placeholder || 'Введите значение';
      textInput.value = '';
      textInputContainer.style.display = 'block';
    }
    if (l3Config && l3Config.sub && l3Config.sub['1 место']) {
      placeSelect.style.display = 'block';
    } else if (l3Config && l3Config.sub && l3Config.sub['золото']) {
      placeSelect.style.display = 'block';
    }
  }
}

function getFullCategoryPath() {
  const level1 = document.getElementById('catLevel1');
  const level2 = document.getElementById('catLevel2');
  const level3 = document.getElementById('catLevel3');
  const textInput = document.getElementById('catTextInput');
  const placeSelect = document.getElementById('catLevelPlace');

  let path = level1.value;
  if (level2.value) path += '/' + level2.value;
  if (level3.value) path += '/' + level3.value;
  if (textInput.value && document.getElementById('catTextInputContainer').style.display !== 'none') {
    path += '/' + textInput.value;
  }
  if (placeSelect.value && placeSelect.style.display !== 'none') {
    path += '/' + placeSelect.value;
  }
  return path;
}

function initCategorySelectors() {
  const level1 = document.getElementById('catLevel1');
  const level2 = document.getElementById('catLevel2');
  const level3 = document.getElementById('catLevel3');
  const textInputContainer = document.getElementById('catTextInputContainer');
  const placeSelect = document.getElementById('catLevelPlace');

  level2.style.display = 'none';
  level3.style.display = 'none';
  textInputContainer.style.display = 'none';
  placeSelect.style.display = 'none';

  populateSelect(level1, CATEGORIES_CONFIG, 'Выберите направление');
  level1.onchange = handleLevel1Change;
  level2.onchange = handleLevel2Change;
  level3.onchange = handleLevel3Change;
}

// ============================================================
// 3.1. ПАРСИНГ И ПРЕДЗАПОЛНЕНИЕ КАТЕГОРИЙ (для редактирования)
// ============================================================
function parseCategoryPath(categoryStr) {
  if (!categoryStr) return [];
  return categoryStr.split('/').map(s => s.trim()).filter(Boolean);
}

function prefillCategorySelectors(categoryStr) {
  // Инициализируем списки заново
  initCategorySelectors();

  const parts = parseCategoryPath(categoryStr);
  if (parts.length === 0) return;

  const level1 = document.getElementById('catLevel1');
  const level2 = document.getElementById('catLevel2');
  const level3 = document.getElementById('catLevel3');
  const textInput = document.getElementById('catTextInput');
  const placeSelect = document.getElementById('catLevelPlace');

  // Проверяем, что первая часть (направление) есть в новой конфигурации
  const firstPart = parts[0];
  if (!CATEGORIES_CONFIG[firstPart]) {
    // Это старая категория — она не соответствует новой структуре.
    console.warn('Категория "' + categoryStr + '" не соответствует новой структуре. Выберите категорию заново.');
    const container = document.getElementById('editCategoryContainer') || document.getElementById('categoryContainer');
    if (container) {
      const notice = document.createElement('p');
      notice.style.cssText = 'color:#800020; font-size:0.9rem; margin:5px 0;';
      notice.textContent = 'Старая категория не поддерживается новой структурой. Выберите новую.';
      container.insertBefore(notice, container.firstChild);
    }
    return;
  }

  // Уровень 1
  level1.value = parts[0];
  handleLevel1Change();

  // Уровень 2
  if (parts[1]) {
    const l1Config = CATEGORIES_CONFIG[parts[0]];
    if (l1Config && l1Config.sub && l1Config.sub[parts[1]]) {
      level2.value = parts[1];
      handleLevel2Change();
    } else {
      return;
    }
  }

  // Уровень 3 и далее
  const l1Key = parts[0];
  const l2Key = parts[1];
  const l2Config = CATEGORIES_CONFIG[l1Key]?.sub?.[l2Key];

  let placeValue = null;

  if (l2Config && l2Config.sub) {
    const l2SubKeys = Object.keys(l2Config.sub);
    const firstKey = l2SubKeys[0];
    const firstConfig = l2Config.sub[firstKey];

    if (firstConfig && firstConfig.inputType === 'text') {
      if (parts[2]) {
        level3.style.display = 'none';
        const textInputContainer = document.getElementById('catTextInputContainer');
        textInput.placeholder = firstConfig.placeholder || '';
        textInput.value = parts[2];
        textInputContainer.style.display = 'block';
        if (parts[3]) placeValue = parts[3];
      }
    } else {
      if (parts[2] && l2Config.sub[parts[2]]) {
        level3.value = parts[2];
        handleLevel3Change();
      }
      if (parts[3]) placeValue = parts[3];
    }
  } else if (l2Config && l2Config.inputType === 'text') {
    const textInputContainer = document.getElementById('catTextInputContainer');
    textInput.placeholder = l2Config.placeholder || '';
    textInput.value = parts[2] || '';
    textInputContainer.style.display = 'block';
    if (parts[3]) placeValue = parts[3];
  }

  if (placeValue) {
    placeSelect.value = placeValue;
    placeSelect.style.display = 'block';
  }
}

// ============================================================
// 4. DOM-ЭЛЕМЕНТЫ И СОСТОЯНИЯ
// ============================================================
const authContainer = document.getElementById('authContainer');
const appContent = document.getElementById('appContent');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const newAchievementCard = document.getElementById('newAchievementCard');
const pageContainer = document.getElementById('pageContainer');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.querySelector('.modal-close');
const showProfileLink = document.getElementById('showProfileLink');
const showStudentsLink = document.getElementById('showStudentsLink');
const showTopLink = document.getElementById('showTopLink');
const showStatisticsLink = document.getElementById('showStatisticsLink');
const mainFeed = document.getElementById('mainFeed');

let currentUser = null;
let currentUserDoc = null;
let currentViewType = null;
let currentViewUid = null;
let userLikesSet = new Set();

// ============================================================
// 5. УПРАВЛЕНИЕ ВИДИМОСТЬЮ И ИНДИКАТОР ЗАГРУЗКИ
// ============================================================
function hideMainContent() {
  if (mainFeed) mainFeed.style.display = 'none';
  pageContainer.style.display = 'block';
  pageContainer.style.minHeight = '70vh';
}

function showMainContent() {
  if (mainFeed) mainFeed.style.display = 'block';
  pageContainer.style.display = 'none';
  pageContainer.innerHTML = '';
  currentViewType = null;
  currentViewUid = null;
}

function showLoadingState() {
  pageContainer.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; min-height:300px; flex-direction:column;">
      <div style="font-size:2rem; margin-bottom:15px;">⏳</div>
      <p style="color:#888; font-size:1.2rem;">Загрузка...</p>
    </div>
  `;
}

function closeModal() {
  modal.style.display = 'none';
  loadNewAchievement();
  refreshCurrentView();
}

function refreshCurrentView() {
  if (currentViewType === 'profile' && currentViewUid) {
    showUserProfile(currentViewUid);
  } else if (currentViewType === 'top') {
    showTopAchievements();
  }
}

// ============================================================
// 6. ЗАГРУЗКА ЛАЙКОВ
// ============================================================
async function loadUserLikes() {
  if (!currentUser) return;
  try {
    const q = query(collection(db, 'likes'), where('userId', '==', currentUser.uid));
    const snap = await getDocs(q);
    userLikesSet = new Set(snap.docs.map(d => d.data().achievementId));
  } catch (e) {
    console.error('Ошибка загрузки лайков:', e);
    userLikesSet = new Set();
  }
}

// ============================================================
// 7. АВТОРИЗАЦИЯ
// ============================================================
showRegisterLink.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
});

showLoginLink.addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.style.display = 'none';
  loginForm.style.display = 'block';
});

loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    alert('Ошибка входа: ' + e.message);
  }
});

registerBtn.addEventListener('click', async () => {
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const classNumber = document.getElementById('regClassNumber').value.trim();
  const classLetterRaw = document.getElementById('regClassLetter').value.trim();
  const birthDate = document.getElementById('regBirthDate').value;

  if (!firstName || !lastName || !email || !password || !classNumber || !classLetterRaw) {
    alert('Заполните все обязательные поля (Имя, Фамилия, Email, Пароль, Номер и Буква класса)');
    return;
  }

  if (parseInt(classNumber) < 1 || parseInt(classNumber) > 11) {
    alert('Номер класса должен быть от 1 до 11');
    return;
  }

  const classLetter = classLetterRaw.toUpperCase();
  if (!validateRussianLetter(classLetter)) {
    alert('Буква класса должна быть русской (например, А, Б, В)');
    return;
  }

  const fullName = `${firstName} ${lastName}`;
  const classDisplay = classNumber + classLetter;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const userData = {
      uid: userCred.user.uid,
      firstName,
      lastName,
      fullName,
      email,
      classNumber: parseInt(classNumber),
      classLetter,
      classDisplay,
      roles: ['student'],
      createdAt: serverTimestamp()
    };
    if (birthDate) {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      userData.birthDate = birthDate;
      userData.age = age;
    }
    await addDoc(collection(db, 'users'), userData);
    alert('Регистрация успешна!');
  } catch (e) {
    alert('Ошибка регистрации: ' + e.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

// ============================================================
// 8. ОТСЛЕЖИВАНИЕ СОСТОЯНИЯ ВХОДА
// ============================================================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authContainer.style.display = 'none';
    appContent.style.display = 'block';
    const q = query(collection(db, 'users'), where('uid', '==', user.uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      currentUserDoc = { id: snap.docs[0].id, ...snap.docs[0].data() };
    }
    if (currentUserDoc && currentUserDoc.isDeleted) {
      alert('Ваш аккаунт был удалён администратором.');
      await signOut(auth);
      return;
    }
    await loadUserLikes();
    if (hasRole(currentUserDoc, 'teacher') || hasRole(currentUserDoc, 'admin')) {
      showStatisticsLink.style.display = 'block';
    } else {
      showStatisticsLink.style.display = 'none';
    }
    showMainContent();
    loadNewAchievement();
  } else {
    currentUser = null;
    currentUserDoc = null;
    userLikesSet = new Set();
    authContainer.style.display = 'block';
    appContent.style.display = 'none';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    showStatisticsLink.style.display = 'none';
  }
});

// ============================================================
// 9. ДОБАВЛЕНИЕ ДОСТИЖЕНИЯ
// ============================================================
async function addAchievement(title, category, description) {
  try {
    await addDoc(collection(db, 'achievements'), {
      userId: currentUser.uid,
      title: title.trim(),
      category,
      description: description.trim(),
      likesCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isDeleted: false
    });
    return true;
  } catch (e) {
    console.error('Ошибка добавления достижения:', e);
    return false;
  }
}

// ============================================================
// 10. ОБНОВЛЕНИЕ ПРОФИЛЯ
// ============================================================
async function updateUserProfile({ firstName, lastName, classNumber, classLetter, birthDate }) {
  if (!currentUser || !currentUserDoc) return;
  try {
    const userRef = doc(db, 'users', currentUserDoc.id);
    const updateData = {};

    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();
    if (classNumber !== undefined) {
      const num = parseInt(classNumber);
      if (num < 1 || num > 11) {
        alert('Номер класса должен быть от 1 до 11');
        return;
      }
      updateData.classNumber = num;
    }
    if (classLetter !== undefined) {
      const letter = classLetter.trim().toUpperCase();
      if (!validateRussianLetter(letter)) {
        alert('Буква класса должна быть русской (например, А, Б, В)');
        return;
      }
      updateData.classLetter = letter;
    }
    if (firstName !== undefined || lastName !== undefined) {
      updateData.fullName = `${updateData.firstName || currentUserDoc.firstName} ${updateData.lastName || currentUserDoc.lastName}`.trim();
    }
    if (classNumber !== undefined || classLetter !== undefined) {
      const num = updateData.classNumber !== undefined ? updateData.classNumber : currentUserDoc.classNumber;
      const letr = updateData.classLetter !== undefined ? updateData.classLetter : currentUserDoc.classLetter;
      updateData.classDisplay = `${num}${letr}`;
    }

    if (birthDate === null || birthDate === '') {
      updateData.birthDate = deleteField();
      updateData.age = deleteField();
    } else if (birthDate) {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      updateData.birthDate = birthDate;
      updateData.age = age;
    }

    await updateDoc(userRef, updateData);
    const freshSnap = await getDoc(userRef);
    if (freshSnap.exists()) {
      currentUserDoc = { id: freshSnap.id, ...freshSnap.data() };
    }
    showUserProfile(currentUser.uid);
    loadNewAchievement();
  } catch (e) {
    console.error('Ошибка обновления профиля:', e);
    alert('Ошибка обновления профиля: ' + e.message);
  }
}

// ============================================================
// 11. УДАЛЕНИЕ АККАУНТА (только для админа)
// ============================================================
async function deleteUserAccount(uid) {
  if (!hasRole(currentUserDoc, 'admin')) {
    alert('Недостаточно прав для удаления аккаунтов');
    return;
  }

  if (!confirm('Вы уверены, что хотите удалить этот аккаунт? Все достижения, лайки и просмотры этого пользователя будут скрыты.')) {
    return;
  }

  try {
    const userQuery = query(collection(db, 'users'), where('uid', '==', uid));
    const userSnap = await getDocs(userQuery);
    if (!userSnap.empty) {
      const userRef = doc(db, 'users', userSnap.docs[0].id);
      await updateDoc(userRef, {
        isDeleted: true,
        deletedAt: serverTimestamp()
      });
    }

    const achQuery = query(collection(db, 'achievements'), where('userId', '==', uid));
    const achSnap = await getDocs(achQuery);
    const updatePromises = achSnap.docs.map(d =>
      updateDoc(doc(db, 'achievements', d.id), { isDeleted: true })
    );
    await Promise.all(updatePromises);

    alert('Аккаунт удалён. Профиль и достижения скрыты.');
    showStudents();
  } catch (e) {
    console.error('Ошибка удаления аккаунта:', e);
    alert('Ошибка удаления: ' + e.message);
  }
}

// ============================================================
// 12. ЛЕНТА НОВЫХ ДОСТИЖЕНИЙ
// ============================================================
async function loadNewAchievement() {
  if (!currentUser) return;
  try {
    newAchievementCard.innerHTML = `<div class="feed__card-placeholder">Загрузка...</div>`;

    const qAchievements = query(
      collection(db, 'achievements'),
      where('isDeleted', '==', false)
    );
    const snap = await getDocs(qAchievements);
    let achievements = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    achievements = achievements.filter(a => {
      if (!a.createdAt) return false;
      const date = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt.seconds * 1000);
      return date >= weekAgo;
    });

    achievements.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    const qViews = query(collection(db, 'views'), where('userId', '==', currentUser.uid));
    const viewsSnap = await getDocs(qViews);
    const viewedIds = viewsSnap.docs.map(d => d.data().achievementId);

    const newAchievements = achievements.filter(a => !viewedIds.includes(a.id));

    if (newAchievements.length === 0) {
      newAchievementCard.innerHTML = `<div class="feed__card-placeholder">Новых достижений за неделю нет</div>`;
      newAchievementCard.onclick = null;
      return;
    }

    const latest = newAchievements[0];
    const authorName = await fetchAuthorName(latest.userId);

    const safeTitle = escapeHtml(latest.title);
    const safeCategory = escapeHtml(latest.category || 'без категории');
    const safeAuthor = escapeHtml(authorName);
    const safeDate = latest.createdAt ? new Date(latest.createdAt.seconds * 1000).toLocaleString() : '';

    newAchievementCard.innerHTML = `
      <div style="text-align:left; width:100%;">
        <h4>${safeTitle}</h4>
        <p><strong>Категория:</strong> ${safeCategory}</p>
        <p><strong>Автор:</strong> ${safeAuthor}</p>
        <small>${safeDate}</small>
      </div>
    `;

    newAchievementCard.onclick = () => {
      showNewAchievementsModal(newAchievements);
    };

  } catch (e) {
    console.error(e);
    newAchievementCard.innerHTML = `<div class="feed__card-placeholder">Ошибка загрузки</div>`;
  }
}

// ============================================================
// 13. МОДАЛЬНОЕ ОКНО С НОВЫМИ ДОСТИЖЕНИЯМИ
// ============================================================
async function showNewAchievementsModal(achievements) {
  let currentIndex = 0;
  const total = achievements.length;

  async function renderCard(index) {
    if (index >= total) {
      modalBody.innerHTML = `<div style="text-align:center;"><p>Вы просмотрели все новые достижения за неделю</p><button id="closeModalBtn">Закрыть</button></div>`;
      document.getElementById('closeModalBtn')?.addEventListener('click', () => {
        closeModal();
        loadNewAchievement();
      });
      return;
    }
    const a = achievements[index];
    const dateStr = a.createdAt ? new Date(a.createdAt.seconds * 1000).toLocaleString() : '';
    const author = await fetchAuthorName(a.userId);
    const liked = userLikesSet.has(a.id);
    const likeIcon = liked ? '♥' : '♡';

    const safeTitle = escapeHtml(a.title);
    const safeCategory = escapeHtml(a.category || 'без категории');
    const safeAuthor = escapeHtml(author);
    const safeDate = escapeHtml(dateStr);

    modalBody.innerHTML = `
      <div style="text-align:left;">
        <h3>${safeTitle}</h3>
        <p><strong>Категория:</strong> ${safeCategory}</p>
        <p><strong>Автор:</strong> ${safeAuthor}</p>
        <p><small>${safeDate}</small></p>
        <div style="margin-top:20px;">
          <button id="prevCardBtn" ${index === 0 ? 'disabled' : ''}>◀ Назад</button>
          <button id="nextCardBtn" ${index === total - 1 ? 'disabled' : ''}>Вперёд ▶</button>
          <button id="viewFullBtn">Подробнее</button>
        </div>
        <div style="margin-top:10px;">
          <button id="likeFromModal" class="like-btn" style="background:none; border:none; font-size:1.2rem; font-family: 'Segoe UI', Arial, sans-serif; font-variant-emoji: text; cursor:pointer; color:${liked ? '#FF0000' : '#888'};">${likeIcon} ${a.likesCount || 0}</button>
        </div>
      </div>
    `;

    document.getElementById('prevCardBtn')?.addEventListener('click', async () => {
      if (currentIndex > 0) {
        currentIndex--;
        await renderCard(currentIndex);
        await markAsViewed(achievements[currentIndex].id);
      }
    });
    document.getElementById('nextCardBtn')?.addEventListener('click', async () => {
      if (currentIndex < total - 1) {
        currentIndex++;
        await renderCard(currentIndex);
        await markAsViewed(achievements[currentIndex].id);
      }
    });
    document.getElementById('viewFullBtn')?.addEventListener('click', () => {
      showFullAchievement(achievements[currentIndex].id);
    });
    document.getElementById('likeFromModal')?.addEventListener('click', async () => {
      await toggleLike(achievements[currentIndex].id);
      await renderCard(currentIndex);
    });

    await markAsViewed(a.id);
  }

  modal.style.display = 'block';
  await renderCard(0);
}

// ============================================================
// 14. ОТМЕТКА ПРОСМОТРА
// ============================================================
async function markAsViewed(achievementId) {
  if (!currentUser) return;
  try {
    const q = query(
      collection(db, 'views'),
      where('userId', '==', currentUser.uid),
      where('achievementId', '==', achievementId)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      await addDoc(collection(db, 'views'), {
        userId: currentUser.uid,
        achievementId: achievementId,
        viewedAt: serverTimestamp()
      });
    }
  } catch (e) {
    console.error('Ошибка отметки просмотра:', e);
  }
}

// ============================================================
// 15. ПОЛНАЯ ИНФОРМАЦИЯ О ДОСТИЖЕНИИ (с редактированием через каскадные списки)
// ============================================================
async function showFullAchievement(achievementId) {
  console.log('showFullAchievement вызвана с ID:', achievementId);
  try {
    const docSnap = await getDoc(doc(db, 'achievements', achievementId));
    if (!docSnap.exists()) {
      console.log('Документ не найден');
      alert('Достижение не найдено');
      return;
    }
    const a = docSnap.data();
    const authorName = await fetchAuthorName(a.userId);
    const isAuthor = currentUser && a.userId === currentUser.uid;
    const isAdmin = hasRole(currentUserDoc, 'admin');
    const liked = userLikesSet.has(achievementId);
    const likeIcon = liked ? '♥' : '♡';

    markAsViewed(achievementId);

    const safeTitle = escapeHtml(a.title);
    const safeAuthor = escapeHtml(authorName);
    const safeCategory = escapeHtml(a.category);
    const safeDate = a.createdAt ? new Date(a.createdAt.seconds * 1000).toLocaleString() : '';
    const safeDesc = escapeHtml(a.description || '');

    const canEdit = isAuthor || isAdmin;
    const canDelete = isAuthor || isAdmin;

    modalBody.innerHTML = `
      <div style="text-align:left;">
        <h2>${safeTitle}</h2>
        <p><strong>Автор:</strong> ${safeAuthor}</p>
        <p><strong>Категория:</strong> ${safeCategory}</p>
        <p><strong>Дата:</strong> ${safeDate}</p>
        <p><strong>Описание:</strong> ${safeDesc}</p>
        <div style="margin-top:15px;">
          <button id="likeFullBtn" class="like-btn" style="background:none; border:none; font-size:1.2rem; font-family: 'Segoe UI', Arial, sans-serif; font-variant-emoji: text; cursor:pointer; color:${liked ? '#FF0000' : '#888'};">${likeIcon} ${a.likesCount || 0}</button>
          ${canEdit ? `<button id="editFullBtn" style="margin-left:10px;background:#800020;color:white;border:none;padding:5px 15px;border-radius:6px;cursor:pointer;">Редактировать</button>` : ''}
          ${canDelete ? `<button id="deleteFullBtn" style="margin-left:10px;background:red;color:white;border:none;padding:5px 15px;border-radius:6px;cursor:pointer;">Удалить</button>` : ''}
        </div>
        <div id="editFormContainer"></div>
        <div style="margin-top:15px;">
          <button id="closeFullBtn">Закрыть</button>
        </div>
      </div>
    `;
    modal.style.display = 'block';

    document.getElementById('likeFullBtn')?.addEventListener('click', async () => {
      await toggleLike(achievementId);
      showFullAchievement(achievementId);
    });

    // ---- Редактирование через каскадные списки ----
    document.getElementById('editFullBtn')?.addEventListener('click', () => {
      const container = document.getElementById('editFormContainer');
      container.innerHTML = `
        <div style="margin-top:15px; padding:15px; background:#f5f5f5; border-radius:8px;">
          <h4>Редактировать достижение</h4>
          <input type="text" id="editAchTitle" value="${escapeHtml(a.title)}" style="width:100%; padding:8px; margin:5px 0; border:1px solid #ccc; border-radius:6px;" />
          
          <div id="editCategoryContainer" style="margin:5px 0;">
            <select id="catLevel1" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;">
              <option value="">Выберите направление</option>
            </select>
            <select id="catLevel2" style="display:none; width:100%; padding:8px; margin-top:5px; border:1px solid #ccc; border-radius:6px;">
              <option value="">Выберите категорию</option>
            </select>
            <select id="catLevel3" style="display:none; width:100%; padding:8px; margin-top:5px; border:1px solid #ccc; border-radius:6px;">
              <option value="">Выберите детали</option>
            </select>
            <div id="catTextInputContainer" style="display:none; margin-top:5px;">
              <input type="text" id="catTextInput" placeholder="" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;" />
            </div>
            <select id="catLevelPlace" style="display:none; width:100%; padding:8px; margin-top:5px; border:1px solid #ccc; border-radius:6px;">
              <option value="">Выберите результат</option>
              <option value="золото">🥇 Золото</option>
              <option value="серебро">🥈 Серебро</option>
              <option value="бронза">🥉 Бронза</option>
              <option value="1 место">🥇 1 место</option>
              <option value="2 место">🥈 2 место</option>
              <option value="3 место">🥉 3 место</option>
              <option value="участник">Участник</option>
            </select>
          </div>
          
          <textarea id="editAchDesc" rows="4" style="width:100%; padding:8px; margin:5px 0; border:1px solid #ccc; border-radius:6px;">${escapeHtml(a.description || '')}</textarea>
          <button id="saveEditBtn" style="background:#800020;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;">Сохранить</button>
          <button id="cancelEditAchBtn" style="background:#ccc;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;margin-left:5px;">Отмена</button>
        </div>
      `;

      // Предзаполняем каскадные списки текущей категорией
      setTimeout(() => {
        prefillCategorySelectors(a.category);
      }, 0);

      document.getElementById('saveEditBtn').addEventListener('click', async () => {
        const newTitle = document.getElementById('editAchTitle').value.trim();
        const newCategory = getFullCategoryPath();
        const newDesc = document.getElementById('editAchDesc').value.trim();
        if (!newTitle || !newCategory) {
          alert('Заполните название и категорию');
          return;
        }
        try {
          await updateDoc(doc(db, 'achievements', achievementId), {
            title: newTitle,
            category: newCategory,
            description: newDesc,
            updatedAt: serverTimestamp()
          });
          alert('Достижение обновлено');
          showFullAchievement(achievementId);
        } catch (e) {
          alert('Ошибка редактирования: ' + e.message);
        }
      });
      document.getElementById('cancelEditAchBtn').addEventListener('click', () => {
        container.innerHTML = '';
      });
    });

    // ---- Удаление ----
    document.getElementById('deleteFullBtn')?.addEventListener('click', async () => {
      if (confirm('Вы уверены, что хотите удалить это достижение?')) {
        try {
          await updateDoc(doc(db, 'achievements', achievementId), {
            isDeleted: true
          });
          alert('Достижение удалено');
          closeModal();
          loadNewAchievement();
          refreshCurrentView();
        } catch (e) {
          alert('Ошибка удаления: ' + e.message);
        }
      }
    });

    document.getElementById('closeFullBtn')?.addEventListener('click', () => {
      closeModal();
    });
  } catch (e) {
    console.error('Ошибка в showFullAchievement:', e);
    alert('Ошибка загрузки: ' + e.message);
  }
}

// ============================================================
// 16. ЛАЙКИ (Атомарное обновление)
// ============================================================
async function toggleLike(achievementId) {
  if (!currentUser) return;
  try {
    const achRef = doc(db, 'achievements', achievementId);
    const achSnap = await getDoc(achRef);
    if (!achSnap.exists()) return;
    const achievementData = achSnap.data();
    if (achievementData.userId === currentUser.uid) {
      alert('Нельзя ставить лайк на своё достижение');
      return;
    }

    const q = query(
      collection(db, 'likes'),
      where('userId', '==', currentUser.uid),
      where('achievementId', '==', achievementId)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      await addDoc(collection(db, 'likes'), {
        userId: currentUser.uid,
        achievementId: achievementId,
        createdAt: serverTimestamp()
      });
      await updateDoc(achRef, { likesCount: increment(1) });
      userLikesSet.add(achievementId);
    } else {
      await deleteDoc(doc(db, 'likes', snap.docs[0].id));
      await updateDoc(achRef, { likesCount: increment(-1) });
      userLikesSet.delete(achievementId);
    }
  } catch (e) {
    console.error('Ошибка лайка:', e);
  }
}

// ============================================================
// 17. СПИСОК УЧЕНИКОВ
// ============================================================
async function showStudents() {
  currentViewType = 'students';
  currentViewUid = null;
  hideMainContent();
  showLoadingState();
  try {
    const snap = await getDocs(collection(db, 'users'));
    let html = '<h2>Список учеников</h2>';
    let count = 0;
    snap.forEach(doc => {
      const u = doc.data();
      if (u.isDeleted) return;
      if (!hasRole(u, 'student')) return;
      count++;
      const displayName = u.fullName || u.firstName || 'Без имени';
      const classDisplay = u.classLetter ? getClassDisplayWithQuotes(u) : (u.classDisplay || '?');
      html += `<div class="user-card" data-uid="${escapeHtml(u.uid)}">${escapeHtml(displayName)} (${escapeHtml(classDisplay)})</div>`;
    });
    if (count === 0) {
      html += '<p>Пока нет зарегистрированных учеников.</p>';
    }
    html += `<div style="margin-top:30px;"><button id="backToMainBtn" class="btn-primary">На главную</button></div>`;
    pageContainer.innerHTML = html;
    document.getElementById('backToMainBtn')?.addEventListener('click', () => {
      showMainContent();
      loadNewAchievement();
    });
  } catch (e) {
    console.error(e);
    pageContainer.innerHTML = 'Ошибка загрузки';
  }
}

// ============================================================
// 18. ПРОФИЛЬ УЧЕНИКА
// ============================================================
async function showUserProfile(uid) {
  currentViewType = 'profile';
  currentViewUid = uid;
  hideMainContent();
  showLoadingState();
  try {
    const q = query(collection(db, 'users'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const userDoc = snap.docs[0];
    const user = userDoc.data();

    const displayName = user.fullName || user.firstName || 'Без имени';
    const classDisplay = user.classLetter ? getClassDisplayWithQuotes(user) : (user.classDisplay || '?');

    let ageText = 'не указан';
    if (user.birthDate) {
      const birth = new Date(user.birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      ageText = `${age} лет`;
    } else if (user.age) {
      ageText = `${user.age} лет`;
    }

    const isOwnProfile = (currentUser && uid === currentUser.uid);
    const isAdmin = hasRole(currentUserDoc, 'admin');

    // ---- Редактирование профиля ----
    let editButtonHtml = '';
    let editFormHtml = '';
    if (isOwnProfile) {
      const currentFirstName = user.firstName || '';
      const currentLastName = user.lastName || '';
      const currentClassNumber = user.classNumber || '';
      const currentClassLetter = user.classLetter || '';
      const currentBirthDate = user.birthDate || '';
      editButtonHtml = `<button id="editProfileBtn" style="margin-bottom:10px; background:#800020; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">Редактировать профиль</button>`;
      editFormHtml = `
        <div id="editProfileForm" style="display:none; margin-bottom:15px; background:#f5f5f5; padding:20px; border-radius:8px;">
          <h4>Редактировать профиль</h4>
          <input type="text" id="editFirstName" placeholder="Имя" value="${escapeHtml(currentFirstName)}" style="width:100%; padding:8px; margin:5px 0; border:1px solid #ccc; border-radius:6px;" />
          <input type="text" id="editLastName" placeholder="Фамилия" value="${escapeHtml(currentLastName)}" style="width:100%; padding:8px; margin:5px 0; border:1px solid #ccc; border-radius:6px;" />
          <div style="display:flex; gap:10px; align-items:center; margin:5px 0;">
            <label>Класс: <input type="number" id="editClassNumber" value="${escapeHtml(String(currentClassNumber))}" style="width:80px;" required min="1" max="11" /></label>
            <label>Буква: <input type="text" id="editClassLetter" value="${escapeHtml(currentClassLetter)}" style="width:60px;" required maxlength="1" /></label>
          </div>
          <label>Дата рождения: <input type="date" id="editBirthDate" value="${escapeHtml(currentBirthDate)}" style="padding:6px; border-radius:4px; border:1px solid #ccc;" /></label>
          <div style="margin-top:10px;">
            <button id="saveProfileBtn" style="background:#800020; color:white; border:none; padding:6px 16px; border-radius:6px; cursor:pointer;">Сохранить</button>
            <button id="cancelEditBtn" style="background:#ccc; border:none; padding:6px 16px; border-radius:6px; cursor:pointer;">Отмена</button>
          </div>
        </div>
      `;
    }

    // ---- Кнопка удаления аккаунта (только для админа, не для себя) ----
    let adminDeleteButtonHtml = '';
    if (isAdmin && !isOwnProfile) {
      adminDeleteButtonHtml = `<button id="adminDeleteUserBtn" style="margin-bottom:15px; background:#c00; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:1rem; font-weight:bold;">🗑️ Удалить аккаунт</button>`;
    }

    // ---- Кнопка добавления достижения ----
    let addButtonHtml = '';
    let addFormHtml = '';
    if (isOwnProfile) {
      addButtonHtml = `<button id="showAddAchievementBtn" style="margin-bottom:15px; background:#800020; color:#FFD700; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:1rem; font-weight:bold;">Добавить достижение</button>`;
      addFormHtml = `
        <div id="addAchievementForm" style="display:none; margin-bottom:15px; background:#f5f5f5; padding:20px; border-radius:8px;">
          <h4>Новое достижение</h4>
          <input type="text" id="achTitle" placeholder="Название" style="width:100%; padding:8px; margin:5px 0; border:1px solid #ccc; border-radius:6px;" />
          
          <div id="categoryContainer" style="margin:5px 0;">
            <select id="catLevel1" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;">
              <option value="">Выберите направление</option>
            </select>
            <select id="catLevel2" style="display:none; width:100%; padding:8px; margin-top:5px; border:1px solid #ccc; border-radius:6px;">
              <option value="">Выберите категорию</option>
            </select>
            <select id="catLevel3" style="display:none; width:100%; padding:8px; margin-top:5px; border:1px solid #ccc; border-radius:6px;">
              <option value="">Выберите детали</option>
            </select>
            <div id="catTextInputContainer" style="display:none; margin-top:5px;">
              <input type="text" id="catTextInput" placeholder="" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px;" />
            </div>
            <select id="catLevelPlace" style="display:none; width:100%; padding:8px; margin-top:5px; border:1px solid #ccc; border-radius:6px;">
              <option value="">Выберите результат</option>
              <option value="золото">🥇 Золото</option>
              <option value="серебро">🥈 Серебро</option>
              <option value="бронза">🥉 Бронза</option>
              <option value="1 место">🥇 1 место</option>
              <option value="2 место">🥈 2 место</option>
              <option value="3 место">🥉 3 место</option>
              <option value="участник">Участник</option>
            </select>
          </div>
          
          <textarea id="achDescription" placeholder="Описание. Ссылки на фото можно вставить сюда (Google Диск, Яндекс Диск и т.п.)" rows="4" style="width:100%; padding:8px; margin:5px 0; border:1px solid #ccc; border-radius:6px;"></textarea>
          <button id="submitAchievementBtn" style="background:#800020; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer;">Опубликовать</button>
          <button id="cancelAddAchievementBtn" style="background:#ccc; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; margin-left:5px;">Отмена</button>
        </div>
      `;
    }

    const qAch = query(
      collection(db, 'achievements'),
      where('userId', '==', uid),
      where('isDeleted', '==', false)
    );
    const achSnap = await getDocs(qAch);
    let achievements = achSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    achievements.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    let html = `
      <h2>${escapeHtml(displayName)}</h2>
      ${user.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" style="max-width:150px;border-radius:50%;"/>` : ''}
      <p>Класс: ${escapeHtml(classDisplay)}</p>
      <p>Возраст: ${escapeHtml(ageText)}</p>
      ${adminDeleteButtonHtml}
      ${editButtonHtml}
      ${editFormHtml}
      <hr/>
      ${addButtonHtml}
      ${addFormHtml}
      <h3>Достижения</h3>
      <div>
        <button id="sortDateBtn">По дате (новые)</button>
        <button id="sortLikesBtn">По популярности</button>
      </div>
      <div id="achievementsList">
        ${achievements.map(a => {
      const liked = userLikesSet.has(a.id);
      const likeIcon = liked ? '♥' : '♡';
      const safeTitle = escapeHtml(a.title);
      const safeCategory = escapeHtml(a.category || 'без категории');
      return `
            <div class="achievement-item" data-id="${escapeHtml(a.id)}" style="cursor:pointer; padding:10px; border-bottom:1px solid #eee;">
              <h4>${safeTitle}</h4>
              <p><strong>Категория:</strong> ${safeCategory}</p>
              <small><span class="like-icon" style="font-size:1.1rem; font-family: 'Segoe UI', Arial, sans-serif; font-variant-emoji: text; color:${liked ? '#FF0000' : '#888'};">${likeIcon}</span> ${a.likesCount || 0}</small>
            </div>
          `;
    }).join('')}
      </div>
      <div style="margin-top:30px;"><button id="backToMainBtn" class="btn-primary">На главную</button></div>
    `;
    pageContainer.innerHTML = html;

    // ---- Обработчики ----
    document.getElementById('adminDeleteUserBtn')?.addEventListener('click', async () => {
      await deleteUserAccount(uid);
    });

    if (isOwnProfile) {
      const editBtn = document.getElementById('editProfileBtn');
      const editForm = document.getElementById('editProfileForm');
      const saveBtn = document.getElementById('saveProfileBtn');
      const cancelBtn = document.getElementById('cancelEditBtn');
      const firstNameInput = document.getElementById('editFirstName');
      const lastNameInput = document.getElementById('editLastName');
      const classNumberInput = document.getElementById('editClassNumber');
      const classLetterInput = document.getElementById('editClassLetter');
      const birthInput = document.getElementById('editBirthDate');

      if (editBtn) {
        editBtn.addEventListener('click', () => {
          editForm.style.display = editForm.style.display === 'block' ? 'none' : 'block';
        });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          editForm.style.display = 'none';
        });
      }
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const firstName = firstNameInput.value.trim();
          const lastName = lastNameInput.value.trim();
          const classNumber = classNumberInput.value.trim();
          let classLetter = classLetterInput.value.trim();

          if (!firstName || !lastName || !classNumber || !classLetter) {
            alert('Имя, фамилия, номер и буква класса обязательны для заполнения');
            return;
          }

          if (parseInt(classNumber) < 1 || parseInt(classNumber) > 11) {
            alert('Номер класса должен быть от 1 до 11');
            return;
          }

          classLetter = classLetter.toUpperCase();
          if (!validateRussianLetter(classLetter)) {
            alert('Буква класса должна быть русской (например, А, Б, В)');
            return;
          }

          const birthDate = birthInput.value;

          await updateUserProfile({
            firstName,
            lastName,
            classNumber: parseInt(classNumber),
            classLetter,
            birthDate: birthDate || null
          });
          editForm.style.display = 'none';
        });
      }

      const showAddBtn = document.getElementById('showAddAchievementBtn');
      const addFormEl = document.getElementById('addAchievementForm');
      const submitBtn = document.getElementById('submitAchievementBtn');
      const cancelAddBtn = document.getElementById('cancelAddAchievementBtn');

      if (showAddBtn) {
        showAddBtn.addEventListener('click', () => {
          if (addFormEl.style.display === 'block') {
            addFormEl.style.display = 'none';
          } else {
            addFormEl.style.display = 'block';
            initCategorySelectors();
          }
        });
      }
      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          const title = document.getElementById('achTitle').value;
          const category = getFullCategoryPath();
          const description = document.getElementById('achDescription').value;

          if (!title || !category) {
            alert('Заполните название и категорию');
            return;
          }

          const success = await addAchievement(title, category, description);
          if (success) {
            alert('Достижение добавлено!');
            addFormEl.style.display = 'none';
            document.getElementById('achTitle').value = '';
            document.getElementById('achDescription').value = '';
            document.getElementById('catLevel1').value = '';
            document.getElementById('catLevel2').innerHTML = '<option value="">Выберите категорию</option>';
            document.getElementById('catLevel3').innerHTML = '<option value="">Выберите детали</option>';
            document.getElementById('catTextInput').value = '';
            document.getElementById('catLevelPlace').value = '';
            document.getElementById('catLevel2').style.display = 'none';
            document.getElementById('catLevel3').style.display = 'none';
            document.getElementById('catTextInputContainer').style.display = 'none';
            document.getElementById('catLevelPlace').style.display = 'none';
            showUserProfile(uid);
            loadNewAchievement();
          } else {
            alert('Ошибка добавления достижения');
          }
        });
      }
      if (cancelAddBtn) {
        cancelAddBtn.addEventListener('click', () => {
          addFormEl.style.display = 'none';
          document.getElementById('achTitle').value = '';
          document.getElementById('achDescription').value = '';
          document.getElementById('catLevel1').value = '';
          document.getElementById('catLevel2').innerHTML = '<option value="">Выберите категорию</option>';
          document.getElementById('catLevel3').innerHTML = '<option value="">Выберите детали</option>';
          document.getElementById('catTextInput').value = '';
          document.getElementById('catLevelPlace').value = '';
          document.getElementById('catLevel2').style.display = 'none';
          document.getElementById('catLevel3').style.display = 'none';
          document.getElementById('catTextInputContainer').style.display = 'none';
          document.getElementById('catLevelPlace').style.display = 'none';
        });
      }
    }

    document.getElementById('sortDateBtn')?.addEventListener('click', () => {
      achievements.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderAchievementsList(achievements);
    });
    document.getElementById('sortLikesBtn')?.addEventListener('click', () => {
      achievements.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
      renderAchievementsList(achievements);
    });

    document.getElementById('backToMainBtn')?.addEventListener('click', () => {
      showMainContent();
      loadNewAchievement();
    });

  } catch (e) {
    pageContainer.innerHTML = 'Ошибка загрузки профиля';
    console.error(e);
  }
}

function renderAchievementsList(achievements) {
  const container = document.getElementById('achievementsList');
  if (!container) return;
  container.innerHTML = achievements.map(a => {
    const liked = userLikesSet.has(a.id);
    const likeIcon = liked ? '♥' : '♡';
    const safeTitle = escapeHtml(a.title);
    const safeCategory = escapeHtml(a.category || 'без категории');
    return `
      <div class="achievement-item" data-id="${escapeHtml(a.id)}" style="cursor:pointer; padding:10px; border-bottom:1px solid #eee;">
        <h4>${safeTitle}</h4>
        <p><strong>Категория:</strong> ${safeCategory}</p>
        <small><span class="like-icon" style="font-size:1.1rem; font-family: 'Segoe UI', Arial, sans-serif; font-variant-emoji: text; color:${liked ? '#FF0000' : '#888'};">${likeIcon}</span> ${a.likesCount || 0}</small>
      </div>
    `;
  }).join('');
}

// ============================================================
// 19. ТОП-10 ДОСТИЖЕНИЙ
// ============================================================
async function showTopAchievements() {
  currentViewType = 'top';
  currentViewUid = null;
  hideMainContent();
  showLoadingState();
  try {
    const q = query(
      collection(db, 'achievements'),
      where('isDeleted', '==', false)
    );
    const snap = await getDocs(q);
    let achievements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    achievements.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
    const top10 = achievements.slice(0, 10);

    const topWithAuthors = await Promise.all(top10.map(async (a) => {
      const author = await fetchAuthorName(a.userId);
      const liked = userLikesSet.has(a.id);
      const likeIcon = liked ? '♥' : '♡';
      return { ...a, author, likeIcon, liked };
    }));

    let html = '<h2>Топ-10 достижений</h2>';
    html += '<div id="topList">';
    topWithAuthors.forEach(a => {
      const safeTitle = escapeHtml(a.title);
      const safeCategory = escapeHtml(a.category || 'без категории');
      const safeAuthor = escapeHtml(a.author);
      html += `<div class="achievement-item" data-id="${escapeHtml(a.id)}" style="cursor:pointer; padding:10px; border-bottom:1px solid #eee;">
        <h4>${safeTitle}</h4>
        <p><strong>Категория:</strong> ${safeCategory}</p>
        <p><strong>Автор:</strong> ${safeAuthor}</p>
        <small><span class="like-icon" style="font-size:1.1rem; font-family: 'Segoe UI', Arial, sans-serif; font-variant-emoji: text; color:${a.liked ? '#FF0000' : '#888'};">${a.likeIcon}</span> ${a.likesCount || 0}</small>
      </div>`;
    });
    html += '</div>';
    html += `<div style="margin-top:30px;"><button id="backToMainBtn" class="btn-primary">На главную</button></div>`;
    pageContainer.innerHTML = html;
    document.getElementById('backToMainBtn')?.addEventListener('click', () => {
      showMainContent();
      loadNewAchievement();
    });
  } catch (e) {
    pageContainer.innerHTML = 'Ошибка загрузки топа';
  }
}

// ============================================================
// 20. СТАТИСТИКА ДЛЯ УЧИТЕЛЯ И АДМИНА
// ============================================================
async function showStatistics() {
  if (!currentUserDoc || (!hasRole(currentUserDoc, 'teacher') && !hasRole(currentUserDoc, 'admin'))) {
    pageContainer.innerHTML = '<p>Доступно только учителям.</p>';
    return;
  }
  currentViewType = 'statistics';
  currentViewUid = null;
  hideMainContent();
  showLoadingState();

  pageContainer.innerHTML = `
    <h2>Статистика</h2>
    <div class="stat-block">
      <label>Класс: <input type="text" id="statClass" placeholder="7В" /></label>
      <label>Ученик (email): <input type="text" id="statUserEmail" placeholder="email" /></label>
      <label>Месяц: <input type="month" id="statMonth" /></label>
      <button id="getStatBtn">Показать</button>
    </div>
    <div id="statResult"></div>
    <div style="margin-top:30px;"><button id="backToMainBtn" class="btn-primary">На главную</button></div>
  `;

  document.getElementById('backToMainBtn')?.addEventListener('click', () => {
    showMainContent();
    loadNewAchievement();
  });

  document.getElementById('getStatBtn').addEventListener('click', async () => {
    const className = document.getElementById('statClass').value.trim();
    const userEmail = document.getElementById('statUserEmail').value.trim();
    const month = document.getElementById('statMonth').value;
    if (!month) { alert('Выберите месяц'); return; }
    const [year, monthNum] = month.split('-');
    const start = new Date(year, monthNum - 1, 1);
    const end = new Date(year, monthNum, 1);

    try {
      const q = query(
        collection(db, 'achievements'),
        where('isDeleted', '==', false),
        where('createdAt', '>=', start),
        where('createdAt', '<', end)
      );
      const snap = await getDocs(q);
      let achievements = snap.docs.map(d => d.data());

      if (className) {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('classDisplay', '==', className)));
        const userIds = usersSnap.docs.map(d => d.data().uid);
        achievements = achievements.filter(a => userIds.includes(a.userId));
      }
      if (userEmail) {
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', userEmail)));
        if (!userSnap.empty) {
          const uid = userSnap.docs[0].data().uid;
          achievements = achievements.filter(a => a.userId === uid);
        } else {
          achievements = [];
        }
      }

      const count = achievements.length;
      document.getElementById('statResult').innerHTML = `
        <p>Количество достижений: <strong>${count}</strong></p>
        <p>${count > 0 ? 'Список достижений: ' + achievements.map(a => a.title).join(', ') : 'Нет достижений'}</p>
      `;
    } catch (e) {
      alert('Ошибка статистики: ' + e.message);
    }
  });
}

// ============================================================
// 21. НАВИГАЦИЯ
// ============================================================
showProfileLink.addEventListener('click', (e) => {
  e.preventDefault();
  if (currentUser) {
    showUserProfile(currentUser.uid);
  } else {
    alert('Вы не авторизованы');
  }
});

showStudentsLink.addEventListener('click', (e) => {
  e.preventDefault();
  showStudents();
});
showTopLink.addEventListener('click', (e) => {
  e.preventDefault();
  showTopAchievements();
});
showStatisticsLink.addEventListener('click', (e) => {
  e.preventDefault();
  showStatistics();
});

// ============================================================
// 22. ЗАКРЫТИЕ МОДАЛКИ
// ============================================================
modalClose.addEventListener('click', () => {
  closeModal();
});

window.addEventListener('click', (e) => {
  if (e.target === modal) {
    closeModal();
  }
});

// ============================================================
// 23. УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК НА pageContainer
// ============================================================
pageContainer.addEventListener('click', (e) => {
  const userCard = e.target.closest('.user-card');
  if (userCard) {
    const uid = userCard.dataset.uid;
    if (uid) showUserProfile(uid);
    return;
  }

  const achievementItem = e.target.closest('.achievement-item');
  if (achievementItem) {
    if (e.target.tagName === 'A') {
      e.preventDefault();
    }
    const id = achievementItem.dataset.id;
    if (id) showFullAchievement(id);
  }
});

console.log('Портал "Достижения 7В" запущен (с обработкой старых категорий)');