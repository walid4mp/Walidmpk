# WARHEX

منصة شطرنج Production Ready مبنية كـ monorepo باستخدام **TypeScript + React + Vite + Node.js + Express + Socket.IO + SQLite**. المشروع يدعم اللعب المحلي، اللعب ضد الذكاء الاصطناعي، المباريات الأونلاين، الغرف، الأصدقاء، البحث، الدردشة النصية، الرسائل الصوتية، الإشارات الصوتية عبر WebRTC، رفع الصور الشخصية، السجل، وإعادة اللعب باستخدام **PGN / FEN**.

---

## 1) نظرة عامة

WARHEX يجمع الواجهة الأمامية والخادم والمنطق المشترك للشطرنج داخل مستودع واحد منظم باستخدام **npm workspaces**. هذا يسمح ببناء متدرج، مشاركة الأكواد بين التطبيقات، ونشر موحد على Render.

### حالات الاستخدام الرئيسية
- لعب محلي على نفس الجهاز.
- اللعب ضد الذكاء الاصطناعي.
- إنشاء مباراة أونلاين ومشاركتها عبر Game ID.
- إنشاء غرف والانضمام والمغادرة وعرض الأعضاء.
- إرسال رسائل نصية وصوتية أثناء المباراة.
- تفعيل محادثة صوتية بين اللاعبين عبر WebRTC signaling.
- إدارة الملف الشخصي والصورة الشخصية والإعدادات.
- البحث عن لاعبين وغرف وإدارة الصداقات.
- مراجعة المباريات السابقة وإعادة اللعب.

---

## 2) المميزات

### المميزات الوظيفية
- محرك شطرنج كامل بقواعد قانونية أساسية ومتقدمة:
  - Check / Checkmate
  - Draw detection
  - Castling
  - En passant
  - Promotion
  - Repetition / insufficient material handling
- AI مبني على Minimax + Alpha-Beta pruning.
- Socket.IO للمباريات الحية والدردشة.
- WebRTC signaling للمحادثات الصوتية.
- تسجيل ودخول واستعادة جلسة JWT.
- رفع الصور الشخصية وحفظها على التخزين المحلي أو Persistent Disk.
- البحث عن اللاعبين والغرف.
- نظام أصدقاء: إرسال، قبول، حذف.
- سجل المباريات مع حفظ الحالة النهائية وPGN.
- استيراد PGN/FEN وإعادة اللعب.

### مميزات الإنتاج
- دعم `process.env.PORT` بالكامل.
- دعم Render بدون تعديل إضافي.
- خدمة Static للواجهة من نفس خادم الإنتاج.
- SPA fallback routes.
- SQLite مع WAL mode.
- Helmet + Rate Limit + Zod validation.
- إعدادات واضحة للتخزين الدائم على Render.
- Monorepo build order ثابت وصحيح.

---

## 3) التقنيات المستخدمة

### Frontend
- React 19
- TypeScript
- Vite
- React Router
- i18next
- Socket.IO Client

### Backend
- Node.js
- Express
- TypeScript
- Socket.IO
- better-sqlite3
- bcryptjs
- jsonwebtoken
- Zod
- Helmet
- express-rate-limit

### Tooling / QA
- npm workspaces
- Vitest
- Supertest
- Playwright

---

## 4) بنية المشروع

```text
warhex/
├── apps/
│   ├── server/                  # Express + Socket.IO backend
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   ├── db.ts
│   │   │   ├── server.ts
│   │   │   └── server.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                     # React + Vite frontend
│       ├── src/
│       │   ├── components/
│       │   ├── lib/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── styles.css
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── packages/
│   ├── shared/                  # Chess engine + AI logic
│   └── ui/                      # Shared UI package entry
├── tests/
│   └── e2e/                     # Playwright end-to-end tests
├── .env.example
├── render.yaml
├── tsconfig.base.json
├── package.json
└── package-lock.json
```

---

## 5) المتطلبات

- **Node.js 20+**
- **npm 10+**

يفضل مطابقة ما يلي:
- Node.js `>=20.10.0`
- npm `>=10.0.0`

---

## 6) التثبيت

```bash
npm install
```

---

## 7) إعداد Environment Variables

انسخ الملف:

```bash
cp .env.example .env
```

ثم عدّل القيم حسب البيئة.

### متغيرات الخادم

