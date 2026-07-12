import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn1lKsAAAAASUVORK5CYII=', 'base64');

async function installMediaMocks(context: BrowserContext) {
  await context.addInitScript(() => {
    class FakeMediaStream {
      tracks: Array<{ enabled: boolean; stop: () => void }>;
      constructor() {
        this.tracks = [{ enabled: true, stop: () => undefined }];
      }
      getTracks() {
        return this.tracks;
      }
      getAudioTracks() {
        return this.tracks;
      }
    }

    class FakeMediaRecorder {
      stream: any;
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      constructor(stream: any) {
        this.stream = stream;
      }
      start() {
        setTimeout(() => this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) }), 50);
        setTimeout(() => this.onstop?.(), 100);
      }
      stop() {
        this.onstop?.();
      }
    }

    class FakeAnalyser {
      fftSize = 256;
      frequencyBinCount = 32;
      getByteFrequencyData(array: Uint8Array) {
        array.fill(0);
      }
    }

    class FakeAudioContext {
      createMediaStreamSource() {
        return { connect: () => undefined };
      }
      createAnalyser() {
        return new FakeAnalyser();
      }
      close() {
        return Promise.resolve();
      }
    }

    class FakeRTCPeerConnection {
      localDescription: any;
      remoteDescription: any;
      onicecandidate: ((event: { candidate: any }) => void) | null = null;
      ontrack: ((event: { streams: any[] }) => void) | null = null;
      addTrack() {
        return undefined;
      }
      async createOffer() {
        return { type: 'offer', sdp: 'fake-offer' };
      }
      async createAnswer() {
        return { type: 'answer', sdp: 'fake-answer' };
      }
      async setLocalDescription(description: any) {
        this.localDescription = description;
      }
      async setRemoteDescription(description: any) {
        this.remoteDescription = description;
      }
      async addIceCandidate() {
        return undefined;
      }
      close() {
        return undefined;
      }
    }

    Object.defineProperty(window, 'MediaStream', { configurable: true, writable: true, value: FakeMediaStream });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, writable: true, value: FakeMediaRecorder });
    Object.defineProperty(window, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, writable: true, value: FakeAudioContext });
    Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, writable: true, value: FakeRTCPeerConnection });
    Object.defineProperty(window, 'RTCSessionDescription', { configurable: true, writable: true, value: class { constructor(public init: any) { return init; } } });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => new FakeMediaStream(),
        enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'fake-mic', label: 'Fake Mic' }],
      },
    });
  });
}

