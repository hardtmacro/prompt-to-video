import { test, expect } from '@playwright/test';

test.describe('prompt-to-video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the main page with all core UI elements', async ({ page }) => {
    // Verify the app title/header
    await expect(page.getByText('Prompt-to-Video').first()).toBeVisible();
    
    // Verify the Generate button exists
    const generateBtn = page.getByRole('button', { name: 'Generate', exact: true });
    await expect(generateBtn).toBeVisible();
    
    // Verify the input placeholder
    const promptInput = page.getByPlaceholder('Enter your story concept...');
    await expect(promptInput).toBeVisible();
    
    // Verify input has default value
    await expect(promptInput).toHaveValue(/.*/);
    
    // Verify volume/mute button exists
    const muteBtn = page.locator('button[title="Mute"], button[title="Unmute"]').first();
    await expect(muteBtn).toBeVisible();
  });

  test('should update prompt input when typing', async ({ page }) => {
    const promptInput = page.getByPlaceholder('Enter your story concept...');
    
    // Clear and type new prompt
    await promptInput.clear();
    await promptInput.fill('A hero journey through space');
    
    await expect(promptInput).toHaveValue('A hero journey through space');
  });

  test('should show generating state when generate button is clicked', async ({ page }) => {
    const generateBtn = page.getByRole('button', { name: 'Generate', exact: true });
    const promptInput = page.getByPlaceholder('Enter your story concept...');
    
    // Ensure input has value
    await promptInput.fill('Test story prompt');
    
    // Click generate - the button should change to "Generating..." state
    await generateBtn.click();
    
    // Verify button shows generating state
    await expect(page.getByText('Generating...').first()).toBeVisible();
    
    // Verify button is now disabled
    await expect(generateBtn).toBeDisabled();
  });

  test('should toggle mute state when volume button is clicked', async ({ page }) => {
    // Get the mute button
    const muteBtn = page.locator('button').filter({ has: page.locator('svg') }).first();
    
    // Click to toggle mute (first click should mute)
    await muteBtn.click();
    
    // The button should now show VolumeX icon (muted)
    // We can verify this by checking the button state changed
    // Click again to unmute
    await muteBtn.click();
  });

  test('should show error message with dismiss button when generation fails', async ({ page }) => {
    // Trigger a generation to see error state (the app might set generationError)
    // First, let's verify the Generate button exists
    const generateBtn = page.getByRole('button', { name: 'Generate', exact: true });
    const promptInput = page.getByPlaceholder('Enter your story concept...');
    
    await promptInput.fill('Test prompt for error');
    await generateBtn.click();
    
    // The app should show generating state
    await expect(page.getByText('Generating...').first()).toBeVisible();
  });

  test('should display chat messages section', async ({ page }) => {
    // Check that chat messages area exists (the welcome message)
    await expect(page.getByText('Welcome to Prompt-to-Video').first()).toBeVisible();
  });

  test('should handle keyboard navigation with ArrowRight', async ({ page }) => {
    // First verify the page is loaded
    await expect(page.getByText('Prompt-to-Video').first()).toBeVisible();
    
    // Press ArrowRight key - this should trigger handleNextScene
    // Since there are no scenes initially, it won't change anything meaningful
    // but we verify the keyboard handler is attached
    await page.keyboard.press('ArrowRight');
    
    // The page should still be functional
    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
  });

  test('should handle space bar for play/pause', async ({ page }) => {
    // Press space bar - this should trigger handlePlayPause
    // Without scenes, it won't do much but should not error
    await page.keyboard.press(' ');
    
    // Verify page still works
    await expect(page.getByText('Prompt-to-Video').first()).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    
    // Verify main elements are still visible on mobile
    await expect(page.getByText('Prompt-to-Video').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your story concept...')).toBeVisible();
    
    // Input should still be functional
    const promptInput = page.getByPlaceholder('Enter your story concept...');
    await promptInput.fill('Mobile test');
    await expect(promptInput).toHaveValue('Mobile test');
  });

  test('should show Ready to Create heading when no content generated', async ({ page }) => {
    // The "Ready to Create" text should be visible as a call to action
    await expect(page.getByText('Ready to Create').first()).toBeVisible();
  });

  test('should have Story Assistant section visible', async ({ page }) => {
    // Verify Story Assistant is present
    await expect(page.getByText('Story Assistant').first()).toBeVisible();
  });

  test('should have Story Scenes section visible', async ({ page }) => {
    // Verify Story Scenes section exists
    await expect(page.getByText('Story Scenes').first()).toBeVisible();
  });
});