| المتغير | مطلوب | الوصف |
|---|---:|---|
| `NODE_ENV` | نعم | `development` أو `production` |
| `PORT` | نعم | المنفذ الذي سيعمل عليه الخادم |
| `JWT_SECRET` | نعم | مفتاح توقيع JWT |
| `CLIENT_ORIGIN` | نعم | أصل الواجهة المسموح به في CORS |
| `RENDER` | لا | `true` في Render |
| `DATABASE_URL` | يوصى به | مثال: `sqlite://./data/royal-square.sqlite` |
| `DB_PATH` | اختياري | بديل مباشر لمسار قاعدة البيانات |
| `UPLOAD_DIR` | يوصى به | مجلد الصور المرفوعة |

### متغيرات الواجهة

| المتغير | مطلوب | الوصف |
|---|---:|---|
| `VITE_API_URL` | اختياري | استخدمه إذا كانت الواجهة تعمل على Origin مختلف عن الـ API |
| `VITE_PORT` | اختياري | منفذ Vite في التطوير |
| `VITE_PROXY_TARGET` | اختياري | الـ backend target في بيئة التطوير |

### إعداد محلي مقترح

```env
NODE_ENV=development
PORT=4200
JWT_SECRET=change-me-in-production
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=sqlite://./data/royal-square.sqlite
UPLOAD_DIR=./uploads
VITE_API_URL=
VITE_PORT=5173
VITE_PROXY_TARGET=http://localhost:4200
RENDER=false
```

### إعداد Render مقترح

```env
NODE_ENV=production
JWT_SECRET=<secure-random-secret>
CLIENT_ORIGIN=https://<your-service>.onrender.com
DATABASE_URL=sqlite:///opt/render/project/src/var/data/royal-square.sqlite
UPLOAD_DIR=/opt/render/project/src/var/data/uploads
RENDER=true
```

---

## 8) التشغيل في وضع التطوير

تشغيل الخادم والواجهة معًا:

```bash
npm run dev
```

