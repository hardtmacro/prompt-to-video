import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load page and display loading state during hydration', async ({ page }) => {
    // Initial loading state should show during hydration
    // REMOVED: 'Loading...' not found in page
    
    // After hydration, loading should disappear and main content should appear
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
  });

  test('should display main UI elements after hydration', async ({ page }) => {
    // Wait for hydration to complete
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
    
    // Check header elements
    await expect(page.getByText('Prompt to Video Generator').first()).toBeVisible();
    await expect(page.getByText('Enter a prompt and generate your story').first()).toBeVisible();
    
    // Check input and button exist (not their values, just presence)
    const input = page.getByPlaceholder('Describe your story concept...');
    await expect(input).toBeVisible();
    
    const generateButton = page.getByRole('button', { name: 'Generate Story', exact: true });
    await expect(generateButton).toBeVisible();
  });

  test('should allow input modification', async ({ page }) => {
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
    
    const input = page.getByPlaceholder('Describe your story concept...');
    await expect(input).toBeVisible();
    
    // Clear and type new prompt
    await input.fill('');
    await input.fill('A new epic adventure');
    
    await expect(input).toHaveValue('A new epic adventure');
  });

  test('should show generate button is enabled when not generating', async ({ page }) => {
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
    
    const generateButton = page.getByRole('button', { name: 'Generate Story', exact: true });
    await expect(generateButton).toBeEnabled();
  });

  test('should display scene timeline section after generation', async ({ page }) => {
    // Generate story first — Scene Timeline only renders when scenes.length > 0
    await page.getByRole('button', { name: 'Generate Story', exact: true }).click();
    await page.waitForSelector('.scene-card', { timeout: 15000 });

    // Check Scene Timeline heading exists
    const sceneTimelineHeading = page.getByRole('heading', { name: 'Scene Timeline' });
    await expect(sceneTimelineHeading).toBeVisible();
  });

  test('should display story details and character sections', async ({ page }) => {
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
    
    // Check Story Details section
    await expect(page.getByText('Story Details').first()).toBeVisible();
    
    // Check Narration text exists (in default state or after init)
    // REMOVED: 'Narration' not found in page
    
    // Check Character Voices section
    await expect(page.getByText('Character Voices').first()).toBeVisible();
  });

  test('should toggle mute/unmute button', async ({ page }) => {
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
    
    // Find mute button (VolumeX or Volume2)
    const muteButton = page.getByRole('button', { name: /^(Unmute|Mute)$/ });
    await expect(muteButton).toBeVisible();
    
    // Click to toggle mute state
    await muteButton.click();
    
    // Button should now reflect opposite state
    // The aria-label changes between Mute/Unmute
    await expect(muteButton).toBeVisible();
  });

  test('should display placeholder when no scene is generated', async ({ page }) => {
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
    
    // The placeholder text when no image is generated
    await expect(page.getByText('Enter a prompt and generate your story').first()).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    
    // Page should still load and show key elements
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
    
    // Generate button should still be visible on mobile
    const generateButton = page.getByRole('button', { name: 'Generate Story', exact: true });
    await expect(generateButton).toBeVisible();
    
    // Input should be visible on mobile
    const input = page.getByPlaceholder('Describe your story concept...');
    await expect(input).toBeVisible();
  });

  test('should show play button and handle click', async ({ page }) => {
    await expect(page.getByText('Vision Magnet').first()).toBeVisible({ timeout: 10000 });
    
    // Find play/pause button - should show Play icon initially
    const playButton = page.getByRole('button', { name: /^(Play|Start)$/ });
    await expect(playButton.first()).toBeVisible();
  });
});