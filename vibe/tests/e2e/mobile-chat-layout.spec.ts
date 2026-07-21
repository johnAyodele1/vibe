import { test, expect } from '@playwright/test';

// Mock helper if not imported elsewhere
async function loginAsAdultMember(page: any) {
  // Mock local storage credentials or mock endpoint responses
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('adultZoneVerified', JSON.stringify({ verified: true, timestamp: Date.now() }));
    localStorage.setItem('adultAccessToken', 'mock-token-abc');
  });
}

test.describe('Mobile Chat Layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await loginAsAdultMember(page);
    await page.goto('/adult/sext');
    // Open first conversation
    await page.locator('[data-testid="conversation-row"]').first().click();
  });

  test('global header is hidden when conversation is open on mobile', async ({ page }) => {
    const globalHeader = page.locator('[data-testid="global-header"]');
    await expect(globalHeader).toBeHidden();
  });

  test('legal footer is not visible in chat view', async ({ page }) => {
    const footer = page.locator('[data-testid="site-footer"]');
    await expect(footer).toBeHidden();
  });

  test('input bar is visible above the tab bar', async ({ page }) => {
    const inputBar = page.locator('[data-testid="chat-input-bar"]');
    const tabBar   = page.locator('[data-testid="bottom-tab-bar"]');

    const inputBox = await inputBar.boundingBox();
    const tabBox   = await tabBar.boundingBox();

    // Input bar bottom must be above tab bar top
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(tabBox!.y + 1);
  });

  test('SEND GIFT and REQUEST PHOTO buttons are visible', async ({ page }) => {
    await expect(page.getByText('SEND GIFT')).toBeVisible();
    await expect(page.getByText('REQUEST PHOTO')).toBeVisible();
  });

  test('SEND GIFT is above tab bar, not hidden behind it', async ({ page }) => {
    const giftBtn = page.getByText('SEND GIFT');
    const tabBar  = page.locator('[data-testid="bottom-tab-bar"]');
    const giftBox = await giftBtn.boundingBox();
    const tabBox  = await tabBar.boundingBox();
    expect(giftBox!.y + giftBox!.height).toBeLessThanOrEqual(tabBox!.y + 1);
  });

  test('message bubbles have minimum 16px from screen edges', async ({ page }) => {
    const bubbles = page.locator('[data-testid="message-bubble"]');
    const count = await bubbles.count();
    for (let i = 0; i < count; i++) {
      const box = await bubbles.nth(i).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(16);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390 - 16);
    }
  });

  test('gift card has minimum 24px from screen edges', async ({ page }) => {
    const giftCard = page.locator('[data-testid="message-gift-card"]');
    if (await giftCard.count() > 0) {
      const box = await giftCard.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(24);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390 - 24);
    }
  });

  test('photo request card has minimum 24px from screen edges', async ({ page }) => {
    const card = page.locator('[data-testid="message-photo-request"]');
    if (await card.count() > 0) {
      const box = await card.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(24);
    }
  });

  test('message feed takes all space between header and input', async ({ page }) => {
    const header = page.locator('[data-testid="conversation-header"]');
    const feed   = page.locator('[data-testid="message-feed"]');
    const input  = page.locator('[data-testid="chat-input-bar"]');

    const headerBox = await header.boundingBox();
    const feedBox   = await feed.boundingBox();
    const inputBox  = await input.boundingBox();

    // Feed starts where header ends
    expect(feedBox!.y).toBeCloseTo(headerBox!.y + headerBox!.height, 1);
    // Feed ends where input starts
    expect(feedBox!.y + feedBox!.height).toBeCloseTo(inputBox!.y, 1);
  });

  test('chat page does not scroll — only feed scrolls internally', async ({ page }) => {
    const bodyScrollY = await page.evaluate(() => document.documentElement.scrollTop);
    expect(bodyScrollY).toBe(0);
    // Attempt to scroll the page
    await page.evaluate(() => window.scrollTo(0, 500));
    const afterScroll = await page.evaluate(() => document.documentElement.scrollTop);
    expect(afterScroll).toBe(0);  // Should not have scrolled
  });
});

test.describe('Voice Recording UX — Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mic button is visible in input bar', async ({ page }) => {
    const mic = page.locator('[data-testid="mic-button"]');
    await expect(mic).toBeVisible();
    const box = await mic.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });

  test('holding mic button enters recording state', async ({ page }) => {
    const mic = page.locator('[data-testid="mic-button"]');
    await mic.dispatchEvent('touchstart');
    await expect(page.locator('[data-testid="recording-waveform"]')).toBeVisible();
    await expect(page.locator('[data-testid="recording-timer"]')).toBeVisible();
    await expect(page.locator('[data-testid="recording-cancel-btn"]')).toBeVisible();
    await mic.dispatchEvent('touchend');
  });

  test('text input is hidden during recording', async ({ page }) => {
    const mic = page.locator('[data-testid="mic-button"]');
    await mic.dispatchEvent('touchstart');
    await expect(page.locator('[data-testid="chat-text-input"]')).toBeHidden();
    await mic.dispatchEvent('touchend');
  });

  test('recording timer counts up', async ({ page }) => {
    const mic = page.locator('[data-testid="mic-button"]');
    await mic.dispatchEvent('touchstart');
    await page.waitForTimeout(2000);
    const timerText = await page.locator('[data-testid="recording-timer"]').textContent();
    // Should show at least "0:01"
    expect(timerText).toMatch(/0:0[1-9]/);
    await mic.dispatchEvent('touchend');
  });

  test('releasing mic after 1+ seconds sends voice note', async ({ page }) => {
    const mic = page.locator('[data-testid="mic-button"]');
    await mic.dispatchEvent('touchstart');
    await page.waitForTimeout(1500);
    await mic.dispatchEvent('touchend');
    // Voice note message should appear in feed
    await expect(page.locator('[data-testid="message-voice-note"]').last()).toBeVisible({
      timeout: 5000,
    });
  });

  test('cancel button cancels recording without sending', async ({ page }) => {
    const mic = page.locator('[data-testid="mic-button"]');
    await mic.dispatchEvent('touchstart');
    await page.waitForTimeout(1000);
    const countBefore = await page.locator('[data-testid="message-voice-note"]').count();
    await page.locator('[data-testid="recording-cancel-btn"]').click();
    await expect(page.locator('[data-testid="recording-waveform"]')).toBeHidden();
    const countAfter = await page.locator('[data-testid="message-voice-note"]').count();
    expect(countAfter).toBe(countBefore);  // No new voice note
  });

  test('global header hidden, tab bar visible, input above tab bar during recording', async ({ page }) => {
    const mic = page.locator('[data-testid="mic-button"]');
    await mic.dispatchEvent('touchstart');

    const globalHeader = page.locator('[data-testid="global-header"]');
    const tabBar = page.locator('[data-testid="bottom-tab-bar"]');
    const recordingBar = page.locator('[data-testid="recording-bar"]');

    await expect(globalHeader).toBeHidden();
    await expect(tabBar).toBeVisible();

    const recordingBox = await recordingBar.boundingBox();
    const tabBox = await tabBar.boundingBox();
    expect(recordingBox!.y + recordingBox!.height).toBeLessThanOrEqual(tabBox!.y + 1);

    await mic.dispatchEvent('touchend');
  });
});