### المسارات الافتراضية
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4200`

Vite يقوم بعمل proxy للمسارات التالية في التطوير:
- `/api`
- `/uploads`
- `/socket.io`

---

## 9) Build للإنتاج

```bash
npm run build
```

هذا الأمر يبني الـ workspaces بالترتيب الصحيح:
1. `@warhex/shared`
2. `@warhex/ui`
3. `@warhex/server`
4. `@warhex/web`

---

## 10) Typecheck

```bash
npm run typecheck
```

---

## 11) الاختبارات

### اختبارات الوحدة والتكامل

```bash
npm test
```

### اختبارات المتصفح E2E

```bash
npx playwright test
```

الاختبارات الحالية تغطي تدفقات مهمة مثل:
- الصفحة الرئيسية والتنقل.
- التسجيل والدخول.
- استعادة الجلسة.
- الملف الشخصي ورفع الصورة.
- الإعدادات.
- البحث والأصدقاء.
- الغرف والانضمام والمغادرة.
- المباريات الأونلاين والدردشة.
- الرسائل الصوتية.
- المحادثة الصوتية.
- اللعب المحلي وإعادة اللعب.
- التحقق من Console / Network errors.

---

## 12) تشغيل نسخة الإنتاج محليًا

بعد البناء:

```bash
npm start
```

خادم الإنتاج يقدّم:
- API عبر Express
- Socket.IO
- ملفات `/uploads`
- الواجهة المجمّعة من `apps/web/dist`
- SPA fallback routes مثل `/login` و`/app/*`

---

## 13) أوامر npm المتاحة

### أوامر الجذر

```bash
npm run dev
npm run build
npm run start
npm run test
npm run typecheck
npm run lint
```

### أوامر Workspaces

```bash
npm run dev --workspace @warhex/server
npm run dev --workspace @warhex/web
npm run build --workspace @warhex/shared
npm run build --workspace @warhex/server
npm run build --workspace @warhex/web
```

---

## 14) النشر على Render

المشروع يحتوي بالفعل على ملف `render.yaml` جاهز.

### إعدادات Render المعتمدة
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`
- **Persistent Disk Mount**: `/opt/render/project/src/var/data`

### لماذا التخزين الدائم مطلوب؟
لأن المشروع يستخدم:
- SQLite database
- uploaded avatars / images

وبالتالي يجب حفظهما على Persistent Disk حتى لا يختفيا بعد إعادة التشغيل.

### ماذا يفعل `render.yaml`؟
- يضبط بيئة Node.
- يمرّر `NODE_ENV=production`.
- يفعّل `RENDER=true`.
- يضبط `DATABASE_URL` على القرص الدائم.
- يضبط `UPLOAD_DIR` على القرص الدائم.
- يترك `CLIENT_ORIGIN` كقيمة يتم ضبطها من Render Dashboard إذا لزم.

### خطوات النشر
1. ارفع المشروع إلى Git repository.
2. اربط المستودع بـ Render.
3. أنشئ Web Service باستخدام `render.yaml`.
4. اضبط `CLIENT_ORIGIN` على رابط الخدمة النهائي عند الحاجة.
5. نفّذ أول Deploy.
6. تأكد من نجاح `/api/health`.

---

## 15) النشر على Railway

المشروع جاهز أيضًا لـ Railway.

### الإعدادات المعتمدة
- ملف `railway.json` موجود.
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check**: `/api/health`

### ملاحظات Railway
- Railway يمرر `PORT` تلقائيًا، والمشروع يدعمه.
- يفضّل ضبط المتغيرات التالية في Railway:
  - `NODE_ENV=production`
  - `JWT_SECRET=<secure-random-secret>`
  - `CLIENT_ORIGIN=<your-railway-domain>`
  - `DATABASE_URL=sqlite://./data/royal-square.sqlite` أو قاعدة بيانات خارجية إذا رغبت لاحقًا
  - `UPLOAD_DIR=./uploads`
- إذا كنت تحتاج persistence أقوى من filesystem المحلي، فكر لاحقًا في نقل قاعدة البيانات إلى Postgres أو استخدام volume دائم عند توفره.

## 16) التشغيل عبر Docker

المشروع يحتوي على:
- `Dockerfile`
- `.dockerignore`

### بناء الصورة

```bash
docker build -t royal-square .
```

### تشغيل الحاوية

```bash
docker run --rm -p 4200:4200 \
  -e NODE_ENV=production \
  -e PORT=4200 \
  -e JWT_SECRET=change-me \
  -e CLIENT_ORIGIN=http://localhost:4200 \
  -e DATABASE_URL=sqlite:///app/data/royal-square.sqlite \
  -e UPLOAD_DIR=/app/uploads \
  royal-square
```

### ملاحظات Docker
- التطبيق يخدم الواجهة والـ API من نفس الحاوية.
- للتخزين الدائم في Docker الإنتاجي، اربط volumes للمجلدين:
  - `/app/data`
  - `/app/uploads`

## 17) الصور ولقطات الشاشة

يمكنك إنشاء مجلد مثل:

```text
assets/screenshots/
```

لقطات مقترحة:
- `landing-page.png`
- `login-page.png`
- `signup-page.png`
- `rooms-page.png`
- `friends-page.png`
- `game-online-page.png`
- `profile-page.png`
- `replay-page.png`

يمكن إضافة هذه الصور لاحقًا داخل README باستخدام Markdown:

```md
![Landing Page](assets/screenshots/landing-page.png)
```

---

## 18) مراجعة الأداء

- البناء يتم بترتيب ثابت لتفادي أخطاء الربط بين الـ workspaces.
- ملفات الواجهة تخدم مباشرة من Express في الإنتاج لتقليل التعقيد.
- تم تفعيل SQLite WAL mode لتحسين الاستقرار في الكتابة.
- WebSocket fan-out يتم عبر rooms مخصصة في Socket.IO.
- الاعتماد على `VITE_API_URL` اختياري فقط عند الحاجة، مما يقلل أخطاء الـ CORS في الإنتاج.

---

## 19) مراجعة الأمان

- كلمات المرور يتم تشفيرها عبر `bcryptjs`.
- JWT مطلوب للمسارات المحمية.
- التحقق من المدخلات يتم عبر `zod`.
- تم تفعيل `helmet`.
- تم تفعيل `express-rate-limit`.
- رفع الصور محدود بالحجم والنوع.
- CORS مضبوط عبر `CLIENT_ORIGIN`.
- لا توجد أسرار hard-coded داخل الكود.

---

## 20) مراجعة الاستقرار

- يدعم التشغيل المحلي والإنتاجي من نفس قاعدة الكود.
- يدعم استعادة الجلسة بعد إعادة التحميل.
- يتعامل مع SPA routes بدون 404 في الإنتاج.
- حفظ الرسائل والمباريات والغرف والملفات يعمل مع قاعدة البيانات.
- يدعم العمل على Render مع Persistent Disk.

---

## 21) الترخيص

هذا المشروع مضبوط حاليًا كـ **UNLICENSED**، أي أنه غير مرخّص للتوزيع العام تلقائيًا. إذا كان المشروع سيُنشر خارجيًا أو سيُفتح كمصدر مفتوح، أضف ملف `LICENSE` مناسب قبل التوزيع.

---

## 22) معلومات المطور

- **Project Name**: WARHEX
- **Architecture**: npm workspaces monorepo
- **Primary Stack**: TypeScript / React / Node.js / Express / Socket.IO / SQLite
- **Deployment Target**: Render

إذا رغبت لاحقًا، يمكن إضافة قسم خاص باسم المطور، البريد، الموقع، أو شعار المشروع داخل هذا README.
