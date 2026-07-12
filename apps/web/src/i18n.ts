import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ar: {
    translation: {
      brand: 'وارهيكس',
      playNow: 'ابدأ اللعب',
      quickPlay: 'لعب سريع',
      rooms: 'الغرف',
      leaderboard: 'المتصدرين',
      history: 'السجل',
      profile: 'الملف الشخصي',
      settings: 'الإعدادات',
      login: 'دخول',
      register: 'حساب جديد',
      logout: 'خروج',
    },
  },
  en: { translation: { brand: 'WARHEX', playNow: 'Play now', quickPlay: 'Quick play', rooms: 'Rooms', leaderboard: 'Leaderboard', history: 'History', profile: 'Profile', settings: 'Settings', login: 'Login', register: 'Register', logout: 'Logout' } },
  fr: { translation: { brand: 'WARHEX', playNow: 'Jouer', quickPlay: 'Partie rapide', rooms: 'Salles', leaderboard: 'Classement', history: 'Historique', profile: 'Profil', settings: 'Paramètres', login: 'Connexion', register: 'Inscription', logout: 'Déconnexion' } },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'ar',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
