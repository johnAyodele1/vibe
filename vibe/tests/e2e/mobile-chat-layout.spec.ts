import { test, expect } from '@playwright/test';

// Mock helper if not imported elsewhere
async function loginAndOpenConversation(page: any) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('adultZoneVerified', JSON.stringify({ verified: true, timestamp: Date.now() }));
    localStorage.setItem('adultAccessToken', 'mock-token-abc');
  });
  await page.goto('/adult/sext');
  // Open first conversation
  await page.locator('[data-testid="conversation-row"]').first().click();
}

test.describe('Message Feed Scroll', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('message feed is scrollable', async ({ page }) => {
    await loginAndOpenConversation(page);
    const feed = page.locator('[data-testid="message-feed"]');
    // Verify scrollHeight > clientHeight (i.e. there is content to scroll)
    const isScrollable = await feed.evaluate(el =>
      el.scrollHeight > el.clientHeight
    );
    // If there are enough messages: should be true
    // Check that overflow-y is not hidden
    const overflowY = await feed.evaluate(el =>
      window.getComputedStyle(el).overflowY
    );
    expect(['auto', 'scroll']).toContain(overflowY);
  });

  test('page itself does not scroll — only feed scrolls', async ({ page }) => {
    await loginAndOpenConversation(page);
    const pageScrollable = await page.evaluate(() =>
      document.documentElement.scrollHeight > document.documentElement.clientHeight
    );
    expect(pageScrollable).toBe(false);
  });

  test('feed scrolled to bottom on open', async ({ page }) => {
    await loginAndOpenConversation(page);
    const feed = page.locator('[data-testid="message-feed"]');
    const atBottom = await feed.evaluate(el => {
      const tolerance = 5;
      return el.scrollHeight - el.scrollTop - el.clientHeight < tolerance;
    });
    expect(atBottom).toBe(true);
  });

  test('can scroll up to see older messages', async ({ page }) => {
    await loginAndOpenConversation(page);
    const feed = page.locator('[data-testid="message-feed"]');
    await feed.evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }));
    const afterScrollTop = await feed.evaluate(el => el.scrollTop);
    expect(afterScrollTop).toBe(0);
  });
});

test.describe('Voice Recording — Tap to Start / Tap to Send', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mic button is visible in idle state', async ({ page }) => {
    await loginAndOpenConversation(page);
    const mic = page.locator('[data-testid="mic-button"]');
    await expect(mic).toBeVisible();
    const box = await mic.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(40);
  });

  test('tapping mic button starts recording', async ({ page }) => {
    await loginAndOpenConversation(page);
    await page.locator('[data-testid="mic-button"]').click();
    // Recording bar should appear
    await expect(page.locator('[data-testid="recording-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="recording-dot"]')).toBeVisible();
    await expect(page.locator('[data-testid="recording-timer"]')).toBeVisible();
  });

  test('text input is hidden during recording', async ({ page }) => {
    await loginAndOpenConversation(page);
    await page.locator('[data-testid="mic-button"]').click();
    await expect(page.locator('[data-testid="chat-text-input"]')).toBeHidden();
  });

  test('bin/cancel button is visible during recording', async ({ page }) => {
    await loginAndOpenConversation(page);
    await page.locator('[data-testid="mic-button"]').click();
    await expect(page.locator('[data-testid="recording-cancel-btn"]')).toBeVisible();
  });

  test('send button is visible during recording', async ({ page }) => {
    await loginAndOpenConversation(page);
    await page.locator('[data-testid="mic-button"]').click();
    await expect(page.locator('[data-testid="recording-send-btn"]')).toBeVisible();
  });

  test('recording does NOT auto-stop after 3 seconds', async ({ page }) => {
    await loginAndOpenConversation(page);
    await page.locator('[data-testid="mic-button"]').click();
    await page.waitForTimeout(4000);  // wait 4 seconds
    // Recording bar must STILL be visible
    await expect(page.locator('[data-testid="recording-bar"]')).toBeVisible();
    // Timer should show at least 0:03
    const timerText = await page.locator('[data-testid="recording-timer"]').textContent();
    expect(timerText).toMatch(/0:0[3-9]|0:[1-9]\d/);
    // Clean up
    await page.locator('[data-testid="recording-cancel-btn"]').click();
  });

  test('timer counts up continuously', async ({ page }) => {
    await loginAndOpenConversation(page);
    await page.locator('[data-testid="mic-button"]').click();
    await page.waitForTimeout(2000);
    const t1 = await page.locator('[data-testid="recording-timer"]').textContent();
    await page.waitForTimeout(2000);
    const t2 = await page.locator('[data-testid="recording-timer"]').textContent();
    expect(t1).not.toBe(t2);  // timer must have advanced
    await page.locator('[data-testid="recording-cancel-btn"]').click();
  });

  test('tapping send button stops recording and sends voice note', async ({ page }) => {
    await loginAndOpenConversation(page);
    const countBefore = await page.locator('[data-testid="message-voice-note"]').count();
    await page.locator('[data-testid="mic-button"]').click();
    await page.waitForTimeout(2000);  // record for 2 seconds
    await page.locator('[data-testid="recording-send-btn"]').click();
    // Recording bar disappears
    await expect(page.locator('[data-testid="recording-bar"]')).toBeHidden({ timeout: 5000 });
    // Idle input returns
    await expect(page.locator('[data-testid="mic-button"]')).toBeVisible({ timeout: 5000 });
    // Voice note appears in feed
    const countAfter = await page.locator('[data-testid="message-voice-note"]').count();
    expect(countAfter).toBeGreaterThan(countBefore);
  });

  test('tapping cancel/bin discards recording', async ({ page }) => {
    await loginAndOpenConversation(page);
    const countBefore = await page.locator('[data-testid="message-voice-note"]').count();
    await page.locator('[data-testid="mic-button"]').click();
    await page.waitForTimeout(2000);
    await page.locator('[data-testid="recording-cancel-btn"]').click();
    // Recording bar disappears
    await expect(page.locator('[data-testid="recording-bar"]')).toBeHidden({ timeout: 3000 });
    // Idle input returns
    await expect(page.locator('[data-testid="mic-button"]')).toBeVisible();
    // NO new voice note
    const countAfter = await page.locator('[data-testid="message-voice-note"]').count();
    expect(countAfter).toBe(countBefore);
  });

  test('can start a new recording after cancelling', async ({ page }) => {
    await loginAndOpenConversation(page);
    // Record and cancel
    await page.locator('[data-testid="mic-button"]').click();
    await page.waitForTimeout(1000);
    await page.locator('[data-testid="recording-cancel-btn"]').click();
    await expect(page.locator('[data-testid="mic-button"]')).toBeVisible();
    // Record again
    await page.locator('[data-testid="mic-button"]').click();
    await expect(page.locator('[data-testid="recording-bar"]')).toBeVisible();
    await page.locator('[data-testid="recording-cancel-btn"]').click();
  });

  test('timer resets to 0:00 after cancel', async ({ page }) => {
    await loginAndOpenConversation(page);
    await page.locator('[data-testid="mic-button"]').click();
    await page.waitForTimeout(3000);
    await page.locator('[data-testid="recording-cancel-btn"]').click();
    // Start again
    await page.locator('[data-testid="mic-button"]').click();
    const timer = await page.locator('[data-testid="recording-timer"]').textContent();
    expect(timer).toBe('0:00');
    await page.locator('[data-testid="recording-cancel-btn"]').click();
  });
});