function observePage(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.method()} ${request.url()} -> ${request.failure()?.errorText}`));
  return errors;
}

async function registerUser(page: Page, username: string, email: string) {
  await page.goto('/register');
  await page.getByLabel('اسم المستخدم').fill(username);
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill('StrongPass123');
  await page.getByRole('button', { name: /إنشاء الحساب/i }).click();
  await expect(page).toHaveURL(/\/app/);
}

async function currentUserId(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('royal-user') || '{}').id as string);
}

test.beforeEach(async ({ context }) => {
  await installMediaMocks(context);
});

test('auth, profile, friends, rooms, online game, chat and voice flows work without console/network errors', async ({ browser }) => {
  test.setTimeout(90000);
  const suffix = Date.now();

  const contextOne = await browser.newContext();
  await installMediaMocks(contextOne);
  const pageOne = await contextOne.newPage();
  const errorsOne = observePage(pageOne);

  await pageOne.goto('/');
  await expect(pageOne.getByRole('heading', { name: /وارهيكس|WARHEX/i })).toBeVisible({ timeout: 15000 });
  await registerUser(pageOne, `alpha${suffix}`, `alpha${suffix}@example.com`);
  const userOneId = await currentUserId(pageOne);

  await pageOne.goto('/app/profile');
  await pageOne.getByLabel('النبذة').fill('لاعب يختبر منصة الإنتاج');
  await pageOne.locator('input[type="file"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  });
  await expect(pageOne.getByText(/تم رفع الصورة بنجاح/i)).toBeVisible();
  await pageOne.getByRole('button', { name: /^حفظ$/ }).click();
  await expect(pageOne.getByText(/تم تحديث الملف الشخصي/i)).toBeVisible();

  await pageOne.goto('/app/settings');
  await pageOne.getByLabel('المظهر').selectOption('light');
  await pageOne.getByRole('button', { name: /حفظ الإعدادات/i }).click();
  await expect(pageOne.getByText(/تم حفظ الإعدادات/i)).toBeVisible();

  await pageOne.reload();
  await expect(pageOne).toHaveURL(/\/app\/settings/);
  await expect(pageOne.getByRole('heading', { name: /الإعدادات/i })).toBeVisible();

  await pageOne.goto('/app/rooms');
  await pageOne.getByLabel('اسم الغرفة').fill(`Room ${suffix}`);
  await pageOne.getByRole('button', { name: /^إنشاء$/ }).click();
  const createdRoom = pageOne.locator('article').filter({ hasText: `Room ${suffix}` }).first();
  await expect(createdRoom).toBeVisible();

  const contextTwo = await browser.newContext();
  await installMediaMocks(contextTwo);
  const pageTwo = await contextTwo.newPage();
  const errorsTwo = observePage(pageTwo);
  await registerUser(pageTwo, `beta${suffix}`, `beta${suffix}@example.com`);
  const userTwoId = await currentUserId(pageTwo);

  await pageOne.goto('/app/search');
  await pageOne.getByPlaceholder('ابحث عن لاعب أو غرفة').fill(`beta${suffix}`);
  await pageOne.getByRole('button', { name: /^بحث$/ }).click();
  await expect(pageOne.getByText(new RegExp(`beta${suffix}`, 'i'))).toBeVisible();
  await pageOne.getByRole('button', { name: /إضافة صديق/i }).click();
  await expect(pageOne.getByText(/تم إرسال طلب صداقة/i)).toBeVisible();

  await pageTwo.goto('/app/friends');
  await expect(pageTwo.getByText(new RegExp(`alpha${suffix}`, 'i'))).toBeVisible();
  await pageTwo.getByRole('button', { name: /قبول/i }).click();
  await expect(pageTwo.getByText(/لا توجد طلبات واردة/i)).toBeVisible();

  await pageOne.goto('/app/friends');
  await expect(pageOne.getByText(new RegExp(`beta${suffix}`, 'i'))).toBeVisible();

  await pageTwo.goto('/app/rooms');
  const targetRoom = pageTwo.locator('article').filter({ hasText: `Room ${suffix}` }).first();
  await expect(targetRoom).toBeVisible();
  await targetRoom.getByRole('button', { name: /^انضمام$/ }).click();
  await expect(pageTwo.getByText(/تم الانضمام إلى/i)).toBeVisible();
  await targetRoom.getByRole('button', { name: /عرض الأعضاء/i }).click();
  await expect(targetRoom.getByText(new RegExp(`beta${suffix}`, 'i'))).toBeVisible();
  await targetRoom.getByRole('button', { name: /^مغادرة$/ }).click();
  await expect(pageTwo.getByText(/تم مغادرة/i)).toBeVisible();

  await pageOne.goto('/app/game?mode=online');
  await pageOne.getByRole('button', { name: /بدء مباراة أونلاين/i }).click();
  const gameIdText = await pageOne.locator('code').first().textContent();
  expect(gameIdText).toBeTruthy();
  const gameId = gameIdText!.trim();

  await pageTwo.goto('/app/game?mode=online');
  await pageTwo.getByPlaceholder('ألصق Game ID').fill(gameId);
  await pageTwo.getByRole('button', { name: /انضمام لمباراة/i }).click();
  await expect(pageTwo.getByText(new RegExp(gameId))).toBeVisible();

  await pageOne.getByPlaceholder('اكتب رسالة...').fill('مرحبا من اللاعب الأول');
  await pageOne.getByRole('button', { name: /^إرسال$/ }).click();
  await expect(pageTwo.getByText(/مرحبا من اللاعب الأول/i)).toBeVisible();

  await pageOne.getByLabel('معرّف اللاعب المستهدف').fill(userTwoId);
  await pageTwo.getByLabel('معرّف اللاعب المستهدف').fill(userOneId);
  await pageOne.getByRole('button', { name: /^انضمام$/ }).click();
  await expect(pageOne.getByRole('button', { name: /مغادرة/i }).first()).toBeVisible();
  await expect(pageTwo.getByRole('button', { name: /مغادرة/i }).first()).toBeVisible({ timeout: 10000 });

  await pageOne.getByRole('button', { name: /رسالة صوتية/i }).click();
  await expect(pageTwo.locator('audio')).toHaveCount(1, { timeout: 5000 });

  await pageOne.getByRole('button', { name: /استسلام/i }).click();
  await expect(pageOne.getByText(/استسلام:/i)).toBeVisible();

  await pageOne.goto('/app/history');
  await expect(pageOne.getByText(/0-1|1-0|1\/2-1\/2/)).toBeVisible();

  await pageOne.getByRole('button', { name: /خروج/i }).click();
  await expect(pageOne).toHaveURL(/\/login/);

  expect(errorsOne).toEqual([]);
  expect(errorsTwo).toEqual([]);

  await contextOne.close();
  await contextTwo.close();
});

test('local game and replay flows work without console/network errors', async ({ browser }) => {
  const context = await browser.newContext();
  await installMediaMocks(context);
  const page = await context.newPage();
  const errors = observePage(page);
  const suffix = Date.now() + 1;

  await registerUser(page, `gamma${suffix}`, `gamma${suffix}@example.com`);

  await page.goto('/app/game?mode=local');
  await page.getByRole('button', { name: /^Square f2/ }).click();
  await page.getByRole('button', { name: /^Square f3$/ }).click();
  await page.getByRole('button', { name: /^Square e7/ }).click();
  await page.getByRole('button', { name: /^Square e5$/ }).click();
  await page.getByRole('button', { name: /^Square g2/ }).click();
  await page.getByRole('button', { name: /^Square g4$/ }).click();
  await page.getByRole('button', { name: /^Square d8/ }).click();
  await page.getByRole('button', { name: /^Square h4$/ }).click();
  await expect(page.getByText(/كش مات/i)).toBeVisible();

  await page.goto('/app/replay');
  await page.getByPlaceholder('ألصق PGN أو FEN هنا').fill('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  await page.getByRole('button', { name: /^تحميل$/ }).click();
  await page.getByRole('button', { name: /النهاية/i }).click();
  await expect(page.getByRole('button', { name: /^Square h4 bq$/ })).toBeVisible();

  expect(errors).toEqual([]);
  await context.close();
});
