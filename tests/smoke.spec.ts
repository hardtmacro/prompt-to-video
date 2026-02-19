import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for hydration to complete
    await page.waitForFunction(() => {
      const body = document.body;
      return body.classList.contains('dark') && body.innerText.length > 0;
    });
  });

  test('page loads with default visible elements', async ({ page }) => {
    // Verify header elements are visible
    await expect(page.getByText('Cine', { exact: true })).toBeVisible();
    await expect(page.getByText('Flow', { exact: true })).toBeVisible();
    
    // Verify Prompt Engine section exists
    await expect(page.getByText('Prompt Engine').first()).toBeVisible();
    
    // Verify textarea with correct placeholder exists
    const textarea = page.getByPlaceholder('Describe your story arc...');
    await expect(textarea).toBeVisible();
    
    // Verify Generate button exists
    const generateBtn = page.getByRole('button', { name: 'Generate Production', exact: true });
    await expect(generateBtn).toBeVisible();
    
    // Verify Script Progress section exists
    await expect(page.getByText('Script Progress').first()).toBeVisible();
    
    // Verify the empty state message
    await expect(page.getByText('Waiting for Script').first()).toBeVisible();
  });

  test('user can type in prompt textarea', async ({ page }) => {
    const textarea = page.getByPlaceholder('Describe your story arc...');
    await textarea.fill('A hero\'s journey through the mountains');
    await expect(textarea).toHaveValue('A hero\'s journey through the mountains');
  });

  test('generate button triggers loading state', async ({ page }) => {
    const textarea = page.getByPlaceholder('Describe your story arc...');
    await textarea.fill('Test story');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Production', exact: true });
    await generateBtn.click();
    
    // Button should change to loading state - use exact text match
    await expect(page.getByRole('button', { name: 'Synthesizing Story...', exact: true })).toBeVisible();
  });

  test('mute toggle changes icon state', async ({ page }) => {
    // Find and click the mute button (volume icon in header)
    const muteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-volume2, svg.lucide-volumeX') }).first();
    await expect(muteBtn).toBeVisible();
    await muteBtn.click();
    
    // After clicking, should show VolumeX icon
    const volumeXIcon = page.locator('svg.lucide-volumeX');
    await expect(volumeXIcon).toBeVisible();
  });

  test('can click on scene cards after generation triggers', async ({ page }) => {
    const textarea = page.getByPlaceholder('Describe your story arc...');
    await textarea.fill('A journey of innovation');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Production', exact: true });
    await generateBtn.click();
    
    // Wait for loading state to appear then resolve
    await expect(page.getByRole('button', { name: 'Synthesizing Story...', exact: true })).toBeVisible();
    
    // Wait for button to return to enabled state after generation completes
    const productionBtn = page.getByRole('button', { name: 'Generate Production', exact: true });
    await expect(productionBtn).toBeEnabled({ timeout: 30000 });
    
    // After generation, scene cards should exist in the script progress
    // The app generates 10 scenes (2+3+2+3 from story arc template)
    const sceneCards = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]');
    await expect(sceneCards.first()).toBeVisible();
  });

  test('scene cards display character names', async ({ page }) => {
    const textarea = page.getByPlaceholder('Describe your story arc...');
    await textarea.fill('Epic adventure');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Production', exact: true });
    await generateBtn.click();
    
    // Wait for generation to complete
    await expect(page.getByRole('button', { name: 'Generate Production', exact: true })).toBeEnabled({ timeout: 30000 });
    
    // Verify character names appear in the scene list (Narrator, Visionary, etc.)
    await expect(page.getByText('Narrator', { exact: true }).first()).toBeVisible();
  });

  test('regeneration works - can generate second story', async ({ page }) => {
    // First generation
    const textarea = page.getByPlaceholder('Describe your story arc...');
    await textarea.fill('First story');
    
    const generateBtn = page.getByRole('button', { name: 'Generate Production', exact: true });
    await generateBtn.click();
    
    // Wait for first generation to complete
    await expect(page.getByRole('button', { name: 'Generate Production', exact: true })).toBeEnabled({ timeout: 30000 });
    
    // Second generation with different prompt
    await textarea.fill('Second story different');
    await generateBtn.click();
    
    // Should show loading state again
    await expect(page.getByRole('button', { name: 'Synthesizing Story...', exact: true })).toBeVisible();
    
    // Wait for completion
    await expect(page.getByRole('button', { name: 'Generate Production', exact: true })).toBeEnabled({ timeout: 30000 });
  });

  test('mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    
    // On mobile, key elements should still be visible
    await expect(page.getByText('Cine', { exact: true })).toBeVisible();
    await expect(page.getByText('Flow', { exact: true })).toBeVisible();
    
    const textarea = page.getByPlaceholder('Describe your story arc...');
    await expect(textarea).toBeVisible();
    
    const generateBtn = page.getByRole('button', { name: 'Generate Production', exact: true });
    await expect(generateBtn).toBeVisible();
  });
});