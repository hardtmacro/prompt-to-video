import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with correct title and initial state', async ({ page }) => {
    // Verify heading is visible
    await expect(page.getByRole('heading', { name: 'Prompt to Video', exact: true })).toBeVisible();
    
    // Verify input has correct placeholder
    const input = page.getByPlaceholder(/Enter your story theme/);
    await expect(input).toBeVisible();
    
    // Verify empty state message
    await expect(page.getByText('No story generated yet').first()).toBeVisible();
    
    // Verify Generate button is initially disabled
    const generateBtn = page.getByRole('button', { name: 'Generate story', exact: true });
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeDisabled();
  });

  test('generate button enables when input has text', async ({ page }) => {
    const input = page.getByPlaceholder(/Enter your story theme/);
    const generateBtn = page.getByRole('button', { name: 'Generate story', exact: true });
    
    await input.fill('cyberpunk');
    await expect(generateBtn).toBeEnabled();
  });

  test('generates story content via API flow', async ({ page }) => {
    const input = page.getByPlaceholder(/Enter your story theme/);
    const generateBtn = page.getByRole('button', { name: 'Generate story', exact: true });
    
    // Fill in the prompt
    await input.fill('cyberpunk');
    
    // Mock the API responses
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'data:image/svg+xml,<svg></svg>' }),
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: '',
      });
    });
    
    // Click generate
    await generateBtn.click();
    
    // Verify button shows generating state
    await expect(page.getByText('Generating...').first()).toBeVisible();
    
    // Wait for story nodes to appear
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Verify character names appear
    await expect(page.getByText('Kaelen').first()).toBeVisible();
    await expect(page.getByText('Lyra').first()).toBeVisible();
    await expect(page.getByText('The Watcher').first()).toBeVisible();
    
    // Verify Ready status appears for nodes
    await expect(page.getByText('Ready').first()).toBeVisible();
  });

  test('play and pause controls work correctly', async ({ page }) => {
    const input = page.getByPlaceholder(/Enter your story theme/);
    const generateBtn = page.getByRole('button', { name: 'Generate story', exact: true });
    
    await input.fill('space exploration');
    
    // Mock APIs
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'data:image/svg+xml,<svg></svg>' }),
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: '',
      });
    });
    
    await generateBtn.click();
    
    // Wait for content to be ready
    await expect(page.getByText('Ready').first()).toBeVisible();
    
    // Play button should now be visible (appears in header when content is ready)
    const playBtn = page.getByRole('button', { name: /Play/, exact: true }).first();
    await expect(playBtn).toBeVisible();
    await playBtn.click();
    
    // After clicking play, pause button should appear
    const pauseBtn = page.getByRole('button', { name: /Pause/, exact: true }).first();
    await expect(pauseBtn).toBeVisible();
    
    // Click pause
    await pauseBtn.click();
    
    // Play button should reappear
    await expect(playBtn).toBeVisible();
  });

  test('reset clears all generated content', async ({ page }) => {
    const input = page.getByPlaceholder(/Enter your story theme/);
    const generateBtn = page.getByRole('button', { name: 'Generate story', exact: true });
    
    await input.fill('medieval fantasy');
    
    // Mock APIs
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'data:image/svg+xml,<svg></svg>' }),
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: '',
      });
    });
    
    await generateBtn.click();
    
    // Wait for content
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Reset button should be visible now
    const resetBtn = page.getByRole('button', { name: /Reset/ }).first();
    await expect(resetBtn).toBeVisible();
    
    // Click reset
    await resetBtn.click();
    
    // Empty state should reappear
    await expect(page.getByText('No story generated yet').first()).toBeVisible();
    
    // Input should be cleared
    await expect(input).toHaveValue('');
  });

  test('mute toggle works correctly', async ({ page }) => {
    // Mute button should be visible in header
    const muteBtn = page.getByRole('button', { name: /Mute/ }).first();
    await expect(muteBtn).toBeVisible();
    
    // Click to mute
    await muteBtn.click();
    
    // Should now show unmute/volume icon
    const unmuteBtn = page.getByRole('button', { name: /Unmute/ }).first();
    await expect(unmuteBtn).toBeVisible();
  });

  test('enter key triggers generation', async ({ page }) => {
    const input = page.getByPlaceholder(/Enter your story theme/);
    
    // Mock APIs
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'data:image/svg+xml,<svg></svg>' }),
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: '',
      });
    });
    
    // Type and press enter
    await input.fill('fantasy');
    await input.press('Enter');
    
    // Should show generating
    await expect(page.getByText('Generating...').first()).toBeVisible();
    
    // Should generate content
    await expect(page.getByText('Narrator').first()).toBeVisible();
  });

  test('re-generation works correctly', async ({ page }) => {
    const input = page.getByPlaceholder(/Enter your story theme/);
    const generateBtn = page.getByRole('button', { name: 'Generate story', exact: true });
    
    // Mock APIs
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'data:image/svg+xml,<svg></svg>' }),
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: '',
      });
    });
    
    // First generation
    await input.fill('horror');
    await generateBtn.click();
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Clear and generate again
    await input.fill('comedy');
    await generateBtn.click();
    
    // Should show new content
    await expect(page.getByText('Narrator').first()).toBeVisible();
  });

  test('renders correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    
    // Verify heading is visible
    await expect(page.getByRole('heading', { name: 'Prompt to Video', exact: true })).toBeVisible();
    
    // Verify input and button are visible and functional
    const input = page.getByPlaceholder(/Enter your story theme/);
    await expect(input).toBeVisible();
    
    const generateBtn = page.getByRole('button', { name: 'Generate story', exact: true });
    await expect(generateBtn).toBeVisible();
    
    // Input should be full width on mobile
    await input.fill('test');
    await expect(generateBtn).toBeEnabled();
  });
});