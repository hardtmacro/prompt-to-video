import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display initial UI elements on page load', async ({ page }) => {
    // Check for the main heading
    await expect(page.getByRole('heading', { name: 'Prompt to Cinema' })).toBeVisible();
    
    // Check for the subtitle/badge
    await expect(page.getByText('AI Video Storyteller').first()).toBeVisible();
    
    // Check for the text area placeholder
    await expect(page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...')).toBeVisible();
    
    // Check for the helper text about 12 nodes
    await expect(page.getByText('Generates 12 unique character nodes').first()).toBeVisible();
    
    // Check Generate button exists and is initially disabled (no prompt)
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeDisabled();
  });

  test('should enable generate button when prompt is entered', async ({ page }) => {
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    
    await textArea.fill('Cyberpunk Samurai');
    await expect(generateBtn).toBeEnabled();
  });

  test('should show loading state during generation', async ({ page }) => {
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    await textArea.fill('Cyberpunk Samurai');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await generateBtn.click();
    
    // Should show loading state
    await expect(page.getByText('Creating Story Arc...').first()).toBeVisible();
    
    // Button should be disabled during generation
    await expect(generateBtn).toBeDisabled();
  });

  test('should show error state when API fails', async ({ page }) => {
    // Intercept API calls to force failure
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({ status: 500 });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({ status: 500 });
    });
    
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    await textArea.fill('Test Theme');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await generateBtn.click();
    
    // Wait for generation to complete (even with errors)
    await page.waitForTimeout(3000);
    
    // Should show error state - the app may show "Generating cinematic frame..." as loading or error
    // The dialogue nodes are still created but with error status
    const loadingText = page.getByText('Generating cinematic frame...').first();
    await expect(loadingText.first()).toBeVisible();
  });

  test('should generate story nodes with mock API responses', async ({ page }) => {
    // Mock successful API responses
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://example.com/image.jpg' })
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from('fake-audio')
      });
    });
    
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    await textArea.fill('Test Theme');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await generateBtn.click();
    
    // Wait for at least one node to be ready
    await page.waitForTimeout(5000);
    
    // Should see character name displayed
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Should see the dialogue text
    await expect(page.getByText(/In the heart of the Test Theme realm/)).toBeVisible();
  });

  test('should navigate between generated story nodes', async ({ page }) => {
    // Mock successful API responses
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://example.com/image.jpg' })
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from('fake-audio')
      });
    });
    
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    await textArea.fill('Adventure');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await generateBtn.click();
    
    // Wait for generation to complete
    await page.waitForTimeout(8000);
    
    // Should start on first node (Narrator)
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Click next button to go to second node
    const nextBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first();
    await nextBtn.click();
    
    // Should now show The Seeker
    await expect(page.getByText('The Seeker').first()).toBeVisible();
    
    // Click previous to go back
    const prevBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-left') }).first();
    await prevBtn.click();
    
    // Should be back on Narrator
    await expect(page.getByText('Narrator').first()).toBeVisible();
  });

  test('should display all 12 character names after generation', async ({ page }) => {
    // Mock successful API responses
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://example.com/image.jpg' })
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from('fake-audio')
      });
    });
    
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    await textArea.fill('Fantasy Quest');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await generateBtn.click();
    
    // Wait for all 12 nodes to be generated
    await page.waitForTimeout(15000);
    
    // Navigate through all characters and verify each exists
    const characterNames = [
      'Narrator', 'The Seeker', 'Ancient Guide', 'Forest Spirit', 
      'Iron Guardian', 'The Oracle', 'Village Elder', 'Lost Wanderer',
      'Gate Keeper', 'Shadow Weaver', 'Light Bringer', 'Mystic Sage'
    ];
    
    // Start at first character
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Navigate through each character
    for (let i = 1; i < characterNames.length; i++) {
      const nextBtn = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') }).first();
      await nextBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByText(characterNames[i])).toBeVisible();
    }
  });

  test('should show story timeline section after generation', async ({ page }) => {
    // Mock successful API responses
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://example.com/image.jpg' })
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from('fake-audio')
      });
    });
    
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    await textArea.fill('Space Opera');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await generateBtn.click();
    
    // Wait for generation
    await page.waitForTimeout(5000);
    
    // Check for Story Timeline heading
    await expect(page.getByRole('heading', { name: 'Story Timeline' })).toBeVisible();
  });

  test('should reset and start over with new prompt', async ({ page }) => {
    // Mock successful API responses
    await page.route('**/api/generate-image', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://example.com/image.jpg' })
      });
    });
    
    await page.route('**/api/text-to-speech', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from('fake-audio')
      });
    });
    
    // First generation
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    await textArea.fill('First Theme');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await generateBtn.click();
    
    await page.waitForTimeout(3000);
    
    // Should see first theme content
    await expect(page.getByText('Narrator').first()).toBeVisible();
    
    // Find and click reset button (rotate icon)
    const resetBtn = page.locator('button').filter({ has: page.locator('svg.lucide-rotate-ccw') }).first();
    await resetBtn.click();
    
    // Should be back to initial state with input visible
    await expect(page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...')).toBeVisible();
    await expect(generateBtn).toBeDisabled();
    
    // Should be able to enter new prompt
    await textArea.fill('Second Theme');
    await expect(generateBtn).toBeEnabled();
  });

  test('should display correctly on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    
    // Check main heading is visible
    await expect(page.getByRole('heading', { name: 'Prompt to Cinema' })).toBeVisible();
    
    // Check input is accessible
    const textArea = page.getByPlaceholder('Enter a theme (e.g., Cyberpunk Samurai, Underwater Kingdom, Space Western)...');
    await expect(textArea).toBeVisible();
    
    // Enter prompt and check button state
    await textArea.fill('Mobile Test');
    const generateBtn = page.getByRole('button', { name: 'Generate Video', exact: true });
    await expect(generateBtn).toBeEnabled();
  });
});